-- ═════════════════════════════════════════════════════════════════════════════
-- DESHACER las migraciones 1, 2 y 3
--
-- ⚠ BORRA todas las tablas del sistema y sus datos (reservaciones, clientes,
--   pagos…). Úsalo SOLO si una migración quedó a medias o mal aplicada y aún
--   no hay datos reales. Después vuelve a aplicar las migraciones en orden.
--
-- No toca: los usuarios de Authentication, la configuración de correos ni
-- otros esquemas de Supabase.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- Trigger sobre los usuarios de Auth
drop trigger if exists al_crear_usuario on auth.users;

-- Políticas de Storage
drop policy if exists "shows: admin sube archivos"               on storage.objects;
drop policy if exists "shows: admin edita archivos"              on storage.objects;
drop policy if exists "shows: admin borra archivos"              on storage.objects;
drop policy if exists "comprobantes: cliente sube a su carpeta"  on storage.objects;
drop policy if exists "comprobantes: ver los propios o admin"    on storage.objects;
drop policy if exists "comprobantes: admin borra"                on storage.objects;

-- Buckets (solo si están vacíos; si tienen archivos, bórralos antes desde Storage)
delete from storage.buckets b
 where b.id in ('shows', 'comprobantes')
   and not exists (select 1 from storage.objects o where o.bucket_id = b.id);

-- Tablas (cascade elimina sus políticas, triggers e índices)
drop table if exists public.catalogo_cp cascade;
drop table if exists
  public.bitacora,
  public.pagos,
  public.notas_reservacion,
  public.reservacion_extras,
  public.reservaciones,
  public.lista_interes,
  public.zonas,
  public.extras,
  public.paquetes,
  public.shows,
  public.categorias,
  public.clientes,
  public.perfiles,
  public.bloqueos,
  public.horario_servicio,
  public.configuracion
  cascade;

-- Funciones
drop function if exists public.crear_reservacion(uuid, uuid, timestamptz, text, text, text, text, uuid[], jsonb, jsonb, uuid, text, numeric, boolean, text);
drop function if exists public.cancelar_reservacion(uuid, text);
drop function if exists public.ocupacion(date, date);
drop function if exists public.zona_por_cp(text);
drop function if exists public.horario_de_zona(uuid, int);
drop function if exists public.zonas_validar_cobertura();
drop function if exists public.horario_zona_valido(jsonb);
drop function if exists public.catalogo_buscar(text, int);
drop function if exists public.catalogo_municipios(text);
drop function if exists public.catalogo_estados();
drop function if exists public.normalizar_texto(text);
drop function if exists public.es_admin();
drop function if exists public.manejar_nuevo_usuario();
drop function if exists public.recalcular_pagado();
drop function if exists public.registrar_bitacora();
drop function if exists public.proteger_ficha_cliente();
drop function if exists public.generar_folio();
drop function if exists public.tocar_actualizado();

commit;
