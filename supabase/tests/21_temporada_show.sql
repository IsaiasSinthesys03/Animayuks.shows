-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 21: periodo de venta y temporada por show
-- Corre dentro de una transacción que se DESHACE al final (rollback).
-- ═════════════════════════════════════════════════════════════════════════════

begin;

update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, reprogramacion_min_horas = 48, reprogramaciones_max = 5,
       reservaciones_en_linea = true, zona_horaria = 'America/Mexico_City'
 where id = 1;
delete from public.dias_especiales;
update public.horario_servicio set activo = true, max_shows = null;
delete from public.horario_franjas where dia_semana is not null and show_id is null;
insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min)
select d, '10:00', '20:00', 'intervalo', 60 from generate_series(0, 6) d;

insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min, activa)
values ('a0000000-0000-4000-8000-000000002101', 'Zona temporada', array['99939'], 0, 0, true);

-- Base: dentro de 40 días, sin reservaciones ni bloqueos reales en los 20 días siguientes
do $$
declare
  tz constant text := 'America/Mexico_City';
  b  date := (now() at time zone tz)::date + 40;
  rango tstzrange;
begin
  loop
    rango := tstzrange(b::timestamp at time zone tz, (b + 20)::timestamp at time zone tz);
    exit when not exists (select 1 from public.reservaciones r where r.estado in ('pendiente', 'confirmada') and r.bloque && rango)
          and not exists (select 1 from public.retenciones t where t.bloque && rango)
          and not exists (select 1 from public.bloqueos x where tstzrange(x.inicio, x.fin) && rango);
    b := b + 7;
  end loop;
  perform set_config('prueba.base', b::text, true);
end $$;

-- Show navideño: se presenta solo del día +5 al +10 de la base. Show normal sin fechas.
insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base, activo, evento_desde, evento_hasta)
select 'a0000000-0000-4000-8000-00000000210a', 'prueba-temporada', 'Show temporada', 60, 0, 0, 1000, true,
       current_setting('prueba.base')::date + 5, current_setting('prueba.base')::date + 10;
insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base, activo)
values ('a0000000-0000-4000-8000-00000000210b', 'prueba-sin-fechas', 'Show sin fechas', 60, 0, 0, 1000, true);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000021a1', 'temporada1@prueba.invalid', '{"nombre":"Cliente Temporada"}'),
  ('a0000000-0000-4000-8000-0000000021ad', 'temporada.admin@prueba.invalid', '{"nombre":"Admin Temporada"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000021ad';

create function pg_temp.h(dias int, hora text) returns timestamptz language sql stable as $$
  select (current_setting('prueba.base')::date + dias + hora::time) at time zone 'America/Mexico_City'
$$;
create function pg_temp.n(p_show text, dias int) returns int language sql stable as $$
  select count(*)::int from public.horarios_disponibles(('a0000000-0000-4000-8000-00000000210' || p_show)::uuid, null, '{}', '99939',
                                                        current_setting('prueba.base')::date + dias)
$$;
grant execute on function pg_temp.h(int, text), pg_temp.n(text, int) to anon, authenticated;

do $$ begin
  if pg_temp.n('a', 2) <> 0 or pg_temp.n('a', 12) <> 0 or pg_temp.n('a', 7) = 0 then
    raise exception 'PRUEBA FALLIDA T01: fuera de temporada ofrece % / %, dentro %', pg_temp.n('a', 2), pg_temp.n('a', 12), pg_temp.n('a', 7);
  end if;
  if pg_temp.n('b', 2) = 0 then
    raise exception 'PRUEBA FALLIDA T06: el show sin fechas dejó de ofrecer horarios';
  end if;
  raise notice 'T01 ok: fuera de su temporada el show no ofrece horarios; dentro sí';
  raise notice 'T06 ok: un show sin fechas funciona igual que antes';
end $$;

-- ── Cliente ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000021a1', true);
do $$
declare r public.reservaciones;
begin
  begin
    perform public.crear_reservacion('a0000000-0000-4000-8000-00000000210a', null, pg_temp.h(2, '12:00'), '99939', 'Calle', 'Colonia');
    raise exception 'PRUEBA FALLIDA T02: reservó fuera de temporada';
  exception when others then if sqlerrm not like 'FUERA_DE_HORARIO%' then raise; end if;
  end;
  r := public.crear_reservacion('a0000000-0000-4000-8000-00000000210a', null, pg_temp.h(7, '12:00'), '99939', 'Calle', 'Colonia');
  perform set_config('prueba.r', r.id::text, true);
  raise notice 'T02 ok: el cliente solo reserva dentro de la temporada';
end $$;
reset role;

-- Periodo de venta todavía no abierto (empieza mañana)
update public.shows set venta_desde = (now() at time zone 'America/Mexico_City')::date + 1 where id = 'a0000000-0000-4000-8000-00000000210a';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000021a1', true);
do $$ begin
  begin
    perform public.crear_reservacion('a0000000-0000-4000-8000-00000000210a', null, pg_temp.h(8, '12:00'), '99939', 'Calle', 'Colonia');
    raise exception 'PRUEBA FALLIDA T03: reservó antes de que abriera la venta';
  exception when others then if sqlerrm not like 'FUERA_DE_HORARIO%' then raise; end if;
  end;
  if pg_temp.n('a', 8) <> 0 then raise exception 'PRUEBA FALLIDA T03: ofrece horarios antes de abrir la venta'; end if;
  raise notice 'T03 ok: antes de abrir la venta el cliente no ve horarios ni puede reservar';
end $$;
reset role;

-- Periodo de venta ya cerrado (terminó ayer): la reservación existente sí se puede reprogramar
update public.shows set venta_desde = null, venta_hasta = (now() at time zone 'America/Mexico_City')::date - 1 where id = 'a0000000-0000-4000-8000-00000000210a';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000021a1', true);
do $$
declare r public.reservaciones;
begin
  begin
    perform public.crear_reservacion('a0000000-0000-4000-8000-00000000210a', null, pg_temp.h(8, '12:00'), '99939', 'Calle', 'Colonia');
    raise exception 'PRUEBA FALLIDA T04: reservó con la venta cerrada';
  exception when others then if sqlerrm not like 'FUERA_DE_HORARIO%' then raise; end if;
  end;
  r := public.reprogramar_reservacion(current_setting('prueba.r')::uuid, pg_temp.h(9, '12:00'));
  if r.inicio <> pg_temp.h(9, '12:00') then raise exception 'PRUEBA FALLIDA T04: no reprogramó'; end if;
  raise notice 'T04 ok: con la venta cerrada no hay reservaciones nuevas, pero las hechas se pueden reprogramar dentro de la temporada';
end $$;
reset role;

-- ── Admin ───────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000021ad', true);
do $$
declare r public.reservaciones;
begin
  -- Con la venta cerrada, el admin sí reserva dentro de la temporada
  r := public.crear_reservacion('a0000000-0000-4000-8000-00000000210a', null, pg_temp.h(10, '12:00'), '99939', 'Calle', 'Colonia',
    p_cliente_id => (select id from public.clientes where usuario_id = 'a0000000-0000-4000-8000-0000000021a1'));
  -- Fuera de temporada, solo con motivo
  begin
    perform public.crear_reservacion('a0000000-0000-4000-8000-00000000210a', null, pg_temp.h(15, '12:00'), '99939', 'Calle', 'Colonia',
      p_cliente_id => (select id from public.clientes where usuario_id = 'a0000000-0000-4000-8000-0000000021a1'));
    raise exception 'PRUEBA FALLIDA T05: el admin reservó fuera de temporada sin motivo';
  exception when others then if sqlerrm not like 'FUERA_DE_HORARIO%' then raise; end if;
  end;
  r := public.crear_reservacion('a0000000-0000-4000-8000-00000000210a', null, pg_temp.h(15, '12:00'), '99939', 'Calle', 'Colonia',
    p_cliente_id => (select id from public.clientes where usuario_id = 'a0000000-0000-4000-8000-0000000021a1'),
    p_forzar => true, p_motivo => 'Evento especial');
  raise notice 'T05 ok: el admin reserva aunque la venta esté cerrada, y fuera de temporada solo con motivo';
end $$;
reset role;

do $$ begin
  begin
    update public.shows set evento_desde = current_date + 10, evento_hasta = current_date where id = 'a0000000-0000-4000-8000-00000000210b';
    raise exception 'PRUEBA FALLIDA T07: aceptó una temporada al revés';
  exception when check_violation then null;
  end;
  begin
    update public.shows set venta_desde = current_date + 10, venta_hasta = current_date where id = 'a0000000-0000-4000-8000-00000000210b';
    raise exception 'PRUEBA FALLIDA T07: aceptó un periodo de venta al revés';
  exception when check_violation then null;
  end;
  raise notice 'T07 ok: rechaza fechas "hasta" anteriores a "desde"';
end $$;

do $$ begin raise notice 'Batería 21 completa: 7 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
