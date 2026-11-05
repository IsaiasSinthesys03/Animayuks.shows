-- ═════════════════════════════════════════════════════════════════════════════
-- Borra los datos de la prueba real de correos del 4 nov 2026
-- ⚠ BORRA DATOS. Se corre a mano en Supabase → SQL Editor, una sola vez.
--
-- Solo toca la reservación cancelada SHW-26-4GEYX, sus 4 registros de correo y la
-- ficha de cliente "Prueba Correos". Al terminar, la zona Zapopan ya se puede eliminar.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

delete from public.notificaciones
 where reservacion_id = (select id from public.reservaciones where folio = 'SHW-26-4GEYX');

delete from public.reservaciones
 where folio = 'SHW-26-4GEYX' and estado = 'cancelada';

delete from public.clientes c
 where c.nombre = 'Prueba Correos'
   and c.usuario_id is null
   and not exists (select 1 from public.reservaciones r where r.cliente_id = c.id);

commit;

-- Debe mostrar 0 y 0
select (select count(*) from public.reservaciones where folio = 'SHW-26-4GEYX') as reservaciones_de_prueba,
       (select count(*) from public.clientes where nombre = 'Prueba Correos') as fichas_de_prueba;
