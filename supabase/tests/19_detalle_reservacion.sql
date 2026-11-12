-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 19: historial de la reservación y aceptaciones visibles para el admin
-- Corre dentro de una transacción que se DESHACE al final (rollback).
-- ═════════════════════════════════════════════════════════════════════════════

begin;

update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, anticipo_porcentaje = 50,
       reservaciones_en_linea = true, zona_horaria = 'America/Mexico_City'
 where id = 1;
delete from public.dias_especiales;
update public.horario_servicio set activo = true, max_shows = null;
delete from public.horario_franjas where dia_semana is not null and show_id is null;
insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min)
select d, '09:00', '22:00', 'intervalo', 60 from generate_series(0, 6) d;

insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min, activa)
values ('a0000000-0000-4000-8000-000000001901', 'Zona historial', array['99959'], 200, 0, true);
insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base, activo)
values ('a0000000-0000-4000-8000-00000000190a', 'prueba-historial', 'Show historial', 60, 0, 0, 1000, true);
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000019a1', 'historial1@prueba.invalid', '{"nombre":"Cliente Historial"}'),
  ('a0000000-0000-4000-8000-0000000019a2', 'historial2@prueba.invalid', '{"nombre":"Otro Cliente"}'),
  ('a0000000-0000-4000-8000-0000000019ad', 'historial.admin@prueba.invalid', '{"nombre":"Admin Historial"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000019ad';

-- Un día libre de reservaciones reales, a 30 días o más
do $$
declare d date := (now() at time zone 'America/Mexico_City')::date + 30;
begin
  while exists (select 1 from public.reservaciones r where r.estado in ('pendiente', 'confirmada')
                 and r.bloque && tstzrange(d::timestamp at time zone 'America/Mexico_City', (d + 1)::timestamp at time zone 'America/Mexico_City'))
        or exists (select 1 from public.bloqueos b where tstzrange(b.inicio, b.fin) && tstzrange(d::timestamp at time zone 'America/Mexico_City', (d + 1)::timestamp at time zone 'America/Mexico_City')) loop
    d := d + 1;
  end loop;
  perform set_config('prueba.dia', d::text, true);
end $$;

-- Cliente reserva y acepta documentos
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000019a1', true);
do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion('a0000000-0000-4000-8000-00000000190a', null,
    (current_setting('prueba.dia')::date + time '12:00') at time zone 'America/Mexico_City', '99959', 'Calle', 'Colonia');
  perform set_config('prueba.r', r.id::text, true);
  perform public.aceptar_paginas(array['terminos', 'politica-de-cancelacion', 'aviso-de-privacidad']);
end $$;
reset role;

-- Admin aprueba un pago y confirma
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000019ad', true);
do $$
declare n int; t text;
begin
  insert into public.pagos (reservacion_id, monto, metodo, tipo, estado, registrado_por)
  values (current_setting('prueba.r')::uuid, 600, 'Transferencia', 'anticipo', 'aprobado', auth.uid());
  update public.reservaciones set estado = 'confirmada' where id = current_setting('prueba.r')::uuid;

  select count(*) into n from public.aceptaciones_legales where usuario_id = 'a0000000-0000-4000-8000-0000000019a1';
  if n <> 3 then raise exception 'PRUEBA FALLIDA D01: el admin ve % aceptaciones del cliente (esperado 3)', n; end if;
  raise notice 'D01 ok: el admin ve qué versión de cada documento aceptó el cliente';

  select string_agg(entidad || ':' || accion || coalesce(':' || (cambios -> 'estado' ->> 1), ''), ' | ')
    into t from public.historial_reservacion(current_setting('prueba.r')::uuid);
  if t is null or t not like 'reservaciones:insert:pendiente%' or t not like '%pagos:insert:aprobado%' or t not like '%reservaciones:update:confirmada%' then
    raise exception 'PRUEBA FALLIDA D02: historial %', t;
  end if;
  if exists (select 1 from public.historial_reservacion(current_setting('prueba.r')::uuid) h where h.accion = 'update' and h.cambios is null) then
    raise exception 'PRUEBA FALLIDA D02: el historial incluye cambios irrelevantes';
  end if;
  if not exists (select 1 from public.historial_reservacion(current_setting('prueba.r')::uuid) h where h.quien = 'Admin Historial (admin)') then
    raise exception 'PRUEBA FALLIDA D02: el historial no dice quién hizo el cambio';
  end if;
  raise notice 'D02 ok: el historial muestra creación, pago y confirmación, con quién lo hizo y sin ruido';
end $$;
reset role;

-- Permisos
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000019a2', true);
do $$ begin
  if exists (select 1 from public.aceptaciones_legales where usuario_id = 'a0000000-0000-4000-8000-0000000019a1') then
    raise exception 'PRUEBA FALLIDA D03: un cliente ve las aceptaciones de otro';
  end if;
  begin
    perform * from public.historial_reservacion(current_setting('prueba.r')::uuid);
    raise exception 'PRUEBA FALLIDA D03: un cliente vio el historial';
  exception when insufficient_privilege then null;
  end;
  raise notice 'D03 ok: los clientes no ven aceptaciones ajenas ni el historial';
end $$;
reset role;

do $$ begin raise notice 'Batería 19 completa: 3 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
