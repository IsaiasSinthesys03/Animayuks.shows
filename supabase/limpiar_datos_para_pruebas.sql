-- ═════════════════════════════════════════════════════════════════════════════
-- Deja la base de datos vacía para probar el flujo desde cero
-- ⚠ BORRA DATOS. Se corre a mano en Supabase → SQL Editor. NO usar con datos reales.
--
-- BORRA: reservaciones, pagos, notas, correos enviados, apartados, shows, paquetes,
--        extras, categorías, zonas, bloqueos, lista de interés, preguntas frecuentes,
--        fichas de clientes sin cuenta y bitácora.
-- REINICIA: el horario de servicio (todos los días quedan sin servicio).
-- CONSERVA: usuarios y sus fichas, roles, configuración (WhatsApp, datos bancarios,
--           reglas), textos legales y plantillas de correo.
--
-- El horario se apaga en lugar de borrarse, y la configuración y las páginas se
-- conservan, porque el panel las edita pero no tiene cómo volver a crearlas.
-- Los archivos de Storage no se tocan: Supabase no deja borrarlos con SQL.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- Primero lo que depende de otras tablas
delete from public.notificaciones;
delete from public.pagos;
delete from public.notas_reservacion;
delete from public.reservacion_extras;
delete from public.reservaciones;
delete from public.retenciones;

delete from public.paquetes;
delete from public.shows;
delete from public.extras;
delete from public.categorias;
delete from public.zonas;

delete from public.bloqueos;
delete from public.lista_interes;
delete from public.preguntas_frecuentes;
delete from public.clientes where usuario_id is null;

update public.horario_servicio set activo = false;

-- Al final: los borrados de arriba también se registran en la bitácora
delete from public.bitacora;

commit;

-- Todo debe estar en 0, salvo usuarios, fichas con cuenta, días (7), páginas (3) y plantillas (13)
select t as tabla, n as filas
  from (values
    (1,  'usuarios (se conservan)',       (select count(*) from auth.users)),
    (2,  'fichas con cuenta (se conservan)', (select count(*) from public.clientes)),
    (3,  'configuración (se conserva)',   (select count(*) from public.configuracion)),
    (4,  'días del horario (7, apagados)', (select count(*) from public.horario_servicio where not activo)),
    (5,  'páginas legales (se conservan)', (select count(*) from public.paginas)),
    (6,  'plantillas (se conservan)',     (select count(*) from public.plantillas_correo)),
    (7,  'shows',                         (select count(*) from public.shows)),
    (8,  'paquetes',                      (select count(*) from public.paquetes)),
    (9,  'extras',                        (select count(*) from public.extras)),
    (10, 'categorías',                    (select count(*) from public.categorias)),
    (11, 'zonas',                         (select count(*) from public.zonas)),
    (12, 'reservaciones',                 (select count(*) from public.reservaciones)),
    (13, 'pagos',                         (select count(*) from public.pagos)),
    (14, 'correos',                       (select count(*) from public.notificaciones)),
    (15, 'bloqueos',                      (select count(*) from public.bloqueos)),
    (16, 'preguntas frecuentes',          (select count(*) from public.preguntas_frecuentes)),
    (17, 'bitácora',                      (select count(*) from public.bitacora))
  ) as x(orden, t, n)
 order by orden;
