-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 4: configuración del negocio
-- Datos para transferencias (editables desde el panel), parámetros de la etapa 2,
-- páginas legales con versión, aceptaciones, preguntas frecuentes y validación
-- de la ruta de los comprobantes. Plan: MD/Plan_Etapa_2.md, sección 4.
-- ═════════════════════════════════════════════════════════════════════════════

-- Todo el archivo se aplica completo o no se aplica nada.
begin;

-- ── Configuración: columnas nuevas ──────────────────────────────────────────
-- Los datos bancarios empiezan vacíos: el administrador los captura en el panel.
alter table public.configuracion
  add column banco                  text,
  add column titular_cuenta         text,
  add column clabe                  text check (clabe ~ '^\d{18}$'),
  add column instrucciones_pago     text not null default
    'Transfiere el anticipo y escribe tu folio en el concepto o referencia. Después sube tu comprobante en Mis reservaciones para que lo confirmemos.',
  add column correo_avisos          text check (correo_avisos ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column retencion_minutos      int  not null default 10 check (retencion_minutos between 1 and 60),       -- RN-08
  add column intervalo_horarios_min int  not null default 30 check (intervalo_horarios_min in (15, 30, 60)),
  add column hora_recordatorio      time not null default '10:00',                                           -- RF-NOT-02
  add column hora_resumen_diario    time not null default '20:00';                                           -- RF-NOT-05

update public.configuracion
   set correo_avisos = coalesce(correo_avisos, 'picafresa.codex@gmail.com')
 where id = 1;

-- ── Páginas legales (RF-CAT-10, RF-CFG-06, RNF-LEG-01) ──────────────────────
create table public.paginas (
  slug            text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  titulo          text not null,
  contenido       text not null,              -- Markdown
  version         int  not null default 1,
  publicada       boolean not null default true,
  actualizado_en  timestamptz not null default now()
);

-- Cada cambio de contenido sube la versión (RNF-LEG-03)
create or replace function public.versionar_pagina()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.contenido is distinct from old.contenido then
    new.version := old.version + 1;
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger paginas_version before update on public.paginas
  for each row execute function public.versionar_pagina();
create trigger bitacora_paginas after insert or update or delete on public.paginas
  for each row execute function public.registrar_bitacora();

-- Qué versión aceptó cada usuario (RNF-LEG-03)
create table public.aceptaciones_legales (
  usuario_id   uuid not null references auth.users (id) on delete cascade,
  slug         text not null references public.paginas (slug) on delete cascade,
  version      int  not null,
  aceptado_en  timestamptz not null default now(),
  primary key (usuario_id, slug, version)
);

create or replace function public.aceptar_paginas(p_slugs text[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA: inicia sesión para continuar' using errcode = '42501';
  end if;
  insert into public.aceptaciones_legales (usuario_id, slug, version)
  select auth.uid(), p.slug, p.version
    from public.paginas p
   where p.slug = any (p_slugs) and p.publicada
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── Preguntas frecuentes (RF-CAT-09) ────────────────────────────────────────
create table public.preguntas_frecuentes (
  id         uuid primary key default gen_random_uuid(),
  pregunta   text not null check (length(trim(pregunta)) > 0),
  respuesta  text not null check (length(trim(respuesta)) > 0),
  orden      int  not null default 0,
  activa     boolean not null default true
);

-- ── Comprobantes: un cliente solo apunta a archivos de su carpeta ───────────
create or replace function public.validar_comprobante()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.comprobante_path is not null
     and not public.es_admin()
     and new.comprobante_path not like auth.uid()::text || '/%' then
    raise exception 'COMPROBANTE_INVALIDO: el comprobante debe estar en tu carpeta' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger pagos_validar_comprobante before insert or update of comprobante_path on public.pagos
  for each row execute function public.validar_comprobante();

-- ── Seguridad ───────────────────────────────────────────────────────────────
alter table public.paginas              enable row level security;
alter table public.aceptaciones_legales enable row level security;
alter table public.preguntas_frecuentes enable row level security;

revoke all on public.paginas, public.aceptaciones_legales, public.preguntas_frecuentes from anon, authenticated;
grant select on public.paginas, public.preguntas_frecuentes to anon, authenticated;
grant select, insert, update, delete on public.paginas, public.preguntas_frecuentes to authenticated;
grant select on public.aceptaciones_legales to authenticated;

create policy "páginas: leer publicadas" on public.paginas
  for select to anon, authenticated using (publicada or public.es_admin());
create policy "páginas: admin gestiona" on public.paginas
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "preguntas: leer activas" on public.preguntas_frecuentes
  for select to anon, authenticated using (activa or public.es_admin());
create policy "preguntas: admin gestiona" on public.preguntas_frecuentes
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "aceptaciones: ver las propias" on public.aceptaciones_legales
  for select to authenticated using (usuario_id = auth.uid() or public.es_admin());

revoke execute on function public.aceptar_paginas(text[]) from anon, public;
grant execute on function public.aceptar_paginas(text[]) to authenticated;

-- ── Contenido inicial (borradores, se editan desde el panel) ───────────────
insert into public.paginas (slug, titulo, contenido) values
  ('aviso-de-privacidad', 'Aviso de privacidad',
   E'> **BORRADOR — revisar con un abogado antes de publicar el sitio.**\n\n'
   '**Animayuks** es responsable del tratamiento de tus datos personales.\n\n'
   '## Datos que recabamos\nNombre, teléfono, correo electrónico y la dirección del evento.\n\n'
   '## Para qué los usamos\nPara agendar y realizar el show que reservas, confirmar pagos y enviarte avisos sobre tu reservación.\n\n'
   '## Derechos ARCO\nPuedes acceder, rectificar, cancelar u oponerte al uso de tus datos escribiendo a reservas@animayuks.com.'),
  ('terminos', 'Términos y condiciones',
   E'> **BORRADOR — revisar con un abogado antes de publicar el sitio.**\n\n'
   '1. Las reservaciones se confirman al recibir el anticipo.\n'
   '2. El servicio se presta solo dentro de las zonas de cobertura publicadas.\n'
   '3. El lugar del evento debe cumplir los requisitos indicados en cada show.'),
  ('politica-de-cancelacion', 'Política de cancelación',
   E'> **BORRADOR — revisar con el dueño del negocio.**\n\n'
   '- Si cancelas con **7 días o más** de anticipación, te devolvemos el anticipo menos 5 % de comisión bancaria.\n'
   '- Con **menos de 7 días**, el anticipo no es reembolsable.\n'
   '- Puedes **cambiar la fecha una vez**, con al menos 72 horas de anticipación y sujeto a disponibilidad.')
on conflict (slug) do nothing;

insert into public.preguntas_frecuentes (pregunta, respuesta, orden) values
  ('¿Cuánto tengo que pagar para apartar?', 'El 30 % del total. El resto se paga el día del evento.', 1),
  ('¿En qué zonas dan servicio?', 'En las zonas que aparecen en la página de cobertura. Escribe tu código postal para confirmarlo.', 2),
  ('¿Con cuánta anticipación debo reservar?', 'En línea, con al menos 48 horas. Para fechas más cercanas, escríbenos por WhatsApp.', 3),
  ('¿A qué hora llegan los artistas?', 'Unos 30 minutos antes del inicio para montar.', 4),
  ('¿Qué pasa si llueve?', 'Si el show es al aire libre, necesitamos un espacio techado. Si no lo hay, podemos cambiar la fecha.', 5),
  ('¿Puedo cambiar la fecha?', 'Sí, una vez, con al menos 72 horas de anticipación y sujeto a disponibilidad.', 6);

commit;
