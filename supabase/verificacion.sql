-- ═════════════════════════════════════════════════════════════════════════════
-- Verificación de las migraciones
-- Solo lee: no cambia nada. Ejecútalo en SQL Editor después de aplicarlas.
-- Cada fila debe decir ok = true (30 chequeos). Si alguna dice false, manda captura.
-- ═════════════════════════════════════════════════════════════════════════════

with tablas as (
  select c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname in ('configuracion', 'horario_servicio', 'bloqueos', 'perfiles', 'clientes', 'categorias',
                       'shows', 'paquetes', 'extras', 'zonas', 'lista_interes', 'reservaciones',
                       'reservacion_extras', 'notas_reservacion', 'pagos', 'bitacora',
                       -- migración 4
                       'paginas', 'aceptaciones_legales', 'preguntas_frecuentes',
                       -- migración 6
                       'retenciones',
                       -- migración 9
                       'plantillas_correo', 'notificaciones')
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
                       'evaluar_horarios_dia', 'horarios_disponibles', 'disponibilidad_mes',
                       -- migración 6
                       'apartar_horario', 'liberar_horario',
                       -- migración 7
                       'reprogramar_reservacion',
                       -- migración 8
                       'expirar_pendientes', 'limpiar_retenciones',
                       -- migración 9
                       'fecha_es', 'hora_es', 'pesos', 'escapar_html', 'renderizar', 'envolver_correo',
                       'reembolso_estimado', 'datos_correo', 'encolar_correo', 'notificar_reservacion', 'notificar_pago',
                       'enviar_pendientes', 'revisar_envios', 'reintentar_correo', 'encolar_recordatorios', 'encolar_resumen_diario')
),
chequeos (orden, chequeo, esperado, obtenido) as (
  values
    (1,  'Tablas creadas',                        '22', (select count(*) from tablas)::text),
    (2,  'Tablas con RLS activo',                 '22', (select count(*) from tablas where relrowsecurity)::text),
    (3,  'Políticas de seguridad en tablas',      '44', (select count(*) from pg_policies where schemaname = 'public')::text),
    (4,  'Funciones de negocio',                  '42', (select count(*) from funciones)::text),
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
                                                           or has_function_privilege('authenticated', 'public.bloquear_agenda()', 'execute'))::text),
    -- migración 6
    (24, 'Apartar exige sesión',                  'false', (has_function_privilege('anon', 'public.apartar_horario(uuid,uuid,uuid[],text,timestamptz)', 'execute'))::text),
    -- migración 7
    (25, 'Reprogramar exige sesión',              'false', (has_function_privilege('anon', 'public.reprogramar_reservacion(uuid,timestamptz,text)', 'execute'))::text),
    -- migración 8
    (26, 'Trabajos de cron activos',              '2',  (select count(*) from cron.job
                                                          where jobname in ('ay-expirar-pendientes', 'ay-limpiar-retenciones') and active)::text),
    -- migración 9
    (27, 'Trabajos de cron de correos activos',   '4',  (select count(*) from cron.job
                                                          where jobname in ('ay-enviar-correos', 'ay-revisar-envios', 'ay-recordatorios', 'ay-resumen-diario') and active)::text),
    (28, 'Plantillas de correo activas',          '13', (select count(*) from public.plantillas_correo where activa)::text),
    (29, 'API key de Resend en Vault',            '1',  (select count(*) from vault.decrypted_secrets where name = 'resend_api_key')::text),
    (30, 'Bandeja de salida cerrada al público',  'false', (has_function_privilege('authenticated', 'public.enviar_pendientes(int)', 'execute')
                                                           or has_function_privilege('anon', 'public.encolar_correo(text,uuid,uuid,jsonb,text)', 'execute'))::text)
)
select orden, chequeo, esperado, obtenido, esperado = obtenido as ok
  from chequeos
 order by orden;
