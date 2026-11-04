-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 01: reglas de negocio, permisos (RLS) y funciones de reservación
--
-- Corre dentro de una transacción que se DESHACE al final (rollback): crea sus
-- propios usuarios, show, zona y horario, prueba todo y no deja nada en la base.
-- Sirve igual con psql o pegado en el SQL Editor.
-- Si una prueba falla, se detiene con "PRUEBA FALLIDA ..." y también se deshace.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── Datos de prueba (solo existen dentro de esta transacción) ────────────────

-- Reglas conocidas para que las pruebas no dependan de la configuración real
update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, anticipo_porcentaje = 30,
       cancelacion_dias_reembolso = 7, cancelacion_comision_pct = 5,
       confirmacion_automatica = false, reservaciones_en_linea = true,
       zona_horaria = 'America/Mexico_City'
 where id = 1;
update public.horario_servicio set activo = (dia_semana <> 1), abre = '09:00', cierra = '22:00';

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

do $$ begin
  if (select count(*) from public.clientes where usuario_id::text like 'a0000000-%') <> 3 then
    raise exception 'PRUEBA FALLIDA T01: el trigger no creó las fichas de cliente';
  end if;
  raise notice 'T01 ok: el registro crea perfil y ficha de cliente';
end $$;

-- ── Visitante sin cuenta ────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $$ begin
  if exists (select 1 from public.shows where slug = 'prueba-show-oculto') then
    raise exception 'PRUEBA FALLIDA T02: el visitante ve un show oculto';
  end if;
  if not exists (select 1 from public.shows where slug = 'prueba-show-activo') then
    raise exception 'PRUEBA FALLIDA T02: el visitante no ve un show activo';
  end if;
  raise notice 'T02 ok: el visitante ve solo shows activos';
end $$;

do $$ begin
  if (public.zona_por_cp('99999')).nombre is distinct from 'Zona de prueba' then
    raise exception 'PRUEBA FALLIDA T03: 99999 debería caer en la zona de prueba';
  end if;
  if (public.zona_por_cp('00001')).id is not null then
    raise exception 'PRUEBA FALLIDA T03: 00001 no debería tener cobertura';
  end if;
  raise notice 'T03 ok: zona_por_cp distingue cobertura';
end $$;

do $$ begin
  perform 1 from public.reservaciones;
  raise exception 'PRUEBA FALLIDA T04: el visitante pudo leer reservaciones';
exception when insufficient_privilege then
  raise notice 'T04 ok: el visitante no puede leer reservaciones';
end $$;

do $$ begin
  perform 1 from public.clientes;
  raise exception 'PRUEBA FALLIDA T05: el visitante pudo leer clientes';
exception when insufficient_privilege then
  raise notice 'T05 ok: el visitante no puede leer clientes';
end $$;

do $$ begin
  perform public.crear_reservacion('a0000000-0000-4000-8000-000000000010', null,
          current_setting('prueba.sab16')::timestamptz, '99999', 'Calle', 'Colonia');
  raise exception 'PRUEBA FALLIDA T06: el visitante pudo reservar';
exception when insufficient_privilege then
  raise notice 'T06 ok: el visitante no puede reservar sin cuenta';
end $$;

reset role;

-- ── Cliente 1 ───────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000000a1', true);

do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion(
    'a0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000020',
    current_setting('prueba.sab16')::timestamptz, '99999', 'Calle 1', 'Colonia 1', null,
    array['a0000000-0000-4000-8000-000000000030']::uuid[],
    '{"tipo_evento":"Cumpleaños","asistentes":"30"}');
  -- 2000 paquete + 500 extra + 300 traslado = 2800; anticipo 30 % = 840; 90 + 30 min
  if r.total <> 2800 or r.anticipo_requerido <> 840 or r.estado <> 'pendiente'
     or r.fin - r.inicio <> interval '120 minutes' or r.canal <> 'En línea' or r.expira_en is null
     or lower(r.bloque) <> r.inicio - interval '60 minutes' or upper(r.bloque) <> r.fin + interval '50 minutes' then
    raise exception 'PRUEBA FALLIDA T07: valores inesperados (total %, anticipo %, estado %, duración %)',
      r.total, r.anticipo_requerido, r.estado, r.fin - r.inicio;
  end if;
  perform set_config('prueba.res1', r.id::text, true);
  raise notice 'T07 ok: reservación válida con precio, duración y bloque correctos (%)', r.folio;
end $$;

do $$ begin
  perform public.crear_reservacion('a0000000-0000-4000-8000-000000000010', null,
          current_setting('prueba.sab1830')::timestamptz, '99999', 'Calle 2', 'Colonia 2');
  raise exception 'PRUEBA FALLIDA T08: permitió dos reservaciones traslapadas';
exception when exclusion_violation then
  raise notice 'T08 ok: rechaza el traslape (montaje + traslado incluidos)';
end $$;

do $$ begin
  perform public.crear_reservacion('a0000000-0000-4000-8000-000000000010', null,
          current_setting('prueba.sab2_12')::timestamptz, '00001', 'Calle', 'Colonia');
  raise exception 'PRUEBA FALLIDA T09: aceptó un código postal sin cobertura';
exception when raise_exception then
  if sqlerrm not like 'FUERA_DE_COBERTURA%' then raise; end if;
  raise notice 'T09 ok: rechaza fuera de cobertura';
end $$;

do $$ begin
  perform public.crear_reservacion('a0000000-0000-4000-8000-000000000010', null,
          now() + interval '20 hours', '99999', 'Calle', 'Colonia');
  raise exception 'PRUEBA FALLIDA T10: aceptó menos de 48 h de anticipación';
exception when raise_exception then
  if sqlerrm not like 'ANTICIPACION%' then raise; end if;
  raise notice 'T10 ok: exige 48 h de anticipación';
end $$;

do $$ begin
  perform public.crear_reservacion('a0000000-0000-4000-8000-000000000010', null,
          current_setting('prueba.lun12')::timestamptz, '99999', 'Calle', 'Colonia');
  raise exception 'PRUEBA FALLIDA T11: aceptó un día sin servicio';
exception when raise_exception then
  if sqlerrm not like 'FUERA_DE_HORARIO%' then raise; end if;
  raise notice 'T11 ok: rechaza días sin servicio';
end $$;

do $$ begin
  perform public.crear_reservacion('a0000000-0000-4000-8000-000000000011', null,
          current_setting('prueba.sab2_12')::timestamptz, '99999', 'Calle', 'Colonia');
  raise exception 'PRUEBA FALLIDA T12: reservó un show oculto';
exception when raise_exception then
  if sqlerrm not like 'SHOW_NO_DISPONIBLE%' then raise; end if;
  raise notice 'T12 ok: no se reservan shows ocultos';
end $$;

do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000000010', null,
         current_setting('prueba.sab2_12')::timestamptz, '99999', 'Calle 3', 'Colonia 3');
  if r.total <> 1300 then raise exception 'PRUEBA FALLIDA T13: total % (esperado 1300)', r.total; end if;
  raise notice 'T13 ok: segunda reservación en otro día, sin paquete (total 1300)';
end $$;

do $$ begin
  if (select count(*) from public.reservaciones) <> 2 then
    raise exception 'PRUEBA FALLIDA T14: el cliente ve % reservaciones (esperado 2)', (select count(*) from public.reservaciones);
  end if;
  raise notice 'T14 ok: el cliente ve solo sus reservaciones';
end $$;

do $$
declare n int;
begin
  update public.reservaciones set total = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'PRUEBA FALLIDA T15: el cliente modificó el precio'; end if;
  update public.perfiles set rol = 'admin';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'PRUEBA FALLIDA T15: el cliente se hizo admin'; end if;
  raise notice 'T15 ok: el cliente no cambia precios ni su rol';
end $$;

do $$
declare n int;
begin
  update public.clientes set nombre = 'Cliente Uno Editado';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'PRUEBA FALLIDA T16: el cliente no pudo editar su nombre'; end if;
  begin
    update public.clientes set bloqueado = false, etiquetas = '{VIP}';
    raise exception 'PRUEBA FALLIDA T16: el cliente editó campos protegidos';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T16 ok: el cliente edita su nombre pero no campos protegidos';
end $$;

do $$ begin
  insert into public.pagos (reservacion_id, monto, metodo, estado)
  select id, 99999, 'Efectivo', 'aprobado' from public.reservaciones limit 1;
  raise exception 'PRUEBA FALLIDA T17: el cliente se aprobó un pago';
exception when insufficient_privilege then
  raise notice 'T17 ok: el cliente no puede aprobar pagos';
end $$;

insert into public.pagos (reservacion_id, monto, metodo, estado, tipo)
select id, 500, 'Transferencia', 'pendiente', 'anticipo'
  from public.reservaciones where inicio = current_setting('prueba.sab16')::timestamptz;

do $$ begin
  if (select count(*) from public.pagos) <> 1 then raise exception 'PRUEBA FALLIDA T18: no quedó el aviso de transferencia'; end if;
  if (select count(*) from public.ocupacion((current_setting('prueba.sab16')::timestamptz at time zone 'America/Mexico_City')::date,
                                            (current_setting('prueba.sab2_12')::timestamptz at time zone 'America/Mexico_City')::date)) < 2 then
    raise exception 'PRUEBA FALLIDA T18: ocupacion() no devuelve los bloques';
  end if;
  raise notice 'T18 ok: el cliente avisa una transferencia y ocupacion() muestra los horarios';
end $$;

reset role;

-- ── Cliente 2 no ve lo del cliente 1 ────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000000a2', true);

do $$ begin
  if (select count(*) from public.reservaciones) <> 0 or (select count(*) from public.pagos) <> 0
     or (select count(*) from public.clientes) <> 1 then
    raise exception 'PRUEBA FALLIDA T19: el cliente 2 ve datos ajenos';
  end if;
  raise notice 'T19 ok: el cliente 2 no ve reservaciones, pagos ni fichas ajenas';
end $$;

do $$ begin
  perform public.cancelar_reservacion(current_setting('prueba.res1')::uuid);
  raise exception 'PRUEBA FALLIDA T20: el cliente 2 canceló algo ajeno';
exception when insufficient_privilege then
  raise notice 'T20 ok: no se pueden cancelar reservaciones ajenas';
end $$;

reset role;

-- ── Administrador ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000000ad', true);

do $$ begin
  if (select count(*) from public.reservaciones r join public.clientes c on c.id = r.cliente_id
       where c.usuario_id::text like 'a0000000-%') <> 2 then
    raise exception 'PRUEBA FALLIDA T21: el admin no ve todas las reservaciones';
  end if;
  raise notice 'T21 ok: el admin ve todas las reservaciones';
end $$;

do $$ begin
  perform public.crear_reservacion('a0000000-0000-4000-8000-000000000010', null,
          current_setting('prueba.dom12')::timestamptz, '00001', 'Calle 4', 'Colonia 4',
          p_cliente => '{"nombre":"Cliente presencial","telefono":"3300000009"}', p_forzar => true);
  raise exception 'PRUEBA FALLIDA T22: forzó una excepción sin motivo';
exception when raise_exception then
  if sqlerrm not like 'MOTIVO_REQUERIDO%' then raise; end if;
  raise notice 'T22 ok: forzar una excepción exige motivo';
end $$;

do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000000010', null,
         current_setting('prueba.dom12')::timestamptz, '00001', 'Calle 4', 'Colonia 4',
         p_cliente => '{"nombre":"Cliente presencial","telefono":"3300000009"}', p_forzar => true,
         p_motivo => 'Acepta pagar traslado aparte', p_descuento => 100);
  if r.canal <> 'Presencial' or r.motivo_excepcion not like 'fuera de cobertura%' or r.total <> 900 then
    raise exception 'PRUEBA FALLIDA T23: canal %, motivo %, total %', r.canal, r.motivo_excepcion, r.total;
  end if;
  raise notice 'T23 ok: reservación presencial con excepción, motivo y descuento';
end $$;

update public.pagos p set estado = 'aprobado'
  from public.reservaciones r
 where r.id = p.reservacion_id and r.inicio = current_setting('prueba.sab16')::timestamptz and p.estado = 'pendiente';
insert into public.pagos (reservacion_id, monto, metodo, tipo, registrado_por)
select id, anticipo_requerido - 500, 'Efectivo', 'anticipo', auth.uid()
  from public.reservaciones where inicio = current_setting('prueba.sab16')::timestamptz;

do $$
declare r public.reservaciones;
begin
  select * into r from public.reservaciones where inicio = current_setting('prueba.sab16')::timestamptz;
  if r.estado <> 'confirmada' or r.total_pagado <> r.anticipo_requerido or r.expira_en is not null then
    raise exception 'PRUEBA FALLIDA T24: estado %, pagado %', r.estado, r.total_pagado;
  end if;
  if (select count(*) from public.bitacora where entidad = 'pagos' and entidad_id in (select id::text from public.pagos where reservacion_id = r.id)) < 2 then
    raise exception 'PRUEBA FALLIDA T24: la bitácora no registró los pagos';
  end if;
  raise notice 'T24 ok: el anticipo cubierto confirma la reservación y queda en bitácora';
end $$;

reset role;

-- ── Cancelación por el cliente 1 ────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000000a1', true);

do $$
declare
  rid uuid;
  pagado numeric;
  c record;
begin
  select id, total_pagado into rid, pagado from public.reservaciones where inicio = current_setting('prueba.sab16')::timestamptz;
  select * into c from public.cancelar_reservacion(rid, 'Cambió la fecha');
  if c.monto_reembolsable <> round(pagado * 0.95, 2) then
    raise exception 'PRUEBA FALLIDA T25: reembolso % (esperado %)', c.monto_reembolsable, round(pagado * 0.95, 2);
  end if;
  raise notice 'T25 ok: cancelación con más de 7 días reembolsa 95 %% (%)', c.monto_reembolsable;
end $$;

do $$
declare r public.reservaciones;
begin
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000000010', null,
         current_setting('prueba.sab16')::timestamptz, '99999', 'Calle 5', 'Colonia 5');
  raise notice 'T26 ok: el horario cancelado queda libre otra vez (%)', r.folio;
end $$;

reset role;

-- ── Fin: se deshace todo lo que hizo la batería ─────────────────────────────
do $$ begin raise notice 'Batería 01 completa: 26 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
