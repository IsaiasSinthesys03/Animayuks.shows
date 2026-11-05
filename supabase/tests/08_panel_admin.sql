-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 08: lo que hace el panel y Mis reservaciones contra las tablas
-- Las mismas escrituras que manda el frontend, con el rol real de cada quien.
-- Se deshace al final con rollback: no deja datos.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000008a1', 'panel.cliente@prueba.invalid', '{"nombre":"Cliente Panel"}'),
  ('a0000000-0000-4000-8000-0000000008ad', 'panel.admin@prueba.invalid',   '{"nombre":"Admin Panel"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000008ad';

-- ── Administrador ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000008ad', true);

do $$ begin
  update public.configuracion
     set whatsapp = '523312345678', banco = 'BBVA', titular_cuenta = 'Dueño', clabe = '012180001234567891',
         correo_avisos = 'dueno@prueba.invalid', anticipo_porcentaje = 40, hora_recordatorio = '09:00',
         reservaciones_en_linea = false
   where id = 1;
  if (select whatsapp from public.configuracion) <> '523312345678' then raise exception 'PRUEBA FALLIDA P01: no guardó el WhatsApp'; end if;
  begin
    update public.configuracion set whatsapp = '33-12' where id = 1;
    raise exception 'PRUEBA FALLIDA P01: aceptó un WhatsApp inválido';
  exception when check_violation then null;
  end;
  update public.configuracion set reservaciones_en_linea = true where id = 1;
  raise notice 'P01 ok: el admin captura WhatsApp y datos bancarios; un WhatsApp inválido se rechaza';
end $$;

do $$ begin
  insert into public.horario_servicio (dia_semana, activo, abre, cierra) values (2, false, '11:00', '19:00')
  on conflict (dia_semana) do update set activo = excluded.activo, abre = excluded.abre, cierra = excluded.cierra;
  if (select activo from public.horario_servicio where dia_semana = 2) then raise exception 'PRUEBA FALLIDA P02: no guardó el horario'; end if;
  insert into public.bloqueos (inicio, fin, motivo, creado_por)
  values (now() + interval '500 days', now() + interval '501 days', 'Prueba', auth.uid());
  delete from public.bloqueos where motivo = 'Prueba' and creado_por = auth.uid();
  raise notice 'P02 ok: el admin guarda el horario y crea y borra bloqueos';
end $$;

do $$ begin
  insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min, color)
  values ('a0000000-0000-4000-8000-000000000801', 'Zona panel', array['99991'], 100, 15, '#0369a1');
  update public.zonas set activa = false where id = 'a0000000-0000-4000-8000-000000000801';
  update public.zonas set activa = true, cargo_traslado = 150 where id = 'a0000000-0000-4000-8000-000000000801';
  raise notice 'P03 ok: el admin agrega, edita y desactiva zonas';
end $$;

do $$ begin
  insert into public.categorias (id, nombre) values ('a0000000-0000-4000-8000-000000000802', 'Categoría panel');
  insert into public.shows (id, slug, nombre, categoria_id, duracion_min, precio_base, imagen_principal, galeria)
  values ('a0000000-0000-4000-8000-000000000810', 'show-panel', 'Show panel', 'a0000000-0000-4000-8000-000000000802', 60, 1000, 'show-panel/a.jpg', array['show-panel/b.jpg']);
  insert into public.paquetes (id, show_id, nombre, precio) values
    ('a0000000-0000-4000-8000-000000000820', 'a0000000-0000-4000-8000-000000000810', 'Básico', 1000),
    ('a0000000-0000-4000-8000-000000000821', 'a0000000-0000-4000-8000-000000000810', 'Plus', 1500);
  update public.paquetes set activo = false where id = 'a0000000-0000-4000-8000-000000000821';
  delete from public.paquetes where id = 'a0000000-0000-4000-8000-000000000821';
  insert into public.extras (id, nombre, precio, minutos) values ('a0000000-0000-4000-8000-000000000830', 'Extra panel', 200, 15);
  update public.extras set activo = false where id = 'a0000000-0000-4000-8000-000000000830';
  update public.shows set activo = false, destacado = true where id = 'a0000000-0000-4000-8000-000000000810';
  update public.shows set activo = true where id = 'a0000000-0000-4000-8000-000000000810';
  raise notice 'P04 ok: el admin gestiona shows, paquetes, extras y categorías';
end $$;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('shows', 'show-panel/prueba.jpg');
  raise notice 'P05 ok: el admin sube fotos al bucket de shows';
end $$;

do $$
declare v int;
begin
  update public.paginas set contenido = contenido || E'\n\nCambio de prueba.' where slug = 'terminos';
  insert into public.preguntas_frecuentes (id, pregunta, respuesta) values ('a0000000-0000-4000-8000-000000000840', '¿Prueba?', 'Sí');
  delete from public.preguntas_frecuentes where id = 'a0000000-0000-4000-8000-000000000840';
  raise notice 'P06 ok: el admin edita textos legales y preguntas frecuentes';
end $$;

do $$
declare c uuid;
begin
  insert into public.clientes (nombre, telefono, correo, origen) values ('Cliente presencial', '3300000081', 'presencial.panel@prueba.invalid', 'Presencial') returning id into c;
  update public.clientes set etiquetas = '{VIP}', bloqueado = true, notas = 'Nota' where id = c;
  if (select count(*) from public.clientes where id = c and bloqueado) <> 1 then raise exception 'PRUEBA FALLIDA P07: no guardó la ficha'; end if;
  raise notice 'P07 ok: el admin registra clientes, los etiqueta y los bloquea';
end $$;

-- Reservación para probar pagos, notas y cambios de estado
do $$
declare r public.reservaciones; sab date := (now() at time zone 'America/Mexico_City')::date + 200;
begin
  update public.horario_servicio set activo = true, abre = '09:00', cierra = '22:00';
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000000810', 'a0000000-0000-4000-8000-000000000820',
        (sab + time '12:00') at time zone 'America/Mexico_City', '99991', 'Calle', 'Colonia',
        p_cliente_id => (select id from public.clientes where usuario_id = 'a0000000-0000-4000-8000-0000000008a1'),
        p_canal => 'Teléfono', p_descuento => 50);
  perform set_config('prueba.r', r.id::text, true);
  if r.total <> 1100 or r.canal <> 'Teléfono' then raise exception 'PRUEBA FALLIDA P08: total %, canal %', r.total, r.canal; end if;
  insert into public.notas_reservacion (reservacion_id, texto, autor_id) values (r.id, 'Llevar extensión', auth.uid());
  raise notice 'P08 ok: reservación telefónica con descuento (total 1100) y nota interna';
end $$;
reset role;

-- ── Cliente: sube su comprobante ────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000008a1', true);

do $$ begin
  insert into storage.objects (bucket_id, name) values ('comprobantes', 'a0000000-0000-4000-8000-0000000008a1/r/comprobante.jpg');
  begin
    insert into storage.objects (bucket_id, name) values ('comprobantes', 'a0000000-0000-4000-8000-0000000008ad/r/ajeno.jpg');
    raise exception 'PRUEBA FALLIDA P09: subió a una carpeta ajena';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('shows', 'x/foto.jpg');
    raise exception 'PRUEBA FALLIDA P09: un cliente subió fotos de shows';
  exception when insufficient_privilege then null;
  end;
  insert into public.pagos (reservacion_id, monto, metodo, estado, tipo, comprobante_path)
  values (current_setting('prueba.r')::uuid, 400, 'Transferencia', 'pendiente', 'anticipo',
          'a0000000-0000-4000-8000-0000000008a1/r/comprobante.jpg');
  raise notice 'P09 ok: el cliente sube su comprobante solo a su carpeta y queda por revisar';
end $$;

do $$
declare r record;
begin
  select res.id, s.nombre as show_nombre, p.nombre as paquete, (select count(*) from public.pagos x where x.reservacion_id = res.id) as pagos
    into r
    from public.reservaciones res
    left join public.shows s on s.id = res.show_id
    left join public.paquetes p on p.id = res.paquete_id
   where res.id = current_setting('prueba.r')::uuid;
  if r.show_nombre is null or r.paquete is null or r.pagos <> 1 then
    raise exception 'PRUEBA FALLIDA P10: Mis reservaciones no ve show, paquete o pago (%)', r;
  end if;
  raise notice 'P10 ok: el cliente ve su reservación con show, paquete y pago';
end $$;
reset role;

-- ── Administrador: revisa el comprobante ────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000008ad', true);

do $$
declare e text; pagado numeric;
begin
  if not exists (select 1 from storage.objects where bucket_id = 'comprobantes' and name like 'a0000000-0000-4000-8000-0000000008a1/%') then
    raise exception 'PRUEBA FALLIDA P11: el admin no ve el comprobante';
  end if;
  update public.pagos set estado = 'rechazado', nota = 'Ilegible' where reservacion_id = current_setting('prueba.r')::uuid and estado = 'pendiente';
  select estado, total_pagado into e, pagado from public.reservaciones where id = current_setting('prueba.r')::uuid;
  if e <> 'pendiente' or pagado <> 0 then raise exception 'PRUEBA FALLIDA P11: rechazar cambió la reservación (%, %)', e, pagado; end if;
  insert into public.pagos (reservacion_id, monto, metodo, tipo, estado, registrado_por)
  values (current_setting('prueba.r')::uuid, 440, 'Efectivo', 'anticipo', 'aprobado', auth.uid());
  select estado, total_pagado into e, pagado from public.reservaciones where id = current_setting('prueba.r')::uuid;
  if e <> 'confirmada' or pagado <> 440 then raise exception 'PRUEBA FALLIDA P11: el pago no confirmó (%, %)', e, pagado; end if;
  update public.reservaciones set estado = 'realizada' where id = current_setting('prueba.r')::uuid;
  raise notice 'P11 ok: el admin ve el comprobante, lo rechaza, registra un pago (confirma con 40 %%) y marca realizada';
end $$;
reset role;

-- ── Borrar zonas (migración 12) ─────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000008ad', true);
do $$
declare n int;
begin
  begin
    delete from public.zonas where id = 'a0000000-0000-4000-8000-000000000801';
    raise exception 'PRUEBA FALLIDA P12: borró una zona con reservaciones';
  exception when foreign_key_violation then null;
  end;
  insert into public.zonas (id, nombre, codigos_postales) values ('a0000000-0000-4000-8000-000000000803', 'Zona sin uso', array['99990']);
  delete from public.zonas where id = 'a0000000-0000-4000-8000-000000000803';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'PRUEBA FALLIDA P12: no borró la zona sin reservaciones'; end if;
  raise notice 'P12 ok: el admin borra zonas sin reservaciones; las que tienen reservaciones se protegen';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000008a1', true);
do $$
declare n int;
begin
  delete from public.zonas where nombre = 'Zona panel';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'PRUEBA FALLIDA P13: un cliente borró una zona'; end if;
  raise notice 'P13 ok: un cliente no puede borrar zonas';
end $$;
reset role;

do $$ begin raise notice 'Batería 08 completa. Deshaciendo los datos de prueba...'; end $$;
rollback;
