-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 16: horario propio por show
--
-- Corre dentro de una transacción que se DESHACE al final (rollback).
-- Si una prueba falla, se detiene con "PRUEBA FALLIDA ..." y también se deshace.
-- Show A usa el horario general; show B tiene horario propio.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, anticipo_porcentaje = 50,
       reprogramacion_min_horas = 48, reprogramaciones_max = 3,
       confirmacion_automatica = false, reservaciones_en_linea = true, zona_horaria = 'America/Mexico_City'
 where id = 1;
delete from public.dias_especiales;

-- Horario general: solo sábados de 9:00 a 13:00, cada hora
update public.horario_servicio set activo = (dia_semana = 6), max_shows = null;
delete from public.horario_franjas where dia_semana is not null and show_id is null;
insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min)
select d, '09:00', '13:00', 'intervalo', 60 from generate_series(0, 6) d;

insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min, activa)
values ('a0000000-0000-4000-8000-000000001601', 'Zona por show', array['99979'], 0, 0, true);
insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base, activo) values
  ('a0000000-0000-4000-8000-00000000160a', 'prueba-show-general', 'Show A general', 60, 0, 0, 1000, true),
  ('a0000000-0000-4000-8000-00000000160b', 'prueba-show-propio',  'Show B propio',  60, 0, 0, 1000, true),
  ('a0000000-0000-4000-8000-00000000160c', 'prueba-show-borrar',  'Show C borrar',  60, 0, 0, 1000, true);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000016a1', 'porshow1@prueba.invalid', '{"nombre":"Cliente Uno"}'),
  ('a0000000-0000-4000-8000-0000000016ad', 'porshow.admin@prueba.invalid', '{"nombre":"Admin Por Show"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000016ad';

-- Un sábado sin reservaciones, apartados ni bloqueos reales en las 3 semanas siguientes
do $$
declare
  tz  constant text := 'America/Mexico_City';
  sab date := (now() at time zone tz)::date + 9;
  rango tstzrange;
begin
  sab := sab + ((6 - extract(dow from sab)::int + 7) % 7);
  loop
    rango := tstzrange(sab::timestamp at time zone tz, (sab + 16)::timestamp at time zone tz);
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
create function pg_temp.horas(p_show text, dias int) returns text language sql stable as $$
  select coalesce(string_agg(to_char(inicio at time zone 'America/Mexico_City', 'HH24:MI'), ' ' order by inicio), '')
    from public.horarios_disponibles(('a0000000-0000-4000-8000-00000000160' || p_show)::uuid, null, '{}', '99979', current_setting('prueba.sab')::date + dias)
$$;
grant execute on function pg_temp.h(int, text), pg_temp.horas(text, int) to anon, authenticated;

-- Horario propio de B: sábado a las 11, 15 y 16; domingo cada hora de 10 a 12; lunes nada
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000016ad', true);
do $$ begin
  perform public.guardar_horario_show('a0000000-0000-4000-8000-00000000160b', true, '[
    {"dia_semana": 6, "franjas": [{"abre":"11:00","cierra":"18:00","modo":"horas","horas":["11:00","15:00","16:00"]}]},
    {"dia_semana": 0, "franjas": [{"abre":"10:00","cierra":"12:00","modo":"intervalo","intervalo_min":60}]}]');
  perform public.guardar_horario_show('a0000000-0000-4000-8000-00000000160c', true, '[
    {"dia_semana": 3, "franjas": [{"abre":"10:00","cierra":"12:00","modo":"intervalo","intervalo_min":60}]}]');
end $$;
reset role;

do $$ begin
  if pg_temp.horas('a', 0) <> '09:00 10:00 11:00 12:00' then
    raise exception 'PRUEBA FALLIDA S01: el show general ofrece %', pg_temp.horas('a', 0);
  end if;
  raise notice 'S01 ok: un show sin horario propio usa el horario general';

  if pg_temp.horas('b', 0) <> '11:00 15:00 16:00' then
    raise exception 'PRUEBA FALLIDA S02: el show con horario propio ofrece %', pg_temp.horas('b', 0);
  end if;
  raise notice 'S02 ok: el mismo sábado, cada show ofrece sus propias horas';

  if pg_temp.horas('b', 1) <> '10:00 11:00' or pg_temp.horas('a', 1) <> '' then
    raise exception 'PRUEBA FALLIDA S03: domingo B %, A %', pg_temp.horas('b', 1), pg_temp.horas('a', 1);
  end if;
  raise notice 'S03 ok: el horario propio abre un día apagado en el general solo para ese show';

  if pg_temp.horas('b', 2) <> '' then
    raise exception 'PRUEBA FALLIDA S04: el lunes B ofrece %', pg_temp.horas('b', 2);
  end if;
  raise notice 'S04 ok: un día sin franjas en el horario del show no se ofrece';
end $$;

-- ── Cliente ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000016a1', true);
do $$
declare r public.reservaciones;
begin
  begin
    perform public.crear_reservacion('a0000000-0000-4000-8000-00000000160b', null, pg_temp.h(0, '10:00'), '99979', 'Calle', 'Colonia');
    raise exception 'PRUEBA FALLIDA S05: reservó B a una hora del horario general';
  exception when others then
    if sqlerrm not like 'FUERA_DE_HORARIO%' then raise; end if;
  end;
  begin
    perform public.apartar_horario('a0000000-0000-4000-8000-00000000160b', null, '{}', '99979', pg_temp.h(0, '10:00'));
    raise exception 'PRUEBA FALLIDA S05: apartó B fuera de su horario';
  exception when others then
    if sqlerrm not like 'FUERA_DE_HORARIO%' then raise; end if;
  end;
  r := public.crear_reservacion('a0000000-0000-4000-8000-00000000160b', null, pg_temp.h(0, '15:00'), '99979', 'Calle', 'Colonia');
  perform set_config('prueba.rb', r.id::text, true);
  begin
    perform public.reprogramar_reservacion(r.id, pg_temp.h(0, '12:00'));
    raise exception 'PRUEBA FALLIDA S05: reprogramó B a una hora del horario general';
  exception when others then
    if sqlerrm not like 'FUERA_DE_HORARIO%' then raise; end if;
  end;
  raise notice 'S05 ok: reservar, apartar y reprogramar respetan el horario del show';

  -- Agenda única: A a las 11:00 le quita a B su hora de las 11:00
  r := public.crear_reservacion('a0000000-0000-4000-8000-00000000160a', null, pg_temp.h(0, '11:00'), '99979', 'Calle', 'Colonia');
end $$;
reset role;

do $$ begin
  if pg_temp.horas('b', 0) <> '16:00' then
    raise exception 'PRUEBA FALLIDA S06: tras reservar A a las 11 y B a las 15, B ofrece %', pg_temp.horas('b', 0);
  end if;
  raise notice 'S06 ok: la agenda es una sola: un show de A ocupa la hora de B';
end $$;

-- Máximo 2 el sábado: cuenta los dos shows
update public.horario_servicio set max_shows = 2 where dia_semana = 6;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000016a1', true);
do $$ begin
  perform public.crear_reservacion('a0000000-0000-4000-8000-00000000160b', null, pg_temp.h(0, '16:00'), '99979', 'Calle', 'Colonia');
  raise exception 'PRUEBA FALLIDA S07: el máximo no contó los dos shows';
exception when others then
  if sqlerrm not like 'DIA_LLENO%' then raise; end if;
  raise notice 'S07 ok: el máximo por día cuenta los shows de los dos tipos de horario';
end $$;

-- Admin: puede salirse del horario del show con motivo
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000016ad', true);
do $$ begin
  perform public.reprogramar_reservacion(current_setting('prueba.rb')::uuid, pg_temp.h(1, '12:00'), 'Pedido especial');
  perform public.reprogramar_reservacion(current_setting('prueba.rb')::uuid, pg_temp.h(0, '15:00'), '');
end $$;
reset role;
update public.horario_servicio set max_shows = null where dia_semana = 6;

-- ── Día especial y bloqueo ──────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000016ad', true);
do $$ begin
  perform public.guardar_dia_especial(current_setting('prueba.sab')::date + 7, null, 'Especial',
    '[{"abre":"13:00","cierra":"15:00","modo":"intervalo","intervalo_min":60}]');
end $$;
reset role;
insert into public.bloqueos (inicio, fin, motivo) values (pg_temp.h(8, '10:00'), pg_temp.h(8, '11:00'), 'Prueba por show');
do $$ begin
  if pg_temp.horas('b', 7) <> '13:00 14:00' or pg_temp.horas('a', 7) <> '13:00 14:00' then
    raise exception 'PRUEBA FALLIDA S08: día especial B %, A %', pg_temp.horas('b', 7), pg_temp.horas('a', 7);
  end if;
  if pg_temp.horas('b', 8) <> '11:00' then
    raise exception 'PRUEBA FALLIDA S08: con bloqueo de 10 a 11, B ofrece %', pg_temp.horas('b', 8);
  end if;
  raise notice 'S08 ok: el día especial manda sobre el horario del show, y los bloqueos también aplican';
end $$;

-- ── Apagar y encender el horario propio; guardar el general ────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000016ad', true);
do $$
declare d jsonb := '[{"dia_semana": 6, "franjas": [{"abre":"11:00","cierra":"18:00","modo":"horas","horas":["11:00","15:00","16:00"]}]},
                     {"dia_semana": 0, "franjas": [{"abre":"10:00","cierra":"12:00","modo":"intervalo","intervalo_min":60}]}]';
begin
  perform public.guardar_horario_show('a0000000-0000-4000-8000-00000000160b', false, d);
  perform set_config('prueba.b_apagado_sab', pg_temp.horas('b', 14), true);
  perform set_config('prueba.b_apagado_dom', pg_temp.horas('b', 15), true);
  perform public.guardar_horario_show('a0000000-0000-4000-8000-00000000160b', true, d);

  -- Guardar el horario general no toca las franjas de los shows
  perform public.guardar_horario_semana('[{"dia_semana": 6, "activo": true, "franjas": [{"abre":"09:00","cierra":"13:00","modo":"intervalo","intervalo_min":60}]},
                                          {"dia_semana": 0, "activo": false, "franjas": []}]');
end $$;
reset role;

do $$ begin
  if current_setting('prueba.b_apagado_sab') <> '09:00 10:00 11:00 12:00' or current_setting('prueba.b_apagado_dom') <> '' then
    raise exception 'PRUEBA FALLIDA S09: con el horario propio apagado, B ofrece sáb % / dom %',
      current_setting('prueba.b_apagado_sab'), current_setting('prueba.b_apagado_dom');
  end if;
  if pg_temp.horas('b', 14) <> '11:00 15:00 16:00' then
    raise exception 'PRUEBA FALLIDA S09: al volver a encenderlo, B ofrece %', pg_temp.horas('b', 14);
  end if;
  raise notice 'S09 ok: apagar el horario propio vuelve al general y al encenderlo se recupera';

  if (select count(*) from public.horario_franjas where show_id = 'a0000000-0000-4000-8000-00000000160b') <> 2
     or pg_temp.horas('b', 15) <> '10:00 11:00' then
    raise exception 'PRUEBA FALLIDA S10: guardar el horario general borró franjas del show';
  end if;
  raise notice 'S10 ok: guardar el horario general no toca los horarios de los shows';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000016ad', true);
do $$
declare t text;
begin
  begin
    perform public.guardar_horario_show('a0000000-0000-4000-8000-00000000160b', true, '[]');
    raise exception 'PRUEBA FALLIDA S11: activó un horario propio vacío';
  exception when others then
    if sqlerrm not like 'HORARIO_SHOW_VACIO%' then raise; end if;
  end;
  begin
    perform public.guardar_horario_show('a0000000-0000-4000-8000-00000000160b', true, '[{"dia_semana": 6, "franjas": [
      {"abre":"09:00","cierra":"12:00","modo":"intervalo","intervalo_min":60},
      {"abre":"11:00","cierra":"14:00","modo":"intervalo","intervalo_min":60}]}]');
    raise exception 'PRUEBA FALLIDA S11: guardó franjas encimadas';
  exception when others then
    if sqlerrm not like 'FRANJA_ENCIMADA%' then raise; end if;
  end;
  if (select count(*) from public.horario_franjas where show_id = 'a0000000-0000-4000-8000-00000000160b') <> 2 then
    raise exception 'PRUEBA FALLIDA S11: un error dejó el horario del show a medias';
  end if;
  raise notice 'S11 ok: no se activa un horario vacío, ni con franjas encimadas, y es todo o nada';

  select string_agg(to_char(x.inicio at time zone 'America/Mexico_City', 'HH24:MI'), ' ') into t
    from public.reservaciones_fuera_horario_show('a0000000-0000-4000-8000-00000000160b',
      '[{"dia_semana": 6, "franjas": [{"abre":"16:00","cierra":"18:00","modo":"horas","horas":["16:00"]}]}]') x;
  if t is distinct from '15:00' then
    raise exception 'PRUEBA FALLIDA S12: detectó fuera de horario: %', t;
  end if;
  raise notice 'S12 ok: avisa qué reservaciones futuras del show quedarían fuera del horario nuevo';
end $$;
reset role;

-- ── Permisos ────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000016a1', true);
do $$ begin
  if exists (select 1 from public.horario_franjas) then
    raise exception 'PRUEBA FALLIDA S13: el cliente lee franjas';
  end if;
  begin
    perform public.guardar_horario_show('a0000000-0000-4000-8000-00000000160b', false, '[]');
    raise exception 'PRUEBA FALLIDA S13: el cliente cambió el horario de un show';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.reservaciones_fuera_horario_show('a0000000-0000-4000-8000-00000000160b', '[]');
    raise exception 'PRUEBA FALLIDA S13: el cliente usó una función del admin';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  if (select string_agg(dia_semana || ' ' || to_char(abre, 'HH24:MI') || '-' || to_char(cierra, 'HH24:MI'), ', ' order by dia_semana, abre)
        from public.resumen_horario_show('a0000000-0000-4000-8000-00000000160b')) <> '0 10:00-12:00, 6 11:00-18:00' then
    raise exception 'PRUEBA FALLIDA S13: resumen público del show B incorrecto';
  end if;
  if exists (select 1 from public.resumen_horario_show('a0000000-0000-4000-8000-00000000160a')) then
    raise exception 'PRUEBA FALLIDA S13: el resumen público del show general no está vacío';
  end if;
  raise notice 'S13 ok: solo el admin ve y cambia horarios; el público solo ve días y rangos';
end $$;
reset role;

do $$ begin
  delete from public.shows where id = 'a0000000-0000-4000-8000-00000000160c';
  if exists (select 1 from public.horario_franjas where show_id = 'a0000000-0000-4000-8000-00000000160c') then
    raise exception 'PRUEBA FALLIDA S14: quedaron franjas de un show borrado';
  end if;
  raise notice 'S14 ok: borrar un show borra su horario';
end $$;

do $$ begin raise notice 'Batería 16 completa: 14 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
