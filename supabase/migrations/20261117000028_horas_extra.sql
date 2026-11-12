-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 28: horas extra por show
-- · Cada show puede permitir tiempo extra en bloques de 30 minutos, con su
--   propio precio por hora (la media hora cuesta la mitad).
-- · Máximo general en Configuración; además el show alargado debe terminar
--   dentro de su franja y no chocar con otra reservación (lo valida la agenda).
-- · El tiempo extra alarga el show y su bloque; traslado y montaje no cambian.
-- · Después de reservar, solo el admin cambia las horas (cambiar_horas_extra).
-- · Las funciones públicas conservan sus parámetros y agregan uno opcional:
--   compatible con el sitio publicado. Reconstruidas desde su versión viva.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

alter table public.shows
  add column permite_horas_extra boolean       not null default false,
  add column precio_hora_extra   numeric(10,2) not null default 0 check (precio_hora_extra >= 0);

alter table public.configuracion
  add column max_minutos_extra int not null default 180
    check (max_minutos_extra between 30 and 600 and max_minutos_extra % 30 = 0);

alter table public.reservaciones
  add column minutos_extra     int           not null default 0 check (minutos_extra >= 0 and minutos_extra % 30 = 0),
  add column precio_hora_extra numeric(10,2) not null default 0 check (precio_hora_extra >= 0),
  add column cargo_horas_extra numeric(10,2) not null default 0 check (cargo_horas_extra >= 0);

alter table public.retenciones
  add column minutos_extra int not null default 0;

-- Correo al cliente cuando el admin cambia el tiempo extra
insert into public.plantillas_correo (clave, destinatario, descripcion, asunto, titulo, cuerpo, boton_texto, activa)
values ('reservacion_actualizada', 'cliente',
        'Al cliente, cuando el equipo cambia el tiempo extra de su reservación',
        'Actualizamos tu reservación {{folio}}',
        'Tu reservación cambió',
        '<p style="margin:0 0 16px;">{{nombre}}, actualizamos tu reservación de <strong>{{show}}</strong> del <strong>{{fecha}}</strong>.</p>'
        || '<p style="margin:0 0 16px;">Ahora el show es de <strong>{{hora}}</strong> a <strong>{{hora_fin}}</strong> ({{horas_extra}}).</p>'
        || '<p style="margin:0 0 16px;">Nuevo total: <strong>{{total}}</strong>. Pagado: {{pagado}}. Saldo para el día del evento: <strong>{{saldo}}</strong>.</p>'
        || '<p style="margin:0;color:#5e5873;font-size:14px;">Folio: {{folio}}. Si tienes dudas, escríbenos por WhatsApp.</p>',
        'Ver mi reservación', true)
on conflict (clave) do nothing;


-- ── calcular_horario(): minutos extra ─────────────────────────────────────
drop function public.calcular_horario(uuid, uuid, uuid[], text, timestamptz, boolean);
CREATE OR REPLACE FUNCTION public.calcular_horario(p_show_id uuid, p_paquete_id uuid, p_extras uuid[], p_codigo_postal text, p_inicio timestamp with time zone, p_incluir_inactivos boolean DEFAULT false, p_minutos_extra integer DEFAULT 0, OUT duracion_min integer, OUT fin timestamp with time zone, OUT bloque tstzrange, OUT zona_id uuid, OUT zona_nombre text, OUT traslado_min integer, OUT cargo_traslado numeric, OUT precio_show numeric, OUT precio_extras numeric, OUT extras_min integer, OUT minutos_extra integer, OUT cargo_horas_extra numeric)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Horas extra: bloques de 30 min, solo en shows que lo permiten y hasta el máximo.
  -- Con p_incluir_inactivos (admin o una reservación ya hecha) no se revisan permiso ni máximo.
  minutos_extra := coalesce(p_minutos_extra, 0);
  if minutos_extra < 0 or minutos_extra % 30 <> 0 then
    raise exception 'HORAS_EXTRA_INVALIDAS: el tiempo extra va en bloques de 30 minutos';
  end if;
  if minutos_extra > 0 and not p_incluir_inactivos then
    if not v_show.permite_horas_extra then
      raise exception 'HORAS_EXTRA_NO_PERMITIDAS: este show no permite agregar tiempo extra';
    end if;
    if minutos_extra > (select c.max_minutos_extra from public.configuracion c where c.id = 1) then
      raise exception 'HORAS_EXTRA_MAXIMO: se pasa del tiempo extra máximo permitido';
    end if;
  end if;
  cargo_horas_extra := round(v_show.precio_hora_extra * minutos_extra / 60.0, 2);

  select coalesce(sum(e.precio), 0), coalesce(sum(e.minutos), 0)
    into precio_extras, extras_min
    from public.extras e
   where e.id = any (coalesce(p_extras, '{}')) and (e.activo or p_incluir_inactivos);

  v_zona := public.zona_por_cp(p_codigo_postal);

  duracion_min   := coalesce(v_paquete.duracion_min, v_show.duracion_min) + extras_min + minutos_extra;
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
$function$;
revoke execute on function public.calcular_horario(uuid, uuid, uuid[], text, timestamptz, boolean, integer) from public, anon, authenticated;

-- ── evaluar_horarios_dia() ────────────────────────────────────────────────
drop function public.evaluar_horarios_dia(uuid, uuid, uuid[], text, date);
CREATE OR REPLACE FUNCTION public.evaluar_horarios_dia(p_show_id uuid, p_paquete_id uuid, p_extras uuid[], p_codigo_postal text, p_fecha date, p_minutos_extra integer DEFAULT 0)
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
                                               (p_fecha + time '12:00') at time zone cfg.zona_horaria, false, coalesce(p_minutos_extra, 0));
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
revoke execute on function public.evaluar_horarios_dia(uuid, uuid, uuid[], text, date, integer) from public, anon, authenticated;

-- ── horarios_disponibles() ────────────────────────────────────────────────
drop function public.horarios_disponibles(uuid, uuid, uuid[], text, date);
CREATE OR REPLACE FUNCTION public.horarios_disponibles(p_show_id uuid, p_paquete_id uuid, p_extras uuid[], p_codigo_postal text, p_fecha date, p_minutos_extra integer DEFAULT 0)
 RETURNS TABLE(inicio timestamp with time zone, fin timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select e.inicio, e.fin
    from public.evaluar_horarios_dia(p_show_id, p_paquete_id, p_extras, p_codigo_postal, p_fecha, coalesce(p_minutos_extra, 0)) e
   where cardinality(e.problemas) = 0
     and exists (select 1 from public.shows s where s.id = p_show_id and s.activo)
     and (p_paquete_id is null or exists (select 1 from public.paquetes p where p.id = p_paquete_id and p.activo))
     and (public.zona_por_cp(p_codigo_postal)).id is not null
   order by e.inicio;
$function$;
grant execute on function public.horarios_disponibles(uuid, uuid, uuid[], text, date, integer) to anon, authenticated;

-- ── disponibilidad_mes() ──────────────────────────────────────────────────
drop function public.disponibilidad_mes(uuid, uuid, uuid[], text, integer, integer);
CREATE OR REPLACE FUNCTION public.disponibilidad_mes(p_show_id uuid, p_paquete_id uuid, p_extras uuid[], p_codigo_postal text, p_anio integer, p_mes integer, p_minutos_extra integer DEFAULT 0)
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
        from public.evaluar_horarios_dia(p_show_id, p_paquete_id, p_extras, p_codigo_postal, d, coalesce(p_minutos_extra, 0)) e;
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
grant execute on function public.disponibilidad_mes(uuid, uuid, uuid[], text, integer, integer, integer) to anon, authenticated;

-- ── apartar_horario() ─────────────────────────────────────────────────────
drop function public.apartar_horario(uuid, uuid, uuid[], text, timestamptz);
CREATE OR REPLACE FUNCTION public.apartar_horario(p_show_id uuid, p_paquete_id uuid, p_extras uuid[], p_codigo_postal text, p_inicio timestamp with time zone, p_minutos_extra integer DEFAULT 0)
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

  select * into h from public.calcular_horario(p_show_id, p_paquete_id, p_extras, p_codigo_postal, p_inicio, false, coalesce(p_minutos_extra, 0));
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
  insert into public.retenciones (usuario_id, show_id, paquete_id, extras, minutos_extra, codigo_postal, inicio, fin, bloque, expira_en)
  values (auth.uid(), p_show_id, p_paquete_id, coalesce(p_extras, '{}'), h.minutos_extra, p_codigo_postal, p_inicio, h.fin, h.bloque,
          now() + make_interval(mins => cfg.retencion_minutos))
  returning * into v_ret;

  return v_ret;
end;
$function$;
revoke execute on function public.apartar_horario(uuid, uuid, uuid[], text, timestamptz, integer) from public, anon;
grant execute on function public.apartar_horario(uuid, uuid, uuid[], text, timestamptz, integer) to authenticated;

-- ── crear_reservacion(): versión viva + horas extra ───────────────────────
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
  v_minutos   int := coalesce(nullif(p_evento ->> 'minutos_extra', '')::int, 0);
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

  select * into h from public.calcular_horario(p_show_id, p_paquete_id, p_extras, p_codigo_postal, p_inicio, admin, v_minutos);

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
  v_total := greatest(0, h.precio_show + h.precio_extras + h.cargo_horas_extra + v_cargo_mod + h.cargo_traslado - v_descuento);

  begin
    insert into public.reservaciones (
      cliente_id, show_id, paquete_id, zona_id,
      inicio, fin, bloque,
      calle, colonia, codigo_postal, municipio, referencias,
      tipo_evento, festejado, asistentes, espacio, comentarios, contacto_dia,
      precio_show, precio_extras, minutos_extra, precio_hora_extra, cargo_horas_extra, modalidad_id, modalidad_nombre, cargo_modalidad, cargo_traslado, descuento, total, anticipo_requerido,
      estado, expira_en, canal, motivo_excepcion, creado_por
    ) values (
      v_cliente.id, v_show.id, v_paquete.id, h.zona_id,
      p_inicio, h.fin, h.bloque,
      trim(p_calle), trim(p_colonia), p_codigo_postal, h.zona_nombre, nullif(trim(p_referencias), ''),
      p_evento ->> 'tipo_evento', p_evento ->> 'festejado', nullif(p_evento ->> 'asistentes', '')::int,
      p_evento ->> 'espacio', p_evento ->> 'comentarios', p_evento ->> 'contacto_dia',
      h.precio_show, h.precio_extras, h.minutos_extra, v_show.precio_hora_extra, h.cargo_horas_extra, v_mod.id, v_mod.nombre, v_cargo_mod, h.cargo_traslado, v_descuento,
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

-- ── reprogramar_reservacion(): conserva las horas extra ───────────────────
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

  select * into h from public.calcular_horario(v_res.show_id, v_res.paquete_id, v_extras, v_res.codigo_postal, p_nuevo_inicio, true, v_res.minutos_extra);

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

-- ── historial_reservacion(): horas extra ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.historial_reservacion(p_reservacion_id uuid)
 RETURNS TABLE(creado_en timestamp with time zone, entidad text, accion text, quien text, cambios jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  claves_res  constant text[] := array['estado', 'inicio', 'total', 'descuento', 'calle', 'colonia', 'codigo_postal', 'motivo_cancelacion', 'motivo_excepcion', 'minutos_extra', 'cargo_horas_extra'];
  claves_pago constant text[] := array['estado', 'monto', 'metodo', 'tipo', 'nota'];
begin
  if not public.es_admin() then
    raise exception 'SOLO_ADMIN: solo el administrador' using errcode = '42501';
  end if;
  return query
  select x.creado_en, x.entidad, x.accion, x.quien, x.cambios
    from (
      select b.id, b.creado_en, b.entidad, b.accion,
             case when b.usuario_id is null then 'Sistema'
                  else coalesce(c.nombre, 'Usuario') || case when p.rol = 'admin' then ' (admin)' else '' end end as quien,
             (select jsonb_object_agg(k, jsonb_build_array(b.antes -> k, b.despues -> k))
                from unnest(case when b.entidad = 'pagos' then claves_pago else claves_res end) k
               where b.accion <> 'update' and coalesce(b.despues, b.antes) ? k
                  or b.accion = 'update' and (b.antes -> k) is distinct from (b.despues -> k)) as cambios
        from public.bitacora b
        left join public.clientes c on c.usuario_id = b.usuario_id
        left join public.perfiles p on p.id = b.usuario_id
       where (b.entidad = 'reservaciones' and b.entidad_id = p_reservacion_id::text)
          or (b.entidad = 'pagos' and coalesce(b.despues, b.antes) ->> 'reservacion_id' = p_reservacion_id::text)
    ) x
   where x.accion <> 'update' or x.cambios is not null
   order by x.creado_en, x.id;
end;
$function$;

-- ── Cambiar el tiempo extra de una reservación (admin, a petición del cliente) ─
create or replace function public.cambiar_horas_extra(p_reservacion_id uuid, p_minutos int, p_forzar boolean default false, p_motivo text default null)
returns public.reservaciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg         public.configuracion;
  v_res       public.reservaciones;
  v_show      public.shows;
  v_extras    uuid[];
  h           record;
  v_problemas text[];
  v_saltos    text[] := '{}';
  v_total     numeric(10,2);
  v_texto     text;
begin
  if not public.es_admin() then
    raise exception 'SOLO_ADMIN: solo el administrador cambia el tiempo extra' using errcode = '42501';
  end if;
  select * into cfg from public.configuracion c where c.id = 1;
  if p_minutos is null or p_minutos < 0 or p_minutos % 30 <> 0 then
    raise exception 'HORAS_EXTRA_INVALIDAS: el tiempo extra va en bloques de 30 minutos';
  end if;
  if p_minutos > cfg.max_minutos_extra then
    raise exception 'HORAS_EXTRA_MAXIMO: se pasa del tiempo extra máximo permitido';
  end if;

  perform public.bloquear_agenda();

  select * into v_res from public.reservaciones where id = p_reservacion_id for update;
  if v_res.id is null then
    raise exception 'NO_ENCONTRADA: reservación no encontrada';
  end if;
  if v_res.estado not in ('pendiente', 'confirmada') then
    raise exception 'NO_EDITABLE: esta reservación ya está %', v_res.estado;
  end if;
  if p_minutos = v_res.minutos_extra then
    return v_res;
  end if;
  select * into v_show from public.shows where id = v_res.show_id;

  select coalesce(array_agg(extra_id), '{}') into v_extras
    from public.reservacion_extras where reservacion_id = v_res.id;
  select * into h from public.calcular_horario(v_res.show_id, v_res.paquete_id, v_extras, v_res.codigo_postal, v_res.inicio, true, p_minutos);

  -- La propia reservación no cuenta: solo importa si el nuevo final cabe
  v_problemas := public.validar_horario(v_res.inicio, h.fin, h.bloque, v_res.id, h.zona_id, v_res.show_id);
  if 'ocupado' = any (v_problemas) then
    raise exception 'HORARIO_OCUPADO: con ese tiempo extra se encima con otra reservación' using errcode = '23P01';
  end if;
  if 'fuera de horario' = any (v_problemas) then
    v_saltos := array_append(v_saltos, 'fuera de horario');
  end if;
  if 'fecha bloqueada' = any (v_problemas) then
    v_saltos := array_append(v_saltos, 'fecha bloqueada');
  end if;
  if array_length(v_saltos, 1) > 0 and (not coalesce(p_forzar, false) or coalesce(trim(p_motivo), '') = '') then
    raise exception 'MOTIVO_REQUERIDO: para guardar con excepción (%), escribe el motivo', array_to_string(v_saltos, ', ');
  end if;

  v_total := greatest(0, v_res.total - v_res.cargo_horas_extra + h.cargo_horas_extra);

  begin
    update public.reservaciones
       set fin               = h.fin,
           bloque            = h.bloque,
           minutos_extra     = p_minutos,
           precio_hora_extra = v_show.precio_hora_extra,
           cargo_horas_extra = h.cargo_horas_extra,
           total             = v_total,
           anticipo_requerido = case when estado = 'pendiente' then round(v_total * cfg.anticipo_porcentaje / 100, 2) else anticipo_requerido end,
           motivo_excepcion  = case when array_length(v_saltos, 1) > 0
                                    then concat_ws(' | ', motivo_excepcion, 'tiempo extra (' || array_to_string(v_saltos, ', ') || '): ' || p_motivo)
                                    else motivo_excepcion end
     where id = v_res.id
     returning * into v_res;
  exception when exclusion_violation then
    raise exception 'HORARIO_OCUPADO: con ese tiempo extra se encima con otra reservación' using errcode = '23P01';
  end;

  v_texto := case
    when p_minutos = 0 then 'sin tiempo extra'
    else 'incluye ' || case when p_minutos >= 60 then (p_minutos / 60)::text || ' h' else '' end
         || case when p_minutos % 60 > 0 then case when p_minutos >= 60 then ' ' else '' end || (p_minutos % 60)::text || ' min' else '' end
         || ' de tiempo extra' end;
  perform public.encolar_correo('reservacion_actualizada', v_res.id, null,
    jsonb_build_object('hora_fin', public.hora_es(v_res.fin), 'horas_extra', v_texto), null);

  return v_res;
end;
$$;

revoke execute on function public.cambiar_horas_extra(uuid, int, boolean, text) from public, anon;
grant execute on function public.cambiar_horas_extra(uuid, int, boolean, text) to authenticated;

commit;
