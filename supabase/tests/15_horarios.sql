-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 15: horarios por franjas, máximo por día, días especiales,
-- bloqueos de unas horas y vista previa.
--
-- Corre dentro de una transacción que se DESHACE al final (rollback).
-- Si una prueba falla, se detiene con "PRUEBA FALLIDA ..." y también se deshace.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, anticipo_porcentaje = 50,
       confirmacion_automatica = false, reservaciones_en_linea = true, zona_horaria = 'America/Mexico_City'
 where id = 1;
delete from public.dias_especiales;

insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min, activa)
values ('a0000000-0000-4000-8000-000000001501', 'Zona horarios', array['99989'], 0, 0, true);
insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base, activo)
values ('a0000000-0000-4000-8000-000000001510', 'prueba-horarios', 'Show horarios', 60, 0, 0, 1000, true);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000015a1', 'horarios1@prueba.invalid', '{"nombre":"Cliente Uno"}'),
  ('a0000000-0000-4000-8000-0000000015a2', 'horarios2@prueba.invalid', '{"nombre":"Cliente Dos"}'),
  ('a0000000-0000-4000-8000-0000000015ad', 'horarios.admin@prueba.invalid', '{"nombre":"Admin Horarios"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000015ad';

-- Un sábado sin reservaciones, apartados ni bloqueos reales en las 4 semanas siguientes
do $$
declare
  tz  constant text := 'America/Mexico_City';
  sab date := (now() at time zone tz)::date + 9;
  rango tstzrange;
begin
  sab := sab + ((6 - extract(dow from sab)::int + 7) % 7);
  loop
    rango := tstzrange(sab::timestamp at time zone tz, (sab + 23)::timestamp at time zone tz);
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
create function pg_temp.horas(dias int) returns text language sql stable as $$
  select coalesce(string_agg(to_char(inicio at time zone 'America/Mexico_City', 'HH24:MI'), ' ' order by inicio), '')
    from public.horarios_disponibles('a0000000-0000-4000-8000-000000001510', null, '{}', '99989', current_setting('prueba.sab')::date + dias)
$$;
grant execute on function pg_temp.h(int, text), pg_temp.horas(int) to anon, authenticated;

-- ── Admin arma la semana: solo sábados, mañana cada 2 h y tarde a horas exactas ─
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000015ad', true);
do $$ begin
  perform public.guardar_horario_semana((
    select jsonb_agg(jsonb_build_object('dia_semana', d, 'activo', d = 6, 'max_shows', case when d = 6 then 2 end,
      'franjas', case when d = 6 then
        '[{"abre":"09:00","cierra":"13:00","modo":"intervalo","intervalo_min":120},
          {"abre":"16:00","cierra":"21:00","modo":"horas","horas":["20:30","16:00","18:00","16:00"]}]'::jsonb
        else '[{"abre":"10:00","cierra":"20:00","modo":"intervalo","intervalo_min":60}]'::jsonb end))
      from generate_series(0, 6) d));
  if (select horas from public.horario_franjas where dia_semana = 6 and modo = 'horas') <> array['16:00','18:00','20:30']::time[] then
    raise exception 'PRUEBA FALLIDA H01: no ordenó ni quitó repetidas las horas exactas';
  end if;
end $$;
reset role;

do $$ begin
  if jsonb_array_length(public.franjas_del_dia(current_setting('prueba.sab')::date)) <> 2
     or jsonb_array_length(public.franjas_del_dia(current_setting('prueba.sab')::date + 1)) <> 0 then
    raise exception 'PRUEBA FALLIDA H01: franjas del día incorrectas';
  end if;
  raise notice 'H01 ok: guardar la semana crea las franjas; un día apagado no tiene franjas aunque las conserve';
end $$;

do $$ begin
  if pg_temp.horas(0) <> '09:00 11:00 16:00 18:00 20:30' then
    raise exception 'PRUEBA FALLIDA H02-H04: el sábado ofrece %', pg_temp.horas(0);
  end if;
  raise notice 'H02 ok: entre dos franjas (13:00 a 16:00) no se ofrecen horas';
  raise notice 'H03 ok: cada 2 horas ofrece 9:00 y 11:00, y no 13:00 porque es la hora de cierre';
  raise notice 'H04 ok: horas exactas ofrece solo las de la lista, aunque el show termine después del cierre (20:30)';
end $$;

do $$ begin
  begin
    insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min) values (6, '12:00', '17:00', 'intervalo', 60);
    raise exception 'PRUEBA FALLIDA H05: aceptó una franja encimada';
  exception when others then
    if sqlerrm not like 'FRANJA_ENCIMADA%' then raise; end if;
  end;
  begin
    insert into public.horario_franjas (dia_semana, abre, cierra, modo, horas) values (6, '13:00', '15:00', 'horas', array['15:30'::time]);
    raise exception 'PRUEBA FALLIDA H05: aceptó una hora fuera de la franja';
  exception when others then
    if sqlerrm not like 'HORA_FUERA_DE_FRANJA%' then raise; end if;
  end;
  begin
    insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min) values (6, '15:00', '14:00', 'intervalo', 60);
    raise exception 'PRUEBA FALLIDA H05: aceptó cierre antes de apertura';
  exception when check_violation then null;
  end;
  insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min) values (6, '13:00', '16:00', 'intervalo', 60);
  delete from public.horario_franjas where dia_semana = 6 and abre = '13:00';
  raise notice 'H05 ok: rechaza franjas encimadas, horas fuera de la franja y cierres al revés; acepta franjas pegadas';
end $$;

-- ── Cliente 1 ───────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000015a1', true);

do $$ begin
  perform public.crear_reservacion('a0000000-0000-4000-8000-000000001510', null, pg_temp.h(0, '10:00'), '99989', 'Calle', 'Colonia');
  raise exception 'PRUEBA FALLIDA H06: el cliente reservó a una hora no ofrecida';
exception when others then
  if sqlerrm not like 'FUERA_DE_HORARIO%' then raise; end if;
  raise notice 'H06 ok: el cliente no puede reservar a una hora que no se ofrece (10:00)';
end $$;

do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000001510', null, pg_temp.h(0, '09:00'), '99989', 'Calle', 'Colonia');
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000001510', null, pg_temp.h(0, '16:00'), '99989', 'Calle', 'Colonia');
  perform set_config('prueba.r16', r.id::text, true);
  begin
    perform public.crear_reservacion('a0000000-0000-4000-8000-000000001510', null, pg_temp.h(0, '18:00'), '99989', 'Calle', 'Colonia');
    raise exception 'PRUEBA FALLIDA H07: aceptó un tercer show con máximo 2';
  exception when others then
    if sqlerrm not like 'DIA_LLENO%' then raise; end if;
  end;
  if (select estado from public.disponibilidad_mes('a0000000-0000-4000-8000-000000001510', null, '{}', '99989',
        extract(year from current_setting('prueba.sab')::date)::int, extract(month from current_setting('prueba.sab')::date)::int) d
       where d.fecha = current_setting('prueba.sab')::date) <> 'lleno' then
    raise exception 'PRUEBA FALLIDA H07: el calendario no marca el día como lleno';
  end if;
  if pg_temp.horas(0) <> '' then
    raise exception 'PRUEBA FALLIDA H07: con el día lleno todavía ofrece %', pg_temp.horas(0);
  end if;
  raise notice 'H07 ok: con máximo 2, la tercera reservación da DIA_LLENO y el calendario marca "lleno"';

  -- La reservación que se mueve no cuenta contra el límite de su propio día
  perform public.reprogramar_reservacion(current_setting('prueba.r16')::uuid, pg_temp.h(0, '18:00'));
  raise notice 'H08 ok (a): reprogramar dentro de un día lleno no se cuenta a sí misma';
end $$;
reset role;

-- ── Días especiales ─────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000015ad', true);
do $$ begin
  perform public.guardar_dia_especial(current_setting('prueba.sab')::date + 7, 1, 'Evento especial',
    '[{"abre":"10:00","cierra":"14:00","modo":"intervalo","intervalo_min":60}]');
  perform public.guardar_dia_especial(current_setting('prueba.sab')::date + 14, null, 'Sin servicio', '[]');
  perform public.guardar_dia_especial(current_setting('prueba.sab')::date + 1, null, 'Domingo abierto',
    '[{"abre":"12:00","cierra":"14:00","modo":"horas","horas":["12:00"]}]');
end $$;
reset role;

do $$ begin
  if pg_temp.horas(7) <> '10:00 11:00 12:00 13:00' then
    raise exception 'PRUEBA FALLIDA H09: el día especial ofrece %', pg_temp.horas(7);
  end if;
  if pg_temp.horas(14) <> '' then
    raise exception 'PRUEBA FALLIDA H09: un día especial sin franjas ofrece %', pg_temp.horas(14);
  end if;
  if pg_temp.horas(1) <> '12:00' then
    raise exception 'PRUEBA FALLIDA H09: el domingo especial ofrece %', pg_temp.horas(1);
  end if;
  raise notice 'H09 ok: un día especial reemplaza la semana; sin franjas no hay servicio; abre un día apagado';
end $$;

-- Máximo 1 en el día especial: el apartado vigente de otra persona ya lo llena
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000015a2', true);
do $$ begin
  perform public.apartar_horario('a0000000-0000-4000-8000-000000001510', null, '{}', '99989', pg_temp.h(7, '10:00'));
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000015a1', true);
do $$ begin
  perform public.crear_reservacion('a0000000-0000-4000-8000-000000001510', null, pg_temp.h(7, '12:00'), '99989', 'Calle', 'Colonia');
  raise exception 'PRUEBA FALLIDA H08: no contó el apartado de otra persona';
exception when others then
  if sqlerrm not like 'DIA_LLENO%' then raise; end if;
  raise notice 'H08 ok (b): el máximo cuenta los horarios apartados por otras personas';
end $$;
reset role;

-- El admin puede salirse de horario y del máximo, dejando el motivo
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000015ad', true);
do $$
declare r public.reservaciones;
begin
  begin
    perform public.crear_reservacion('a0000000-0000-4000-8000-000000001510', null, pg_temp.h(0, '12:00'), '99989', 'Calle', 'Colonia',
      p_cliente_id => (select id from public.clientes where usuario_id = 'a0000000-0000-4000-8000-0000000015a1'));
    raise exception 'PRUEBA FALLIDA H06: el admin se saltó reglas sin motivo';
  exception when others then
    if sqlerrm not like 'FUERA_DE_HORARIO%' then raise; end if;
  end;
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000001510', null, pg_temp.h(0, '12:00'), '99989', 'Calle', 'Colonia',
    p_cliente_id => (select id from public.clientes where usuario_id = 'a0000000-0000-4000-8000-0000000015a1'),
    p_forzar => true, p_motivo => 'Cliente especial');
  if r.motivo_excepcion not like '%fuera de horario%' or r.motivo_excepcion not like '%día lleno%' then
    raise exception 'PRUEBA FALLIDA H06: excepción guardada: %', r.motivo_excepcion;
  end if;
  raise notice 'H06 ok: el admin puede reservar fuera de horario y en un día lleno, dejando el motivo';
end $$;
reset role;

-- ── Bloqueo de unas horas ───────────────────────────────────────────────────
do $$ begin
  insert into public.bloqueos (inicio, fin, motivo) values (pg_temp.h(21, '15:00'), pg_temp.h(21, '19:00'), 'Prueba parcial');
  if pg_temp.horas(21) <> '09:00 11:00 20:30' then
    raise exception 'PRUEBA FALLIDA H10: con bloqueo de 15:00 a 19:00 ofrece %', pg_temp.horas(21);
  end if;
  raise notice 'H10 ok: un bloqueo de unas horas cierra solo esas horas';
end $$;

-- ── Vista previa y permisos ─────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000015ad', true);
do $$
declare t text;
begin
  select string_agg(to_char(inicio, 'HH24:MI'), ' ' order by inicio) into t
    from public.vista_previa_horario('[{"abre":"09:00","cierra":"13:00","modo":"intervalo","intervalo_min":120},
                                       {"abre":"16:00","cierra":"21:00","modo":"horas","horas":["16:00","18:00","20:30"]}]', 60);
  if t <> '09:00 11:00 16:00 18:00 20:30' then
    raise exception 'PRUEBA FALLIDA H11: la vista previa dio %', t;
  end if;
  if exists (select 1 from public.reservaciones_fuera_de_franjas(current_setting('prueba.sab')::date,
               '[{"abre":"09:00","cierra":"13:00","modo":"intervalo","intervalo_min":120},{"abre":"16:00","cierra":"21:00","modo":"horas","horas":["16:00","18:00","20:30"]}]'::jsonb) x where to_char(x.inicio at time zone 'America/Mexico_City', 'HH24:MI') <> '12:00')
     or not exists (select 1 from public.reservaciones_fuera_de_franjas(current_setting('prueba.sab')::date,
               '[{"abre":"09:00","cierra":"13:00","modo":"intervalo","intervalo_min":120},{"abre":"16:00","cierra":"21:00","modo":"horas","horas":["16:00","18:00","20:30"]}]'::jsonb)) then
    raise exception 'PRUEBA FALLIDA H11: el aviso de reservaciones fuera de horario no detectó la de 12:00';
  end if;
  raise notice 'H11 ok: la vista previa coincide con lo que ve el cliente y detecta reservaciones fuera de horario';
end $$;

do $$
declare antes text;
begin
  select string_agg(abre::text || '-' || cierra::text, ',' order by abre) into antes from public.horario_franjas where dia_semana = 6;
  begin
    perform public.guardar_horario_semana('[{"dia_semana":6,"activo":true,"franjas":[
      {"abre":"09:00","cierra":"12:00","modo":"intervalo","intervalo_min":60},
      {"abre":"11:00","cierra":"14:00","modo":"intervalo","intervalo_min":60}]}]');
    raise exception 'PRUEBA FALLIDA H13: guardó franjas encimadas';
  exception when others then
    if sqlerrm not like 'FRANJA_ENCIMADA%' then raise; end if;
  end;
  if (select string_agg(abre::text || '-' || cierra::text, ',' order by abre) from public.horario_franjas where dia_semana = 6) <> antes then
    raise exception 'PRUEBA FALLIDA H13: el error dejó la semana a medias';
  end if;
  raise notice 'H13 ok: guardar la semana es todo o nada';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000015a1', true);
do $$
declare n int;
begin
  if exists (select 1 from public.horario_franjas) or exists (select 1 from public.dias_especiales) then
    raise exception 'PRUEBA FALLIDA H12: el cliente lee horarios crudos';
  end if;
  update public.horario_franjas set abre = '00:00';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'PRUEBA FALLIDA H12: el cliente cambió franjas'; end if;
  begin
    perform public.guardar_horario_semana('[]');
    raise exception 'PRUEBA FALLIDA H12: el cliente guardó el horario';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.vista_previa_horario('[]', 60);
    raise exception 'PRUEBA FALLIDA H12: el cliente usó la vista previa';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform 1 from public.horario_franjas;
    raise exception 'PRUEBA FALLIDA H12: el visitante leyó franjas';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.franjas_del_dia(current_date);
    raise exception 'PRUEBA FALLIDA H12: el visitante llamó una función interna';
  exception when insufficient_privilege then null;
  end;
  raise notice 'H12 ok: visitante y cliente no leen ni cambian horarios, ni usan funciones del admin';
end $$;
reset role;

-- ── H14: la franja marca el inicio; el show puede terminar después de medianoche ─
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000015ad', true);
do $$ begin
  perform public.guardar_dia_especial(current_setting('prueba.sab')::date + 35, null, 'Noche',
    '[{"abre":"17:00","cierra":"23:59","modo":"intervalo","intervalo_min":30}]');
end $$;
reset role;
do $$ begin
  if pg_temp.horas(35) not like '17:00 17:30 %' or pg_temp.horas(35) not like '% 23:00 23:30' then
    raise exception 'PRUEBA FALLIDA H14: la noche ofrece %', pg_temp.horas(35);
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000015a1', true);
do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000001510', null, pg_temp.h(35, '23:30'), '99989', 'Calle', 'Colonia');
  if r.fin <> pg_temp.h(36, '00:30') then
    raise exception 'PRUEBA FALLIDA H14: el show de las 23:30 termina %', r.fin;
  end if;
  raise notice 'H14 ok: franja de 17:00 a 23:59 cada 30 min ofrece hasta las 23:30, y ese show puede terminar a las 00:30';
end $$;
reset role;

do $$ begin raise notice 'Batería 15 completa: 14 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
