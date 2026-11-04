-- ═════════════════════════════════════════════════════════════════════════════
-- Verificación de las migraciones
-- Solo lee: no cambia nada. Ejecútalo en SQL Editor después de aplicarlas.
-- Cada fila debe decir ok = true (23 chequeos). Si alguna dice false, manda captura.
-- ═════════════════════════════════════════════════════════════════════════════

with tablas as (
  select c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname in ('configuracion', 'horario_servicio', 'bloqueos', 'perfiles', 'clientes', 'categorias',
                       'shows', 'paquetes', 'extras', 'zonas', 'lista_interes', 'reservaciones',
                       'reservacion_extras', 'notas_reservacion', 'pagos', 'bitacora',
                       -- migración 4
                       'paginas', 'aceptaciones_legales', 'preguntas_frecuentes')
),
funciones as (
  select p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('tocar_actualizado', 'generar_folio', 'es_admin', 'manejar_nuevo_usuario', 'zona_por_cp',
                       'recalcular_pagado', 'registrar_bitacora', 'ocupacion', 'crear_reservacion',
                       'cancelar_reservacion', 'proteger_ficha_cliente',
                       -- migración 4
                       'versionar_pagina', 'aceptar_paginas', 'validar_comprobante',
                       -- migración 5
                       'bloquear_agenda', 'bloqueos_tomar_candado', 'calcular_horario', 'validar_horario',
                       'evaluar_horarios_dia', 'horarios_disponibles', 'disponibilidad_mes')
),
chequeos (orden, chequeo, esperado, obtenido) as (
  values
    (1,  'Tablas creadas',                        '19', (select count(*) from tablas)::text),
    (2,  'Tablas con RLS activo',                 '19', (select count(*) from tablas where relrowsecurity)::text),
    (3,  'Políticas de seguridad en tablas',      '40', (select count(*) from pg_policies where schemaname = 'public')::text),
    (4,  'Funciones de negocio',                  '21', (select count(*) from funciones)::text),
    (5,  'Trigger de nuevos usuarios',            '1',  (select count(*) from pg_trigger where tgname = 'al_crear_usuario')::text),
    (6,  'Regla anti-traslapes de reservaciones', '1',  (select count(*) from pg_constraint where conname = 'reservaciones_sin_traslape')::text),
    (7,  'Buckets de Storage',                    '2',  (select count(*) from storage.buckets where id in ('shows', 'comprobantes'))::text),
    (8,  'Políticas de Storage',                  '6',  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
                                                           and policyname like any (array['shows:%', 'comprobantes:%']))::text),
    (9,  'Administrador con rol admin',           '1',  (select count(*) from public.perfiles p join auth.users u on u.id = p.id
                                                          where p.rol = 'admin' and lower(u.email) = 'picafresa.codex@gmail.com')::text),
    (10, 'Configuración del negocio',             '1',  (select count(*) from public.configuracion)::text),
    (11, 'Días del horario de servicio',          '7',  (select count(*) from public.horario_servicio)::text),
    (12, 'Zonas de cobertura',                    '5',  (select count(*) from public.zonas)::text),
    (13, 'Categorías',                            '3',  (select count(*) from public.categorias)::text),
    (14, 'Shows',                                 '6',  (select count(*) from public.shows)::text),
    (15, 'Paquetes',                              '12', (select count(*) from public.paquetes)::text),
    (16, 'Extras',                                '4',  (select count(*) from public.extras)::text),
    (17, 'Cobertura: 45110 cae en Zapopan',       'Zapopan', coalesce((public.zona_por_cp('45110')).nombre, 'sin zona')),
    (18, 'Cobertura: 45640 queda fuera',          'sin zona', coalesce((public.zona_por_cp('45640')).nombre, 'sin zona')),
    -- migración 4
    (19, 'Páginas legales publicadas',            '3',  (select count(*) from public.paginas where publicada
                                                           and slug in ('aviso-de-privacidad', 'terminos', 'politica-de-cancelacion'))::text),
    (20, 'Preguntas frecuentes activas',          '6',  (select count(*) from public.preguntas_frecuentes where activa)::text),
    (21, 'Correo para avisos del dueño',          'true', (select (correo_avisos is not null)::text from public.configuracion)),
    -- migración 5
    (22, 'Visitante consulta disponibilidad',     'true', (has_function_privilege('anon', 'public.horarios_disponibles(uuid,uuid,uuid[],text,date)', 'execute')
                                                           and has_function_privilege('anon', 'public.disponibilidad_mes(uuid,uuid,uuid[],text,int,int)', 'execute'))::text),
    (23, 'Funciones internas cerradas al público','false', (has_function_privilege('anon', 'public.calcular_horario(uuid,uuid,uuid[],text,timestamptz,boolean)', 'execute')
                                                           or has_function_privilege('authenticated', 'public.validar_horario(timestamptz,timestamptz,tstzrange,uuid)', 'execute')
                                                           or has_function_privilege('authenticated', 'public.bloquear_agenda()', 'execute'))::text)
)
select orden, chequeo, esperado, obtenido, esperado = obtenido as ok
  from chequeos
 order by orden;
