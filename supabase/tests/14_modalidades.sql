-- Batería 14: tipos de evento (modalidades). Se deshace al final (rollback).
begin;

-- ── Datos de prueba (solo existen dentro de esta transacción) ────────────────

-- Reglas conocidas para que las pruebas no dependan de la configuración real
update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, anticipo_porcentaje = 30,
       cancelacion_dias_reembolso = 7, cancelacion_comision_pct = 5,
       confirmacion_automatica = false, reservaciones_en_linea = true,
       zona_horaria = 'America/Mexico_City'
 where id = 1;
update public.horario_servicio set activo = (dia_semana <> 1), max_shows = null;
delete from public.dias_especiales;
delete from public.horario_franjas where dia_semana is not null;
insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min)
select d, '09:00', '22:00', 'intervalo', 30 from generate_series(0, 6) d;

insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min, activa)
values ('a0000000-0000-4000-8000-000000000001', 'Zona de prueba', array['99999'], 300, 30, true);

insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base, activo)
values ('a0000000-0000-4000-8000-000000000010', 'prueba-show-activo', 'Show de prueba', 60, 30, 20, 1000, true),
       ('a0000000-0000-4000-8000-000000000011', 'prueba-show-oculto', 'Show oculto de prueba', 60, 30, 20, 1000, false);

insert into public.paquetes (id, show_id, nombre, precio, duracion_min)
values ('a0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000010', 'Paquete plus de prueba', 2000, 90);

insert into public.extras (id, nombre, precio, minutos)
values ('a0000000-0000-4000-8000-000000000030', 'Extra de prueba', 500, 30);

-- Usuarios: el trigger al_crear_usuario les crea perfil y ficha de cliente
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000000a1', 'cliente1@prueba.invalid', '{"nombre":"Cliente Uno","telefono":"3300000001"}'),
  ('a0000000-0000-4000-8000-0000000000a2', 'cliente2@prueba.invalid', '{"nombre":"Cliente Dos"}'),
  ('a0000000-0000-4000-8000-0000000000ad', 'admin@prueba.invalid',    '{"nombre":"Admin Prueba"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000000ad';

-- Fechas: el primer sábado con al menos 9 días de distancia cuyo fin de semana
-- y el siguiente estén libres de reservaciones y bloqueos reales
do $$
declare
  tz  constant text := 'America/Mexico_City';
  hoy date := (now() at time zone tz)::date;
  sab date := hoy + 9;
  lun date := hoy + 3;
begin
  sab := sab + ((6 - extract(dow from sab)::int + 7) % 7);
  loop
    exit when not exists (
      select 1 from public.ocupacion(sab, sab + 8)
    );
    sab := sab + 7;
  end loop;
  lun := lun + ((1 - extract(dow from lun)::int + 7) % 7);

  perform set_config('prueba.sab16',   ((sab + time '16:00')     at time zone tz)::text, true);
  perform set_config('prueba.sab1830', ((sab + time '18:30')     at time zone tz)::text, true);
  perform set_config('prueba.sab2_12', ((sab + 7 + time '12:00') at time zone tz)::text, true);
  perform set_config('prueba.dom12',   ((sab + 8 + time '12:00') at time zone tz)::text, true);
  perform set_config('prueba.lun12',   ((lun + time '12:00')     at time zone tz)::text, true);
  raise notice 'Fechas de prueba: sábado %, lunes %', sab, lun;
end $$;

update public.configuracion set anticipo_porcentaje = 50 where id = 1;
insert into public.modalidades (id, nombre, descripcion, cargo, activo) values
  ('a0000000-0000-4000-8000-000000000041', 'Modalidad prueba', 'Explicación', 700, true),
  ('a0000000-0000-4000-8000-000000000042', 'Modalidad apagada', '', 900, false);
update public.shows set pide_modalidad = true where id = 'a0000000-0000-4000-8000-000000000010';
insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base, activo)
values ('a0000000-0000-4000-8000-000000000012', 'prueba-show-sin-modalidad', 'Show sin modalidad', 60, 30, 20, 1000, true);

-- ── Visitante ───────────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  if not exists (select 1 from public.modalidades where id = 'a0000000-0000-4000-8000-000000000041') then
    raise exception 'PRUEBA FALLIDA M01: el visitante no ve una modalidad activa';
  end if;
  if exists (select 1 from public.modalidades where id = 'a0000000-0000-4000-8000-000000000042') then
    raise exception 'PRUEBA FALLIDA M01: el visitante ve una modalidad apagada';
  end if;
  raise notice 'M01 ok: el visitante ve solo los tipos de evento activos';
end $$;
do $$ begin
  update public.modalidades set cargo = 0;
  if found then raise exception 'PRUEBA FALLIDA M02: el visitante cambió un cargo'; end if;
  raise notice 'M02 ok: el visitante no puede cambiar tipos de evento';
exception when insufficient_privilege then raise notice 'M02 ok: el visitante no puede cambiar tipos de evento';
end $$;
reset role;

-- ── Cliente ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000000a1', true);

do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000000010', null,
    current_setting('prueba.sab16')::timestamptz, '99999', 'Calle 1', 'Colonia 1', null, '{}',
    '{"modalidad_id":"a0000000-0000-4000-8000-000000000041"}');
  -- 1000 show + 700 tipo de evento + 300 traslado = 2000; anticipo 50 % = 1000
  if r.total <> 2000 or r.anticipo_requerido <> 1000 or r.cargo_modalidad <> 700
     or r.modalidad_nombre <> 'Modalidad prueba' or r.modalidad_id is null then
    raise exception 'PRUEBA FALLIDA M03: total %, anticipo %, cargo %, nombre %', r.total, r.anticipo_requerido, r.cargo_modalidad, r.modalidad_nombre;
  end if;
  raise notice 'M03 ok: el tipo de evento suma su cargo y queda guardado en la reservación';
end $$;

do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000000010', null,
    current_setting('prueba.sab2_12')::timestamptz, '99999', 'Calle 1', 'Colonia 1', null, '{}', '{}');
  if r.total <> 1300 or r.cargo_modalidad <> 0 or r.modalidad_id is not null then
    raise exception 'PRUEBA FALLIDA M04: total %, cargo %', r.total, r.cargo_modalidad;
  end if;
  raise notice 'M04 ok: "ninguno de estos" no cobra extra';
end $$;

do $$ begin
  perform public.crear_reservacion('a0000000-0000-4000-8000-000000000012', null,
    current_setting('prueba.dom12')::timestamptz, '99999', 'Calle 1', 'Colonia 1', null, '{}',
    '{"modalidad_id":"a0000000-0000-4000-8000-000000000041"}');
  raise exception 'PRUEBA FALLIDA M05: cobró tipo de evento en un show que no lo pide';
exception when others then
  if sqlerrm not like 'MODALIDAD_NO_APLICA%' then raise; end if;
  raise notice 'M05 ok: un show que no pide tipo de evento lo rechaza';
end $$;

do $$ begin
  perform public.crear_reservacion('a0000000-0000-4000-8000-000000000010', null,
    current_setting('prueba.dom12')::timestamptz, '99999', 'Calle 1', 'Colonia 1', null, '{}',
    '{"modalidad_id":"a0000000-0000-4000-8000-000000000042"}');
  raise exception 'PRUEBA FALLIDA M06: aceptó un tipo de evento apagado';
exception when others then
  if sqlerrm not like 'MODALIDAD_NO_DISPONIBLE%' then raise; end if;
  raise notice 'M06 ok: el cliente no puede usar un tipo de evento apagado';
end $$;
reset role;

-- ── Admin ───────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000000ad', true);
do $$ begin
  update public.modalidades set cargo = 800 where id = 'a0000000-0000-4000-8000-000000000041';
  if (select cargo from public.modalidades where id = 'a0000000-0000-4000-8000-000000000041') <> 800 then
    raise exception 'PRUEBA FALLIDA M07: el admin no pudo cambiar el cargo';
  end if;
  if (select cargo_modalidad from public.reservaciones where modalidad_id = 'a0000000-0000-4000-8000-000000000041') <> 700 then
    raise exception 'PRUEBA FALLIDA M07: cambiar el cargo alteró una reservación ya hecha';
  end if;
  if not exists (select 1 from public.modalidades where id = 'a0000000-0000-4000-8000-000000000042') then
    raise exception 'PRUEBA FALLIDA M07: el admin no ve los tipos apagados';
  end if;
  raise notice 'M07 ok: el admin cambia cargos sin tocar reservaciones anteriores';
end $$;
reset role;

do $$ begin raise notice 'Batería 14 completa: 7 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
