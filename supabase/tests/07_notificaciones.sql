-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 07: correos de reservación (migración 9)
-- Todo corre dentro de una transacción que se deshace al final: las peticiones
-- a Resend que arma enviar_pendientes() nunca salen (pg_net solo envía lo que
-- se confirma) y no queda ningún dato.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- Los correos reales que estén en cola no se tocan durante la prueba
update public.notificaciones set proximo_intento = now() + interval '1 day' where estado = 'pendiente';

update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, anticipo_porcentaje = 30,
       cancelacion_dias_reembolso = 7, cancelacion_comision_pct = 5, expiracion_pendiente_horas = 24,
       reprogramacion_min_horas = 72, reprogramaciones_max = 1, intervalo_horarios_min = 30,
       reservaciones_en_linea = true, confirmacion_automatica = false, zona_horaria = 'America/Mexico_City',
       banco = 'BBVA', titular_cuenta = 'Animayuks Prueba', clabe = '012180001234567891',
       correo_avisos = 'dueno@prueba.invalid', sitio_url = 'https://animayuks.com'
 where id = 1;
update public.horario_servicio set activo = true, abre = '10:00', cierra = '20:00';

-- Si no existe el secreto (base local), se crea uno falso solo para esta transacción
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'resend_api_key') then
    perform vault.create_secret('re_prueba_falsa', 'resend_api_key', 'solo para pruebas');
  end if;
end $$;

insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min)
values ('a0000000-0000-4000-8000-000000000701', 'Zona correos', array['99992'], 300, 0);
insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base)
values ('a0000000-0000-4000-8000-000000000710', 'prueba-correos', 'Show de correos', 60, 30, 20, 2500);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000007a1', 'correo.cliente1@prueba.invalid', '{"nombre":"<b>Ana</b> López","telefono":"3300000071"}'),
  ('a0000000-0000-4000-8000-0000000007ad', 'correo.admin@prueba.invalid',    '{"nombre":"Admin Correos"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000007ad';

do $$
declare sab date := (now() at time zone 'America/Mexico_City')::date + 9;
begin
  sab := sab + ((6 - extract(dow from sab)::int + 7) % 7);
  while exists (select 1 from public.ocupacion(sab, sab + 7))
        or exists (select 1 from public.retenciones r
                    where r.bloque && tstzrange(sab::timestamp at time zone 'America/Mexico_City',
                                                (sab + 8)::timestamp at time zone 'America/Mexico_City')) loop
    sab := sab + 7;
  end loop;
  perform set_config('prueba.sab', sab::text, true);
end $$;

create function pg_temp.h(dias int, hora text) returns timestamptz language sql stable as $$
  select (current_setting('prueba.sab')::date + dias + hora::time) at time zone 'America/Mexico_City'
$$;
grant execute on function pg_temp.h(int, text) to anon, authenticated;

-- ── N01–N03: reservación en línea ───────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000007a1', true);
select set_config('prueba.r1', (public.crear_reservacion('a0000000-0000-4000-8000-000000000710', null, pg_temp.h(0, '16:00'), '99992', 'Calle Uno 1', 'Centro')).id::text, true);
select set_config('prueba.r2', (public.crear_reservacion('a0000000-0000-4000-8000-000000000710', null, pg_temp.h(0, '12:00'), '99992', 'Calle Dos 2', 'Centro')).id::text, true);
select set_config('prueba.r3', (public.crear_reservacion('a0000000-0000-4000-8000-000000000710', null, pg_temp.h(7, '12:00'), '99992', 'Calle Tres 3', 'Centro')).id::text, true);
reset role;

do $$
declare n record;
begin
  select * into n from public.notificaciones where reservacion_id = current_setting('prueba.r1')::uuid and plantilla = 'reservacion_recibida';
  if n.id is null or n.estado <> 'pendiente' or n.destinatario <> 'correo.cliente1@prueba.invalid' then
    raise exception 'PRUEBA FALLIDA N01: no se encoló el correo al cliente (%)', n;
  end if;
  if not exists (select 1 from public.notificaciones where reservacion_id = current_setting('prueba.r1')::uuid
                    and plantilla = 'aviso_nueva_reservacion' and destinatario = 'dueno@prueba.invalid' and estado = 'pendiente') then
    raise exception 'PRUEBA FALLIDA N01: no se encoló el aviso al dueño';
  end if;
  raise notice 'N01 ok: reservación en línea encola el correo al cliente y el aviso al dueño';

  if n.html not like '%' || (select folio from public.reservaciones where id = current_setting('prueba.r1')::uuid) || '%'
     or n.html not like '%sábado ' || extract(day from current_setting('prueba.sab')::date)::int || ' de %'
     or n.html not like '%4:00 p. m.%'
     or n.html not like '%$2,800.00%'
     or n.html not like '%$840.00%'
     or n.html not like '%012180001234567891%'
     or n.html like '%{{%' then
    raise exception 'PRUEBA FALLIDA N02: el HTML no tiene folio, fecha en español, montos o CLABE';
  end if;
  raise notice 'N02 ok: el correo trae folio, fecha y hora en español, total $2,800.00, anticipo y CLABE';

  if n.html not like '%&lt;b&gt;Ana&lt;/b&gt;%' or n.html like '%<b>Ana</b>%' then
    raise exception 'PRUEBA FALLIDA N03: el nombre con HTML no se escapó';
  end if;
  raise notice 'N03 ok: los datos del cliente se escapan (un nombre con <b> no rompe el correo)';
end $$;

-- ── N04: cliente presencial sin correo ──────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000007ad', true);
select set_config('prueba.r4', (public.crear_reservacion('a0000000-0000-4000-8000-000000000710', null, pg_temp.h(7, '16:00'), '99992', 'Calle Cuatro 4', 'Centro',
       p_cliente => '{"nombre":"Cliente Presencial","telefono":"3300000074"}')).id::text, true);
insert into public.pagos (reservacion_id, monto, metodo, tipo, registrado_por)
values (current_setting('prueba.r4')::uuid, 1000, 'Efectivo', 'anticipo', auth.uid());
reset role;

do $$ begin
  if exists (select 1 from public.notificaciones where reservacion_id = current_setting('prueba.r4')::uuid and plantilla = 'reservacion_recibida') then
    raise exception 'PRUEBA FALLIDA N04: una reservación presencial mandó "recibimos tu reservación"';
  end if;
  if (select estado from public.notificaciones where reservacion_id = current_setting('prueba.r4')::uuid and plantilla = 'pago_recibido') <> 'omitida'
     or (select estado from public.notificaciones where reservacion_id = current_setting('prueba.r4')::uuid and plantilla = 'aviso_nueva_reservacion') <> 'pendiente' then
    raise exception 'PRUEBA FALLIDA N04: sin correo del cliente, su aviso debe quedar omitido y el del dueño pendiente';
  end if;
  raise notice 'N04 ok: cliente sin correo: su recibo queda omitido y el dueño sí recibe el aviso';
end $$;

-- ── N05: pago que cubre el anticipo ─────────────────────────────────────────
insert into public.pagos (reservacion_id, monto, metodo, tipo)
values (current_setting('prueba.r1')::uuid, 840, 'Transferencia', 'anticipo');

do $$
declare h text;
begin
  select html into h from public.notificaciones where reservacion_id = current_setting('prueba.r1')::uuid and plantilla = 'pago_recibido';
  if h is null or h not like '%$840.00%' or h not like '%$1,960.00%' then
    raise exception 'PRUEBA FALLIDA N05: el recibo no muestra el pago y el saldo actualizados';
  end if;
  if not exists (select 1 from public.notificaciones where reservacion_id = current_setting('prueba.r1')::uuid and plantilla = 'reservacion_confirmada') then
    raise exception 'PRUEBA FALLIDA N05: no se encoló la confirmación';
  end if;
  raise notice 'N05 ok: el pago encola el recibo (con saldo $1,960.00) y la confirmación';
end $$;

-- ── N06: cancelación ────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000007a1', true);
select (public.cancelar_reservacion(current_setting('prueba.r1')::uuid, 'Prueba')).monto_reembolsable;
reset role;

do $$ begin
  if not exists (select 1 from public.notificaciones where reservacion_id = current_setting('prueba.r1')::uuid
                    and plantilla = 'reservacion_cancelada' and html like '%$798.00%')
     or not exists (select 1 from public.notificaciones where reservacion_id = current_setting('prueba.r1')::uuid
                    and plantilla = 'aviso_cancelacion' and destinatario = 'dueno@prueba.invalid') then
    raise exception 'PRUEBA FALLIDA N06: faltan los correos de cancelación o el reembolso de $798.00';
  end if;
  raise notice 'N06 ok: cancelar avisa al cliente (reembolso $798.00) y al dueño';
end $$;

-- ── N07: reprogramación ─────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000007a1', true);
select (public.reprogramar_reservacion(current_setting('prueba.r3')::uuid, pg_temp.h(7, '18:00'))).reprogramaciones;
reset role;

do $$ begin
  if not exists (select 1 from public.notificaciones where reservacion_id = current_setting('prueba.r3')::uuid
                    and plantilla = 'reservacion_reprogramada' and html like '%12:00 p. m.%' and html like '%6:00 p. m.%')
     or not exists (select 1 from public.notificaciones where reservacion_id = current_setting('prueba.r3')::uuid
                    and plantilla = 'aviso_reprogramacion') then
    raise exception 'PRUEBA FALLIDA N07: faltan los correos de reprogramación con hora anterior y nueva';
  end if;
  raise notice 'N07 ok: reprogramar avisa a ambos con la fecha anterior y la nueva';
end $$;

-- ── N08: expiración ─────────────────────────────────────────────────────────
update public.reservaciones set expira_en = now() - interval '1 minute' where id = current_setting('prueba.r2')::uuid;
select public.expirar_pendientes() >= 1 as expiradas;

do $$ begin
  if not exists (select 1 from public.notificaciones where reservacion_id = current_setting('prueba.r2')::uuid and plantilla = 'reservacion_expirada') then
    raise exception 'PRUEBA FALLIDA N08: no se encoló el aviso de expiración';
  end if;
  raise notice 'N08 ok: expirar encola el aviso al cliente';
end $$;

-- ── N09: sin duplicados ─────────────────────────────────────────────────────
do $$
declare antes int; id_nuevo bigint;
begin
  select count(*) into antes from public.notificaciones;
  id_nuevo := public.encolar_correo('reservacion_recibida', current_setting('prueba.r1')::uuid);
  if id_nuevo is not null or (select count(*) from public.notificaciones) <> antes then
    raise exception 'PRUEBA FALLIDA N09: se duplicó un correo';
  end if;
  raise notice 'N09 ok: el mismo aviso no se encola dos veces';
end $$;

-- ── N10: envío ──────────────────────────────────────────────────────────────
do $$
declare enviados int; esperados int; sin_peticion int;
begin
  select count(*) into esperados from public.notificaciones
   where estado = 'pendiente' and proximo_intento <= now();
  enviados := public.enviar_pendientes(100);
  select count(*) into sin_peticion from public.notificaciones n
   where n.estado = 'enviando' and not exists (select 1 from net.http_request_queue q where q.id = n.request_id
                                                 and q.url = 'https://api.resend.com/emails');
  if enviados <> esperados or enviados = 0 or sin_peticion <> 0
     or exists (select 1 from public.notificaciones where estado = 'omitida' and request_id is not null) then
    raise exception 'PRUEBA FALLIDA N10: enviados %, esperados %, sin petición %', enviados, esperados, sin_peticion;
  end if;
  raise notice 'N10 ok: % correos pasan a "enviando" con su petición a Resend; los omitidos no se envían', enviados;
end $$;

-- ── N11: respuestas de Resend (simuladas) ───────────────────────────────────
do $$
declare
  ids bigint[];
  n record;
begin
  if not has_table_privilege('net._http_response', 'insert') then
    raise notice 'N11 omitida: en este entorno no se pueden simular respuestas de pg_net';
    return;
  end if;
  select array_agg(id order by id) into ids from (select id from public.notificaciones where estado = 'enviando' order by id limit 4) x;

  insert into net._http_response (id, status_code, content, timed_out)
  select x.request_id, v.codigo, v.contenido, false
    from public.notificaciones x
    join (values (1, 200, '{"id":"ok"}'), (2, 500, 'error interno'), (3, 422, 'correo inválido')) as v(pos, codigo, contenido)
      on x.id = ids[v.pos];
  update public.notificaciones set enviando_desde = now() - interval '6 minutes' where id = ids[4];

  perform public.revisar_envios();

  select * into n from public.notificaciones where id = ids[1];
  if n.estado <> 'enviada' or n.enviado_en is null then raise exception 'PRUEBA FALLIDA N11: 200 no quedó enviada'; end if;
  select * into n from public.notificaciones where id = ids[2];
  if n.estado <> 'pendiente' or n.proximo_intento <> now() + interval '1 minute' or n.error not like '500%' then
    raise exception 'PRUEBA FALLIDA N11: 500 debía reintentarse en 1 min (%, %)', n.estado, n.proximo_intento - now();
  end if;
  select * into n from public.notificaciones where id = ids[3];
  if n.estado <> 'fallida' then raise exception 'PRUEBA FALLIDA N11: 422 debía quedar fallida sin reintentos'; end if;
  select * into n from public.notificaciones where id = ids[4];
  if n.estado <> 'pendiente' or n.error not like 'sin respuesta%' then
    raise exception 'PRUEBA FALLIDA N11: sin respuesta en 5 min debía reintentarse';
  end if;

  -- Tercer fallo seguido: queda fallida
  update public.notificaciones set intentos = 3, estado = 'enviando', request_id = -1, enviando_desde = now() - interval '6 minutes' where id = ids[2];
  perform public.revisar_envios();
  if (select estado from public.notificaciones where id = ids[2]) <> 'fallida' then
    raise exception 'PRUEBA FALLIDA N11: al tercer intento debía quedar fallida';
  end if;
  raise notice 'N11 ok: 200 → enviada; 500 o sin respuesta → reintento en 1 min; 422 o tercer fallo → fallida';
end $$;

-- ── N12: recordatorio y resumen diario ──────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000007ad', true);
-- Reservaciones forzadas a las 21:30 (fuera de horario) pasado mañana y mañana
select set_config('prueba.r5', (public.crear_reservacion('a0000000-0000-4000-8000-000000000710', null,
       (((now() at time zone 'America/Mexico_City')::date + 2) + time '21:30') at time zone 'America/Mexico_City',
       '99992', 'Calle Cinco 5', 'Centro', p_cliente_id => (select id from public.clientes where usuario_id = 'a0000000-0000-4000-8000-0000000007a1'),
       p_forzar => true, p_motivo => 'Prueba de recordatorio')).id::text, true);
select set_config('prueba.r6', (public.crear_reservacion('a0000000-0000-4000-8000-000000000710', null,
       (((now() at time zone 'America/Mexico_City')::date + 1) + time '21:30') at time zone 'America/Mexico_City',
       '99992', 'Calle Seis 6', 'Centro', p_cliente_id => (select id from public.clientes where usuario_id = 'a0000000-0000-4000-8000-0000000007a1'),
       p_forzar => true, p_motivo => 'Prueba de resumen')).id::text, true);
insert into public.pagos (reservacion_id, monto, metodo, tipo, registrado_por)
select id, anticipo_requerido, 'Efectivo', 'anticipo', auth.uid() from public.reservaciones where id = current_setting('prueba.r5')::uuid;
reset role;

do $$
declare n int; h text;
begin
  n := public.encolar_recordatorios(true);
  if not exists (select 1 from public.notificaciones where reservacion_id = current_setting('prueba.r5')::uuid and plantilla = 'recordatorio')
     or exists (select 1 from public.notificaciones where reservacion_id = current_setting('prueba.r6')::uuid and plantilla = 'recordatorio') then
    raise exception 'PRUEBA FALLIDA N12: el recordatorio debe salir solo para la confirmada de pasado mañana';
  end if;
  if public.encolar_recordatorios(true) <> 0 then
    raise exception 'PRUEBA FALLIDA N12: el recordatorio se duplicó';
  end if;

  if public.encolar_resumen_diario(true) < 1 then
    raise exception 'PRUEBA FALLIDA N12: el resumen no encontró las funciones de mañana';
  end if;
  select html into h from public.notificaciones
   where plantilla = 'resumen_diario' and clave = ((now() at time zone 'America/Mexico_City')::date + 1)::text;
  if h is null or h not like '%' || (select folio from public.reservaciones where id = current_setting('prueba.r6')::uuid) || '%'
     or h not like '%9:30 p. m.%' or h not like '%/admin/agenda%' then
    raise exception 'PRUEBA FALLIDA N12: el resumen no lista la función de mañana con hora y enlace a la agenda';
  end if;
  raise notice 'N12 ok: recordatorio solo a confirmadas de pasado mañana, sin duplicar; resumen al dueño con las de mañana';
end $$;

-- ── N13: permisos ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000007a1', true);
do $$ begin
  if exists (select 1 from public.notificaciones) or exists (select 1 from public.plantillas_correo) then
    raise exception 'PRUEBA FALLIDA N13: un cliente lee la bandeja de salida o las plantillas';
  end if;
  begin
    perform public.enviar_pendientes();
    raise exception 'PRUEBA FALLIDA N13: un cliente ejecutó enviar_pendientes()';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.reintentar_correo(1);
    raise exception 'PRUEBA FALLIDA N13: un cliente reintentó un correo';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000007ad', true);
do $$
declare fallida bigint;
begin
  if (select count(*) from public.plantillas_correo) <> 13 then
    raise exception 'PRUEBA FALLIDA N13: el admin no ve las 13 plantillas';
  end if;
  select id into fallida from public.notificaciones where estado = 'fallida' and destinatario is not null limit 1;
  if fallida is not null and not public.reintentar_correo(fallida) then
    raise exception 'PRUEBA FALLIDA N13: el admin no pudo reintentar un correo fallido';
  end if;
  raise notice 'N13 ok: solo el admin ve la bandeja y las plantillas, y puede reintentar correos';
end $$;
reset role;

do $$ begin raise notice 'Batería 07 completa. Deshaciendo los datos de prueba (ningún correo sale)...'; end $$;
rollback;
