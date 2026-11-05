-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 11: el WhatsApp del negocio se captura desde el panel
-- Quita el número de ejemplo y valida el formato (solo dígitos, con lada de país).
-- ═════════════════════════════════════════════════════════════════════════════

-- Todo el archivo se aplica completo o no se aplica nada.
begin;

update public.configuracion set whatsapp = null where whatsapp = '523312345678';

alter table public.configuracion
  add constraint configuracion_whatsapp_formato check (whatsapp ~ '^\d{10,15}$');

commit;
