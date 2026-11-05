-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 12: una zona con reservaciones no se puede borrar (RN-19)
-- Antes, borrarla dejaba esas reservaciones sin zona. Ahora la base de datos lo
-- rechaza y el panel sugiere pausarla. Las zonas sin reservaciones sí se borran.
-- ═════════════════════════════════════════════════════════════════════════════

-- Todo el archivo se aplica completo o no se aplica nada.
begin;

alter table public.reservaciones drop constraint reservaciones_zona_id_fkey;
alter table public.reservaciones
  add constraint reservaciones_zona_id_fkey
  foreign key (zona_id) references public.zonas (id);  -- sin "on delete": rechaza con el error 23503

commit;
