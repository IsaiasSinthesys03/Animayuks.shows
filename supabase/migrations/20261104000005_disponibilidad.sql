-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 5: disponibilidad real
-- Un solo cálculo de horarios (duración, montaje, desmontaje, traslado) para el
-- calendario y para crear reservaciones, candado de agenda y las funciones
-- públicas horarios_disponibles() y disponibilidad_mes().
-- crear_reservacion() se reconstruyó a partir de su versión viva en Supabase.
-- Plan: MD/Plan_Etapa_2.md, sección 4 (migración 5).
-- ═════════════════════════════════════════════════════════════════════════════

-- Todo el archivo se aplica completo o no se aplica nada.
begin;

-- ── Candado de agenda ───────────────────────────────────────────────────────
-- Toda operación que escribe en la agenda lo toma: dos personas nunca validan
-- y guardan el mismo horario al mismo tiempo. Se libera al terminar la transacción.
create or replace function public.bloquear_agenda()
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('animayuks.agenda', 0));
$$;

create or replace function public.bloqueos_tomar_candado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.bloquear_agenda();
  return coalesce(new, old);
end;
$$;

create trigger bloqueos_candado before insert or update on public.bloqueos
  for each row execute function public.bloqueos_tomar_candado();

-- ── Cálculo de horario (interno) ────────────────────────────────────────────
-- Duración = paquete (o show) + minutos de extras.
-- Bloque   = [inicio − montaje − traslado, fin + desmontaje + traslado]   (RN-02)
-- Sin cobertura: zona nula y traslado 0; quien llama decide si es error.
create or replace function public.calcular_horario(
  p_show_id          uuid,
  p_paquete_id       uuid,
  p_extras           uuid[],
  p_codigo_postal    text,
  p_inicio           timestamptz,
  p_incluir_inactivos boolean default false,
  out duracion_min   int,
  out fin            timestamptz,
  out bloque         tstzrange,
  out zona_id        uuid,
  out zona_nombre    text,
  out traslado_min   int,
  out cargo_traslado numeric,
  out precio_show    numeric,
  out precio_extras  numeric,
  out extras_min     int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_show    public.shows;
  v_paquete public.paquetes;
  v_zona    public.zonas;
begin
  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null then
    raise exception 'SHOW_NO_DISPONIBLE: este show no está disponible';
  end if;
  if p_paquete_id is not null then
    select * into v_paquete from public.paquetes where id = p_paquete_id and show_id = v_show.id;
    if v_paquete.id is null then
      raise exception 'PAQUETE_NO_DISPONIBLE: el paquete no pertenece a este show';
    end if;
  end if;

  select coalesce(sum(e.precio), 0), coalesce(sum(e.minutos), 0)
    into precio_extras, extras_min
    from public.extras e
   where e.id = any (coalesce(p_extras, '{}')) and (e.activo or p_incluir_inactivos);

  v_zona := public.zona_por_cp(p_codigo_postal);

  duracion_min   := coalesce(v_paquete.duracion_min, v_show.duracion_min) + extras_min;
  fin            := p_inicio + make_interval(mins => duracion_min);
  zona_id        := v_zona.id;
  zona_nombre    := v_zona.nombre;
  traslado_min   := coalesce(v_zona.traslado_min, 0);
  cargo_traslado := coalesce(v_zona.cargo_traslado, 0);
  precio_show    := coalesce(v_paquete.precio, v_show.precio_base);
  bloque := tstzrange(
    p_inicio - make_interval(mins => v_show.montaje_min + traslado_min),
    fin      + make_interval(mins => v_show.desmontaje_min + traslado_min)
  );
end;
$$;

-- ── Validación de horario (interno) ─────────────────────────────────────────
-- Devuelve la lista de problemas; vacía si el horario se puede reservar.
--   'fecha pasada' · 'anticipación' (RN-04) · 'fuera de horario' (RN-21)
--   'fecha bloqueada' (RN-14) · 'ocupado' (RN-02)
create or replace function public.validar_horario(
  p_inicio              timestamptz,
  p_fin                 timestamptz,
  p_bloque              tstzrange,
  p_excluir_reservacion uuid default null
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
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
  select * into v_horario from public.horario_servicio where dia_semana = extract(dow from v_ini);
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

  return problemas;
end;
$$;


-- ── Horarios candidatos de un día (interno) ─────────────────────────────────
-- Cada inicio posible del día, cada intervalo_horarios_min, con sus problemas.
create or replace function public.evaluar_horarios_dia(
  p_show_id       uuid,
  p_paquete_id    uuid,
  p_extras        uuid[],
  p_codigo_postal text,
  p_fecha         date
)
returns table (inicio timestamptz, fin timestamptz, problemas text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg       public.configuracion;
  v_horario public.horario_servicio;
  h         record;
  antes     interval;
  despues   interval;
  t         timestamptz;
  cierre    timestamptz;
begin
  select * into cfg from public.configuracion where id = 1;
  select * into v_horario from public.horario_servicio where dia_semana = extract(dow from p_fecha);
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
    problemas := public.validar_horario(inicio, fin, tstzrange(inicio - antes, fin + despues));
    return next;
    t := t + make_interval(mins => cfg.intervalo_horarios_min);
  end loop;
end;
$$;

-- ── Horarios disponibles de un día (público, RF-DIS-02) ─────────────────────
-- Solo horas de inicio sin ningún problema. Sin cobertura o show oculto: vacío.
create or replace function public.horarios_disponibles(
  p_show_id       uuid,
  p_paquete_id    uuid,
  p_extras        uuid[],
  p_codigo_postal text,
  p_fecha         date
)
returns table (inicio timestamptz, fin timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.inicio, e.fin
    from public.evaluar_horarios_dia(p_show_id, p_paquete_id, p_extras, p_codigo_postal, p_fecha) e
   where cardinality(e.problemas) = 0
     and exists (select 1 from public.shows s where s.id = p_show_id and s.activo)
     and (p_paquete_id is null or exists (select 1 from public.paquetes p where p.id = p_paquete_id and p.activo))
     and (public.zona_por_cp(p_codigo_postal)).id is not null
   order by e.inicio;
$$;

-- ── Disponibilidad del mes (público, RF-DIS-01) ─────────────────────────────
-- estado: 'no_disponible' (sin servicio, bloqueado, fuera de anticipación o sin cobertura)
--         'lleno' (hay servicio pero todo está ocupado) · 'pocos' (1–2) · 'libre' (3 o más)
create or replace function public.disponibilidad_mes(
  p_show_id       uuid,
  p_paquete_id    uuid,
  p_extras        uuid[],
  p_codigo_postal text,
  p_anio          int,
  p_mes           int
)
returns table (fecha date, horarios int, estado text)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      select count(*) filter (where e.problemas <@ array['ocupado']),
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
$$;

-- ── crear_reservacion(): reconstruida desde la versión viva ─────────────────
-- Misma firma, mismos mensajes de error. Ahora usa calcular_horario(),
-- validar_horario() y el candado de agenda.
create or replace function public.crear_reservacion(
  p_show_id       uuid,
  p_paquete_id    uuid,
  p_inicio        timestamptz,
  p_codigo_postal text,
  p_calle         text,
  p_colonia       text,
  p_referencias   text default null,
  p_extras        uuid[] default '{}',
  p_evento        jsonb default '{}',
  p_cliente       jsonb default '{}',
  p_cliente_id    uuid default null,
  p_canal         text default null,
  p_descuento     numeric default 0,
  p_forzar        boolean default false,
  p_motivo        text default null
)
returns public.reservaciones
language plpgsql
security definer
set search_path = ''
as $$
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

  v_problemas := public.validar_horario(p_inicio, h.fin, h.bloque);

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

  return v_res;
end;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke execute on function public.bloquear_agenda() from public, anon, authenticated;
revoke execute on function public.calcular_horario(uuid, uuid, uuid[], text, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public.validar_horario(timestamptz, timestamptz, tstzrange, uuid) from public, anon, authenticated;
revoke execute on function public.evaluar_horarios_dia(uuid, uuid, uuid[], text, date) from public, anon, authenticated;
grant execute on function public.horarios_disponibles(uuid, uuid, uuid[], text, date) to anon, authenticated;
grant execute on function public.disponibilidad_mes(uuid, uuid, uuid[], text, int, int) to anon, authenticated;

commit;
