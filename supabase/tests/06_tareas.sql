-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 06: tareas programadas (migración 8)
-- Ejecuta las funciones a mano (no espera al cron). Se deshace al final con rollback.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, anticipo_porcentaje = 30,
       expiracion_pendiente_horas = 24, intervalo_horarios_min = 30, reservaciones_en_linea = true,
       zona_horaria = 'America/Mexico_City'
 where id = 1;
update public.horario_servicio set activo = true, abre = '10:00', cierra = '20:00';

insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min)
values ('a0000000-0000-4000-8000-000000000601', 'Zona tareas', array['99993'], 0, 0);
insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base)
values ('a0000000-0000-4000-8000-000000000610', 'prueba-tareas', 'Show tareas', 60, 30, 20, 1000);
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000006a1', 'tar.cliente1@prueba.invalid', '{"nombre":"Cliente Uno"}'),
  ('a0000000-0000-4000-8000-0000000006a2', 'tar.cliente2@prueba.invalid', '{"nombre":"Cliente Dos"}');

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
end $$;

create function pg_temp.h(hora text) returns timestamptz language sql stable as $$
  select (current_setting('prueba.sab')::date + hora::time) at time zone 'America/Mexico_City'
$$;
grant execute on function pg_temp.h(text) to anon, authenticated;

-- Dos pendientes del cliente 1: la de las 12:00 sin pago y la de las 16:00 con anticipo pagado
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000006a1', true);
select set_config('prueba.sin_pago', (public.crear_reservacion('a0000000-0000-4000-8000-000000000610', null, pg_temp.h('12:00'), '99993', 'Calle', 'Colonia')).id::text, true);
select set_config('prueba.pagada',   (public.crear_reservacion('a0000000-0000-4000-8000-000000000610', null, pg_temp.h('16:00'), '99993', 'Calle', 'Colonia')).id::text, true);
reset role;

insert into public.pagos (reservacion_id, monto, metodo, tipo)
select id, anticipo_requerido, 'Efectivo', 'anticipo' from public.reservaciones where id = current_setting('prueba.pagada')::uuid;

-- El plazo de ambas se vence (en la vida real pasan 24 h)
update public.reservaciones set expira_en = now() - interval '1 minute'
 where id in (current_setting('prueba.sin_pago')::uuid, current_setting('prueba.pagada')::uuid);

do $$
declare n int; e1 text; e2 text;
begin
  if exists (select 1 from public.horarios_disponibles('a0000000-0000-4000-8000-000000000610', null, '{}', '99993',
                                                       current_setting('prueba.sab')::date) where inicio = pg_temp.h('12:00')) then
    raise exception 'PRUEBA FALLIDA X01: el horario de la pendiente se ofrecía antes de expirar';
  end if;
  n := public.expirar_pendientes();
  select estado into e1 from public.reservaciones where id = current_setting('prueba.sin_pago')::uuid;
  select estado into e2 from public.reservaciones where id = current_setting('prueba.pagada')::uuid;
  if e1 <> 'expirada' or e2 <> 'confirmada' or n < 1 then
    raise exception 'PRUEBA FALLIDA X01: sin pago %, pagada %, expiradas %', e1, e2, n;
  end if;
  raise notice 'X01 ok: expira la pendiente sin anticipo y respeta la que ya pagó';
end $$;

do $$ begin
  if not exists (select 1 from public.horarios_disponibles('a0000000-0000-4000-8000-000000000610', null, '{}', '99993',
                                                           current_setting('prueba.sab')::date) where inicio = pg_temp.h('12:00')) then
    raise exception 'PRUEBA FALLIDA X02: el horario no se liberó al expirar';
  end if;
  raise notice 'X02 ok: al expirar, el horario vuelve a ofrecerse';
end $$;

-- Retenciones: una vencida (cliente 1) y una vigente (cliente 2)
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000006a1', true);
select (public.apartar_horario('a0000000-0000-4000-8000-000000000610', null, '{}', '99993', pg_temp.h('10:00'))).id is not null as apartado;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000006a2', true);
select (public.apartar_horario('a0000000-0000-4000-8000-000000000610', null, '{}', '99993', pg_temp.h('18:00'))).id is not null as apartado;
reset role;
update public.retenciones set expira_en = now() - interval '1 minute'
 where usuario_id = 'a0000000-0000-4000-8000-0000000006a1';

do $$
declare n int;
begin
  n := public.limpiar_retenciones();
  if exists (select 1 from public.retenciones where usuario_id = 'a0000000-0000-4000-8000-0000000006a1')
     or not exists (select 1 from public.retenciones where usuario_id = 'a0000000-0000-4000-8000-0000000006a2')
     or n < 1 then
    raise exception 'PRUEBA FALLIDA X03: no limpió solo las retenciones vencidas';
  end if;
  raise notice 'X03 ok: limpia los apartados vencidos y deja los vigentes';
end $$;

do $$ begin
  if (select count(*) from cron.job
       where jobname in ('ay-expirar-pendientes', 'ay-limpiar-retenciones') and active) <> 2 then
    raise exception 'PRUEBA FALLIDA X04: faltan trabajos de cron activos';
  end if;
  raise notice 'X04 ok: los dos trabajos de cron existen y están activos';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000006a1', true);
do $$ begin
  perform public.expirar_pendientes();
  raise exception 'PRUEBA FALLIDA X05: un cliente ejecutó expirar_pendientes()';
exception when insufficient_privilege then
  begin
    perform public.limpiar_retenciones();
    raise exception 'PRUEBA FALLIDA X05: un cliente ejecutó limpiar_retenciones()';
  exception when insufficient_privilege then
    raise notice 'X05 ok: los clientes no ejecutan las tareas programadas';
  end;
end $$;
reset role;

do $$ begin raise notice 'Batería 06 completa: 5 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
