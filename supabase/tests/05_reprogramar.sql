-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 05: reprogramar reservaciones (migración 7)
-- Se deshace al final con rollback: no deja datos.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, reprogramacion_min_horas = 72,
       reprogramaciones_max = 1, reservaciones_en_linea = true,
       cancelacion_dias_reembolso = 7, zona_horaria = 'America/Mexico_City'
 where id = 1;
update public.horario_servicio set activo = true, max_shows = null;
delete from public.dias_especiales;
delete from public.horario_franjas where dia_semana is not null;
insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min)
select d, '10:00', '20:00', 'intervalo', 30 from generate_series(0, 6) d;

insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min)
values ('a0000000-0000-4000-8000-000000000501', 'Zona reprogramar', array['99994'], 200, 0);
insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base)
values ('a0000000-0000-4000-8000-000000000510', 'prueba-reprog', 'Show reprogramar', 60, 30, 20, 1000);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000005a1', 'rep.cliente1@prueba.invalid', '{"nombre":"Cliente Uno"}'),
  ('a0000000-0000-4000-8000-0000000005a2', 'rep.cliente2@prueba.invalid', '{"nombre":"Cliente Dos"}'),
  ('a0000000-0000-4000-8000-0000000005ad', 'rep.admin@prueba.invalid',    '{"nombre":"Admin Rep"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000005ad';

do $$
declare sab date := (now() at time zone 'America/Mexico_City')::date + 9;
begin
  sab := sab + ((6 - extract(dow from sab)::int + 7) % 7);
  while exists (select 1 from public.ocupacion(sab, sab + 7))
        or exists (select 1 from public.retenciones r
                    where r.bloque && tstzrange(sab::timestamp at time zone 'America/Mexico_City',
                                                (sab + 8)::timestamp at time zone 'America/Mexico_City')) loop
    sab := sab + 7;
  end loop;
  perform set_config('prueba.sab', sab::text, true);
  raise notice 'Sábado de prueba: %', sab;
end $$;

create function pg_temp.h(dias int, hora text) returns timestamptz language sql stable as $$
  select (current_setting('prueba.sab')::date + dias + hora::time) at time zone 'America/Mexico_City'
$$;
grant execute on function pg_temp.h(int, text) to anon, authenticated;

-- Reservaciones de prueba
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000005a1', true);
select set_config('prueba.r1', (public.crear_reservacion('a0000000-0000-4000-8000-000000000510', null, pg_temp.h(0, '12:00'), '99994', 'Calle', 'Colonia')).id::text, true);
select set_config('prueba.r2', (public.crear_reservacion('a0000000-0000-4000-8000-000000000510', null, pg_temp.h(0, '16:00'), '99994', 'Calle', 'Colonia')).id::text, true);
select set_config('prueba.r4', (public.crear_reservacion('a0000000-0000-4000-8000-000000000510', null, pg_temp.h(0, '18:00'), '99994', 'Calle', 'Colonia')).id::text, true);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000005a2', true);
select set_config('prueba.r3', (public.crear_reservacion('a0000000-0000-4000-8000-000000000510', null, pg_temp.h(7, '10:00'), '99994', 'Calle', 'Colonia')).id::text, true);
reset role;

-- ── Cliente 1 ───────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000005a1', true);

do $$
declare r public.reservaciones; total_antes numeric;
begin
  select total into total_antes from public.reservaciones where id = current_setting('prueba.r1')::uuid;
  r := public.reprogramar_reservacion(current_setting('prueba.r1')::uuid, pg_temp.h(7, '15:00'));
  if r.inicio <> pg_temp.h(7, '15:00') or r.fin <> pg_temp.h(7, '16:00')
     or lower(r.bloque) <> pg_temp.h(7, '14:30') or upper(r.bloque) <> pg_temp.h(7, '16:20')
     or r.reprogramaciones <> 1 or r.total <> total_antes then
    raise exception 'PRUEBA FALLIDA G01: inicio %, bloque %, reprogramaciones %, total %', r.inicio, r.bloque, r.reprogramaciones, r.total;
  end if;
  if not exists (select 1 from public.horarios_disponibles('a0000000-0000-4000-8000-000000000510', null, '{}', '99994',
                                                           current_setting('prueba.sab')::date) where inicio = pg_temp.h(0, '12:00')) then
    raise exception 'PRUEBA FALLIDA G01: la fecha anterior no quedó libre';
  end if;
  raise notice 'G01 ok: cambia fecha, fin y bloque; el precio se mantiene y la fecha anterior queda libre';
end $$;

do $$ begin
  perform public.reprogramar_reservacion(current_setting('prueba.r1')::uuid, pg_temp.h(7, '17:00'));
  raise exception 'PRUEBA FALLIDA G02: permitió una segunda reprogramación';
exception when raise_exception then
  if sqlerrm not like 'REPROGRAMACION_LIMITE%' then raise; end if;
  raise notice 'G02 ok: el cliente solo cambia la fecha una vez';
end $$;

do $$ begin
  perform public.reprogramar_reservacion(current_setting('prueba.r4')::uuid, pg_temp.h(7, '10:30'));
  raise exception 'PRUEBA FALLIDA G04: reprogramó sobre un horario ocupado';
exception when exclusion_violation then
  raise notice 'G04 ok: no reprograma a un horario ocupado';
end $$;

do $$
declare r public.reservaciones;
begin
  r := public.reprogramar_reservacion(current_setting('prueba.r4')::uuid, pg_temp.h(0, '18:30'));
  if r.inicio <> pg_temp.h(0, '18:30') or r.reprogramaciones <> 1 then
    raise exception 'PRUEBA FALLIDA G05: inicio %, reprogramaciones %', r.inicio, r.reprogramaciones;
  end if;
  raise notice 'G05 ok: se puede mover 30 min dentro de su propio bloque (no choca consigo misma); el intento fallido no contó';
end $$;

do $$ begin
  perform public.reprogramar_reservacion(current_setting('prueba.r2')::uuid, pg_temp.h(7, '21:00'));
  raise exception 'PRUEBA FALLIDA G09: aceptó una fecha nueva después del cierre sin ser admin';
exception when raise_exception then
  if sqlerrm not like 'FUERA_DE_HORARIO%' then raise; end if;
  raise notice 'G09 ok: la fecha nueva cumple las mismas reglas que una reservación nueva';
end $$;
reset role;

-- La reservación 2 ahora es en menos de 72 h (se acomoda directo para la prueba)
update public.reservaciones
   set inicio = now() + interval '60 hours', fin = now() + interval '61 hours',
       bloque = tstzrange(now() + interval '59 hours 30 minutes', now() + interval '61 hours 20 minutes')
 where id = current_setting('prueba.r2')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000005a1', true);
do $$ begin
  perform public.reprogramar_reservacion(current_setting('prueba.r2')::uuid, pg_temp.h(7, '18:00'));
  raise exception 'PRUEBA FALLIDA G03: reprogramó con menos de 72 h';
exception when raise_exception then
  if sqlerrm not like 'REPROGRAMACION_TARDE%' then raise; end if;
  raise notice 'G03 ok: no se reprograma con menos de 72 h para el evento';
end $$;
reset role;

-- ── Cliente 2 no toca reservaciones ajenas ──────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000005a2', true);
do $$ begin
  perform public.reprogramar_reservacion(current_setting('prueba.r1')::uuid, pg_temp.h(7, '18:00'));
  raise exception 'PRUEBA FALLIDA G07: el cliente 2 reprogramó una reservación ajena';
exception when insufficient_privilege then
  raise notice 'G07 ok: no se reprograman reservaciones ajenas';
end $$;
reset role;

-- ── Administrador ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000005ad', true);
do $$
declare r public.reservaciones;
begin
  begin
    perform public.reprogramar_reservacion(current_setting('prueba.r4')::uuid, pg_temp.h(7, '20:30'));
    raise exception 'PRUEBA FALLIDA G06: el admin se saltó el horario sin motivo';
  exception when raise_exception then
    if sqlerrm not like 'MOTIVO_REQUERIDO%' then raise; end if;
  end;
  r := public.reprogramar_reservacion(current_setting('prueba.r4')::uuid, pg_temp.h(7, '20:30'), 'Evento nocturno acordado');
  if r.reprogramaciones <> 2 or r.motivo_excepcion not like '%reprogramación (fuera de horario): Evento nocturno acordado%' then
    raise exception 'PRUEBA FALLIDA G06: reprogramaciones %, motivo %', r.reprogramaciones, r.motivo_excepcion;
  end if;
  raise notice 'G06 ok: el admin pasa el límite de una vez y se salta el horario solo con motivo';
end $$;

do $$
declare dummy record;
begin
  select * into dummy from public.cancelar_reservacion(current_setting('prueba.r3')::uuid, 'Prueba');
  begin
    perform public.reprogramar_reservacion(current_setting('prueba.r3')::uuid, pg_temp.h(7, '12:00'));
    raise exception 'PRUEBA FALLIDA G08: reprogramó una reservación cancelada';
  exception when raise_exception then
    if sqlerrm not like 'NO_REPROGRAMABLE%' then raise; end if;
    raise notice 'G08 ok: una reservación cancelada no se reprograma';
  end;
end $$;

do $$ begin
  if (select count(*) from public.bitacora
       where entidad = 'reservaciones' and accion = 'update'
         and entidad_id = current_setting('prueba.r1')
         and (antes ->> 'inicio') is distinct from (despues ->> 'inicio')) < 1 then
    raise exception 'PRUEBA FALLIDA G10: la bitácora no guardó la fecha anterior';
  end if;
  raise notice 'G10 ok: la bitácora guarda la fecha anterior y la nueva';
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  perform public.reprogramar_reservacion(current_setting('prueba.r1')::uuid, pg_temp.h(7, '18:00'));
  raise exception 'PRUEBA FALLIDA G11: el visitante reprogramó';
exception when insufficient_privilege then
  raise notice 'G11 ok: el visitante no puede reprogramar';
end $$;
reset role;

do $$ begin raise notice 'Batería 05 completa: 11 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
