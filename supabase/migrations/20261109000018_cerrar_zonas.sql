-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 18: la tabla de zonas deja de ser legible para el público
-- Nombres y costos solo los ve el admin. Reservar sigue funcionando por zona_por_cp().
-- ⚠ Se aplica AL PUBLICAR el sitio nuevo: la versión anterior lee esta tabla.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

drop policy "cobertura: leer zonas activas" on public.zonas;
create policy "cobertura: solo admin lee zonas" on public.zonas
  for select to authenticated using (public.es_admin());

revoke select on public.zonas from anon;

commit;
