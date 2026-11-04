# Base de datos (Supabase)

Este proyecto **no usa la CLI de Supabase**. Las migraciones son archivos SQL con fecha en `migrations/`.

## Flujo para aplicar una migración (con psql)

1. **Conexión:** `supabase/.env` (no se sube a git) contiene `AY_DB_URL` con la URI del *Session pooler* (Supabase → **Connect**). Nunca se imprime ni se sube.
2. **Respaldo antes de tocar nada:** `pg_dump` a la carpeta `respaldos/` (no se sube a git).
3. **Aplicar:** `psql "$AY_DB_URL" -v ON_ERROR_STOP=1 -f migrations/<archivo>.sql`. Cada archivo trae su propio `begin; … commit;`: entra completo o no entra nada.
4. **Verificar y probar:** [`verificacion.sql`](verificacion.sql) y la batería de [`tests/`](tests/). Las pruebas crean sus propios datos dentro de una transacción y la deshacen al final (`rollback`): no dejan nada en la base.
5. **Guardar:** commit y push del `.sql` y sus pruebas.

Reglas:
- Si una función ya existe en Supabase, se reconstruye a partir de la versión viva (`pg_get_functiondef`), no del archivo viejo, para no perder cambios hechos a mano.
- Un valor nuevo de un `enum` va en su propio archivo: Postgres no deja usarlo en la misma transacción.
- Lo que **borra datos** (como [`deshacer_migraciones.sql`](deshacer_migraciones.sql)) no se ejecuta con psql desde aquí: se corre a mano en el SQL Editor.

## Alternativa sin psql: SQL Editor

1. Abre el proyecto en https://supabase.com/dashboard → **SQL Editor** → **New query**.
2. Abre el archivo en el repo, copia **todo** su contenido, pégalo y dale **Run** (Ctrl + Enter).
3. Espera a que diga *Success*. Si sale un error, no sigas con el siguiente archivo y manda captura.
4. Repite con el siguiente archivo, **en orden**:

| # | Archivo | Qué hace |
|---|---|---|
| 1 | [`20261103000001_esquema_inicial.sql`](migrations/20261103000001_esquema_inicial.sql) | Tablas, regla anti-traslapes, precios, cobertura, pagos, bitácora y funciones de reservación |
| 2 | [`20261103000002_seguridad_rls.sql`](migrations/20261103000002_seguridad_rls.sql) | Seguridad por filas (RLS), permisos y buckets de Storage `shows` y `comprobantes` |
| 3 | [`20261103000003_admin_y_datos_iniciales.sql`](migrations/20261103000003_admin_y_datos_iniciales.sql) | Rol de administrador, configuración, horario, zonas y catálogo de ejemplo |

Las migraciones 1 y 2 se ejecutan **una sola vez**. La 3 se puede volver a correr sin duplicar datos; al terminar muestra una tabla con el correo del administrador y su rol.

Cada archivo se aplica **completo o no se aplica nada** (`begin; … commit;`): si falla a la mitad, la base de datos queda como estaba antes de ese archivo.

**Después de las tres**, ejecuta [`verificacion.sql`](verificacion.sql). Solo lee datos y devuelve 18 chequeos: todos deben decir `ok = true`.

**Si algo quedó mal** y todavía no hay datos reales, [`deshacer_migraciones.sql`](deshacer_migraciones.sql) borra todo lo que crearon las migraciones (tablas, funciones, políticas, buckets vacíos y el trigger de Auth) sin tocar los usuarios de Authentication. Después se vuelven a aplicar en orden. **Borra datos: no usarlo en producción.**

Si Supabase muestra el aviso *"Potential issue detected"* o *"This query has destructive operations"*, revisa que pegaste el archivo correcto y confirma: los archivos no borran datos existentes.

## Correos de autenticación (Resend)

Supabase envía los correos de cuenta (confirmar registro, recuperar contraseña, cambiar correo) por el SMTP de Resend:

| Campo (Authentication → Emails → SMTP Settings) | Valor |
|---|---|
| Sender email | `no-responder@animayuks.com` |
| Sender name | `Animayuks` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | API key de Resend (no se guarda en el repo) |

Plantillas en español, para pegar en **Authentication → Emails → Templates**:

| Plantilla de Supabase | Asunto | Archivo |
|---|---|---|
| Confirm sign up | Confirma tu cuenta en Animayuks | [`templates/confirmar_registro.html`](templates/confirmar_registro.html) |
| Reset password | Cambia tu contraseña de Animayuks | [`templates/recuperar_contrasena.html`](templates/recuperar_contrasena.html) |
| Change email address | Confirma tu nuevo correo en Animayuks | [`templates/cambiar_correo.html`](templates/cambiar_correo.html) |

## Qué queda en la base de datos

- **Roles:** `cliente` (por defecto al registrarse) y `admin`. Solo un admin puede cambiar roles.
- **Reservaciones:** se crean únicamente con la función `crear_reservacion()`, que valida en el servidor la cobertura, la anticipación, el horario de servicio, los bloqueos y calcula el precio. La base de datos rechaza dos reservaciones que se traslapen (incluyendo montaje, desmontaje y traslado).
- **Pagos:** al aprobarse pagos que cubren el anticipo, la reservación pasa sola a *confirmada*.
- **Cancelación:** `cancelar_reservacion()` aplica la política de reembolso de la configuración.
- **Disponibilidad pública:** `ocupacion(desde, hasta)` devuelve los horarios ocupados sin datos de clientes.
- **Bitácora:** cada cambio en reservaciones, pagos, shows, paquetes, zonas, bloqueos, perfiles y configuración queda registrado.

## Pendiente para migraciones siguientes

- Expirar automáticamente las reservaciones pendientes sin anticipo (RN-07) con `pg_cron`.
- Retención temporal de 10 minutos del horario mientras se completa el pago (RN-08).
- Cupones de descuento (RF-PRO).
