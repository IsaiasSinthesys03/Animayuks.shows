-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 17: desglose del bloque (traslado, montaje, desmontaje), franjas
-- de una fecha para la agenda y resumen diario con salida y hora libre.
--
-- Corre dentro de una transacción que se DESHACE al final (rollback).
-- ═════════════════════════════════════════════════════════════════════════════

begin;

update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, anticipo_porcentaje = 50,
       reprogramacion_min_horas = 48, reprogramaciones_max = 3,
       confirmacion_automatica = false, reservaciones_en_linea = true, zona_horaria = 'America/Mexico_City'
 where id = 1;
delete from public.dias_especiales;
update public.horario_servicio set activo = (dia_semana = 6), max_shows = null;
delete from public.horario_franjas where dia_semana is not null and show_id is null;
insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min)
select d, '09:00', '22:00', 'intervalo', 60 from generate_series(0, 6) d;

insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min, activa) values
  ('a0000000-0000-4000-8000-000000001701', 'Zona lejos', array['99969'], 0, 30, true),
  ('a0000000-0000-4000-8000-000000001702', 'Zona cerca', array['99968'], 0, 0, true);
insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base, activo) values
  ('a0000000-0000-4000-8000-00000000170a', 'prueba-desglose', 'Show desglose', 60, 30, 20, 1000, true),
  ('a0000000-0000-4000-8000-00000000170b', 'prueba-sin-montaje', 'Show sin montaje', 60, 0, 0, 1000, true);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000017a1', 'desglose1@prueba.invalid', '{"nombre":"Cliente Uno"}'),
  ('a0000000-0000-4000-8000-0000000017a2', 'desglose2@prueba.invalid', '{"nombre":"Cliente Dos"}'),
  ('a0000000-0000-4000-8000-0000000017ad', 'desglose.admin@prueba.invalid', '{"nombre":"Admin Desglose"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000017ad';

do $$
declare
  tz  constant text := 'America/Mexico_City';
  sab date := (now() at time zone tz)::date + 9;
  rango tstzrange;
begin
  sab := sab + ((6 - extract(dow from sab)::int + 7) % 7);
  loop
    rango := tstzrange(sab::timestamp at time zone tz, (sab + 9)::timestamp at time zone tz);
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
grant execute on function pg_temp.h(int, text) to anon, authenticated;

-- Suma exacta: antes del show = traslado + montaje; después = desmontaje + traslado
create function pg_temp.cuadra(r public.reservaciones) returns boolean language sql immutable as $$
  select r.inicio - lower(r.bloque) = make_interval(mins => r.traslado_min + r.montaje_min)
     and upper(r.bloque) - r.fin   = make_interval(mins => r.desmontaje_min + r.traslado_min)
$$;
grant execute on function pg_temp.cuadra(public.reservaciones) to authenticated;

-- ── Cliente ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000017a1', true);
do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion('a0000000-0000-4000-8000-00000000170a', null, pg_temp.h(0, '11:00'), '99969', 'Calle', 'Colonia');
  if r.traslado_min <> 30 or r.montaje_min <> 30 or r.desmontaje_min <> 20 or not pg_temp.cuadra(r)
     or lower(r.bloque) <> pg_temp.h(0, '10:00') or upper(r.bloque) <> pg_temp.h(0, '12:50') then
    raise exception 'PRUEBA FALLIDA B01: traslado %, montaje %, desmontaje %, bloque %', r.traslado_min, r.montaje_min, r.desmontaje_min, r.bloque;
  end if;
  perform set_config('prueba.r1', r.id::text, true);
  raise notice 'B01 ok: reservar guarda traslado 30, montaje 30 y desmontaje 20; suman el bloque de 10:00 a 12:50';

  r := public.crear_reservacion('a0000000-0000-4000-8000-00000000170b', null, pg_temp.h(0, '17:00'), '99968', 'Calle', 'Colonia');
  if r.traslado_min <> 0 or r.montaje_min <> 0 or r.desmontaje_min <> 0 or lower(r.bloque) <> r.inicio or upper(r.bloque) <> r.fin then
    raise exception 'PRUEBA FALLIDA B05: desglose %/%/% y bloque %', r.traslado_min, r.montaje_min, r.desmontaje_min, r.bloque;
  end if;
  raise notice 'B05 ok: sin traslado ni montaje, el desglose queda en ceros y el bloque es solo el show';
end $$;
reset role;

update public.shows set montaje_min = 45 where id = 'a0000000-0000-4000-8000-00000000170a';
do $$ begin
  if (select montaje_min from public.reservaciones where id = current_setting('prueba.r1')::uuid) <> 30 then
    raise exception 'PRUEBA FALLIDA B02: cambiar el montaje del show alteró una reservación ya hecha';
  end if;
  raise notice 'B02 ok: cambiar el montaje del show no altera el desglose de reservaciones ya hechas';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000017a1', true);
do $$
declare r public.reservaciones;
begin
  r := public.reprogramar_reservacion(current_setting('prueba.r1')::uuid, pg_temp.h(0, '14:00'));
  if r.montaje_min <> 45 or r.traslado_min <> 30 or r.desmontaje_min <> 20 or not pg_temp.cuadra(r) then
    raise exception 'PRUEBA FALLIDA B03: tras reprogramar: %/%/%', r.traslado_min, r.montaje_min, r.desmontaje_min;
  end if;
  raise notice 'B03 ok: reprogramar recalcula el desglose con el montaje vigente';
end $$;
reset role;

-- ── Admin ───────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000017ad', true);
do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion('a0000000-0000-4000-8000-00000000170a', null, pg_temp.h(0, '20:10'), '99969', 'Calle', 'Colonia',
    p_cliente_id => (select id from public.clientes where usuario_id = 'a0000000-0000-4000-8000-0000000017a2'),
    p_forzar => true, p_motivo => 'Hora especial');
  if r.traslado_min <> 30 or r.montaje_min <> 45 or not pg_temp.cuadra(r) then
    raise exception 'PRUEBA FALLIDA B04: excepción del admin sin desglose (%/%/%)', r.traslado_min, r.montaje_min, r.desmontaje_min;
  end if;
  raise notice 'B04 ok: una reservación del admin con excepción también guarda su desglose';

  -- Franjas de una fecha (fondo de la agenda)
  if (select string_agg(to_char(abre, 'HH24:MI') || '-' || to_char(cierra, 'HH24:MI') || ':' || especial, ',') from public.franjas_de_fecha(current_setting('prueba.sab')::date)) <> '09:00-22:00:false'
     or exists (select 1 from public.franjas_de_fecha(current_setting('prueba.sab')::date + 1)) then
    raise exception 'PRUEBA FALLIDA B07: franjas de un día normal o apagado incorrectas';
  end if;
  perform public.guardar_dia_especial(current_setting('prueba.sab')::date + 1, null, 'Especial',
    '[{"abre":"10:00","cierra":"14:00","modo":"intervalo","intervalo_min":60}]');
  if (select string_agg(to_char(abre, 'HH24:MI') || ':' || especial, ',') from public.franjas_de_fecha(current_setting('prueba.sab')::date + 1)) <> '10:00:true' then
    raise exception 'PRUEBA FALLIDA B07: franjas de un día especial incorrectas';
  end if;

  -- Para el resumen: una función mañana a las 20:00 en la zona lejana
  perform public.crear_reservacion('a0000000-0000-4000-8000-00000000170a', null,
    (((now() at time zone 'America/Mexico_City')::date + 1) + time '20:00') at time zone 'America/Mexico_City', '99969', 'Calle', 'Colonia',
    p_cliente_id => (select id from public.clientes where usuario_id = 'a0000000-0000-4000-8000-0000000017a2'),
    p_forzar => true, p_motivo => 'Prueba de resumen');
end $$;
reset role;

do $$ begin
  if exists (select 1 from public.reservaciones r where not pg_temp.cuadra(r)) then
    raise exception 'PRUEBA FALLIDA B06: hay reservaciones cuyo desglose no suma su bloque';
  end if;
  raise notice 'B06 ok: el desglose de todas las reservaciones (incluidas las existentes) suma exactamente su bloque';
end $$;

do $$
declare h text;
begin
  delete from public.notificaciones where plantilla = 'resumen_diario' and clave = ((now() at time zone 'America/Mexico_City')::date + 1)::text;
  perform public.encolar_resumen_diario(true);
  select html into h from public.notificaciones
   where plantilla = 'resumen_diario' and clave = ((now() at time zone 'America/Mexico_City')::date + 1)::text;
  -- 20:00 con 45 min de montaje y 30 de traslado: sale 6:45 p. m.; libre 21:00 + 20 + 30 = 9:50 p. m.
  if h is null or h not like '%Sale 6:45 p. m.%' or h not like '%Libre 9:50 p. m.%' or h not like '%Equipo: sale%' then
    raise exception 'PRUEBA FALLIDA B08: el resumen diario no muestra salida y hora libre';
  end if;
  raise notice 'B08 ok: el resumen diario muestra a qué hora sale el equipo y cuándo queda libre';
end $$;

-- ── Permisos ────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000017a2', true);
do $$ begin
  if exists (select 1 from public.reservaciones where id = current_setting('prueba.r1')::uuid) then
    raise exception 'PRUEBA FALLIDA B09: un cliente ve el desglose de otro';
  end if;
  if not exists (select 1 from public.reservaciones where traslado_min = 30) then
    raise exception 'PRUEBA FALLIDA B09: el cliente no ve el desglose de las suyas';
  end if;
  begin
    perform * from public.franjas_de_fecha(current_date);
    raise exception 'PRUEBA FALLIDA B09: el cliente usó franjas_de_fecha';
  exception when insufficient_privilege then null;
  end;
  raise notice 'B07 ok: franjas de un día normal, apagado y especial; solo para el admin';
  raise notice 'B09 ok: cada cliente ve el desglose solo de sus reservaciones';
end $$;
reset role;

do $$ begin raise notice 'Batería 17 completa: 9 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
