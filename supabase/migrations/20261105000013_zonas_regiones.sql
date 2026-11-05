-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 13: zonas por región
-- · Catálogo de códigos postales de México, para elegir sin escribirlos.
-- · Una zona puede cubrir estados, municipios o códigos postales; lo más
--   específico gana (CP > municipio > estado).
-- · Cada zona puede tener su propio horario semanal (norte en la mañana, sur en
--   la noche). Sin horario propio usa el horario general.
-- Las funciones que validan horarios se reconstruyeron desde su versión viva.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── Catálogo ────────────────────────────────────────────────────────────────
create or replace function public.normalizar_texto(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(lower(translate(coalesce(p_texto, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '\s+', ' ', 'g'));
$$;

create table public.catalogo_cp (
  codigo_postal text primary key check (codigo_postal ~ '^\d{5}$'),
  estado        text not null,
  municipio     text not null,
  colonias      text[] not null default '{}',
  busqueda      text not null
);
create index catalogo_cp_lugar on public.catalogo_cp (estado, municipio);

alter table public.catalogo_cp enable row level security;
grant select on public.catalogo_cp to anon, authenticated;
create policy "catálogo de CP: lectura pública" on public.catalogo_cp
  for select to anon, authenticated using (true);

create or replace function public.catalogo_estados()
returns table (estado text, municipios int, cps int)
language sql
stable
set search_path = ''
as $$
  select c.estado, count(distinct c.municipio)::int, count(*)::int
    from public.catalogo_cp c
   group by c.estado
   order by c.estado;
$$;

create or replace function public.catalogo_municipios(p_estado text)
returns table (municipio text, cps int)
language sql
stable
set search_path = ''
as $$
  select c.municipio, count(*)::int
    from public.catalogo_cp c
   where c.estado = p_estado
   group by c.municipio
   order by c.municipio;
$$;

-- Busca sin importar acentos ni el orden de las palabras: estados, municipios y CP
create or replace function public.catalogo_buscar(p_texto text, p_limite int default 40)
returns table (tipo text, estado text, municipio text, codigo_postal text, colonias text[])
language sql
stable
set search_path = ''
as $$
  with palabras as (
    select array_remove(string_to_array(public.normalizar_texto(p_texto), ' '), '') as p
     where length(public.normalizar_texto(p_texto)) >= 2
  ),
  lugares as (
    select distinct c.estado, c.municipio from public.catalogo_cp c
  )
  (select 'estado'::text, e.estado, null::text, null::text, null::text[]
     from (select distinct l.estado from lugares l) e, palabras
    where not exists (select 1 from unnest(p) t where position(t in public.normalizar_texto(e.estado)) = 0)
    order by e.estado)
  union all
  (select 'municipio', l.estado, l.municipio, null, null
     from lugares l, palabras
    where not exists (select 1 from unnest(p) t where position(t in public.normalizar_texto(l.municipio || ' ' || l.estado)) = 0)
    order by l.municipio, l.estado
    limit 15)
  union all
  (select 'cp', c.estado, c.municipio, c.codigo_postal, c.colonias
     from public.catalogo_cp c, palabras
    where not exists (select 1 from unnest(p) t where position(t in c.busqueda) = 0)
    order by c.codigo_postal
    limit greatest(coalesce(p_limite, 40), 1));
$$;

grant execute on function public.catalogo_estados() to anon, authenticated;
grant execute on function public.catalogo_municipios(text) to anon, authenticated;
grant execute on function public.catalogo_buscar(text, int) to anon, authenticated;

-- ── Zonas: qué cubren y cuándo ──────────────────────────────────────────────
-- horario: {"1": {"abre": "09:00", "cierra": "14:00"}, ...} con 0 = domingo.
-- Un día que no aparece no tiene servicio. null = usa el horario general.
create or replace function public.horario_zona_valido(p_horario jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d record;
begin
  if p_horario is null then
    return true;
  end if;
  if jsonb_typeof(p_horario) <> 'object' or p_horario = '{}'::jsonb then
    return false;
  end if;
  for d in select * from jsonb_each(p_horario) loop
    if d.key !~ '^[0-6]$'
       or jsonb_typeof(d.value) <> 'object'
       or coalesce(d.value ->> 'abre', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
       or coalesce(d.value ->> 'cierra', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
       or d.value ->> 'cierra' <= d.value ->> 'abre' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.zonas
  add column estados    text[] not null default '{}' check (array_position(estados, null) is null),
  add column municipios text[] not null default '{}' check (array_position(municipios, null) is null),
  add column horario    jsonb check (public.horario_zona_valido(horario));

comment on column public.zonas.municipios is 'Cada elemento es Estado|Municipio, porque hay municipios con el mismo nombre en varios estados';

-- Un mismo lugar no puede estar en dos zonas: no se sabría cuál precio aplicar
create or replace function public.zonas_validar_cobertura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_otra text;
begin
  select z.nombre into v_otra
    from public.zonas z
   where z.id <> new.id
     and (z.codigos_postales && new.codigos_postales or z.estados && new.estados or z.municipios && new.municipios)
   limit 1;
  if v_otra is not null then
    raise exception 'COBERTURA_DUPLICADA: parte de lo que elegiste ya está en la zona %', v_otra using errcode = '23505';
  end if;
  return new;
end;
$$;
revoke execute on function public.zonas_validar_cobertura() from public, anon, authenticated;

create trigger zonas_validar_cobertura before insert or update on public.zonas
  for each row execute function public.zonas_validar_cobertura();

-- La zona más específica decide. Si esa zona está pausada no hay cobertura: pausar
-- una ciudad no debe pasar sus clientes a la zona del estado con otro precio.
create or replace function public.zona_por_cp(p_cp text)
returns public.zonas
language sql
stable
security definer
set search_path = ''
as $$
  select m.*
    from (
      select z.*
        from public.zonas z
        left join public.catalogo_cp c on c.codigo_postal = p_cp
       cross join lateral (
         select greatest(
           (select 100 + max(length(prefijo)) from unnest(z.codigos_postales) as prefijo where p_cp like prefijo || '%'),
           case when c.estado || '|' || c.municipio = any (z.municipios) then 50 end,
           case when c.estado = any (z.estados) then 10 end
         ) as rango
       ) r
       where p_cp ~ '^\d{5}$'
         and r.rango is not null
       order by r.rango desc, z.activa desc
       limit 1
    ) m
   where m.activa;
$$;

-- ── Horario que aplica a una zona en un día (interno) ───────────────────────
create or replace function public.horario_de_zona(p_zona_id uuid, p_dia int)
returns public.horario_servicio
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_horario jsonb;
  r         public.horario_servicio;
begin
  select z.horario into v_horario from public.zonas z where z.id = p_zona_id;
  if v_horario is null then
    select * into r from public.horario_servicio h where h.dia_semana = p_dia;
    return r;
  end if;
  r.dia_semana := p_dia;
  r.activo     := v_horario ? p_dia::text;
  r.abre       := coalesce((v_horario -> p_dia::text ->> 'abre')::time, '00:00');
  r.cierra     := coalesce((v_horario -> p_dia::text ->> 'cierra')::time, '00:00');
  return r;
end;
$$;
revoke execute on function public.horario_de_zona(uuid, int) from public, anon, authenticated;

-- ── Funciones reconstruidas desde la versión viva ───────────────────────────
drop function public.validar_horario(timestamptz, timestamptz, tstzrange, uuid);

CREATE OR REPLACE FUNCTION public.validar_horario(p_inicio timestamp with time zone, p_fin timestamp with time zone, p_bloque tstzrange, p_excluir_reservacion uuid DEFAULT NULL::uuid, p_zona_id uuid DEFAULT NULL::uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg        public.configuracion;
  v_horario  public.horario_servicio;
  v_ini      timestamp;
  v_fin      timestamp;
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

  v_ini := p_inicio at time zone cfg.zona_horaria;
  v_fin := p_fin at time zone cfg.zona_horaria;
  v_horario := public.horario_de_zona(p_zona_id, extract(dow from v_ini)::int);
  if v_horario.dia_semana is null or not v_horario.activo
     or v_ini::time < v_horario.abre or v_fin::time > v_horario.cierra
     or v_fin::date <> v_ini::date then
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

  return problemas;
end;
$function$;

CREATE OR REPLACE FUNCTION public.evaluar_horarios_dia(p_show_id uuid, p_paquete_id uuid, p_extras uuid[], p_codigo_postal text, p_fecha date)
 RETURNS TABLE(inicio timestamp with time zone, fin timestamp with time zone, problemas text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg       public.configuracion;
  v_horario public.horario_servicio;
  v_zona_id uuid;
  h         record;
  antes     interval;
  despues   interval;
  t         timestamptz;
  cierre    timestamptz;
begin
  select * into cfg from public.configuracion where id = 1;
  v_zona_id := (public.zona_por_cp(p_codigo_postal)).id;
  v_horario := public.horario_de_zona(v_zona_id, extract(dow from p_fecha)::int);
  if v_horario.dia_semana is null then
    return;
  end if;

  t      := (p_fecha + v_horario.abre) at time zone cfg.zona_horaria;
  cierre := (p_fecha + v_horario.cierra) at time zone cfg.zona_horaria;

  -- La duración y los márgenes no dependen de la hora: se calculan una vez
  select * into h from public.calcular_horario(p_show_id, p_paquete_id, p_extras, p_codigo_postal, t);
  antes   := t - lower(h.bloque);
  despues := upper(h.bloque) - h.fin;

  while t + make_interval(mins => h.duracion_min) <= cierre loop
    inicio    := t;
    fin       := t + make_interval(mins => h.duracion_min);
    problemas := public.validar_horario(inicio, fin, tstzrange(inicio - antes, fin + despues), null, v_zona_id);
    return next;
    t := t + make_interval(mins => cfg.intervalo_horarios_min);
  end loop;
end;
$function$;

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

  -- Traslape (RN-02): nunca se puede forzar
  if 'ocupado' = any (v_problemas) then
    raise exception 'HORARIO_OCUPADO: este horario acaba de ser reservado, elige otro' using errcode = '23P01';
  end if;

  if array_length(v_saltos, 1) > 0 and coalesce(trim(p_motivo), '') = '' then
    raise exception 'MOTIVO_REQUERIDO: para guardar con excepción (%), escribe el motivo', array_to_string(v_saltos, ', ');
  end if;

  -- Precio (RN-09)
  v_total := greatest(0, h.precio_show + h.precio_extras + h.cargo_traslado - v_descuento);

  begin
    insert into public.reservaciones (
      cliente_id, show_id, paquete_id, zona_id,
      inicio, fin, bloque,
      calle, colonia, codigo_postal, municipio, referencias,
      tipo_evento, festejado, asistentes, espacio, comentarios, contacto_dia,
      precio_show, precio_extras, cargo_traslado, descuento, total, anticipo_requerido,
      estado, expira_en, canal, motivo_excepcion, creado_por
    ) values (
      v_cliente.id, v_show.id, v_paquete.id, h.zona_id,
      p_inicio, h.fin, h.bloque,
      trim(p_calle), trim(p_colonia), p_codigo_postal, h.zona_nombre, nullif(trim(p_referencias), ''),
      p_evento ->> 'tipo_evento', p_evento ->> 'festejado', nullif(p_evento ->> 'asistentes', '')::int,
      p_evento ->> 'espacio', p_evento ->> 'comentarios', p_evento ->> 'contacto_dia',
      h.precio_show, h.precio_extras, h.cargo_traslado, v_descuento,
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

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke execute on function public.validar_horario(timestamptz, timestamptz, tstzrange, uuid, uuid) from public, anon, authenticated;

commit;
