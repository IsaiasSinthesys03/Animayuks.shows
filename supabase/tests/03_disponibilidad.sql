-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 03: disponibilidad real (migración 5)
-- horarios_disponibles(), disponibilidad_mes(), coherencia con crear_reservacion()
-- y permisos de las funciones internas. Se deshace al final con rollback.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── Reglas y datos de prueba ────────────────────────────────────────────────
update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, anticipo_porcentaje = 30,
       intervalo_horarios_min = 30, reservaciones_en_linea = true, zona_horaria = 'America/Mexico_City'
 where id = 1;
-- Lunes sin servicio, viernes 10:00–11:30, domingo 10:00–11:00, resto 10:00–20:00
update public.horario_servicio
   set activo = (dia_semana <> 1),
       abre   = '10:00',
       cierra = case dia_semana when 5 then time '11:30' when 0 then time '11:00' else time '20:00' end;

insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min) values
  ('a0000000-0000-4000-8000-000000000301', 'Zona A prueba (sin traslado)', array['99997'], 0, 0),
  ('a0000000-0000-4000-8000-000000000302', 'Zona B prueba (60 min)',       array['99996'], 500, 60);

insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base, activo) values
  ('a0000000-0000-4000-8000-000000000310', 'prueba-disp',        'Show disponibilidad', 60, 30, 20, 1000, true),
  ('a0000000-0000-4000-8000-000000000311', 'prueba-disp-oculto', 'Show oculto',         60, 30, 20, 1000, false);
insert into public.paquetes (id, show_id, nombre, precio, duracion_min)
values ('a0000000-0000-4000-8000-000000000320', 'a0000000-0000-4000-8000-000000000310', 'Paquete 90 min', 2000, 90);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000003a1', 'disp.cliente@prueba.invalid', '{"nombre":"Cliente Disp"}'),
  ('a0000000-0000-4000-8000-0000000003ad', 'disp.admin@prueba.invalid',   '{"nombre":"Admin Disp"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000003ad';

-- Sábado de prueba: al menos 9 días adelante, con viernes, domingo, lunes y el
-- sábado siguiente libres de reservaciones y bloqueos reales
do $$
declare
  tz  constant text := 'America/Mexico_City';
  sab date := (now() at time zone tz)::date + 9;
begin
  sab := sab + ((6 - extract(dow from sab)::int + 7) % 7);
  while exists (select 1 from public.ocupacion(sab - 1, sab + 8)) loop
    sab := sab + 7;
  end loop;
  perform set_config('prueba.sab', sab::text, true);
  raise notice 'Sábado de prueba: %', sab;
end $$;

-- ── D01–D02: día libre ──────────────────────────────────────────────────────
do $$
declare
  sab date := current_setting('prueba.sab')::date;
  n int; primero time; ultimo time;
begin
  select count(*), min((inicio at time zone 'America/Mexico_City')::time), max((inicio at time zone 'America/Mexico_City')::time)
    into n, primero, ultimo
    from public.horarios_disponibles('a0000000-0000-4000-8000-000000000310', null, '{}', '99997', sab);
  if n <> 19 or primero <> '10:00' or ultimo <> '19:00' then
    raise exception 'PRUEBA FALLIDA D01: % horarios de % a % (esperado 19, de 10:00 a 19:00)', n, primero, ultimo;
  end if;
  raise notice 'D01 ok: día libre ofrece 19 inicios, de 10:00 a 19:00 (show de 60 min, cierre 20:00)';

  select count(*), max((inicio at time zone 'America/Mexico_City')::time) into n, ultimo
    from public.horarios_disponibles('a0000000-0000-4000-8000-000000000310', 'a0000000-0000-4000-8000-000000000320', '{}', '99997', sab);
  if n <> 18 or ultimo <> '18:30' then
    raise exception 'PRUEBA FALLIDA D02: paquete de 90 min da % horarios, último %', n, ultimo;
  end if;
  raise notice 'D02 ok: con el paquete de 90 min el último inicio es 18:30 (terminaría al cierre)';
end $$;

-- ── Reservación existente: sábado 14:00 en la zona A ────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000003a1', true);
select public.crear_reservacion('a0000000-0000-4000-8000-000000000310', null,
       (current_setting('prueba.sab')::date + time '14:00') at time zone 'America/Mexico_City',
       '99997', 'Calle', 'Colonia') is not null as reservada;
reset role;

-- ── D03–D04: una reservación quita horarios según la zona ───────────────────
do $$
declare
  sab date := current_setting('prueba.sab')::date;
  a time[]; b time[];
begin
  select array_agg((inicio at time zone 'America/Mexico_City')::time order by inicio) into a
    from public.horarios_disponibles('a0000000-0000-4000-8000-000000000310', null, '{}', '99997', sab);
  -- Ocupado: bloque 13:30–15:20. En zona A cada candidato ocupa [t−30 min, t+80 min] → se pierden 12:30 a 15:30
  if cardinality(a) <> 12 or not ('12:00' = any (a)) or '12:30' = any (a) or '15:30' = any (a) or not ('16:00' = any (a)) then
    raise exception 'PRUEBA FALLIDA D03: zona A ofrece %', a;
  end if;
  raise notice 'D03 ok: la reservación de las 14:00 quita de 12:30 a 15:30 (montaje y desmontaje incluidos)';

  select array_agg((inicio at time zone 'America/Mexico_City')::time order by inicio) into b
    from public.horarios_disponibles('a0000000-0000-4000-8000-000000000310', null, '{}', '99996', sab);
  -- En zona B (60 min de traslado) cada candidato ocupa [t−90 min, t+140 min] → se pierden 11:30 a 16:30
  if b <> array['10:00','10:30','11:00','17:00','17:30','18:00','18:30','19:00']::time[] then
    raise exception 'PRUEBA FALLIDA D04: zona B ofrece %', b;
  end if;
  raise notice 'D04 ok: la zona lejana pierde más horarios por el traslado (12:00 libre en A, ocupado en B)';
end $$;

-- ── D05–D07: días sin horarios ──────────────────────────────────────────────
insert into public.bloqueos (inicio, fin, motivo)
values ((current_setting('prueba.sab')::date + 7)::timestamp at time zone 'America/Mexico_City',
        (current_setting('prueba.sab')::date + 8)::timestamp at time zone 'America/Mexico_City',
        'Bloqueo de prueba');

do $$
declare sab date := current_setting('prueba.sab')::date;
begin
  if exists (select 1 from public.horarios_disponibles('a0000000-0000-4000-8000-000000000310', null, '{}', '99997', sab + 7)) then
    raise exception 'PRUEBA FALLIDA D05: ofrece horarios en un día bloqueado';
  end if;
  if exists (select 1 from public.horarios_disponibles('a0000000-0000-4000-8000-000000000310', null, '{}', '99997', sab + 2)) then
    raise exception 'PRUEBA FALLIDA D05: ofrece horarios en lunes (sin servicio)';
  end if;
  raise notice 'D05 ok: día bloqueado y lunes sin servicio no ofrecen horarios';

  if exists (select 1 from public.horarios_disponibles('a0000000-0000-4000-8000-000000000310', null, '{}', '99997',
                                                       (now() at time zone 'America/Mexico_City')::date + 1)) then
    raise exception 'PRUEBA FALLIDA D06: ofrece horarios para mañana (menos de 48 h)';
  end if;
  raise notice 'D06 ok: no ofrece horarios con menos de 48 h de anticipación';

  if exists (select 1 from public.horarios_disponibles('a0000000-0000-4000-8000-000000000310', null, '{}', '00001', sab)) then
    raise exception 'PRUEBA FALLIDA D07: ofrece horarios sin cobertura';
  end if;
  raise notice 'D07 ok: sin cobertura no hay horarios';
end $$;

-- ── D08: calendario del mes ─────────────────────────────────────────────────
-- Domingo: su único horario (10:00) queda reservado → 'lleno'
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000003a1', true);
select public.crear_reservacion('a0000000-0000-4000-8000-000000000310', null,
       (current_setting('prueba.sab')::date + 1 + time '10:00') at time zone 'America/Mexico_City',
       '99997', 'Calle', 'Colonia') is not null as reservada;
reset role;

do $$
declare
  sab date := current_setting('prueba.sab')::date;
  r record;
  function_estado text;
begin
  for r in
    select x.dia, x.esperado, x.horarios_esperados
      from (values (sab,     'libre',         12),
                   (sab - 1, 'pocos',         2),
                   (sab + 1, 'lleno',         0),
                   (sab + 2, 'no_disponible', 0),
                   (sab + 7, 'no_disponible', 0),
                   ((now() at time zone 'America/Mexico_City')::date + 1, 'no_disponible', 0)
           ) as x(dia, esperado, horarios_esperados)
  loop
    select d.estado into function_estado
      from public.disponibilidad_mes('a0000000-0000-4000-8000-000000000310', null, '{}', '99997',
                                     extract(year from r.dia)::int, extract(month from r.dia)::int) d
     where d.fecha = r.dia
       and d.horarios = r.horarios_esperados;
    if function_estado is distinct from r.esperado then
      raise exception 'PRUEBA FALLIDA D08: % debería ser % con % horarios (obtenido: %)',
        r.dia, r.esperado, r.horarios_esperados, coalesce(function_estado, 'otro número de horarios');
    end if;
  end loop;
  raise notice 'D08 ok: el calendario distingue libre, pocos, lleno y no disponible';
end $$;

-- ── D09: coherencia calendario ↔ reservación ────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000003a1', true);

do $$
declare
  sab date := current_setting('prueba.sab')::date;
  disponibles timestamptz[];
  t timestamptz;
  probados int := 0;
begin
  select array_agg(inicio) into disponibles
    from public.horarios_disponibles('a0000000-0000-4000-8000-000000000310', null, '{}', '99996', sab);

  -- Cada hora de la cuadrícula del sábado: si se ofrece, se puede reservar; si no, se rechaza
  for t in
    select g from generate_series((sab + time '10:00') at time zone 'America/Mexico_City',
                                  (sab + time '19:30') at time zone 'America/Mexico_City',
                                  interval '30 minutes') g
  loop
    begin
      perform public.crear_reservacion('a0000000-0000-4000-8000-000000000310', null, t, '99996', 'Calle', 'Colonia');
      if t = any (disponibles) then
        raise exception 'DESHACER';
      end if;
      raise exception 'PRUEBA FALLIDA D09: aceptó % que el calendario no ofrece', t;
    exception when others then
      if sqlerrm like 'PRUEBA FALLIDA%' then raise; end if;
      if sqlerrm <> 'DESHACER' and t = any (disponibles) then
        raise exception 'PRUEBA FALLIDA D09: rechazó % que el calendario sí ofrece: %', t, sqlerrm;
      end if;
    end;
    probados := probados + 1;
  end loop;
  raise notice 'D09 ok: las % horas del sábado coinciden entre calendario y reservación', probados;
end $$;

reset role;

-- ── D10–D11: permisos y show oculto ─────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $$
declare sab date := current_setting('prueba.sab')::date;
begin
  perform count(*) from public.horarios_disponibles('a0000000-0000-4000-8000-000000000310', null, '{}', '99997', sab);
  perform count(*) from public.disponibilidad_mes('a0000000-0000-4000-8000-000000000310', null, '{}', '99997',
                                                  extract(year from sab)::int, extract(month from sab)::int);
  begin
    perform public.calcular_horario('a0000000-0000-4000-8000-000000000310', null, '{}', '99997', now());
    raise exception 'PRUEBA FALLIDA D10: el visitante ejecutó calcular_horario()';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.validar_horario(now(), now() + interval '1 hour', tstzrange(now(), now() + interval '1 hour'));
    raise exception 'PRUEBA FALLIDA D10: el visitante ejecutó validar_horario()';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.evaluar_horarios_dia('a0000000-0000-4000-8000-000000000310', null, '{}', '99997', sab);
    raise exception 'PRUEBA FALLIDA D10: el visitante ejecutó evaluar_horarios_dia()';
  exception when insufficient_privilege then null;
  end;
  raise notice 'D10 ok: el visitante consulta disponibilidad pero no las funciones internas';

  if exists (select 1 from public.horarios_disponibles('a0000000-0000-4000-8000-000000000311', null, '{}', '99997', sab))
     or exists (select 1 from public.disponibilidad_mes('a0000000-0000-4000-8000-000000000311', null, '{}', '99997',
                                                        extract(year from sab)::int, extract(month from sab)::int)
                 where estado <> 'no_disponible') then
    raise exception 'PRUEBA FALLIDA D11: un show oculto muestra disponibilidad';
  end if;
  raise notice 'D11 ok: un show oculto no muestra disponibilidad';
end $$;

reset role;

-- ── D12: el admin bloquea fechas aunque el candado sea interno ──────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000003ad', true);
do $$ begin
  insert into public.bloqueos (inicio, fin, motivo)
  values (now() + interval '300 days', now() + interval '301 days', 'Bloqueo admin de prueba');
  raise notice 'D12 ok: el admin bloquea fechas (el trigger toma el candado de agenda)';
end $$;
reset role;

do $$ begin raise notice 'Batería 03 completa: 12 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
