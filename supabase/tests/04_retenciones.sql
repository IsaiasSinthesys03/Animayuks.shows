-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 04: apartar horario 10 minutos (migración 6)
-- Se deshace al final con rollback: no deja datos.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, intervalo_horarios_min = 30,
       retencion_minutos = 10, reservaciones_en_linea = true, zona_horaria = 'America/Mexico_City'
 where id = 1;
update public.horario_servicio set activo = true, abre = '10:00', cierra = '20:00';

insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min)
values ('a0000000-0000-4000-8000-000000000401', 'Zona retenciones', array['99995'], 0, 0);
insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base)
values ('a0000000-0000-4000-8000-000000000410', 'prueba-ret', 'Show retenciones', 60, 30, 20, 1000);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000004a1', 'ret.cliente1@prueba.invalid', '{"nombre":"Cliente Uno"}'),
  ('a0000000-0000-4000-8000-0000000004a2', 'ret.cliente2@prueba.invalid', '{"nombre":"Cliente Dos"}'),
  ('a0000000-0000-4000-8000-0000000004ad', 'ret.admin@prueba.invalid',    '{"nombre":"Admin Ret"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000004ad';

do $$
declare sab date := (now() at time zone 'America/Mexico_City')::date + 9;
begin
  sab := sab + ((6 - extract(dow from sab)::int + 7) % 7);
  while exists (select 1 from public.ocupacion(sab, sab))
        or exists (select 1 from public.retenciones r
                    where r.bloque && tstzrange(sab::timestamp at time zone 'America/Mexico_City',
                                                (sab + 1)::timestamp at time zone 'America/Mexico_City')) loop
    sab := sab + 7;
  end loop;
  perform set_config('prueba.sab', sab::text, true);
  raise notice 'Sábado de prueba: %', sab;
end $$;

-- Atajos: hora local del sábado de prueba
create function pg_temp.h(hora text) returns timestamptz language sql stable as $$
  select (current_setting('prueba.sab')::date + hora::time) at time zone 'America/Mexico_City'
$$;
grant execute on function pg_temp.h(text) to anon, authenticated;

-- ── Cliente 1 aparta el sábado a las 14:00 ─────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000004a1', true);

do $$
declare r public.retenciones;
begin
  r := public.apartar_horario('a0000000-0000-4000-8000-000000000410', null, '{}', '99995', pg_temp.h('14:00'));
  if r.expira_en - now() <> interval '10 minutes' or r.fin - r.inicio <> interval '60 minutes' then
    raise exception 'PRUEBA FALLIDA H01: vence en %, dura %', r.expira_en - now(), r.fin - r.inicio;
  end if;
  if not exists (select 1 from public.horarios_disponibles('a0000000-0000-4000-8000-000000000410', null, '{}', '99995',
                                                           current_setting('prueba.sab')::date) where inicio = pg_temp.h('14:00')) then
    raise exception 'PRUEBA FALLIDA H01: quien apartó ya no ve su propio horario';
  end if;
  raise notice 'H01 ok: el cliente aparta 10 minutos y sigue viendo su propio horario';
end $$;
reset role;

-- ── Cliente 2 y visitantes ya no lo ven ni lo pueden tomar ──────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000004a2', true);

do $$
declare horas time[];
begin
  select array_agg((inicio at time zone 'America/Mexico_City')::time order by inicio) into horas
    from public.horarios_disponibles('a0000000-0000-4000-8000-000000000410', null, '{}', '99995',
                                     current_setting('prueba.sab')::date);
  if '14:00' = any (horas) or '12:30' = any (horas) or '15:30' = any (horas)
     or not ('12:00' = any (horas)) or not ('16:00' = any (horas)) then
    raise exception 'PRUEBA FALLIDA H02: el cliente 2 ve %', horas;
  end if;
  raise notice 'H02 ok: para otra persona el apartado ocupa igual que una reservación (12:30 a 15:30)';
end $$;

do $$ begin
  perform public.apartar_horario('a0000000-0000-4000-8000-000000000410', null, '{}', '99995', pg_temp.h('14:30'));
  raise exception 'PRUEBA FALLIDA H03: el cliente 2 apartó un horario que choca';
exception when exclusion_violation then
  begin
    perform public.crear_reservacion('a0000000-0000-4000-8000-000000000410', null, pg_temp.h('14:00'), '99995', 'Calle', 'Colonia');
    raise exception 'PRUEBA FALLIDA H03: el cliente 2 reservó un horario apartado por otro';
  exception when exclusion_violation then
    raise notice 'H03 ok: el cliente 2 no puede apartar ni reservar sobre un apartado ajeno';
  end;
end $$;

-- Cliente 2 aparta las 10:00 y luego cambia a las 17:00: solo queda un apartado
do $$
declare n int; ini timestamptz;
begin
  perform public.apartar_horario('a0000000-0000-4000-8000-000000000410', null, '{}', '99995', pg_temp.h('10:00'));
  perform public.apartar_horario('a0000000-0000-4000-8000-000000000410', null, '{}', '99995', pg_temp.h('17:00'));
  select count(*), min(inicio) into n, ini from public.retenciones;
  if n <> 1 or ini <> pg_temp.h('17:00') then
    raise exception 'PRUEBA FALLIDA H04: el cliente 2 tiene % apartados (inicio %)', n, ini;
  end if;
  raise notice 'H04 ok: apartar otro horario reemplaza el anterior (uno por persona)';
end $$;

do $$ begin
  insert into public.retenciones (usuario_id, show_id, codigo_postal, inicio, fin, bloque, expira_en)
  values (auth.uid(), 'a0000000-0000-4000-8000-000000000410', '99995', now(), now(), tstzrange(now(), now() + interval '1 h'), now());
  raise exception 'PRUEBA FALLIDA H05: el cliente insertó un apartado directo';
exception when insufficient_privilege then
  raise notice 'H05 ok: nadie escribe apartados directo en la tabla';
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare horas time[];
begin
  select array_agg((inicio at time zone 'America/Mexico_City')::time order by inicio) into horas
    from public.horarios_disponibles('a0000000-0000-4000-8000-000000000410', null, '{}', '99995',
                                     current_setting('prueba.sab')::date);
  if not ('10:00' = any (horas)) or '17:00' = any (horas) or '14:00' = any (horas) then
    raise exception 'PRUEBA FALLIDA H06: el visitante ve %', horas;
  end if;
  begin
    perform public.apartar_horario('a0000000-0000-4000-8000-000000000410', null, '{}', '99995', pg_temp.h('11:00'));
    raise exception 'PRUEBA FALLIDA H06: el visitante apartó sin sesión';
  exception when insufficient_privilege then null;
  end;
  raise notice 'H06 ok: el visitante ve liberado el apartado reemplazado y no puede apartar sin sesión';
end $$;
reset role;

-- ── Un apartado vencido ya no estorba ───────────────────────────────────────
update public.retenciones set expira_en = now() - interval '1 minute'
 where usuario_id = 'a0000000-0000-4000-8000-0000000004a2';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000004a1', true);
do $$ begin
  if not exists (select 1 from public.horarios_disponibles('a0000000-0000-4000-8000-000000000410', null, '{}', '99995',
                                                           current_setting('prueba.sab')::date) where inicio = pg_temp.h('17:00')) then
    raise exception 'PRUEBA FALLIDA H07: un apartado vencido sigue bloqueando';
  end if;
  raise notice 'H07 ok: un apartado vencido ya no bloquea a nadie, aunque aún no se limpie';
end $$;

-- Cliente 1 reserva su horario apartado: la reservación entra y el apartado desaparece
do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000000410', null, pg_temp.h('14:00'), '99995', 'Calle 1', 'Colonia 1');
  if exists (select 1 from public.retenciones) then
    raise exception 'PRUEBA FALLIDA H08: el apartado sigue después de reservar';
  end if;
  raise notice 'H08 ok: el cliente reserva su horario apartado y el apartado se borra (%)', r.folio;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000004a2', true);
do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000000410', null, pg_temp.h('17:00'), '99995', 'Calle 2', 'Colonia 2');
  raise notice 'H09 ok: con el apartado vencido, el horario se reserva si sigue libre (%)', r.folio;
end $$;

do $$ begin
  perform public.apartar_horario('a0000000-0000-4000-8000-000000000410', null, '{}', '00001', pg_temp.h('11:00'));
  raise exception 'PRUEBA FALLIDA H10: apartó fuera de cobertura';
exception when raise_exception then
  if sqlerrm not like 'FUERA_DE_COBERTURA%' then raise; end if;
  begin
    perform public.apartar_horario('a0000000-0000-4000-8000-000000000410', null, '{}', '99995', now() + interval '20 hours');
    raise exception 'PRUEBA FALLIDA H10: apartó con menos de 48 h';
  exception when raise_exception then
    if sqlerrm not like 'ANTICIPACION%' then raise; end if;
    raise notice 'H10 ok: apartar respeta cobertura y anticipación';
  end;
end $$;

do $$
declare liberado boolean;
begin
  perform public.apartar_horario('a0000000-0000-4000-8000-000000000410', null, '{}', '99995', pg_temp.h('11:00'));
  -- En dos sentencias: una sola consulta vería la tabla como estaba antes de liberar
  liberado := public.liberar_horario();
  if not liberado or exists (select 1 from public.retenciones) then
    raise exception 'PRUEBA FALLIDA H11: liberar_horario() no borró el apartado';
  end if;
  raise notice 'H11 ok: liberar_horario() borra el apartado propio';
end $$;

-- Para H12: el cliente 2 deja un apartado vigente
select (public.apartar_horario('a0000000-0000-4000-8000-000000000410', null, '{}', '99995', pg_temp.h('11:00'))).id is not null as apartado;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000004a1', true);
do $$ begin
  if exists (select 1 from public.retenciones) then
    raise exception 'PRUEBA FALLIDA H12: el cliente 1 ve el apartado del cliente 2';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000004ad', true);
do $$ begin
  if not exists (select 1 from public.retenciones where usuario_id = 'a0000000-0000-4000-8000-0000000004a2') then
    raise exception 'PRUEBA FALLIDA H12: el admin no ve los apartados';
  end if;
  raise notice 'H12 ok: cada cliente ve solo su apartado y el admin ve todos';
end $$;
reset role;

do $$ begin raise notice 'Batería 04 completa: 12 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
