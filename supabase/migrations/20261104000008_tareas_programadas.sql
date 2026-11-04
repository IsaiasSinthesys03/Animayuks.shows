-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 8: tareas programadas con pg_cron
--   · expirar_pendientes()   cada 10 min: reservaciones sin anticipo cuyo plazo
--                            venció pasan a 'expirada' y liberan el horario (RN-07)
--   · limpiar_retenciones()  cada 5 min: borra horarios apartados vencidos (RN-08)
-- Los trabajos llevan el prefijo "ay-". Volver a correr este archivo los reemplaza.
-- Plan: MD/Plan_Etapa_2.md, sección 4 (migración 8).
-- ═════════════════════════════════════════════════════════════════════════════

-- Todo el archivo se aplica completo o no se aplica nada.
begin;

-- En Supabase la extensión está disponible; en la base local de pruebas se usa una imitación
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end $$;

-- ── Funciones ───────────────────────────────────────────────────────────────
create or replace function public.expirar_pendientes()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  update public.reservaciones
     set estado = 'expirada', expira_en = null
   where estado = 'pendiente'
     and expira_en < now()
     and total_pagado < anticipo_requerido;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.limpiar_retenciones()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  delete from public.retenciones where expira_en < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.expirar_pendientes() from public, anon, authenticated;
revoke execute on function public.limpiar_retenciones() from public, anon, authenticated;

-- ── Trabajos ────────────────────────────────────────────────────────────────
select cron.schedule('ay-expirar-pendientes',  '*/10 * * * *', 'select public.expirar_pendientes()');
select cron.schedule('ay-limpiar-retenciones', '*/5 * * * *',  'select public.limpiar_retenciones()');

commit;
