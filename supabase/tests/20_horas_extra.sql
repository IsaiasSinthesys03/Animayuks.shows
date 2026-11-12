-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 20: horas extra por show
-- Corre dentro de una transacción que se DESHACE al final (rollback).
-- Show A permite tiempo extra ($800/h); show B no.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, anticipo_porcentaje = 50,
       reprogramacion_min_horas = 48, reprogramaciones_max = 5, max_minutos_extra = 180,
       confirmacion_automatica = false, reservaciones_en_linea = true, zona_horaria = 'America/Mexico_City'
 where id = 1;
delete from public.dias_especiales;
update public.horario_servicio set activo = (dia_semana = 6), max_shows = null;
delete from public.horario_franjas where dia_semana is not null and show_id is null;
insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min)
select d, '09:00', '20:00', 'intervalo', 60 from generate_series(0, 6) d;

insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min, activa)
values ('a0000000-0000-4000-8000-000000002001', 'Zona horas extra', array['99949'], 0, 30, true);
insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base, activo, permite_horas_extra, precio_hora_extra) values
  ('a0000000-0000-4000-8000-00000000200a', 'prueba-con-extra', 'Show con extra', 60, 30, 20, 1000, true, true, 800),
  ('a0000000-0000-4000-8000-00000000200b', 'prueba-sin-extra', 'Show sin extra', 60, 30, 20, 1000, true, false, 0);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000020a1', 'extra1@prueba.invalid', '{"nombre":"Cliente Uno"}'),
  ('a0000000-0000-4000-8000-0000000020a2', 'extra2@prueba.invalid', '{"nombre":"Cliente Dos"}'),
  ('a0000000-0000-4000-8000-0000000020ad', 'extra.admin@prueba.invalid', '{"nombre":"Admin Extra"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000020ad';

do $$
declare
  tz  constant text := 'America/Mexico_City';
  sab date := (now() at time zone tz)::date + 9;
  rango tstzrange;
begin
  sab := sab + ((6 - extract(dow from sab)::int + 7) % 7);
  loop
    rango := tstzrange(sab::timestamp at time zone tz, (sab + 30)::timestamp at time zone tz);
    exit when not exists (select 1 from public.reservaciones r where r.estado in ('pendiente', 'confirmada') and r.bloque && rango)
          and not exists (select 1 from public.retenciones t where t.bloque && rango)
          and not exists (select 1 from public.bloqueos b where tstzrange(b.inicio, b.fin) && rango);
    sab := sab + 7;
  end loop;
  perform set_config('prueba.sab', sab::text, true);
end $$;
create function pg_temp.h(dias int, hora text) returns timestamptz language sql stable as $$
  select (current_setting('prueba.sab')::date + dias + hora::time) at time zone 'America/Mexico_City'
$$;
create function pg_temp.horas(dias int, minutos int) returns text language sql stable as $$
  select coalesce(string_agg(to_char(inicio at time zone 'America/Mexico_City', 'HH24:MI'), ' ' order by inicio), '')
    from public.horarios_disponibles('a0000000-0000-4000-8000-00000000200a', null, '{}', '99949', current_setting('prueba.sab')::date + dias, minutos)
$$;
create function pg_temp.cuadra(r public.reservaciones) returns boolean language sql immutable as $$
  select r.inicio - lower(r.bloque) = make_interval(mins => r.traslado_min + r.montaje_min)
     and upper(r.bloque) - r.fin   = make_interval(mins => r.desmontaje_min + r.traslado_min)
$$;
grant execute on function pg_temp.h(int, text), pg_temp.horas(int, int), pg_temp.cuadra(public.reservaciones) to anon, authenticated;

-- ── Cálculo ─────────────────────────────────────────────────────────────────
do $$
declare h record;
begin
  select * into h from public.calcular_horario('a0000000-0000-4000-8000-00000000200a', null, '{}', '99949', pg_temp.h(0, '10:00'), false, 30);
  if h.cargo_horas_extra <> 400 or h.duracion_min <> 90 then
    raise exception 'PRUEBA FALLIDA X02: 30 min cobró % y duró %', h.cargo_horas_extra, h.duracion_min;
  end if;
  select * into h from public.calcular_horario('a0000000-0000-4000-8000-00000000200a', null, '{}', '99949', pg_temp.h(0, '10:00'), false, 90);
  if h.cargo_horas_extra <> 1200 or h.duracion_min <> 150 then
    raise exception 'PRUEBA FALLIDA X02: 90 min cobró %', h.cargo_horas_extra;
  end if;
  raise notice 'X02 ok: la media hora cuesta la mitad; 90 minutos, hora y media';
end $$;

do $$ begin
  if pg_temp.horas(7, 0) <> '09:00 10:00 11:00 12:00 13:00 14:00 15:00 16:00 17:00 18:00 19:00'
     or pg_temp.horas(7, 120) <> '09:00 10:00 11:00 12:00 13:00 14:00 15:00 16:00 17:00' then
    raise exception 'PRUEBA FALLIDA X05: sin extra % / con 2 h %', pg_temp.horas(7, 0), pg_temp.horas(7, 120);
  end if;
  raise notice 'X05 ok: con tiempo extra solo se ofrecen las horas en que el show termina antes del cierre';
end $$;

-- Día especial de 10:00 a 11:00: cabe el show base, no el alargado
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000020ad', true);
do $$ begin
  perform public.guardar_dia_especial(current_setting('prueba.sab')::date + 14, null, 'Corto',
    '[{"abre":"10:00","cierra":"11:00","modo":"intervalo","intervalo_min":60}]');
end $$;
reset role;
do $$
declare a text; b text; d date := current_setting('prueba.sab')::date + 14;
begin
  select estado into a from public.disponibilidad_mes('a0000000-0000-4000-8000-00000000200a', null, '{}', '99949',
    extract(year from d)::int, extract(month from d)::int, 0) x where x.fecha = d;
  select estado into b from public.disponibilidad_mes('a0000000-0000-4000-8000-00000000200a', null, '{}', '99949',
    extract(year from d)::int, extract(month from d)::int, 60) x where x.fecha = d;
  if a = 'no_disponible' or b <> 'no_disponible' then
    raise exception 'PRUEBA FALLIDA X06: sin extra %, con 1 h %', a, b;
  end if;
  raise notice 'X06 ok: el calendario del mes refleja la duración con tiempo extra';
end $$;

-- ── Cliente ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000020a1', true);
do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion('a0000000-0000-4000-8000-00000000200a', null, pg_temp.h(0, '09:00'), '99949', 'Calle', 'Colonia',
         p_evento => '{"minutos_extra": 60}');
  if r.minutos_extra <> 60 or r.cargo_horas_extra <> 800 or r.precio_hora_extra <> 800 or r.total <> 1800 or r.anticipo_requerido <> 900
     or r.fin <> pg_temp.h(0, '11:00') or lower(r.bloque) <> pg_temp.h(0, '08:00') or upper(r.bloque) <> pg_temp.h(0, '11:50') or not pg_temp.cuadra(r) then
    raise exception 'PRUEBA FALLIDA X01: minutos %, cargo %, total %, anticipo %, fin %, bloque %', r.minutos_extra, r.cargo_horas_extra, r.total, r.anticipo_requerido, r.fin, r.bloque;
  end if;
  perform set_config('prueba.r1', r.id::text, true);
  raise notice 'X01 ok: +1 h alarga el show y su bloque, y suma $800 al total y la mitad al anticipo';

  begin
    perform public.crear_reservacion('a0000000-0000-4000-8000-00000000200a', null, pg_temp.h(0, '15:00'), '99949', 'Calle', 'Colonia', p_evento => '{"minutos_extra": 45}');
    raise exception 'PRUEBA FALLIDA X03: aceptó 45 minutos';
  exception when others then if sqlerrm not like 'HORAS_EXTRA_INVALIDAS%' then raise; end if;
  end;
  begin
    perform public.crear_reservacion('a0000000-0000-4000-8000-00000000200a', null, pg_temp.h(0, '15:00'), '99949', 'Calle', 'Colonia', p_evento => '{"minutos_extra": 210}');
    raise exception 'PRUEBA FALLIDA X03: aceptó más del máximo';
  exception when others then if sqlerrm not like 'HORAS_EXTRA_MAXIMO%' then raise; end if;
  end;
  begin
    perform public.crear_reservacion('a0000000-0000-4000-8000-00000000200a', null, pg_temp.h(0, '15:00'), '99949', 'Calle', 'Colonia', p_evento => '{"minutos_extra": -30}');
    raise exception 'PRUEBA FALLIDA X03: aceptó minutos negativos';
  exception when others then if sqlerrm not like 'HORAS_EXTRA_INVALIDAS%' then raise; end if;
  end;
  raise notice 'X03 ok: rechaza minutos que no son bloques de 30, negativos o sobre el máximo';

  begin
    perform public.crear_reservacion('a0000000-0000-4000-8000-00000000200b', null, pg_temp.h(0, '15:00'), '99949', 'Calle', 'Colonia', p_evento => '{"minutos_extra": 30}');
    raise exception 'PRUEBA FALLIDA X04: un show sin horas extra las aceptó';
  exception when others then if sqlerrm not like 'HORAS_EXTRA_NO_PERMITIDAS%' then raise; end if;
  end;
  raise notice 'X04 ok: un show que no permite tiempo extra lo rechaza';

  r := public.crear_reservacion('a0000000-0000-4000-8000-00000000200b', null, pg_temp.h(0, '15:00'), '99949', 'Calle', 'Colonia');
  if r.minutos_extra <> 0 or r.cargo_horas_extra <> 0 or r.total <> 1000 or r.fin - r.inicio <> interval '60 minutes' then
    raise exception 'PRUEBA FALLIDA X14: una reservación sin tiempo extra cambió (total %)', r.total;
  end if;
  raise notice 'X14 ok: las reservaciones sin tiempo extra quedan igual que antes';
end $$;
reset role;

-- Otra persona aparta con +1 h: el bloque alargado bloquea a los demás
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000020a2', true);
do $$
declare t public.retenciones;
begin
  t := public.apartar_horario('a0000000-0000-4000-8000-00000000200a', null, '{}', '99949', pg_temp.h(7, '10:00'), 60);
  if t.minutos_extra <> 60 or upper(t.bloque) <> pg_temp.h(7, '12:50') then
    raise exception 'PRUEBA FALLIDA X07: apartado con bloque %', t.bloque;
  end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000020a1', true);
do $$ begin
  perform public.crear_reservacion('a0000000-0000-4000-8000-00000000200a', null, pg_temp.h(7, '13:00'), '99949', 'Calle', 'Colonia');
  raise exception 'PRUEBA FALLIDA X07: reservó encima de un apartado con tiempo extra';
exception when others then
  if sqlerrm not like 'HORARIO_OCUPADO%' then raise; end if;
  raise notice 'X07 ok: apartar con tiempo extra aparta el bloque completo';
end $$;

do $$
declare r public.reservaciones;
begin
  r := public.reprogramar_reservacion(current_setting('prueba.r1')::uuid, pg_temp.h(21, '10:00'));
  if r.minutos_extra <> 60 or r.fin <> pg_temp.h(21, '12:00') or r.cargo_horas_extra <> 800 or r.total <> 1800 then
    raise exception 'PRUEBA FALLIDA X08: tras reprogramar fin %, cargo %, total %', r.fin, r.cargo_horas_extra, r.total;
  end if;
  raise notice 'X08 ok: reprogramar conserva el tiempo extra y su precio';

  begin
    perform public.cambiar_horas_extra(current_setting('prueba.r1')::uuid, 120);
    raise exception 'PRUEBA FALLIDA X12: el cliente cambió su tiempo extra';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- El precio del show cambia: las reservaciones hechas no
update public.shows set precio_hora_extra = 1000 where id = 'a0000000-0000-4000-8000-00000000200a';
do $$ begin
  if (select precio_hora_extra from public.reservaciones where id = current_setting('prueba.r1')::uuid) <> 800 then
    raise exception 'PRUEBA FALLIDA X13: cambiar el precio del show alteró una reservación';
  end if;
  raise notice 'X13 ok: cambiar el precio por hora no altera reservaciones ya hechas';
end $$;
update public.shows set precio_hora_extra = 800 where id = 'a0000000-0000-4000-8000-00000000200a';

-- ── Admin ───────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000020ad', true);
do $$
declare r public.reservaciones; t text;
begin
  r := public.cambiar_horas_extra(current_setting('prueba.r1')::uuid, 120);
  if r.minutos_extra <> 120 or r.fin <> pg_temp.h(21, '13:00') or r.cargo_horas_extra <> 1600 or r.total <> 2600
     or upper(r.bloque) <> pg_temp.h(21, '13:50') or not pg_temp.cuadra(r) or r.anticipo_requerido <> 1300 then
    raise exception 'PRUEBA FALLIDA X09: minutos %, fin %, cargo %, total %, anticipo %', r.minutos_extra, r.fin, r.cargo_horas_extra, r.total, r.anticipo_requerido;
  end if;
  if not exists (select 1 from public.notificaciones where reservacion_id = r.id and plantilla = 'reservacion_actualizada') then
    raise exception 'PRUEBA FALLIDA X09: no se encoló el correo al cliente';
  end if;
  select string_agg(coalesce(cambios -> 'minutos_extra' ->> 1, ''), ',') into t from public.historial_reservacion(r.id);
  if t not like '%120%' then raise exception 'PRUEBA FALLIDA X09: el historial no registra el cambio (%)', t; end if;
  raise notice 'X09 ok: el admin agrega tiempo extra; recalcula fin, bloque, total y anticipo, avisa al cliente y queda en el historial';

  -- Otra reservación justo después: alargar más ya chocaría
  perform public.crear_reservacion('a0000000-0000-4000-8000-00000000200b', null, pg_temp.h(21, '15:00'), '99949', 'Calle', 'Colonia',
    p_cliente_id => (select id from public.clientes where usuario_id = 'a0000000-0000-4000-8000-0000000020a2'));
  begin
    perform public.cambiar_horas_extra(current_setting('prueba.r1')::uuid, 180);
    raise exception 'PRUEBA FALLIDA X10: alargó encima de otra reservación';
  exception when others then if sqlerrm not like 'HORARIO_OCUPADO%' then raise; end if;
  end;

  -- Fuera de la franja (cierra 20:00): solo con motivo
  r := public.crear_reservacion('a0000000-0000-4000-8000-00000000200a', null, pg_temp.h(28, '18:00'), '99949', 'Calle', 'Colonia',
    p_cliente_id => (select id from public.clientes where usuario_id = 'a0000000-0000-4000-8000-0000000020a2'), p_evento => '{"minutos_extra": 60}');
  perform set_config('prueba.r3', r.id::text, true);
  begin
    perform public.cambiar_horas_extra(r.id, 120);
    raise exception 'PRUEBA FALLIDA X10: salió de la franja sin motivo';
  exception when others then if sqlerrm not like 'MOTIVO_REQUERIDO%fuera de horario%' then raise; end if;
  end;
  r := public.cambiar_horas_extra(r.id, 120, true, 'El cliente lo pidió');
  if r.fin <> pg_temp.h(28, '21:00') or r.motivo_excepcion not like '%tiempo extra%' then
    raise exception 'PRUEBA FALLIDA X10: con motivo fin %, excepción %', r.fin, r.motivo_excepcion;
  end if;
  raise notice 'X10 ok: nunca se encima con otra reservación; fuera de la franja solo con motivo';

  r := public.cambiar_horas_extra(current_setting('prueba.r3')::uuid, 0);
  if r.minutos_extra <> 0 or r.cargo_horas_extra <> 0 or r.total <> 1000 or r.anticipo_requerido <> 500 or r.fin <> pg_temp.h(28, '19:00') then
    raise exception 'PRUEBA FALLIDA X11: al quitar el tiempo extra total %, anticipo %', r.total, r.anticipo_requerido;
  end if;
  raise notice 'X11 ok: quitar el tiempo extra baja el total y, en pendiente, el anticipo';
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform public.cambiar_horas_extra(current_setting('prueba.r1')::uuid, 60);
    raise exception 'PRUEBA FALLIDA X12: el visitante cambió el tiempo extra';
  exception when insufficient_privilege then null;
  end;
  raise notice 'X12 ok: ni el cliente ni el visitante pueden cambiar el tiempo extra';
end $$;
reset role;

do $$ begin raise notice 'Batería 20 completa: 14 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
