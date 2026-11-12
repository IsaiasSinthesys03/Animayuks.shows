-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 24: horario propio por show
-- · Un show puede tener su propia semana de franjas (shows.horario_propio).
--   Un día sin franjas en su horario = ese show no se ofrece ese día.
--   No depende de los días encendidos en el horario general.
-- · Para todos los shows siguen igual: agenda única, máximo por día,
--   bloqueos y días especiales (ese día manda el día especial).
-- · Apagar el horario propio conserva sus franjas.
-- Sin horarios propios todo da el mismo resultado que antes: es compatible con
-- el sitio publicado. Las funciones se reconstruyeron desde su versión viva.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

alter table public.shows add column horario_propio boolean not null default false;

alter table public.horario_franjas
  add column show_id uuid references public.shows (id) on delete cascade;
alter table public.horario_franjas
  add constraint franja_show_semanal check (show_id is null or (dia_semana is not null and fecha is null));
create index horario_franjas_show_idx on public.horario_franjas (show_id) where show_id is not null;

-- ── franjas_del_dia(): día especial › horario propio del show › general ────
drop function public.franjas_del_dia(date);
create or replace function public.franjas_del_dia(p_fecha date, p_show_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'abre', f.abre, 'cierra', f.cierra, 'modo', f.modo,
           'intervalo_min', f.intervalo_min, 'horas', f.horas) order by f.abre), '[]'::jsonb)
    from public.horario_franjas f
   where case
           when exists (select 1 from public.dias_especiales d where d.fecha = p_fecha)
             then f.fecha = p_fecha
           when exists (select 1 from public.shows s where s.id = p_show_id and s.horario_propio)
             then f.show_id = p_show_id and f.dia_semana = extract(dow from p_fecha)::int
           else f.show_id is null
                and f.dia_semana = extract(dow from p_fecha)::int
                and exists (select 1 from public.horario_servicio h where h.dia_semana = f.dia_semana and h.activo)
         end;
$$;
revoke execute on function public.franjas_del_dia(date, uuid) from public, anon, authenticated;


-- ── trigger de franjas: también por show ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.horario_franjas_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1 from public.horario_franjas o
     where o.id <> new.id
       and o.dia_semana is not distinct from new.dia_semana
       and o.fecha is not distinct from new.fecha
       and o.show_id is not distinct from new.show_id
       and o.abre < new.cierra and new.abre < o.cierra
  ) then
    raise exception 'FRANJA_ENCIMADA: dos franjas del mismo día no pueden encimarse' using errcode = '23P01';
  end if;
  if (select count(*) from public.horario_franjas o
       where o.dia_semana is not distinct from new.dia_semana and o.fecha is not distinct from new.fecha and o.show_id is not distinct from new.show_id) > 6 then
    raise exception 'DEMASIADAS_FRANJAS: máximo 6 franjas por día' using errcode = '23514';
  end if;
  return null;
end;
$function$;

-- ── validar_horario(): recibe el show ─────────────────────────────────────
drop function public.validar_horario(timestamptz, timestamptz, tstzrange, uuid, uuid);
CREATE OR REPLACE FUNCTION public.validar_horario(p_inicio timestamp with time zone, p_fin timestamp with time zone, p_bloque tstzrange, p_excluir_reservacion uuid DEFAULT NULL::uuid, p_zona_id uuid DEFAULT NULL::uuid, p_show_id uuid DEFAULT NULL::uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg        public.configuracion;
  v_ini      timestamp;
  v_fin      timestamp;
  v_limite   int;
  v_usados   int;
  problemas  text[] := '{}';
begin
  select * into cfg from public.configuracion where id = 1;

  if p_inicio < now() then
    problemas := array_append(problemas, 'fecha pasada');
  end if;
  if p_inicio < now() + make_interval(hours => cfg.anticipacion_min_horas)
     or p_inicio > now() + make_interval(days => cfg.anticipacion_max_dias) then
    problemas := array_append(problemas, 'anticipación');
  end if;

  -- Debe ser una hora que ofrece alguna franja de ese día y terminar dentro de ella
  v_ini := p_inicio at time zone cfg.zona_horaria;
  v_fin := p_fin at time zone cfg.zona_horaria;
  if v_fin::date <> v_ini::date
     or extract(second from v_ini) <> 0
     or not exists (
       select 1 from public.inicios_de_franjas(public.franjas_del_dia(v_ini::date, p_show_id),
                                               (extract(epoch from (p_fin - p_inicio)) / 60)::int) i
        where i.inicio = v_ini::time
     ) then
    problemas := array_append(problemas, 'fuera de horario');
  end if;

  if exists (select 1 from public.bloqueos b where tstzrange(b.inicio, b.fin) && p_bloque) then
    problemas := array_append(problemas, 'fecha bloqueada');
  end if;

  if exists (
    select 1 from public.reservaciones r
     where r.estado in ('pendiente', 'confirmada')
       and r.bloque && p_bloque
       and r.id is distinct from p_excluir_reservacion
  ) then
    problemas := array_append(problemas, 'ocupado');
  end if;

  -- Horarios apartados por otras personas (RN-08); los apartados propios no estorban
  if not ('ocupado' = any (problemas)) and exists (
    select 1 from public.retenciones t
     where t.expira_en > now()
       and t.bloque && p_bloque
       and t.usuario_id is distinct from auth.uid()
  ) then
    problemas := array_append(problemas, 'ocupado');
  end if;

  -- Máximo de shows del día: reservaciones vivas + apartados vigentes de otros
  v_limite := public.limite_del_dia(v_ini::date);
  if v_limite is not null then
    select (select count(*) from public.reservaciones r
             where r.estado in ('pendiente', 'confirmada')
               and (r.inicio at time zone cfg.zona_horaria)::date = v_ini::date
               and r.id is distinct from p_excluir_reservacion)
         + (select count(*) from public.retenciones t
             where t.expira_en > now()
               and (t.inicio at time zone cfg.zona_horaria)::date = v_ini::date
               and t.usuario_id is distinct from auth.uid())
      into v_usados;
    if v_usados >= v_limite then
      problemas := array_append(problemas, 'día lleno');
    end if;
  end if;

  return problemas;
end;
$function$;
revoke execute on function public.validar_horario(timestamptz, timestamptz, tstzrange, uuid, uuid, uuid) from public, anon, authenticated;

-- ── evaluar_horarios_dia(): horario del show ──────────────────────────────
CREATE OR REPLACE FUNCTION public.evaluar_horarios_dia(p_show_id uuid, p_paquete_id uuid, p_extras uuid[], p_codigo_postal text, p_fecha date)
 RETURNS TABLE(inicio timestamp with time zone, fin timestamp with time zone, problemas text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg       public.configuracion;
  v_zona_id uuid;
  v_franjas jsonb;
  h         record;
  antes     interval;
  despues   interval;
  i         record;
begin
  select * into cfg from public.configuracion where id = 1;
  v_franjas := public.franjas_del_dia(p_fecha, p_show_id);
  if jsonb_array_length(v_franjas) = 0 then
    return;
  end if;
  v_zona_id := (public.zona_por_cp(p_codigo_postal)).id;

  -- La duración y los márgenes no dependen de la hora: se calculan una vez
  select * into h from public.calcular_horario(p_show_id, p_paquete_id, p_extras, p_codigo_postal,
                                               (p_fecha + time '12:00') at time zone cfg.zona_horaria);
  antes   := ((p_fecha + time '12:00') at time zone cfg.zona_horaria) - lower(h.bloque);
  despues := upper(h.bloque) - h.fin;

  for i in select distinct x.inicio from public.inicios_de_franjas(v_franjas, h.duracion_min) x order by x.inicio loop
    inicio    := (p_fecha + i.inicio) at time zone cfg.zona_horaria;
    fin       := inicio + make_interval(mins => h.duracion_min);
    problemas := public.validar_horario(inicio, fin, tstzrange(inicio - antes, fin + despues), null, v_zona_id, p_show_id);
    return next;
  end loop;
end;
$function$;

-- ── crear_reservacion(): versión viva + show ──────────────────────────────
CREATE OR REPLACE FUNCTION public.crear_reservacion(p_show_id uuid, p_paquete_id uuid, p_inicio timestamp with time zone, p_codigo_postal text, p_calle text, p_colonia text, p_referencias text DEFAULT NULL::text, p_extras uuid[] DEFAULT '{}'::uuid[], p_evento jsonb DEFAULT '{}'::jsonb, p_cliente jsonb DEFAULT '{}'::jsonb, p_cliente_id uuid DEFAULT NULL::uuid, p_canal text DEFAULT NULL::text, p_descuento numeric DEFAULT 0, p_forzar boolean DEFAULT false, p_motivo text DEFAULT NULL::text)
 RETURNS reservaciones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  admin       boolean := public.es_admin();
  cfg         public.configuracion;
  v_show      public.shows;
  v_paquete   public.paquetes;
  v_cliente   public.clientes;
  h           record;
  v_problemas text[];
  v_saltos    text[] := '{}';
  v_descuento numeric(10,2) := case when admin then coalesce(p_descuento, 0) else 0 end;
  v_total     numeric(10,2);
  v_res       public.reservaciones;
  v_mod       public.modalidades;
  v_cargo_mod numeric(10,2) := 0;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA: inicia sesión para reservar' using errcode = '42501';
  end if;

  select * into cfg from public.configuracion where id = 1;

  if not admin and not cfg.reservaciones_en_linea then
    raise exception 'RESERVACIONES_PAUSADAS: por ahora no se aceptan reservaciones en línea';
  end if;

  -- Cliente
  if admin and p_cliente_id is not null then
    select * into v_cliente from public.clientes where id = p_cliente_id;
  elsif admin and p_cliente ? 'nombre' then
    insert into public.clientes (nombre, telefono, correo, origen)
    values (p_cliente ->> 'nombre', p_cliente ->> 'telefono', nullif(p_cliente ->> 'correo', ''), coalesce(p_canal, 'Presencial'))
    returning * into v_cliente;
  else
    select * into v_cliente from public.clientes where usuario_id = auth.uid();
    if found then
      update public.clientes
         set nombre   = coalesce(nullif(p_cliente ->> 'nombre', ''), nombre),
             telefono = coalesce(nullif(p_cliente ->> 'telefono', ''), telefono)
       where id = v_cliente.id
       returning * into v_cliente;
    end if;
  end if;
  if v_cliente.id is null then
    raise exception 'CLIENTE_NO_ENCONTRADO: no hay ficha de cliente para esta reservación';
  end if;
  if v_cliente.bloqueado and not admin then
    raise exception 'CLIENTE_BLOQUEADO: comunícate con nosotros para reservar' using errcode = '42501';
  end if;

  -- Show y paquete
  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null or (not v_show.activo and not admin) then
    raise exception 'SHOW_NO_DISPONIBLE: este show no está disponible';
  end if;
  if p_paquete_id is not null then
    select * into v_paquete from public.paquetes where id = p_paquete_id and show_id = v_show.id;
    if v_paquete.id is null or (not v_paquete.activo and not admin) then
      raise exception 'PAQUETE_NO_DISPONIBLE: el paquete no pertenece a este show';
    end if;
  end if;

  -- Tipo de evento (modalidad): solo en shows que lo piden; sin elegir = ninguno, sin cargo
  if nullif(p_evento ->> 'modalidad_id', '') is not null then
    if not v_show.pide_modalidad then
      raise exception 'MODALIDAD_NO_APLICA: este show no lleva tipo de evento';
    end if;
    select * into v_mod from public.modalidades where id = (p_evento ->> 'modalidad_id')::uuid;
    if v_mod.id is null or (not v_mod.activo and not admin) then
      raise exception 'MODALIDAD_NO_DISPONIBLE: ese tipo de evento no está disponible';
    end if;
    v_cargo_mod := v_mod.cargo;
  end if;

  -- A partir de aquí nadie más escribe en la agenda hasta que termine esta transacción
  perform public.bloquear_agenda();

  select * into h from public.calcular_horario(p_show_id, p_paquete_id, p_extras, p_codigo_postal, p_inicio, admin);

  -- Cobertura (RN-01)
  if h.zona_id is null then
    if admin and p_forzar then
      v_saltos := array_append(v_saltos, 'fuera de cobertura');
    else
      raise exception 'FUERA_DE_COBERTURA: por ahora no damos servicio en el código postal %', p_codigo_postal;
    end if;
  end if;

  v_problemas := public.validar_horario(p_inicio, h.fin, h.bloque, null, h.zona_id, p_show_id);

  -- Anticipación (RN-04)
  if 'anticipación' = any (v_problemas) then
    if admin and p_forzar then
      v_saltos := array_append(v_saltos, 'anticipación');
    elsif not admin then
      raise exception 'ANTICIPACION: las reservaciones en línea se hacen con al menos % horas de anticipación', cfg.anticipacion_min_horas;
    end if;
  end if;
  if 'fecha pasada' = any (v_problemas) and not admin then
    raise exception 'FECHA_PASADA: la fecha ya pasó';
  end if;

  -- Horario de servicio (RN-21)
  if 'fuera de horario' = any (v_problemas) then
    if admin and p_forzar then
      v_saltos := array_append(v_saltos, 'fuera de horario');
    else
      raise exception 'FUERA_DE_HORARIO: ese día u hora no damos servicio';
    end if;
  end if;

  -- Fechas bloqueadas (RN-14)
  if 'fecha bloqueada' = any (v_problemas) then
    if admin and p_forzar then
      v_saltos := array_append(v_saltos, 'fecha bloqueada');
    else
      raise exception 'FECHA_BLOQUEADA: ese horario no está disponible';
    end if;
  end if;

  -- Máximo de shows del día
  if 'día lleno' = any (v_problemas) then
    if admin and p_forzar then
      v_saltos := array_append(v_saltos, 'día lleno');
    else
      raise exception 'DIA_LLENO: ya no hay lugar para más shows ese día, elige otra fecha';
    end if;
  end if;

  -- Traslape (RN-02): nunca se puede forzar
  if 'ocupado' = any (v_problemas) then
    raise exception 'HORARIO_OCUPADO: este horario acaba de ser reservado, elige otro' using errcode = '23P01';
  end if;

  if array_length(v_saltos, 1) > 0 and coalesce(trim(p_motivo), '') = '' then
    raise exception 'MOTIVO_REQUERIDO: para guardar con excepción (%), escribe el motivo', array_to_string(v_saltos, ', ');
  end if;

  -- Precio (RN-09)
  v_total := greatest(0, h.precio_show + h.precio_extras + v_cargo_mod + h.cargo_traslado - v_descuento);

  begin
    insert into public.reservaciones (
      cliente_id, show_id, paquete_id, zona_id,
      inicio, fin, bloque,
      calle, colonia, codigo_postal, municipio, referencias,
      tipo_evento, festejado, asistentes, espacio, comentarios, contacto_dia,
      precio_show, precio_extras, modalidad_id, modalidad_nombre, cargo_modalidad, cargo_traslado, descuento, total, anticipo_requerido,
      estado, expira_en, canal, motivo_excepcion, creado_por
    ) values (
      v_cliente.id, v_show.id, v_paquete.id, h.zona_id,
      p_inicio, h.fin, h.bloque,
      trim(p_calle), trim(p_colonia), p_codigo_postal, h.zona_nombre, nullif(trim(p_referencias), ''),
      p_evento ->> 'tipo_evento', p_evento ->> 'festejado', nullif(p_evento ->> 'asistentes', '')::int,
      p_evento ->> 'espacio', p_evento ->> 'comentarios', p_evento ->> 'contacto_dia',
      h.precio_show, h.precio_extras, v_mod.id, v_mod.nombre, v_cargo_mod, h.cargo_traslado, v_descuento,
      v_total,
      round(v_total * cfg.anticipo_porcentaje / 100, 2),
      case when cfg.confirmacion_automatica and cfg.anticipo_porcentaje = 0 then 'confirmada' else 'pendiente' end,
      case when cfg.anticipo_porcentaje > 0 then now() + make_interval(hours => cfg.expiracion_pendiente_horas) end,
      case when admin then coalesce(p_canal, 'Presencial') else 'En línea' end,
      case when array_length(v_saltos, 1) > 0 then array_to_string(v_saltos, ', ') || ': ' || p_motivo end,
      auth.uid()
    )
    returning * into v_res;
  exception when exclusion_violation then
    raise exception 'HORARIO_OCUPADO: este horario acaba de ser reservado, elige otro' using errcode = '23P01';
  end;

  insert into public.reservacion_extras (reservacion_id, extra_id, precio_unitario)
  select v_res.id, e.id, e.precio
    from public.extras e
   where e.id = any (coalesce(p_extras, '{}')) and (e.activo or admin);

  -- Al reservar, el horario apartado de quien reserva ya no hace falta
  delete from public.retenciones where usuario_id = auth.uid();

  return v_res;
end;
$function$;

-- ── apartar_horario(): versión viva + show ────────────────────────────────
CREATE OR REPLACE FUNCTION public.apartar_horario(p_show_id uuid, p_paquete_id uuid, p_extras uuid[], p_codigo_postal text, p_inicio timestamp with time zone)
 RETURNS retenciones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg         public.configuracion;
  v_show      public.shows;
  v_paquete   public.paquetes;
  v_cliente   public.clientes;
  h           record;
  v_problemas text[];
  v_ret       public.retenciones;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA: inicia sesión para apartar un horario' using errcode = '42501';
  end if;

  select * into cfg from public.configuracion where id = 1;
  if not cfg.reservaciones_en_linea and not public.es_admin() then
    raise exception 'RESERVACIONES_PAUSADAS: por ahora no se aceptan reservaciones en línea';
  end if;

  select * into v_cliente from public.clientes where usuario_id = auth.uid();
  if v_cliente.bloqueado then
    raise exception 'CLIENTE_BLOQUEADO: comunícate con nosotros para reservar' using errcode = '42501';
  end if;

  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null or not v_show.activo then
    raise exception 'SHOW_NO_DISPONIBLE: este show no está disponible';
  end if;
  if p_paquete_id is not null then
    select * into v_paquete from public.paquetes where id = p_paquete_id and show_id = v_show.id;
    if v_paquete.id is null or not v_paquete.activo then
      raise exception 'PAQUETE_NO_DISPONIBLE: el paquete no pertenece a este show';
    end if;
  end if;

  perform public.bloquear_agenda();

  select * into h from public.calcular_horario(p_show_id, p_paquete_id, p_extras, p_codigo_postal, p_inicio);
  if h.zona_id is null then
    raise exception 'FUERA_DE_COBERTURA: por ahora no damos servicio en el código postal %', p_codigo_postal;
  end if;

  v_problemas := public.validar_horario(p_inicio, h.fin, h.bloque, null, h.zona_id, p_show_id);
  if 'anticipación' = any (v_problemas) or 'fecha pasada' = any (v_problemas) then
    raise exception 'ANTICIPACION: las reservaciones en línea se hacen con al menos % horas de anticipación', cfg.anticipacion_min_horas;
  elsif 'fuera de horario' = any (v_problemas) then
    raise exception 'FUERA_DE_HORARIO: ese día u hora no damos servicio';
  elsif 'fecha bloqueada' = any (v_problemas) then
    raise exception 'FECHA_BLOQUEADA: ese horario no está disponible';
  elsif 'día lleno' = any (v_problemas) then
    raise exception 'DIA_LLENO: ya no hay lugar para más shows ese día, elige otra fecha';
  elsif 'ocupado' = any (v_problemas) then
    raise exception 'HORARIO_OCUPADO: este horario acaba de ser reservado, elige otro' using errcode = '23P01';
  end if;

  delete from public.retenciones where usuario_id = auth.uid();
  insert into public.retenciones (usuario_id, show_id, paquete_id, extras, codigo_postal, inicio, fin, bloque, expira_en)
  values (auth.uid(), p_show_id, p_paquete_id, coalesce(p_extras, '{}'), p_codigo_postal, p_inicio, h.fin, h.bloque,
          now() + make_interval(mins => cfg.retencion_minutos))
  returning * into v_ret;

  return v_ret;
end;
$function$;

-- ── reprogramar_reservacion(): versión viva + show ────────────────────────
CREATE OR REPLACE FUNCTION public.reprogramar_reservacion(p_reservacion_id uuid, p_nuevo_inicio timestamp with time zone, p_motivo text DEFAULT NULL::text)
 RETURNS reservaciones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  admin       boolean := public.es_admin();
  cfg         public.configuracion;
  v_res       public.reservaciones;
  v_extras    uuid[];
  h           record;
  v_problemas text[];
  v_saltos    text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA: inicia sesión para cambiar la fecha' using errcode = '42501';
  end if;

  select * into cfg from public.configuracion where id = 1;

  perform public.bloquear_agenda();

  select r.* into v_res
    from public.reservaciones r
    join public.clientes c on c.id = r.cliente_id
   where r.id = p_reservacion_id
     and (c.usuario_id = auth.uid() or admin)
   for update of r;

  if v_res.id is null then
    raise exception 'NO_ENCONTRADA: reservación no encontrada' using errcode = '42501';
  end if;
  if v_res.estado not in ('pendiente', 'confirmada') then
    raise exception 'NO_REPROGRAMABLE: esta reservación ya está %', v_res.estado;
  end if;

  -- Reglas del cliente (RN-12)
  if not admin then
    if now() > v_res.inicio - make_interval(hours => cfg.reprogramacion_min_horas) then
      raise exception 'REPROGRAMACION_TARDE: solo puedes cambiar la fecha con al menos % horas de anticipación', cfg.reprogramacion_min_horas;
    end if;
    if v_res.reprogramaciones >= cfg.reprogramaciones_max then
      raise exception 'REPROGRAMACION_LIMITE: ya cambiaste la fecha de esta reservación % vez', cfg.reprogramaciones_max;
    end if;
  end if;

  -- Mismo show, paquete, extras y dirección; solo cambia la fecha
  select coalesce(array_agg(extra_id), '{}') into v_extras
    from public.reservacion_extras where reservacion_id = v_res.id;

  select * into h from public.calcular_horario(v_res.show_id, v_res.paquete_id, v_extras, v_res.codigo_postal, p_nuevo_inicio, true);

  if h.zona_id is null then
    if admin then
      v_saltos := array_append(v_saltos, 'fuera de cobertura');
    else
      raise exception 'FUERA_DE_COBERTURA: por ahora no damos servicio en el código postal %', v_res.codigo_postal;
    end if;
  end if;

  -- La propia reservación no cuenta como ocupada
  v_problemas := public.validar_horario(p_nuevo_inicio, h.fin, h.bloque, v_res.id, h.zona_id, v_res.show_id);

  if 'anticipación' = any (v_problemas) or 'fecha pasada' = any (v_problemas) then
    if admin then
      v_saltos := array_append(v_saltos, 'anticipación');
    else
      raise exception 'ANTICIPACION: las reservaciones en línea se hacen con al menos % horas de anticipación', cfg.anticipacion_min_horas;
    end if;
  end if;
  if 'fuera de horario' = any (v_problemas) then
    if admin then
      v_saltos := array_append(v_saltos, 'fuera de horario');
    else
      raise exception 'FUERA_DE_HORARIO: ese día u hora no damos servicio';
    end if;
  end if;
  if 'fecha bloqueada' = any (v_problemas) then
    if admin then
      v_saltos := array_append(v_saltos, 'fecha bloqueada');
    else
      raise exception 'FECHA_BLOQUEADA: ese horario no está disponible';
    end if;
  end if;
  if 'día lleno' = any (v_problemas) then
    if admin then
      v_saltos := array_append(v_saltos, 'día lleno');
    else
      raise exception 'DIA_LLENO: ya no hay lugar para más shows ese día, elige otra fecha';
    end if;
  end if;
  if 'ocupado' = any (v_problemas) then
    raise exception 'HORARIO_OCUPADO: este horario acaba de ser reservado, elige otro' using errcode = '23P01';
  end if;

  if array_length(v_saltos, 1) > 0 and coalesce(trim(p_motivo), '') = '' then
    raise exception 'MOTIVO_REQUERIDO: para guardar con excepción (%), escribe el motivo', array_to_string(v_saltos, ', ');
  end if;

  begin
    update public.reservaciones
       set inicio           = p_nuevo_inicio,
           fin              = h.fin,
           bloque           = h.bloque,
           reprogramaciones = reprogramaciones + 1,
           motivo_excepcion = case when array_length(v_saltos, 1) > 0
                                   then concat_ws(' | ', motivo_excepcion,
                                                  'reprogramación (' || array_to_string(v_saltos, ', ') || '): ' || p_motivo)
                                   else motivo_excepcion end
     where id = v_res.id
     returning * into v_res;
  exception when exclusion_violation then
    raise exception 'HORARIO_OCUPADO: este horario acaba de ser reservado, elige otro' using errcode = '23P01';
  end;

  -- Si quien reprograma tenía un horario apartado, ya no hace falta
  delete from public.retenciones where usuario_id = auth.uid();

  return v_res;
end;
$function$;

-- ── guardar_horario_semana(): no toca los horarios de los shows ───────────
CREATE OR REPLACE FUNCTION public.guardar_horario_semana(p_dias jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d jsonb;
  f jsonb;
begin
  if not public.es_admin() then
    raise exception 'SOLO_ADMIN: solo el administrador cambia el horario' using errcode = '42501';
  end if;
  for d in select * from jsonb_array_elements(p_dias) loop
    update public.horario_servicio
       set activo = coalesce((d ->> 'activo')::boolean, false),
           max_shows = nullif(d ->> 'max_shows', '')::int
     where dia_semana = (d ->> 'dia_semana')::int;
    if not found then
      raise exception 'DIA_INVALIDO: día de la semana inválido';
    end if;
    delete from public.horario_franjas where dia_semana = (d ->> 'dia_semana')::int and show_id is null;
    for f in select * from jsonb_array_elements(coalesce(d -> 'franjas', '[]'::jsonb)) loop
      insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min, horas)
      values ((d ->> 'dia_semana')::int, (f ->> 'abre')::time, (f ->> 'cierra')::time,
              coalesce(f ->> 'modo', 'intervalo'), nullif(f ->> 'intervalo_min', '')::int,
              (select array_agg(x::time) from jsonb_array_elements_text(f -> 'horas') x));
    end loop;
  end loop;
end;
$function$;

-- ── Guardar el horario de un show (admin, todo o nada) ─────────────────────
-- p_dias: [{"dia_semana": 6, "franjas": [{"abre":"10:00","cierra":"14:00","modo":"intervalo","intervalo_min":120}]}, ...]
-- Con p_activo = false las franjas se guardan igual (se recuperan al volver a activarlo).
create or replace function public.guardar_horario_show(p_show_id uuid, p_activo boolean, p_dias jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb;
  f jsonb;
  n int := 0;
begin
  if not public.es_admin() then
    raise exception 'SOLO_ADMIN: solo el administrador cambia el horario' using errcode = '42501';
  end if;
  if not exists (select 1 from public.shows where id = p_show_id) then
    raise exception 'SHOW_NO_ENCONTRADO: el show no existe';
  end if;
  delete from public.horario_franjas where show_id = p_show_id;
  for d in select * from jsonb_array_elements(coalesce(p_dias, '[]'::jsonb)) loop
    if not ((d ->> 'dia_semana')::int between 0 and 6) then
      raise exception 'DIA_INVALIDO: día de la semana inválido';
    end if;
    for f in select * from jsonb_array_elements(coalesce(d -> 'franjas', '[]'::jsonb)) loop
      insert into public.horario_franjas (show_id, dia_semana, abre, cierra, modo, intervalo_min, horas)
      values (p_show_id, (d ->> 'dia_semana')::int, (f ->> 'abre')::time, (f ->> 'cierra')::time,
              coalesce(f ->> 'modo', 'intervalo'), nullif(f ->> 'intervalo_min', '')::int,
              (select array_agg(x::time) from jsonb_array_elements_text(f -> 'horas') x));
      n := n + 1;
    end loop;
  end loop;
  if p_activo and n = 0 then
    raise exception 'HORARIO_SHOW_VACIO: agrega al menos un día con horario o usa el horario general';
  end if;
  update public.shows set horario_propio = coalesce(p_activo, false) where id = p_show_id;
end;
$$;

-- ── Reservaciones futuras del show que quedarían fuera del horario propuesto ─
-- Solo para el aviso del panel: no cancela nada. Los días especiales mandan,
-- así que esas fechas no se revisan aquí.
create or replace function public.reservaciones_fuera_horario_show(p_show_id uuid, p_dias jsonb)
returns table (id uuid, folio text, inicio timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg public.configuracion;
begin
  if not public.es_admin() then
    raise exception 'SOLO_ADMIN: solo el administrador' using errcode = '42501';
  end if;
  select * into cfg from public.configuracion c where c.id = 1;
  return query
    select r.id, r.folio::text, r.inicio
      from public.reservaciones r
     where r.show_id = p_show_id
       and r.estado in ('pendiente', 'confirmada')
       and r.inicio > now()
       and not exists (select 1 from public.dias_especiales e where e.fecha = (r.inicio at time zone cfg.zona_horaria)::date)
       and not exists (
         select 1
           from public.inicios_de_franjas(
                  coalesce((select x -> 'franjas' from jsonb_array_elements(coalesce(p_dias, '[]'::jsonb)) x
                             where (x ->> 'dia_semana')::int = extract(dow from r.inicio at time zone cfg.zona_horaria)::int
                             limit 1), '[]'::jsonb),
                  (extract(epoch from (r.fin - r.inicio)) / 60)::int) i
          where i.inicio = (r.inicio at time zone cfg.zona_horaria)::time)
     order by r.inicio;
end;
$$;

-- ── Resumen público del horario de un show (solo días y rangos) ────────────
-- Para la línea "Se presenta: …" del sitio. Vacío si el show usa el horario general.
create or replace function public.resumen_horario_show(p_show_id uuid)
returns table (dia_semana int, abre time, cierra time)
language sql
stable
security definer
set search_path = ''
as $$
  select f.dia_semana::int, f.abre, f.cierra
    from public.horario_franjas f
    join public.shows s on s.id = f.show_id
   where f.show_id = p_show_id and s.horario_propio and s.activo
   order by f.dia_semana, f.abre;
$$;

revoke execute on function public.guardar_horario_show(uuid, boolean, jsonb), public.reservaciones_fuera_horario_show(uuid, jsonb) from public, anon;
grant execute on function public.guardar_horario_show(uuid, boolean, jsonb), public.reservaciones_fuera_horario_show(uuid, jsonb) to authenticated;
revoke execute on function public.resumen_horario_show(uuid) from public;
grant execute on function public.resumen_horario_show(uuid) to anon, authenticated;

commit;
