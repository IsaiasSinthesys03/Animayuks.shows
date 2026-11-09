-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 15: página de inicio (landing)
-- Textos editables, banners del carrusel y videos de YouTube. El sitio los lee
-- directo de la base: quien protege los datos es RLS. Las imágenes van en el
-- bucket `landing`; los videos de banner, en Cloudflare R2.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── Textos de la página (una sola fila) ─────────────────────────────────────
create table public.landing_contenido (
  id                    smallint primary key default 1 check (id = 1),
  portada_titulo        text not null,
  portada_resaltado     text not null default '',
  portada_descripcion   text not null default '',
  cobertura_titulo      text not null,
  cobertura_descripcion text not null default '',
  pasos_titulo          text not null,
  pasos                 jsonb not null check (
    jsonb_typeof(pasos) = 'array' and jsonb_array_length(pasos) = 4
  ),
  shows_titulo          text not null,
  shows_resaltado       text not null default '',
  shows_subtitulo       text not null default '',
  shows_boton           text not null default '',
  personajes_titulo     text not null,
  personajes_resaltado  text not null default '',
  personajes_subtitulo  text not null default '',
  videos_titulo         text not null,
  videos_resaltado      text not null default '',
  videos_descripcion    text not null default '',
  videos_boton          text not null default '',
  actualizado_en        timestamptz not null default now()
);

insert into public.landing_contenido (
  portada_titulo, portada_resaltado, portada_descripcion,
  cobertura_titulo, cobertura_descripcion,
  pasos_titulo, pasos,
  shows_titulo, shows_resaltado, shows_subtitulo, shows_boton,
  personajes_titulo, personajes_resaltado, personajes_subtitulo,
  videos_titulo, videos_resaltado, videos_descripcion, videos_boton
) values (
  'Llevamos el show', 'a tu fiesta',
  'Shows en vivo para tu fiesta o evento. Elige el tuyo, revisa la fecha y apártalo desde tu celular.',
  '¿Llegamos a tu colonia?', 'Solo hacemos eventos en nuestras zonas de cobertura. Revísalo antes de elegir.',
  'Así de fácil se reserva',
  '[
    {"titulo": "Escribe tu código postal", "texto": "Confirmamos al momento si llegamos a tu colonia y cuánto cuesta el traslado."},
    {"titulo": "Elige show y fecha", "texto": "Ves los horarios libres al momento y apartamos el tuyo mientras terminas."},
    {"titulo": "Aparta con el {anticipo} %", "texto": "Transfiere el anticipo y sube tu comprobante. El resto se paga el día del evento."},
    {"titulo": "Disfruta la función", "texto": "Te recordamos dos días antes y llegamos con tiempo para montar."}
  ]'::jsonb,
  'Shows', 'destacados', 'Los favoritos para celebrar en grande.', 'Ver todos los shows',
  'Conoce a la', 'familia Animayuks', 'Ellos llegan a tu fiesta para llenarla de alegría.',
  'No es solo un show,', 'es una experiencia.',
  'Animayuks lleva a tu casa, salón o jardín la magia de nuestros personajes, con música, baile y diversión en vivo.',
  'Reservar mi show'
);

create trigger landing_contenido_actualizado before update on public.landing_contenido
  for each row execute function public.tocar_actualizado();

-- ── Banners del carrusel ────────────────────────────────────────────────────
create table public.landing_banners (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null check (length(trim(titulo)) > 0),
  titulo_resaltado text,
  etiqueta         text,
  descripcion      text,
  color            text not null default '#e9b83f' check (color ~ '^#[0-9a-fA-F]{6}$'),
  texto_boton      text,
  -- Solo rutas internas o https: un enlace nunca puede ejecutar código
  enlace           text check (enlace is null or enlace ~ '^/([^/\\]|$)' or enlace ~ '^https://[^\s]+$'),
  -- Los videos solo pueden venir de nuestra carpeta en Cloudflare R2
  video_url        text check (video_url is null or video_url ~ '^https://media\.animayuks\.com/landing/banners/[A-Za-z0-9._-]+$'),
  imagen_ruta      text,
  orden            int not null default 0,
  activo           boolean not null default false,
  inicia_en        timestamptz,
  termina_en       timestamptz,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  check (inicia_en is null or termina_en is null or termina_en > inicia_en)
);
create index landing_banners_orden on public.landing_banners (orden);

create trigger landing_banners_actualizado before update on public.landing_banners
  for each row execute function public.tocar_actualizado();

-- ── Videos de YouTube ───────────────────────────────────────────────────────
create table public.landing_videos (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null check (length(trim(titulo)) > 0),
  youtube_id     text not null unique check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  orden          int not null default 0,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index landing_videos_orden on public.landing_videos (orden);

create trigger landing_videos_actualizado before update on public.landing_videos
  for each row execute function public.tocar_actualizado();

-- ── Bitácora ────────────────────────────────────────────────────────────────
create trigger bitacora_landing_contenido after update on public.landing_contenido
  for each row execute function public.registrar_bitacora();
create trigger bitacora_landing_banners after insert or update or delete on public.landing_banners
  for each row execute function public.registrar_bitacora();
create trigger bitacora_landing_videos after insert or update or delete on public.landing_videos
  for each row execute function public.registrar_bitacora();

-- ── Seguridad ───────────────────────────────────────────────────────────────
alter table public.landing_contenido enable row level security;
alter table public.landing_banners   enable row level security;
alter table public.landing_videos    enable row level security;

grant select on public.landing_contenido, public.landing_banners, public.landing_videos to anon, authenticated;
grant update on public.landing_contenido to authenticated;
grant insert, update, delete on public.landing_banners, public.landing_videos to authenticated;

create policy "landing: leer textos" on public.landing_contenido
  for select to anon, authenticated using (true);
create policy "landing: admin edita textos" on public.landing_contenido
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "landing: ver banners vigentes" on public.landing_banners
  for select to anon, authenticated
  using (activo and (inicia_en is null or inicia_en <= now()) and (termina_en is null or termina_en > now()));
create policy "landing: admin gestiona banners" on public.landing_banners
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "landing: ver videos activos" on public.landing_videos
  for select to anon, authenticated using (activo);
create policy "landing: admin gestiona videos" on public.landing_videos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ── Reordenar: una sola llamada, todo o nada ────────────────────────────────
create or replace function public.reordenar_banners(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'SIN_PERMISO: solo un administrador puede reordenar' using errcode = '42501';
  end if;
  update public.landing_banners b
     set orden = x.posicion
    from unnest(p_ids) with ordinality as x(id, posicion)
   where b.id = x.id;
end;
$$;

create or replace function public.reordenar_videos(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'SIN_PERMISO: solo un administrador puede reordenar' using errcode = '42501';
  end if;
  update public.landing_videos v
     set orden = x.posicion
    from unnest(p_ids) with ordinality as x(id, posicion)
   where v.id = x.id;
end;
$$;

revoke execute on function public.reordenar_banners(uuid[]) from public, anon;
revoke execute on function public.reordenar_videos(uuid[]) from public, anon;
grant execute on function public.reordenar_banners(uuid[]) to authenticated;
grant execute on function public.reordenar_videos(uuid[]) to authenticated;

-- ── Imágenes de los banners ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('landing', 'landing', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

create policy "landing: admin sube archivos" on storage.objects
  for insert to authenticated with check (bucket_id = 'landing' and public.es_admin());
create policy "landing: admin edita archivos" on storage.objects
  for update to authenticated using (bucket_id = 'landing' and public.es_admin());
create policy "landing: admin borra archivos" on storage.objects
  for delete to authenticated using (bucket_id = 'landing' and public.es_admin());

commit;
