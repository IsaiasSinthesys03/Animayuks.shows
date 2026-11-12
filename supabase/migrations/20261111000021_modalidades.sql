-- Tipos de evento (modalidades): Escolar, Privado, Municipal…
-- Reemplazan a los extras en el sitio. Cada uno tiene un cargo fijo, igual para
-- todos los shows, y una explicación para el cliente. Cada show decide si los
-- pide (shows.pide_modalidad); si los pide, el cliente puede elegir uno o
-- "ninguno" (sin cargo). La reservación guarda el nombre y el cargo de ese momento.
-- La tabla extras y sus datos se conservan para las reservaciones anteriores.

begin;

create table public.modalidades (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null unique check (length(trim(nombre)) > 0),
  descripcion  text not null default '',
  cargo        numeric(10,2) not null default 0 check (cargo >= 0),
  activo       boolean not null default true,
  orden        int not null default 0
);

alter table public.shows add column pide_modalidad boolean not null default false;

alter table public.reservaciones
  add column modalidad_id     uuid references public.modalidades (id) on delete set null,
  add column modalidad_nombre text,
  add column cargo_modalidad  numeric(10,2) not null default 0 check (cargo_modalidad >= 0);

alter table public.modalidades enable row level security;
grant select on public.modalidades to anon, authenticated;
grant insert, update, delete on public.modalidades to authenticated;
create policy "catalogo: leer modalidades activas" on public.modalidades
  for select to anon, authenticated using (activo or public.es_admin());
create policy "catalogo: admin gestiona modalidades" on public.modalidades
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

insert into public.modalidades (nombre, descripcion, cargo, orden) values
  ('Escolar',   'Para escuelas y guarderías: festivales, día del niño, fin de cursos u otro evento dentro del plantel.', 0, 1),
  ('Privado',   'Para empresas o eventos privados con público: convivios de trabajo, inauguraciones o reuniones de clientes.', 0, 2),
  ('Municipal', 'Para eventos públicos de ayuntamientos, comisarías o dependencias de gobierno, en plazas o parques.', 0, 3);

-- ── crear_reservacion(): versión viva + tipo de evento ─────────────────────
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



commit;
