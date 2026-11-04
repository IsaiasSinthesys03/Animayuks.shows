# Base de datos (Supabase)

Este proyecto **no usa la CLI de Supabase**. Las migraciones son archivos SQL con fecha en `migrations/`.

## Flujo para aplicar una migración (con psql)

1. **Conexión:** `supabase/.env` (no se sube a git) contiene `AY_DB_URL` con la URI del *Session pooler* (Supabase → **Connect**). Nunca se imprime ni se sube.
2. **Respaldo antes de tocar nada:** `pg_dump` a la carpeta `respaldos/` (no se sube a git).
3. **Aplicar:** `psql "$AY_DB_URL" -v ON_ERROR_STOP=1 -f migrations/<archivo>.sql`. Cada archivo trae su propio `begin; … commit;`: entra completo o no entra nada.
4. **Verificar y probar:** [`verificacion.sql`](verificacion.sql) (30 chequeos) y **todas** las baterías de [`tests/`](tests/). Las pruebas crean sus propios datos dentro de una transacción y la deshacen al final (`rollback`): no dejan nada en la base y no envían correos.
5. **Guardar:** commit y push del `.sql` y sus pruebas.

Reglas:
- Si una función ya existe en Supabase, se reconstruye a partir de la versión viva (`pg_get_functiondef`), no del archivo viejo, para no perder cambios hechos a mano.
- Un valor nuevo de un `enum` va en su propio archivo: Postgres no deja usarlo en la misma transacción.
- Lo que **borra datos** (como [`deshacer_migraciones.sql`](deshacer_migraciones.sql)) no se ejecuta con psql desde aquí: se corre a mano en el SQL Editor.

## Migraciones

| # | Archivo | Qué hace |
|---|---|---|
| 1 | [`20261103000001_esquema_inicial.sql`](migrations/20261103000001_esquema_inicial.sql) | Tablas, regla anti-traslapes, precios, cobertura, pagos, bitácora y funciones de reservación |
| 2 | [`20261103000002_seguridad_rls.sql`](migrations/20261103000002_seguridad_rls.sql) | Seguridad por filas (RLS), permisos y buckets de Storage `shows` y `comprobantes` |
| 3 | [`20261103000003_admin_y_datos_iniciales.sql`](migrations/20261103000003_admin_y_datos_iniciales.sql) | Rol de administrador, configuración, horario, zonas y catálogo de ejemplo |
| 4 | [`20261104000004_configuracion_negocio.sql`](migrations/20261104000004_configuracion_negocio.sql) | Datos bancarios (editables desde el panel), páginas legales con versión, aceptaciones, preguntas frecuentes, validación de comprobantes |
| 5 | [`20261104000005_disponibilidad.sql`](migrations/20261104000005_disponibilidad.sql) | Candado de agenda, cálculo único de horario, `horarios_disponibles()`, `disponibilidad_mes()` |
| 6 | [`20261104000006_retenciones.sql`](migrations/20261104000006_retenciones.sql) | Apartar un horario 10 minutos (`apartar_horario()`, `liberar_horario()`) |
| 7 | [`20261104000007_reprogramar.sql`](migrations/20261104000007_reprogramar.sql) | `reprogramar_reservacion()` |
| 8 | [`20261104000008_tareas_programadas.sql`](migrations/20261104000008_tareas_programadas.sql) | `pg_cron`: expirar pendientes sin anticipo y limpiar apartados vencidos |
| 9 | [`20261104000009_notificaciones.sql`](migrations/20261104000009_notificaciones.sql) | Correos de reservación: bandeja de salida, 13 plantillas, envío por Resend con `pg_net`, reintentos, recordatorio y resumen diario |

**Si algo quedó mal** con las migraciones 1–3 y todavía no hay datos reales, [`deshacer_migraciones.sql`](deshacer_migraciones.sql) las revierte. **Borra datos: no usarlo en producción.**

### Alternativa sin psql: SQL Editor

Supabase → **SQL Editor → New query** → pegar el archivo completo → **Run**, en orden. Si sale un error, no seguir con el siguiente. Después, `verificacion.sql`.

## Secretos

| Secreto | Dónde vive | Cómo se carga |
|---|---|---|
| Conexión a la base (`AY_DB_URL`) | `supabase/.env` (no se sube) | La captura el dueño del proyecto |
| API key de Resend para correos de reservación | **Supabase Vault**, nombre `resend_api_key` | Desde `RESEND_API_KEY` de `supabase/.env` con `psql` y `\getenv` (nunca se imprime); o en el dashboard: **Project Settings → Vault → Add new secret** |
| API key de Resend para correos de cuenta | Supabase → Authentication → SMTP Settings | A mano en el dashboard |

Para cambiar la llave de Resend: actualizar `resend_api_key` en Vault. Los correos pendientes salen con la llave nueva en el siguiente minuto.

## Tareas programadas (`pg_cron`)

| Trabajo | Cada | Qué hace |
|---|---|---|
| `ay-expirar-pendientes` | 10 min | Reservaciones sin anticipo con el plazo vencido → `expirada` (libera el horario) |
| `ay-limpiar-retenciones` | 5 min | Borra horarios apartados vencidos |
| `ay-enviar-correos` | 1 min | Envía hasta 10 correos pendientes a Resend |
| `ay-revisar-envios` | 1 min | Marca enviados, programa reintentos (1, 4, 16 min) o deja `fallida` |
| `ay-recordatorios` | 1 h | A la `hora_recordatorio` (10:00), encola el recordatorio de las funciones de pasado mañana |
| `ay-resumen-diario` | 1 h | A la `hora_resumen_diario` (20:00), manda al dueño las funciones de mañana |

Revisar que corran: `select * from cron.job_run_details order by start_time desc limit 20;`

## Correos de autenticación (Resend por SMTP)

| Campo (Authentication → Emails → SMTP Settings) | Valor |
|---|---|
| Sender email | `no-responder@animayuks.com` |
| Sender name | `Animayuks` |
| Host / Port / Username | `smtp.resend.com` / `465` / `resend` |
| Password | API key de Resend (no se guarda en el repo) |

Plantillas en español para **Authentication → Emails → Templates**: [`confirmar_registro.html`](templates/confirmar_registro.html), [`recuperar_contrasena.html`](templates/recuperar_contrasena.html), [`cambiar_correo.html`](templates/cambiar_correo.html).

## Correos de reservación

Los triggers dejan cada correo **ya renderizado** en `notificaciones`; `pg_cron` los envía. Cada envío lleva una llave de idempotencia, así que un reintento nunca duplica un correo. Las plantillas están en `plantillas_correo` (el admin podrá editarlas desde el panel). Variables: `{{folio}}`, `{{nombre}}`, `{{show}}`, `{{fecha}}`, `{{hora}}`, `{{total}}`, `{{anticipo}}`, `{{saldo}}`, `{{reembolso}}`, etc. Las que terminan en `_html` se insertan sin escapar porque las arma el sistema.

| Plantilla | Para | Cuándo |
|---|---|---|
| `reservacion_recibida` | Cliente | Reservación en línea creada (con datos de transferencia) |
| `reservacion_confirmada` | Cliente | Pasa a confirmada |
| `pago_recibido` | Cliente | Se aprueba un pago |
| `comprobante_rechazado` | Cliente | El admin rechaza un comprobante (motivo = `pagos.nota`) |
| `reservacion_reprogramada` / `aviso_reprogramacion` | Cliente / dueño | Cambia la fecha |
| `reservacion_cancelada` / `aviso_cancelacion` | Cliente / dueño | Se cancela |
| `reservacion_expirada` | Cliente | Venció el plazo del anticipo |
| `recordatorio` | Cliente | Dos días antes |
| `aviso_nueva_reservacion` | Dueño | Cualquier reservación nueva |
| `aviso_comprobante` | Dueño | El cliente sube un comprobante |
| `resumen_diario` | Dueño | Funciones de mañana |

Clientes sin correo (presenciales): sus correos quedan `omitida`. El admin puede reenviar un `fallida` u `omitida` con `reintentar_correo(id)`.

## Funciones públicas para el frontend

Se llaman con `supabase.rpc('nombre', { parametros })`. Los errores de negocio llegan en `error.message` con un código al inicio (`FUERA_DE_COBERTURA: …`), pensado para mostrar un mensaje claro en la interfaz.

| Función | Quién | Parámetros | Devuelve |
|---|---|---|---|
| `zona_por_cp` | Todos | `p_cp` | La zona activa del código postal, o vacío |
| `disponibilidad_mes` | Todos | `p_show_id, p_paquete_id, p_extras, p_codigo_postal, p_anio, p_mes` | Una fila por día: `fecha, horarios, estado` (`libre`, `pocos`, `lleno`, `no_disponible`) |
| `horarios_disponibles` | Todos | `p_show_id, p_paquete_id, p_extras, p_codigo_postal, p_fecha` | `inicio, fin` de cada hora libre |
| `apartar_horario` | Con sesión | `p_show_id, p_paquete_id, p_extras, p_codigo_postal, p_inicio` | La retención (con `expira_en`) |
| `liberar_horario` | Con sesión | — | `true` si había apartado |
| `crear_reservacion` | Con sesión | `p_show_id, p_paquete_id, p_inicio, p_codigo_postal, p_calle, p_colonia, p_referencias, p_extras, p_evento, p_cliente`; solo admin: `p_cliente_id, p_canal, p_descuento, p_forzar, p_motivo` | La reservación creada |
| `reprogramar_reservacion` | Con sesión | `p_reservacion_id, p_nuevo_inicio, p_motivo` | La reservación actualizada |
| `cancelar_reservacion` | Con sesión | `p_reservacion_id, p_motivo` | `folio, monto_reembolsable` |
| `aceptar_paginas` | Con sesión | `p_slugs` (ej. `['aviso-de-privacidad','terminos']`) | Cuántas aceptaciones nuevas se guardaron |
| `ocupacion` | Todos | `p_desde, p_hasta` | Bloques ocupados, sin datos de clientes |
| `reintentar_correo` | Admin | `p_id` | `true` si se reprogramó |

Códigos de error: `SESION_REQUERIDA`, `RESERVACIONES_PAUSADAS`, `CLIENTE_BLOQUEADO`, `SHOW_NO_DISPONIBLE`, `PAQUETE_NO_DISPONIBLE`, `FUERA_DE_COBERTURA`, `ANTICIPACION`, `FECHA_PASADA`, `FUERA_DE_HORARIO`, `FECHA_BLOQUEADA`, `HORARIO_OCUPADO`, `MOTIVO_REQUERIDO`, `NO_ENCONTRADA`, `NO_CANCELABLE`, `NO_REPROGRAMABLE`, `REPROGRAMACION_TARDE`, `REPROGRAMACION_LIMITE`, `COMPROBANTE_INVALIDO`.

Ejemplo (calendario del asistente):

```js
const { data: dias, error } = await supabase.rpc('disponibilidad_mes', {
  p_show_id: show.id, p_paquete_id: paquete?.id ?? null, p_extras: extrasIds,
  p_codigo_postal: cp, p_anio: 2026, p_mes: 11,
})
```

Ejemplo (apartar y luego reservar):

```js
await supabase.rpc('apartar_horario', { p_show_id, p_paquete_id, p_extras, p_codigo_postal, p_inicio })
// … el cliente llena sus datos (tiene 10 minutos) …
const { data: reservacion, error } = await supabase.rpc('crear_reservacion', {
  p_show_id, p_paquete_id, p_inicio, p_codigo_postal, p_calle, p_colonia, p_extras,
  p_evento: { tipo_evento: 'Cumpleaños', festejado: 'Emilio', asistentes: '30' },
})
if (error?.message.startsWith('HORARIO_OCUPADO')) { /* pedir otro horario */ }
```

Datos que el frontend lee directo de las tablas (RLS decide qué ve cada quien): `shows`, `paquetes`, `extras`, `categorias`, `zonas`, `configuracion` (incluye datos bancarios), `paginas`, `preguntas_frecuentes`, `horario_servicio`; con sesión, `reservaciones`, `pagos` y `clientes` propios; el admin, todo.

## Pendiente

- Cupones de descuento (RF-PRO).
- Pagos en línea con Mercado Pago (fase 2).
