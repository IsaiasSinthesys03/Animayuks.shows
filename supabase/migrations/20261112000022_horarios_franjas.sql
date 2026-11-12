-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 22: horarios por franjas
-- · Varias franjas por día; cada franja ofrece horas "cada X minutos" o una
--   lista de horas exactas.
-- · Máximo de shows por día (semana normal o día especial).
-- · Días especiales: una fecha con su propio horario, reemplaza la semana.
-- · Los bloqueos ya aceptan cualquier rango; el panel ahora permite unas horas.
-- · El horario anterior (una franja por día + intervalo global) se convierte en
--   franjas equivalentes: se ofrecen las mismas horas que antes.
-- · Ya no hay horario por zona (zonas.horario queda sin uso, todas en null).
-- Las funciones de reservación se reconstruyeron desde su versión viva.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── Tablas ──────────────────────────────────────────────────────────────────
create table public.dias_especiales (
  fecha      date primary key,
  max_shows  int check (max_shows between 1 and 20),
  motivo     text not null default '',
  creado_por uuid references auth.users (id) on delete set null,
  creado_en  timestamptz not null default now()
);

create table public.horario_franjas (
  id            uuid primary key default gen_random_uuid(),
  dia_semana    smallint references public.horario_servicio (dia_semana) on delete cascade,
  fecha         date references public.dias_especiales (fecha) on delete cascade,
  abre          time not null,
  cierra        time not null,
  modo          text not null default 'intervalo' check (modo in ('intervalo', 'horas')),
  intervalo_min int check (intervalo_min between 15 and 480 and intervalo_min % 5 = 0),
  horas         time[],
  check ((dia_semana is null) <> (fecha is null)),
  check (cierra > abre),
  check (modo <> 'intervalo' or intervalo_min is not null),
  check (modo <> 'horas' or cardinality(horas) between 1 and 24)
);
create index horario_franjas_dia_idx on public.horario_franjas (dia_semana);
create index horario_franjas_fecha_idx on public.horario_franjas (fecha);

alter table public.horario_servicio add column max_shows int check (max_shows between 1 and 20);

-- Antes de guardar: horas exactas ordenadas, sin repetir, dentro de la franja
create or replace function public.horario_franjas_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.modo = 'horas' then
    select array_agg(distinct h order by h) into new.horas from unnest(new.horas) h;
    if exists (select 1 from unnest(new.horas) h where h < new.abre or h >= new.cierra) then
      raise exception 'HORA_FUERA_DE_FRANJA: las horas exactas deben estar entre % y %', to_char(new.abre, 'HH24:MI'), to_char(new.cierra, 'HH24:MI')
        using errcode = '23514';
    end if;
    if exists (select 1 from unnest(new.horas) h where extract(minute from h)::int % 5 <> 0 or extract(second from h) <> 0) then
      raise exception 'HORA_INVALIDA: usa horas en múltiplos de 5 minutos' using errcode = '23514';
    end if;
    new.intervalo_min := null;
  else
    new.horas := null;
  end if;
  return new;
end;
$$;
create trigger horario_franjas_normalizar before insert or update on public.horario_franjas
  for each row execute function public.horario_franjas_normalizar();

-- Después de guardar: sin franjas encimadas y máximo 6 por día
create or replace function public.horario_franjas_validar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.horario_franjas o
     where o.id <> new.id
       and o.dia_semana is not distinct from new.dia_semana
       and o.fecha is not distinct from new.fecha
       and o.abre < new.cierra and new.abre < o.cierra
  ) then
    raise exception 'FRANJA_ENCIMADA: dos franjas del mismo día no pueden encimarse' using errcode = '23P01';
  end if;
  if (select count(*) from public.horario_franjas o
       where o.dia_semana is not distinct from new.dia_semana and o.fecha is not distinct from new.fecha) > 6 then
    raise exception 'DEMASIADAS_FRANJAS: máximo 6 franjas por día' using errcode = '23514';
  end if;
  return null;
end;
$$;
create trigger horario_franjas_validar after insert or update on public.horario_franjas
  for each row execute function public.horario_franjas_validar();

-- ── Conversión del horario anterior ────────────────────────────────────────
insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min)
select h.dia_semana, h.abre, h.cierra, 'intervalo', c.intervalo_horarios_min
  from public.horario_servicio h cross join public.configuracion c
 where c.id = 1;

alter table public.horario_servicio drop column abre, drop column cierra;

-- ── Permisos ────────────────────────────────────────────────────────────────
alter table public.dias_especiales enable row level security;
alter table public.horario_franjas enable row level security;
grant select, insert, update, delete on public.dias_especiales, public.horario_franjas to authenticated;
create policy "horarios: admin gestiona días especiales" on public.dias_especiales
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "horarios: admin gestiona franjas" on public.horario_franjas
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ── Franjas y límite que aplican a una fecha (interno) ─────────────────────
-- Un día especial reemplaza la semana; si no, la semana normal si el día está activo.
create or replace function public.franjas_del_dia(p_fecha date)
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
           when exists (select 1 from public.dias_especiales d where d.fecha = p_fecha) then f.fecha = p_fecha
           else f.dia_semana = extract(dow from p_fecha)::int
                and exists (select 1 from public.horario_servicio h where h.dia_semana = f.dia_semana and h.activo)
         end;
$$;

create or replace function public.limite_del_dia(p_fecha date)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when exists (select 1 from public.dias_especiales d where d.fecha = p_fecha)
             then (select d.max_shows from public.dias_especiales d where d.fecha = p_fecha)
           else (select h.max_shows from public.horario_servicio h where h.dia_semana = extract(dow from p_fecha)::int)
         end;
$$;

-- Horas de inicio que ofrecen unas franjas para un show de cierta duración.
-- Una sola fuente de verdad: la usan la agenda, la validación y la vista previa.
-- Franjas: [{"abre":"09:00","cierra":"13:00","modo":"intervalo","intervalo_min":120}, {"modo":"horas","horas":["16:00"],...}]
create or replace function public.inicios_de_franjas(p_franjas jsonb, p_duracion_min int)
returns table (inicio time)
language plpgsql
immutable
set search_path = ''
as $$
declare
  f       jsonb;
  abre_m  int;
  cierra_m int;
  paso    int;
  m       int;
  h       jsonb;
begin
  for f in select * from jsonb_array_elements(coalesce(p_franjas, '[]'::jsonb)) loop
    abre_m   := extract(epoch from (f ->> 'abre')::time)::int / 60;
    cierra_m := extract(epoch from (f ->> 'cierra')::time)::int / 60;
    if f ->> 'modo' = 'horas' then
      for h in select * from jsonb_array_elements(coalesce(f -> 'horas', '[]'::jsonb)) loop
        m := extract(epoch from (h #>> '{}')::time)::int / 60;
        if m >= abre_m and m + p_duracion_min <= cierra_m then
          inicio := make_time(m / 60, m % 60, 0);
          return next;
        end if;
      end loop;
    else
      paso := greatest(coalesce((f ->> 'intervalo_min')::int, 60), 5);
      m := abre_m;
      while m + p_duracion_min <= cierra_m loop
        inicio := make_time(m / 60, m % 60, 0);
        return next;
        m := m + paso;
      end loop;
    end if;
  end loop;
end;
$$;

revoke execute on function public.franjas_del_dia(date), public.limite_del_dia(date),
  public.inicios_de_franjas(jsonb, int) from public, anon, authenticated;

-- ── validar_horario(): franjas, hora ofrecida y máximo por día ─────────────
-- Misma firma (p_zona_id ya no cambia nada: las zonas no tienen horario).
CREATE OR REPLACE FUNCTION public.validar_horario(p_inicio timestamp with time zone, p_fin timestamp with time zone, p_bloque tstzrange, p_excluir_reservacion uuid DEFAULT NULL::uuid, p_zona_id uuid DEFAULT NULL::uuid)
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
       select 1 from public.inicios_de_franjas(public.franjas_del_dia(v_ini::date),
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

-- ── evaluar_horarios_dia(): un inicio por cada hora que ofrecen las franjas ─
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
  v_franjas := public.franjas_del_dia(p_fecha);
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
    problemas := public.validar_horario(inicio, fin, tstzrange(inicio - antes, fin + despues), null, v_zona_id);
    return next;
  end loop;
end;
$function$;

-- ── disponibilidad_mes(): un día con el máximo alcanzado sale "lleno" ──────
CREATE OR REPLACE FUNCTION public.disponibilidad_mes(p_show_id uuid, p_paquete_id uuid, p_extras uuid[], p_codigo_postal text, p_anio integer, p_mes integer)
 RETURNS TABLE(fecha date, horarios integer, estado text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d        date := make_date(p_anio, p_mes, 1);
  ultimo   date := (make_date(p_anio, p_mes, 1) + interval '1 month - 1 day')::date;
  posibles int;
  libres   int;
  v_ok     boolean;
begin
  v_ok := exists (select 1 from public.shows s where s.id = p_show_id and s.activo)
          and (p_paquete_id is null or exists (select 1 from public.paquetes p where p.id = p_paquete_id and p.activo))
          and (public.zona_por_cp(p_codigo_postal)).id is not null;

  while d <= ultimo loop
    posibles := 0;
    libres := 0;
    if v_ok then
      select count(*) filter (where e.problemas <@ array['ocupado', 'día lleno']),
             count(*) filter (where cardinality(e.problemas) = 0)
        into posibles, libres
        from public.evaluar_horarios_dia(p_show_id, p_paquete_id, p_extras, p_codigo_postal, d) e;
    end if;
    fecha    := d;
    horarios := libres;
    estado   := case when posibles = 0 then 'no_disponible'
                     when libres = 0   then 'lleno'
                     when libres <= 2  then 'pocos'
                     else 'libre' end;
    return next;
    d := d + 1;
  end loop;
end;
$function$;

-- ── crear_reservacion(): versión viva + "día lleno" ─────────────────────
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

  v_problemas := public.validar_horario(p_inicio, h.fin, h.bloque, null, h.zona_id);

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

-- ── apartar_horario(): versión viva + "día lleno" ───────────────────────
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

  v_problemas := public.validar_horario(p_inicio, h.fin, h.bloque, null, h.zona_id);
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

-- ── reprogramar_reservacion(): versión viva + "día lleno" ───────────────
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
  v_problemas := public.validar_horario(p_nuevo_inicio, h.fin, h.bloque, v_res.id, h.zona_id);

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

-- ── Guardar la semana completa en una sola transacción (admin) ─────────────
-- p_dias: [{"dia_semana":6,"activo":true,"max_shows":3,
--           "franjas":[{"abre":"09:00","cierra":"13:00","modo":"intervalo","intervalo_min":120}, ...]}, ...]
create or replace function public.guardar_horario_semana(p_dias jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    delete from public.horario_franjas where dia_semana = (d ->> 'dia_semana')::int;
    for f in select * from jsonb_array_elements(coalesce(d -> 'franjas', '[]'::jsonb)) loop
      insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min, horas)
      values ((d ->> 'dia_semana')::int, (f ->> 'abre')::time, (f ->> 'cierra')::time,
              coalesce(f ->> 'modo', 'intervalo'), nullif(f ->> 'intervalo_min', '')::int,
              (select array_agg(x::time) from jsonb_array_elements_text(f -> 'horas') x));
    end loop;
  end loop;
end;
$$;

-- ── Crear o cambiar un día especial con sus franjas (admin) ────────────────
create or replace function public.guardar_dia_especial(p_fecha date, p_max_shows int, p_motivo text, p_franjas jsonb, p_fecha_anterior date default null)
returns public.dias_especiales
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  v public.dias_especiales;
begin
  if not public.es_admin() then
    raise exception 'SOLO_ADMIN: solo el administrador cambia el horario' using errcode = '42501';
  end if;
  if p_fecha_anterior is not null and p_fecha_anterior <> p_fecha then
    delete from public.dias_especiales where fecha = p_fecha_anterior;
  end if;
  insert into public.dias_especiales (fecha, max_shows, motivo, creado_por)
  values (p_fecha, p_max_shows, coalesce(trim(p_motivo), ''), auth.uid())
  on conflict (fecha) do update set max_shows = excluded.max_shows, motivo = excluded.motivo
  returning * into v;
  delete from public.horario_franjas where fecha = p_fecha;
  for f in select * from jsonb_array_elements(coalesce(p_franjas, '[]'::jsonb)) loop
    insert into public.horario_franjas (fecha, abre, cierra, modo, intervalo_min, horas)
    values (p_fecha, (f ->> 'abre')::time, (f ->> 'cierra')::time,
            coalesce(f ->> 'modo', 'intervalo'), nullif(f ->> 'intervalo_min', '')::int,
            (select array_agg(x::time) from jsonb_array_elements_text(f -> 'horas') x));
  end loop;
  return v;
end;
$$;

-- ── Vista previa: las horas que verá el cliente, antes de guardar (admin) ──
create or replace function public.vista_previa_horario(p_franjas jsonb, p_duracion_min int)
returns table (inicio time)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'SOLO_ADMIN: solo el administrador ve la vista previa' using errcode = '42501';
  end if;
  return query select distinct i.inicio from public.inicios_de_franjas(p_franjas, p_duracion_min) i order by i.inicio;
end;
$$;

-- Reservaciones vivas de una fecha que quedarían fuera de unas franjas (aviso en el panel)
create or replace function public.reservaciones_fuera_de_franjas(p_fecha date, p_franjas jsonb)
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
     where r.estado in ('pendiente', 'confirmada')
       and (r.inicio at time zone cfg.zona_horaria)::date = p_fecha
       and not exists (
         select 1 from public.inicios_de_franjas(p_franjas, (extract(epoch from (r.fin - r.inicio)) / 60)::int) i
          where i.inicio = (r.inicio at time zone cfg.zona_horaria)::time)
     order by r.inicio;
end;
$$;

revoke execute on function public.guardar_horario_semana(jsonb), public.guardar_dia_especial(date, int, text, jsonb, date),
  public.vista_previa_horario(jsonb, int), public.reservaciones_fuera_de_franjas(date, jsonb) from public, anon;
grant execute on function public.guardar_horario_semana(jsonb), public.guardar_dia_especial(date, int, text, jsonb, date),
  public.vista_previa_horario(jsonb, int), public.reservaciones_fuera_de_franjas(date, jsonb) to authenticated;

-- ── Ya no hay intervalo global ni horario por zona ─────────────────────────
alter table public.configuracion drop column intervalo_horarios_min;
drop function if exists public.horario_de_zona(uuid, int);

commit;
