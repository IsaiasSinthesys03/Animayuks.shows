-- ═════════════════════════════════════════════════════════════════════════════
-- Verificación de las migraciones
-- Solo lee: no cambia nada. Revisa la estructura, no los datos que el administrador
-- puede editar desde el panel (zonas, shows, preguntas...). Ejecútalo en SQL Editor después de aplicarlas.
-- Cada fila debe decir ok = true (22 chequeos). Si alguna dice false, manda captura.
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
                       'plantillas_correo', 'notificaciones',
                       -- migración 15
                       'landing_contenido', 'landing_banners', 'landing_videos',
                       -- migración 17
                       'cp_contornos')
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
    (1,  'Tablas creadas',                        '26', (select count(*) from tablas)::text),
    (2,  'Tablas con RLS activo',                 '26', (select count(*) from tablas where relrowsecurity)::text),
    (3,  'Políticas de seguridad en tablas',      '51', (select count(*) from pg_policies where schemaname = 'public')::text),
    (4,  'Funciones de negocio',                  '42', (select count(*) from funciones)::text),
    (5,  'Trigger de nuevos usuarios',            '1',  (select count(*) from pg_trigger where tgname = 'al_crear_usuario')::text),
    (6,  'Regla anti-traslapes de reservaciones', '1',  (select count(*) from pg_constraint where conname = 'reservaciones_sin_traslape')::text),
    (7,  'Buckets de Storage',                    '3',  (select count(*) from storage.buckets where id in ('shows', 'comprobantes', 'landing'))::text),
    (8,  'Políticas de Storage',                  '6',  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
                                                           and policyname like any (array['shows:%', 'comprobantes:%']))::text),
    (9,  'Administrador con rol admin',           '1',  (select count(*) from public.perfiles p join auth.users u on u.id = p.id
                                                          where p.rol = 'admin' and lower(u.email) = 'picafresa.codex@gmail.com')::text),
    (10, 'Configuración del negocio',             '1',  (select count(*) from public.configuracion)::text),
    (11, 'Días del horario de servicio',          '7',  (select count(*) from public.horario_servicio)::text),
    (12, 'Zonas con reservaciones protegidas',    'a',  (select confdeltype::text from pg_constraint where conname = 'reservaciones_zona_id_fkey')),
    -- migración 4
    (19, 'Páginas legales existen',               '3',  (select count(*) from public.paginas
                                                          where slug in ('aviso-de-privacidad', 'terminos', 'politica-de-cancelacion'))::text),
    -- migración 5
    (22, 'Visitante consulta disponibilidad',     'true', (has_function_privilege('anon', 'public.horarios_disponibles(uuid,uuid,uuid[],text,date)', 'execute')
                                                           and has_function_privilege('anon', 'public.disponibilidad_mes(uuid,uuid,uuid[],text,int,int)', 'execute'))::text),
    (23, 'Funciones internas cerradas al público','false', (has_function_privilege('anon', 'public.calcular_horario(uuid,uuid,uuid[],text,timestamptz,boolean)', 'execute')
                                                           or has_function_privilege('authenticated', 'public.validar_horario(timestamptz,timestamptz,tstzrange,uuid,uuid)', 'execute')
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
    (28, 'Plantillas de correo',                  '13', (select count(*) from public.plantillas_correo)::text),
    (29, 'API key de Resend en Vault',            '1',  (select count(*) from vault.decrypted_secrets where name = 'resend_api_key')::text),
    (30, 'Bandeja de salida cerrada al público',  'false', (has_function_privilege('authenticated', 'public.enviar_pendientes(int)', 'execute')
                                                           or has_function_privilege('anon', 'public.encolar_correo(text,uuid,uuid,jsonb,text)', 'execute'))::text),
    -- migración 13
    (31, 'Catálogo de códigos postales cargado',  'true', ((select count(*) from public.catalogo_cp) > 30000)::text),
    (32, 'Horario de zona es interno',            'false', (has_function_privilege('anon', 'public.horario_de_zona(uuid,int)', 'execute'))::text),
    -- migración 17
    (33, 'Contornos de Yucatán cargados',         '468', (select count(*) from public.cp_contornos)::text),
    (34, 'Mapa del panel cerrado al público',     'false', (has_function_privilege('anon', 'public.mapa_zonas_admin()', 'execute'))::text),
    -- migración 19
    (35, 'Cuadrícula cerrada al público',         'false', (has_function_privilege('anon', 'public.cuadricula_cp_admin()', 'execute'))::text),
    -- migración 20
    (36, 'Agregar CP cerrado al público',         'false', (has_function_privilege('anon', 'public.agregar_cp_a_zona(uuid,text)', 'execute'))::text)
)
select orden, chequeo, esperado, obtenido, esperado = obtenido as ok
  from chequeos
 order by orden;
