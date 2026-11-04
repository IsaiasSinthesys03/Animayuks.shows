-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 1: esquema inicial
-- Tablas, restricciones, funciones de negocio y triggers.
-- Se ejecuta en Supabase → SQL Editor. Ver supabase/README.md.
-- ═════════════════════════════════════════════════════════════════════════════

-- Todo el archivo se aplica completo o no se aplica nada.
begin;

-- ── Utilidades ───────────────────────────────────────────────────────────────
create or replace function public.tocar_actualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- Folio legible y no secuencial (RN-16), ej. SHW-26-7K4Q9
create or replace function public.generar_folio()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  s text := '';
begin
  for i in 1..5 loop
    s := s || substr(abc, 1 + floor(random() * length(abc))::int, 1);
  end loop;
  return 'SHW-' || to_char(now(), 'YY') || '-' || s;
end;
$$;

-- ── Configuración del negocio (una sola fila) ────────────────────────────────

create table public.configuracion (
  id                          smallint primary key default 1 check (id = 1),
  nombre_negocio              text not null default 'Animayuks',
  zona_horaria                text not null default 'America/Mexico_City',
  whatsapp                    text,
  correo_contacto             text,
  anticipacion_min_horas      int  not null default 48  check (anticipacion_min_horas >= 0),   -- RN-04
  anticipacion_max_dias       int  not null default 365 check (anticipacion_max_dias > 0),     -- RN-04
  expiracion_pendiente_horas  int  not null default 24  check (expiracion_pendiente_horas > 0),-- RN-07
  anticipo_porcentaje         numeric(5,2) not null default 30 check (anticipo_porcentaje between 0 and 100), -- RN-06
  cancelacion_dias_reembolso  int  not null default 7   check (cancelacion_dias_reembolso >= 0), -- RN-11
  cancelacion_comision_pct    numeric(5,2) not null default 5 check (cancelacion_comision_pct between 0 and 100),
  reprogramacion_min_horas    int  not null default 72,  -- RN-12
  reprogramaciones_max        int  not null default 1,
  confirmacion_automatica     boolean not null default false, -- RN-05
  reservaciones_en_linea      boolean not null default true,  -- RF-CFG-10 (modo mantenimiento)
  actualizado_en              timestamptz not null default now()
);

create trigger configuracion_actualizado before update on public.configuracion
  for each row execute function public.tocar_actualizado();

-- Horario de servicio por día de la semana (0 = domingo … 6 = sábado), RN-21
create table public.horario_servicio (
  dia_semana  smallint primary key check (dia_semana between 0 and 6),
  activo      boolean not null default true,
  abre        time not null default '09:00',
  cierra      time not null default '23:00',
  check (cierra > abre)
);

-- Fechas u horarios bloqueados por el administrador (RN-14, RF-AGE-06)
create table public.bloqueos (
  id          uuid primary key default gen_random_uuid(),
  inicio      timestamptz not null,
  fin         timestamptz not null,
  motivo      text not null default 'Bloqueado',
  creado_por  uuid references auth.users (id) on delete set null,
  creado_en   timestamptz not null default now(),
  check (fin > inicio)
);
create index bloqueos_rango_idx on public.bloqueos using gist (tstzrange(inicio, fin));

-- ── Usuarios y clientes ──────────────────────────────────────────────────────

-- Perfil de cada cuenta de Supabase Auth con su rol (RNF-SEG-04)
create table public.perfiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  rol         text not null default 'cliente' check (rol in ('cliente', 'admin')),
  creado_en   timestamptz not null default now()
);

-- Fichas de clientes. Pueden existir sin cuenta (clientes presenciales, RF-CLI-04)
-- y ligarse después a una cuenta con el mismo correo (RF-CLI-05).
create table public.clientes (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid unique references auth.users (id) on delete set null,
  nombre          text not null check (length(trim(nombre)) > 0),
  telefono        text,
  correo          text,
  etiquetas       text[] not null default '{}',
  bloqueado       boolean not null default false,       -- RF-CLI-07
  motivo_bloqueo  text,
  origen          text not null default 'En línea',
  notas           text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create unique index clientes_correo_unico on public.clientes (lower(correo)) where correo is not null;
create index clientes_telefono_idx on public.clientes (telefono);

create trigger clientes_actualizado before update on public.clientes
  for each row execute function public.tocar_actualizado();

-- ¿El usuario actual es administrador?
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and p.rol = 'admin'
  );
$$;

-- Al registrarse alguien en Supabase Auth: crea su perfil y liga (o crea) su ficha de cliente
create or replace function public.manejar_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id) values (new.id) on conflict (id) do nothing;

  update public.clientes
     set usuario_id = new.id
   where usuario_id is null
     and new.email is not null
     and lower(correo) = lower(new.email);

  if not found then
    insert into public.clientes (usuario_id, nombre, telefono, correo, origen)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), split_part(coalesce(new.email, 'Cliente'), '@', 1)),
      coalesce(new.raw_user_meta_data ->> 'telefono', new.phone),
      new.email,
      'En línea'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.manejar_nuevo_usuario();

-- ── Catálogo ────────────────────────────────────────────────────────────────

create table public.categorias (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  orden   int not null default 0
);

create table public.shows (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre            text not null,
  categoria_id      uuid references public.categorias (id) on delete set null,
  resumen           text not null default '',
  descripcion       text not null default '',
  duracion_min      int not null check (duracion_min > 0),
  montaje_min       int not null default 30 check (montaje_min >= 0),
  desmontaje_min    int not null default 20 check (desmontaje_min >= 0),
  artistas          int not null default 1 check (artistas > 0),
  requisitos        text[] not null default '{}',
  precio_base       numeric(10,2) not null check (precio_base >= 0),
  imagen_principal  text,              -- ruta en el bucket "shows"
  galeria           text[] not null default '{}',
  video_url         text,
  activo            boolean not null default true,   -- RF-SHW-01, RN-18
  destacado         boolean not null default false,
  orden             int not null default 0,
  seo_titulo        text,
  seo_descripcion   text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
create trigger shows_actualizado before update on public.shows
  for each row execute function public.tocar_actualizado();

create table public.paquetes (
  id            uuid primary key default gen_random_uuid(),
  show_id       uuid not null references public.shows (id) on delete restrict,
  nombre        text not null,
  descripcion   text not null default '',
  precio        numeric(10,2) not null check (precio >= 0),
  duracion_min  int check (duracion_min > 0),     -- si es null se usa la del show
  incluye       text[] not null default '{}',
  orden         int not null default 0,
  activo        boolean not null default true,
  unique (show_id, nombre)
);

create table public.extras (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique,
  precio    numeric(10,2) not null check (precio >= 0),
  minutos   int not null default 0 check (minutos >= 0),  -- tiempo que agrega al show (ej. media hora extra)
  activo    boolean not null default true,
  orden     int not null default 0
);

-- ── Cobertura geográfica (RN-01, RF-COB) ─────────────────────────────────────

-- En la fase 1 la cobertura se define por códigos postales completos (45110)
-- o por prefijos (451 cubre 45100–45199).
create table public.zonas (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null unique,
  codigos_postales  text[] not null default '{}' check (array_position(codigos_postales, null) is null),
  cargo_traslado    numeric(10,2) not null default 0 check (cargo_traslado >= 0), -- RN-10
  traslado_min      int not null default 30 check (traslado_min >= 0),
  activa            boolean not null default true,
  color             text not null default '#a3122a',
  notas             text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
create trigger zonas_actualizado before update on public.zonas
  for each row execute function public.tocar_actualizado();

-- Zona activa para un código postal; prefiere el prefijo más específico (RF-COB-06)
create or replace function public.zona_por_cp(p_cp text)
returns public.zonas
language sql
stable
security definer
set search_path = ''
as $$
  select z.*
    from public.zonas z
    cross join lateral unnest(z.codigos_postales) as prefijo
   where z.activa
     and p_cp ~ '^\d{5}$'
     and p_cp like prefijo || '%'
   order by length(prefijo) desc
   limit 1;
$$;

-- Personas que buscaron fuera de cobertura (RF-COB-07, RF-COB-12)
create table public.lista_interes (
  id             uuid primary key default gen_random_uuid(),
  codigo_postal  text not null check (codigo_postal ~ '^\d{5}$'),
  nombre         text,
  contacto       text,
  creado_en      timestamptz not null default now()
);

-- ── Reservaciones ────────────────────────────────────────────────────────────

create table public.reservaciones (
  id                  uuid primary key default gen_random_uuid(),
  folio               text not null unique default public.generar_folio(),
  cliente_id          uuid not null references public.clientes (id) on delete restrict,
  show_id             uuid not null references public.shows (id) on delete restrict,
  paquete_id          uuid references public.paquetes (id) on delete restrict,
  zona_id             uuid references public.zonas (id) on delete set null,

  -- Horario del show y bloque que ocupa en la agenda (incluye montaje, desmontaje y traslado, RN-02)
  inicio              timestamptz not null,
  fin                 timestamptz not null,
  bloque              tstzrange not null,

  -- Dirección del evento (copia inmutable, RD-01)
  calle               text not null,
  colonia             text not null,
  codigo_postal       text not null check (codigo_postal ~ '^\d{5}$'),
  municipio           text,
  referencias         text,
  latitud             numeric(9,6),
  longitud            numeric(9,6),

  -- Detalles del evento (RF-RES-07, RF-RES-08)
  tipo_evento         text,
  festejado           text,
  asistentes          int check (asistentes > 0),
  espacio             text,
  comentarios         text,
  contacto_dia        text,

  -- Precios congelados al reservar (RN-09, RD-03)
  precio_show         numeric(10,2) not null check (precio_show >= 0),
  precio_extras       numeric(10,2) not null default 0 check (precio_extras >= 0),
  cargo_traslado      numeric(10,2) not null default 0 check (cargo_traslado >= 0),
  descuento           numeric(10,2) not null default 0 check (descuento >= 0),
  total               numeric(10,2) not null check (total >= 0),
  anticipo_requerido  numeric(10,2) not null default 0 check (anticipo_requerido >= 0),
  total_pagado        numeric(10,2) not null default 0,

  estado              text not null default 'pendiente'
                      check (estado in ('pendiente', 'confirmada', 'realizada', 'no_realizada', 'cancelada', 'rechazada', 'expirada')),
  expira_en           timestamptz,                -- solo para pendientes sin anticipo (RN-07)
  canal               text not null default 'En línea'
                      check (canal in ('En línea', 'Presencial', 'Teléfono', 'WhatsApp', 'Redes sociales', 'Recomendación')),
  reprogramaciones    int not null default 0,
  motivo_cancelacion  text,
  cancelada_en        timestamptz,
  motivo_excepcion    text,                       -- RN-13: por qué el admin se saltó una regla
  creado_por          uuid references auth.users (id) on delete set null,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  check (fin > inicio),

  -- RN-02 / RD-04: dos reservaciones activas no pueden ocupar el mismo bloque de tiempo
  constraint reservaciones_sin_traslape
    exclude using gist (bloque with &&) where (estado in ('pendiente', 'confirmada'))
);
create index reservaciones_cliente_idx on public.reservaciones (cliente_id);
create index reservaciones_inicio_idx on public.reservaciones (inicio);
create index reservaciones_estado_idx on public.reservaciones (estado);

create trigger reservaciones_actualizado before update on public.reservaciones
  for each row execute function public.tocar_actualizado();

create table public.reservacion_extras (
  reservacion_id  uuid not null references public.reservaciones (id) on delete cascade,
  extra_id        uuid not null references public.extras (id) on delete restrict,
  cantidad        int not null default 1 check (cantidad > 0),
  precio_unitario numeric(10,2) not null,
  primary key (reservacion_id, extra_id)
);

-- Notas internas del administrador (RF-ADR-10)
create table public.notas_reservacion (
  id              uuid primary key default gen_random_uuid(),
  reservacion_id  uuid not null references public.reservaciones (id) on delete cascade,
  autor_id        uuid references auth.users (id) on delete set null,
  texto           text not null check (length(trim(texto)) > 0),
  creado_en       timestamptz not null default now()
);

-- ── Pagos (RF-PAG) ──────────────────────────────────────────────────────────

create table public.pagos (
  id                uuid primary key default gen_random_uuid(),
  reservacion_id    uuid not null references public.reservaciones (id) on delete restrict,
  monto             numeric(10,2) not null check (monto > 0),
  tipo              text not null default 'abono' check (tipo in ('anticipo', 'abono', 'liquidacion', 'reembolso')),
  metodo            text not null check (metodo in ('Efectivo', 'Transferencia', 'Terminal', 'Tarjeta en línea', 'OXXO')),
  estado            text not null default 'aprobado' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  referencia        text,
  comprobante_path  text,          -- ruta en el bucket "comprobantes"
  nota              text,
  registrado_por    uuid references auth.users (id) on delete set null,
  creado_en         timestamptz not null default now()
);
create index pagos_reservacion_idx on public.pagos (reservacion_id);

-- Recalcula lo pagado y confirma la reservación cuando cubre el anticipo (RF-PAG-07, RN-05)
create or replace function public.recalcular_pagado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid := coalesce(new.reservacion_id, old.reservacion_id);
  pagado numeric(10,2);
begin
  select coalesce(sum(case when tipo = 'reembolso' then -monto else monto end), 0)
    into pagado
    from public.pagos
   where reservacion_id = rid and estado = 'aprobado';

  update public.reservaciones r
     set total_pagado = pagado,
         estado = case when r.estado = 'pendiente' and pagado >= r.anticipo_requerido and pagado > 0
                       then 'confirmada' else r.estado end,
         expira_en = case when pagado >= r.anticipo_requerido then null else r.expira_en end
   where r.id = rid;

  return null;
end;
$$;

create trigger pagos_recalcular
  after insert or update or delete on public.pagos
  for each row execute function public.recalcular_pagado();

-- ── Bitácora de auditoría (RF-AUD) ───────────────────────────────────────────

create table public.bitacora (
  id           bigint generated always as identity primary key,
  usuario_id   uuid,
  accion       text not null,
  entidad      text not null,
  entidad_id   text,
  antes        jsonb,
  despues      jsonb,
  creado_en    timestamptz not null default now()
);
create index bitacora_entidad_idx on public.bitacora (entidad, entidad_id);
create index bitacora_fecha_idx on public.bitacora (creado_en desc);

create or replace function public.registrar_bitacora()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.bitacora (usuario_id, accion, entidad, entidad_id, antes, despues)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    fila ->> 'id',
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger bitacora_reservaciones after insert or update or delete on public.reservaciones
  for each row execute function public.registrar_bitacora();
create trigger bitacora_pagos after insert or update or delete on public.pagos
  for each row execute function public.registrar_bitacora();
create trigger bitacora_shows after insert or update or delete on public.shows
  for each row execute function public.registrar_bitacora();
create trigger bitacora_paquetes after insert or update or delete on public.paquetes
  for each row execute function public.registrar_bitacora();
create trigger bitacora_zonas after insert or update or delete on public.zonas
  for each row execute function public.registrar_bitacora();
create trigger bitacora_configuracion after update on public.configuracion
  for each row execute function public.registrar_bitacora();
create trigger bitacora_perfiles after update on public.perfiles
  for each row execute function public.registrar_bitacora();
create trigger bitacora_bloqueos after insert or update or delete on public.bloqueos
  for each row execute function public.registrar_bitacora();

-- ── Funciones públicas de negocio (RPC) ──────────────────────────────────────

-- Bloques ocupados en un rango de fechas, sin datos de clientes (RF-DIS-01 a 03)
create or replace function public.ocupacion(p_desde date, p_hasta date)
returns table (inicio timestamptz, fin timestamptz, tipo text)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (select zona_horaria from public.configuracion where id = 1),
       rango as (
         select tstzrange(
                  (p_desde::timestamp at time zone cfg.zona_horaria),
                  ((p_hasta + 1)::timestamp at time zone cfg.zona_horaria)
                ) as r
           from cfg
       )
  select lower(res.bloque), upper(res.bloque), 'reservacion'
    from public.reservaciones res, rango
   where res.estado in ('pendiente', 'confirmada') and res.bloque && rango.r
  union all
  select b.inicio, b.fin, 'bloqueo'
    from public.bloqueos b, rango
   where tstzrange(b.inicio, b.fin) && rango.r
  order by 1;
$$;

-- Crea una reservación validando todo en el servidor (RF-RES-12/14, RF-COB-08, RF-ADR-03 a 05).
-- Los precios se calculan aquí: el navegador no puede mandarlos.
create or replace function public.crear_reservacion(
  p_show_id       uuid,
  p_paquete_id    uuid,
  p_inicio        timestamptz,
  p_codigo_postal text,
  p_calle         text,
  p_colonia       text,
  p_referencias   text default null,
  p_extras        uuid[] default '{}',
  p_evento        jsonb default '{}',    -- tipo_evento, festejado, asistentes, espacio, comentarios, contacto_dia
  p_cliente       jsonb default '{}',    -- nombre, telefono, correo (solo para crear o completar la ficha)
  -- Solo administrador:
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
  admin         boolean := public.es_admin();
  cfg           public.configuracion;
  v_show        public.shows;
  v_paquete     public.paquetes;
  v_zona        public.zonas;
  v_cliente     public.clientes;
  v_horario     public.horario_servicio;
  v_extra_min   int;
  v_precio_ext  numeric(10,2);
  v_duracion    int;
  v_fin         timestamptz;
  v_bloque      tstzrange;
  v_local_ini   timestamp;
  v_local_fin   timestamp;
  v_precio      numeric(10,2);
  v_total       numeric(10,2);
  v_saltos      text[] := '{}';
  v_res         public.reservaciones;
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

  -- Extras
  select coalesce(sum(e.precio), 0), coalesce(sum(e.minutos), 0)
    into v_precio_ext, v_extra_min
    from public.extras e
   where e.id = any (coalesce(p_extras, '{}')) and (e.activo or admin);

  -- Cobertura (RN-01)
  v_zona := public.zona_por_cp(p_codigo_postal);
  if v_zona.id is null then
    if admin and p_forzar then
      v_saltos := array_append(v_saltos, 'fuera de cobertura');
    else
      raise exception 'FUERA_DE_COBERTURA: por ahora no damos servicio en el código postal %', p_codigo_postal;
    end if;
  end if;

  -- Horarios
  v_duracion := coalesce(v_paquete.duracion_min, v_show.duracion_min) + v_extra_min;
  v_fin := p_inicio + make_interval(mins => v_duracion);
  v_bloque := tstzrange(
    p_inicio - make_interval(mins => v_show.montaje_min + coalesce(v_zona.traslado_min, 0)),
    v_fin    + make_interval(mins => v_show.desmontaje_min + coalesce(v_zona.traslado_min, 0))
  );

  -- Anticipación mínima y máxima (RN-04)
  if p_inicio < now() + make_interval(hours => cfg.anticipacion_min_horas)
     or p_inicio > now() + make_interval(days => cfg.anticipacion_max_dias) then
    if admin and p_forzar then
      v_saltos := array_append(v_saltos, 'anticipación');
    elsif not admin then
      raise exception 'ANTICIPACION: las reservaciones en línea se hacen con al menos % horas de anticipación', cfg.anticipacion_min_horas;
    end if;
  end if;
  if p_inicio < now() and not admin then
    raise exception 'FECHA_PASADA: la fecha ya pasó';
  end if;

  -- Horario de servicio (RN-21)
  v_local_ini := p_inicio at time zone cfg.zona_horaria;
  v_local_fin := v_fin at time zone cfg.zona_horaria;
  select * into v_horario from public.horario_servicio where dia_semana = extract(dow from v_local_ini);
  if v_horario.dia_semana is null or not v_horario.activo
     or v_local_ini::time < v_horario.abre
     or v_local_fin::time > v_horario.cierra
     or v_local_fin::date <> v_local_ini::date then
    if admin and p_forzar then
      v_saltos := array_append(v_saltos, 'fuera de horario');
    else
      raise exception 'FUERA_DE_HORARIO: ese día u hora no damos servicio';
    end if;
  end if;

  -- Fechas bloqueadas (RN-14)
  if exists (select 1 from public.bloqueos b where tstzrange(b.inicio, b.fin) && v_bloque) then
    if admin and p_forzar then
      v_saltos := array_append(v_saltos, 'fecha bloqueada');
    else
      raise exception 'FECHA_BLOQUEADA: ese horario no está disponible';
    end if;
  end if;

  if array_length(v_saltos, 1) > 0 and coalesce(trim(p_motivo), '') = '' then
    raise exception 'MOTIVO_REQUERIDO: para guardar con excepción (%), escribe el motivo', array_to_string(v_saltos, ', ');
  end if;

  -- Precio (RN-09)
  v_precio := coalesce(v_paquete.precio, v_show.precio_base);
  v_total := greatest(0, v_precio + v_precio_ext + coalesce(v_zona.cargo_traslado, 0)
                         - case when admin then coalesce(p_descuento, 0) else 0 end);

  begin
    insert into public.reservaciones (
      cliente_id, show_id, paquete_id, zona_id,
      inicio, fin, bloque,
      calle, colonia, codigo_postal, municipio, referencias,
      tipo_evento, festejado, asistentes, espacio, comentarios, contacto_dia,
      precio_show, precio_extras, cargo_traslado, descuento, total, anticipo_requerido,
      estado, expira_en, canal, motivo_excepcion, creado_por
    ) values (
      v_cliente.id, v_show.id, v_paquete.id, v_zona.id,
      p_inicio, v_fin, v_bloque,
      trim(p_calle), trim(p_colonia), p_codigo_postal, v_zona.nombre, nullif(trim(p_referencias), ''),
      p_evento ->> 'tipo_evento', p_evento ->> 'festejado', nullif(p_evento ->> 'asistentes', '')::int,
      p_evento ->> 'espacio', p_evento ->> 'comentarios', p_evento ->> 'contacto_dia',
      v_precio, v_precio_ext, coalesce(v_zona.cargo_traslado, 0),
      case when admin then coalesce(p_descuento, 0) else 0 end,
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

-- Cancelación por el cliente o el admin, con cálculo de reembolso (RF-MRS-03, RN-11)
create or replace function public.cancelar_reservacion(p_reservacion_id uuid, p_motivo text default null)
returns table (folio text, monto_reembolsable numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg   public.configuracion;
  v_res public.reservaciones;
  dias  numeric;
  monto numeric(10,2) := 0;
begin
  select * into cfg from public.configuracion where id = 1;
  select r.* into v_res
    from public.reservaciones r
    join public.clientes c on c.id = r.cliente_id
   where r.id = p_reservacion_id
     and (c.usuario_id = auth.uid() or public.es_admin())
   for update of r;

  if v_res.id is null then
    raise exception 'NO_ENCONTRADA: reservación no encontrada' using errcode = '42501';
  end if;
  if v_res.estado not in ('pendiente', 'confirmada') then
    raise exception 'NO_CANCELABLE: esta reservación ya está %', v_res.estado;
  end if;
  if v_res.inicio < now() and not public.es_admin() then
    raise exception 'NO_CANCELABLE: el evento ya pasó';
  end if;

  dias := extract(epoch from (v_res.inicio - now())) / 86400;
  if dias >= cfg.cancelacion_dias_reembolso then
    monto := round(v_res.total_pagado * (1 - cfg.cancelacion_comision_pct / 100), 2);
  end if;

  update public.reservaciones
     set estado = 'cancelada', motivo_cancelacion = p_motivo, cancelada_en = now(), expira_en = null
   where id = v_res.id;

  return query select v_res.folio, monto;
end;
$$;

commit;
