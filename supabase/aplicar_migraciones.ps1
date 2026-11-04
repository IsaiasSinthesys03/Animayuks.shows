# Aplica las migraciones 1-3 y la verificación en Supabase con psql.
# Uso (desde la raíz del proyecto):  .\supabase\aplicar_migraciones.ps1
# psql pide la contraseña de la base de datos; no se guarda en ningún archivo.

$ErrorActionPreference = 'Stop'
$env:PGCLIENTENCODING = 'UTF8'   # evita que los acentos se guarden mal en Windows

$conexion = 'postgresql://postgres.wvqpazwwfrveliekqorv@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
$carpeta  = Split-Path -Parent $MyInvocation.MyCommand.Path

$archivos = @(
  'migrations\20261103000001_esquema_inicial.sql',
  'migrations\20261103000002_seguridad_rls.sql',
  'migrations\20261103000003_admin_y_datos_iniciales.sql',
  'verificacion.sql'
) | ForEach-Object { '-f'; (Join-Path $carpeta $_) }

& psql $conexion -v ON_ERROR_STOP=1 -X @archivos
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nSe detuvo por un error. Lo que no terminó no quedó a medias. Manda captura." -ForegroundColor Red
  exit $LASTEXITCODE
}
Write-Host "`nListo. Revisa que los 18 chequeos de arriba digan ok = t." -ForegroundColor Green
