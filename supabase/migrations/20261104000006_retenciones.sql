-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 6: apartar el horario mientras el cliente termina de reservar (RN-08)
-- Tabla retenciones, apartar_horario(), liberar_horario(). validar_horario()
-- y crear_reservacion() se reconstruyeron desde su versión viva en Supabase:
--   · validar_horario() considera ocupados los horarios apartados por OTRAS
--     personas (los propios no estorban);
--   · crear_reservacion() borra el apartado de quien reserva.
-- Plan: MD/Plan_Etapa_2.md, sección 4 (migración 6).
-- ═════════════════════════════════════════════════════════════════════════════

-- Todo el archivo se aplica completo o no se aplica nada.
begin;

-- ── Tabla ───────────────────────────────────────────────────────────────────
create table public.retenciones (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null unique references auth.users (id) on delete cascade,  -- una por persona
  show_id        uuid not null references public.shows (id) on delete cascade,
  paquete_id     uuid references public.paquetes (id) on delete cascade,
  extras         uuid[] not null default '{}',
  codigo_postal  text not null check (codigo_postal ~ '^\d{5}$'),
  inicio         timestamptz not null,
  fin            timestamptz not null,
  bloque         tstzrange not null,
  expira_en      timestamptz not null,
  creado_en      timestamptz not null default now()
);
create index retenciones_bloque_idx on public.retenciones using gist (bloque);
create index retenciones_expira_idx on public.retenciones (expira_en);

alter table public.retenciones enable row level security;
revoke all on public.retenciones from anon, authenticated;
grant select on public.retenciones to authenticated;

-- Nadie escribe directo: solo apartar_horario(), liberar_horario() y crear_reservacion()
create policy "retenciones: ver la propia" on public.retenciones
  for select to authenticated using (usuario_id = auth.uid() or public.es_admin());

-- ── validar_horario(): versión viva + apartados de otras personas ───────────
CREATE OR REPLACE FUNCTION public.validar_horario(p_inicio timestamp with time zone, p_fin timestamp with time zone, p_bloque tstzrange, p_excluir_reservacion uuid DEFAULT NULL::uuid)
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

-- ── crear_reservacion(): versión viva + borra el apartado propio ────────────
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

  -- Al reservar, el horario apartado de quien reserva ya no hace falta
  delete from public.retenciones where usuario_id = auth.uid();

  return v_res;
end;
$function$;

-- ── apartar_horario() ───────────────────────────────────────────────────────
-- Aparta el horario por configuracion.retencion_minutos (10 por defecto).
-- Reemplaza cualquier apartado anterior de la misma persona. Exige sesión.
create or replace function public.apartar_horario(
  p_show_id       uuid,
  p_paquete_id    uuid,
  p_extras        uuid[],
  p_codigo_postal text,
  p_inicio        timestamptz
)
returns public.retenciones
language plpgsql
security definer
set search_path = ''
as $$
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

  v_problemas := public.validar_horario(p_inicio, h.fin, h.bloque);
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
$$;

-- ── liberar_horario() ───────────────────────────────────────────────────────
-- Borra el apartado propio (por ejemplo, si regresa de paso en el asistente).
create or replace function public.liberar_horario()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA: inicia sesión' using errcode = '42501';
  end if;
  delete from public.retenciones where usuario_id = auth.uid();
  return found;
end;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke execute on function public.apartar_horario(uuid, uuid, uuid[], text, timestamptz) from public, anon;
revoke execute on function public.liberar_horario() from public, anon;
grant execute on function public.apartar_horario(uuid, uuid, uuid[], text, timestamptz) to authenticated;
grant execute on function public.liberar_horario() to authenticated;
-- validar_horario() y crear_reservacion() conservan sus permisos (create or replace)

commit;
