-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 26: documentos legales en PDF
-- · Cada documento (aviso de privacidad, términos, política de cancelación)
--   puede tener un PDF oficial. "contenido" pasa a ser el resumen; sin PDF
--   sigue siendo el texto completo, como antes.
-- · Historial: cada versión guarda su PDF y su texto (paginas_versiones).
--   Los PDF no se cambian ni se borran: son la prueba de lo que se aceptó.
-- · Versión nueva = PDF nuevo (o texto nuevo si no hay PDF). Editar el
--   resumen de un documento con PDF no pide volver a aceptar.
-- · legales_pendientes(): qué versiones vigentes le faltan aceptar al usuario.
-- Solo agrega: sin PDF las páginas se ven igual que antes.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── Archivos ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('legales', 'legales', true, 10485760, array['application/pdf']);

-- Solo el admin sube; nadie cambia ni borra (no hay políticas de update/delete)
create policy "legales: admin sube" on storage.objects
  for insert to authenticated with check (bucket_id = 'legales' and public.es_admin());

-- ── Columnas y historial ────────────────────────────────────────────────────
alter table public.paginas
  add column pdf_ruta      text,
  add column pdf_nombre    text,
  add column pdf_bytes     int check (pdf_bytes is null or pdf_bytes > 0),
  add column vigente_desde timestamptz not null default now();

update public.paginas set vigente_desde = actualizado_en;

create table public.paginas_versiones (
  slug          text not null references public.paginas (slug) on delete cascade,
  version       int  not null,
  pdf_ruta      text,
  pdf_nombre    text,
  pdf_bytes     int,
  contenido     text not null,
  publicado_en  timestamptz not null default now(),
  publicado_por uuid references auth.users (id) on delete set null,
  primary key (slug, version)
);

insert into public.paginas_versiones (slug, version, contenido, publicado_en)
select slug, version, contenido, actualizado_en from public.paginas;

alter table public.paginas_versiones enable row level security;
grant select on public.paginas_versiones to anon, authenticated;
create policy "páginas: leer versiones publicadas" on public.paginas_versiones
  for select to anon, authenticated
  using (exists (select 1 from public.paginas p where p.slug = paginas_versiones.slug and (p.publicada or public.es_admin())));

-- ── Versiones ───────────────────────────────────────────────────────────────
-- PDF nuevo = versión nueva. Sin PDF, un texto nuevo también (como antes).
create or replace function public.versionar_pagina()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pdf_ruta is distinct from old.pdf_ruta
     or (new.pdf_ruta is null and new.contenido is distinct from old.contenido) then
    new.version := old.version + 1;
    new.vigente_desde := now();
  else
    new.version := old.version;
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;

-- Guarda cada versión en el historial; editar el resumen actualiza la vigente
create or replace function public.historial_pagina()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.version <> old.version then
    insert into public.paginas_versiones (slug, version, pdf_ruta, pdf_nombre, pdf_bytes, contenido, publicado_en, publicado_por)
    values (new.slug, new.version, new.pdf_ruta, new.pdf_nombre, new.pdf_bytes, new.contenido, new.vigente_desde, auth.uid())
    on conflict (slug, version) do nothing;
  elsif new.contenido is distinct from old.contenido then
    update public.paginas_versiones set contenido = new.contenido where slug = new.slug and version = new.version;
  end if;
  return null;
end;
$$;
create trigger paginas_historial after update on public.paginas
  for each row execute function public.historial_pagina();

-- ── Publicar un PDF (admin) ─────────────────────────────────────────────────
create or replace function public.publicar_pdf_legal(p_slug text, p_ruta text, p_nombre text, p_bytes int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v int;
begin
  if not public.es_admin() then
    raise exception 'SOLO_ADMIN: solo el administrador publica documentos legales' using errcode = '42501';
  end if;
  if not exists (select 1 from public.paginas where slug = p_slug) then
    raise exception 'PAGINA_NO_ENCONTRADA: ese documento no existe';
  end if;
  if p_ruta is null or left(p_ruta, length(p_slug) + 1) <> p_slug || '/' or lower(p_ruta) not like '%.pdf'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'legales' and o.name = p_ruta) then
    raise exception 'PDF_INVALIDO: el archivo no está en la carpeta de este documento';
  end if;
  update public.paginas
     set pdf_ruta = p_ruta, pdf_nombre = nullif(trim(p_nombre), ''), pdf_bytes = p_bytes
   where slug = p_slug
   returning version into v;
  return v;
end;
$$;

-- ── Lo que le falta aceptar al usuario con sesión ──────────────────────────
-- Solo a quien ya aceptó algo o ya reservó: a los nuevos se les pide al registrarse/reservar.
create or replace function public.legales_pendientes()
returns table (slug text, titulo text, version int, vigente_desde timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.slug, p.titulo, p.version, p.vigente_desde
    from public.paginas p
   where auth.uid() is not null
     and p.publicada
     and p.slug in ('aviso-de-privacidad', 'terminos', 'politica-de-cancelacion')
     and not exists (select 1 from public.aceptaciones_legales a where a.usuario_id = auth.uid() and a.slug = p.slug and a.version = p.version)
     and (exists (select 1 from public.aceptaciones_legales a where a.usuario_id = auth.uid())
          or exists (select 1 from public.reservaciones r join public.clientes c on c.id = r.cliente_id where c.usuario_id = auth.uid()))
   order by p.titulo;
$$;

-- ── Cuántos clientes aceptaron cada versión (admin) ────────────────────────
create or replace function public.aceptaciones_por_version(p_slug text)
returns table (version int, clientes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'SOLO_ADMIN: solo el administrador' using errcode = '42501';
  end if;
  return query select a.version, count(*) from public.aceptaciones_legales a where a.slug = p_slug group by a.version order by a.version desc;
end;
$$;

revoke execute on function public.publicar_pdf_legal(text, text, text, int), public.legales_pendientes(),
  public.aceptaciones_por_version(text) from public, anon;
grant execute on function public.publicar_pdf_legal(text, text, text, int), public.legales_pendientes(),
  public.aceptaciones_por_version(text) to authenticated;

commit;
