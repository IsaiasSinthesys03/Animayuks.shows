-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 23: el visitante no tiene ningún permiso sobre las tablas de horarios
-- Supabase da permisos por omisión a "anon" en tablas nuevas; las reglas (RLS)
-- ya le devolvían cero filas, esto además le quita el acceso.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

revoke all on public.horario_franjas, public.dias_especiales from anon;

commit;
