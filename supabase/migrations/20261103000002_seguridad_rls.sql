-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 2: seguridad
-- Row Level Security, permisos por rol y buckets de Storage (RNF-SEG-04).
--
-- Reglas generales:
--   anon           visitante sin cuenta: solo lee el catálogo activo.
--   authenticated  cliente con sesión: lee el catálogo y SUS reservaciones/pagos.
--   admin          perfil con rol 'admin': lee y modifica todo.
-- Las reservaciones NO se insertan directo: se crean con crear_reservacion().
-- ═════════════════════════════════════════════════════════════════════════════

-- Todo el archivo se aplica completo o no se aplica nada.
begin;

-- ── Activar RLS en todas las tablas ─────────────────────────────────────────
alter table public.configuracion      enable row level security;
alter table public.horario_servicio   enable row level security;
alter table public.bloqueos           enable row level security;
alter table public.perfiles           enable row level security;
alter table public.clientes           enable row level security;
alter table public.categorias         enable row level security;
alter table public.shows              enable row level security;
alter table public.paquetes           enable row level security;
alter table public.extras             enable row level security;
alter table public.zonas              enable row level security;
alter table public.lista_interes      enable row level security;
alter table public.reservaciones      enable row level security;
alter table public.reservacion_extras enable row level security;
alter table public.notas_reservacion  enable row level security;
alter table public.pagos              enable row level security;
alter table public.bitacora           enable row level security;

-- ── Permisos de tabla (RLS decide después qué filas) ────────────────────────
revoke all on all tables in schema public from anon, authenticated;

grant select on public.configuracion, public.horario_servicio, public.categorias,
                public.shows, public.paquetes, public.extras, public.zonas
  to anon, authenticated;
grant insert on public.lista_interes to anon, authenticated;

-- Las políticas de abajo deciden qué filas puede tocar cada quien
grant select, insert, update, delete on all tables in schema public to authenticated;
-- Nadie escribe la bitácora a mano: la llenan los triggers
revoke insert, update, delete on public.bitacora from authenticated;

grant execute on function public.zona_por_cp(text)       to anon, authenticated;
grant execute on function public.ocupacion(date, date)   to anon, authenticated;
grant execute on function public.es_admin()              to anon, authenticated;
grant execute on function public.crear_reservacion(uuid, uuid, timestamptz, text, text, text, text, uuid[], jsonb, jsonb, uuid, text, numeric, boolean, text) to authenticated;
grant execute on function public.cancelar_reservacion(uuid, text) to authenticated;
revoke execute on function public.crear_reservacion(uuid, uuid, timestamptz, text, text, text, text, uuid[], jsonb, jsonb, uuid, text, numeric, boolean, text) from anon, public;
revoke execute on function public.cancelar_reservacion(uuid, text) from anon, public;

-- ── Catálogo y configuración: lectura pública, escritura solo admin ─────────

create policy "catalogo: leer shows activos" on public.shows
  for select to anon, authenticated using (activo or public.es_admin());
create policy "catalogo: admin gestiona shows" on public.shows
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "catalogo: leer paquetes activos" on public.paquetes
  for select to anon, authenticated using (activo or public.es_admin());
create policy "catalogo: admin gestiona paquetes" on public.paquetes
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "catalogo: leer extras activos" on public.extras
  for select to anon, authenticated using (activo or public.es_admin());
create policy "catalogo: admin gestiona extras" on public.extras
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "catalogo: leer categorías" on public.categorias
  for select to anon, authenticated using (true);
create policy "catalogo: admin gestiona categorías" on public.categorias
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "cobertura: leer zonas activas" on public.zonas
  for select to anon, authenticated using (activa or public.es_admin());
create policy "cobertura: admin gestiona zonas" on public.zonas
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "config: lectura pública" on public.configuracion
  for select to anon, authenticated using (true);
create policy "config: admin actualiza" on public.configuracion
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "horario: lectura pública" on public.horario_servicio
  for select to anon, authenticated using (true);
create policy "horario: admin gestiona" on public.horario_servicio
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Los bloqueos se consultan públicamente con ocupacion(), que no expone el motivo
create policy "bloqueos: admin gestiona" on public.bloqueos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "interes: cualquiera se anota" on public.lista_interes
  for insert to anon, authenticated with check (true);
create policy "interes: admin consulta" on public.lista_interes
  for select to authenticated using (public.es_admin());
create policy "interes: admin borra" on public.lista_interes
  for delete to authenticated using (public.es_admin());

-- ── Usuarios y clientes ──────────────────────────────────────────────────────

create policy "perfiles: ver el propio" on public.perfiles
  for select to authenticated using (id = auth.uid() or public.es_admin());
-- Solo el admin cambia roles; nadie puede ascenderse a sí mismo
create policy "perfiles: admin actualiza" on public.perfiles
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "clientes: ver la propia ficha" on public.clientes
  for select to authenticated using (usuario_id = auth.uid() or public.es_admin());
create policy "clientes: editar la propia ficha" on public.clientes
  for update to authenticated
  using (usuario_id = auth.uid() or public.es_admin())
  with check (usuario_id = auth.uid() or public.es_admin());
create policy "clientes: admin crea" on public.clientes
  for insert to authenticated with check (public.es_admin());
create policy "clientes: admin borra" on public.clientes
  for delete to authenticated using (public.es_admin());

-- Un cliente no puede tocar columnas sensibles de su ficha aunque RLS le deje la fila
create or replace function public.proteger_ficha_cliente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.es_admin() then
    if new.usuario_id is distinct from old.usuario_id
       or new.correo is distinct from old.correo
       or new.etiquetas is distinct from old.etiquetas
       or new.bloqueado is distinct from old.bloqueado
       or new.motivo_bloqueo is distinct from old.motivo_bloqueo
       or new.origen is distinct from old.origen
       or new.notas is distinct from old.notas then
      raise exception 'Solo puedes cambiar tu nombre y teléfono' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger clientes_proteger before update on public.clientes
  for each row execute function public.proteger_ficha_cliente();

-- ── Reservaciones ───────────────────────────────────────────────────────────

create policy "reservaciones: ver las propias" on public.reservaciones
  for select to authenticated
  using (
    public.es_admin()
    or exists (select 1 from public.clientes c where c.id = cliente_id and c.usuario_id = auth.uid())
  );
-- Altas: solo por crear_reservacion(). Cambios directos: solo admin.
create policy "reservaciones: admin actualiza" on public.reservaciones
  for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "reservaciones: admin borra" on public.reservaciones
  for delete to authenticated using (public.es_admin());

create policy "extras de reservación: ver los propios" on public.reservacion_extras
  for select to authenticated
  using (
    public.es_admin()
    or exists (
      select 1 from public.reservaciones r join public.clientes c on c.id = r.cliente_id
       where r.id = reservacion_id and c.usuario_id = auth.uid()
    )
  );
create policy "extras de reservación: admin gestiona" on public.reservacion_extras
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "notas: solo admin" on public.notas_reservacion
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ── Pagos ───────────────────────────────────────────────────────────────────

create policy "pagos: ver los propios" on public.pagos
  for select to authenticated
  using (
    public.es_admin()
    or exists (
      select 1 from public.reservaciones r join public.clientes c on c.id = r.cliente_id
       where r.id = reservacion_id and c.usuario_id = auth.uid()
    )
  );
-- El cliente puede avisar de una transferencia; queda pendiente hasta que el admin la apruebe (RF-PAG-05)
create policy "pagos: cliente sube comprobante" on public.pagos
  for insert to authenticated
  with check (
    public.es_admin()
    or (
      estado = 'pendiente'
      and tipo in ('anticipo', 'abono', 'liquidacion')
      and metodo = 'Transferencia'
      and exists (
        select 1 from public.reservaciones r join public.clientes c on c.id = r.cliente_id
         where r.id = reservacion_id and c.usuario_id = auth.uid()
           and r.estado in ('pendiente', 'confirmada')
      )
    )
  );
create policy "pagos: admin actualiza" on public.pagos
  for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "pagos: admin borra" on public.pagos
  for delete to authenticated using (public.es_admin());

-- ── Bitácora: solo lectura para el admin (RF-AUD-03) ─────────────────────────

create policy "bitácora: admin consulta" on public.bitacora
  for select to authenticated using (public.es_admin());

-- ── Storage ─────────────────────────────────────────────────────────────────

-- Fotos y videos de los shows: públicos para ver, solo el admin sube (máx. 10 MB, RNF-SEG-09)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shows', 'shows', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'video/mp4'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Comprobantes de pago: privados. Cada cliente sube a la carpeta con su id de usuario.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "shows: admin sube archivos" on storage.objects
  for insert to authenticated with check (bucket_id = 'shows' and public.es_admin());
create policy "shows: admin edita archivos" on storage.objects
  for update to authenticated using (bucket_id = 'shows' and public.es_admin());
create policy "shows: admin borra archivos" on storage.objects
  for delete to authenticated using (bucket_id = 'shows' and public.es_admin());

create policy "comprobantes: cliente sube a su carpeta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "comprobantes: ver los propios o admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'comprobantes' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
create policy "comprobantes: admin borra" on storage.objects
  for delete to authenticated using (bucket_id = 'comprobantes' and public.es_admin());

commit;
