-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 02: configuración del negocio, páginas legales, FAQ y comprobantes
-- (migración 4). Se deshace al final con rollback: no deja datos.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000002a1', 'conf.cliente1@prueba.invalid', '{"nombre":"Cliente Conf"}'),
  ('a0000000-0000-4000-8000-0000000002ad', 'conf.admin@prueba.invalid',    '{"nombre":"Admin Conf"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000002ad';

insert into public.paginas (slug, titulo, contenido, publicada)
values ('prueba-borrador', 'Página no publicada', 'Oculta', false);
insert into public.preguntas_frecuentes (pregunta, respuesta, activa) values
  ('¿Pregunta inactiva de prueba?', 'No debe verse', false),
  ('¿Pregunta activa de prueba?', 'Debe verse', true);

-- Reservación del cliente para probar comprobantes
insert into public.zonas (id, nombre, codigos_postales, cargo_traslado, traslado_min)
values ('a0000000-0000-4000-8000-000000000201', 'Zona conf', array['99998'], 0, 0);
insert into public.shows (id, slug, nombre, duracion_min, precio_base)
values ('a0000000-0000-4000-8000-000000000210', 'prueba-conf', 'Show conf', 60, 1000);
insert into public.reservaciones (id, cliente_id, show_id, inicio, fin, bloque, calle, colonia, codigo_postal,
                                  precio_show, total, anticipo_requerido)
select 'a0000000-0000-4000-8000-000000000220', c.id, 'a0000000-0000-4000-8000-000000000210',
       now() + interval '400 days', now() + interval '400 days 1 hour',
       tstzrange(now() + interval '400 days', now() + interval '400 days 1 hour'),
       'Calle', 'Colonia', '99998', 1000, 1000, 300
  from public.clientes c where c.usuario_id = 'a0000000-0000-4000-8000-0000000002a1';

-- ── Visitante ──
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $$ begin
  if (select count(*) from public.configuracion) <> 1 then
    raise exception 'PRUEBA FALLIDA C01: el visitante no lee la configuración';
  end if;
  if (select count(*) from public.paginas where slug in ('aviso-de-privacidad', 'terminos', 'politica-de-cancelacion')) <> 3 then
    raise exception 'PRUEBA FALLIDA C01: faltan páginas legales publicadas';
  end if;
  if exists (select 1 from public.paginas where slug = 'prueba-borrador') then
    raise exception 'PRUEBA FALLIDA C01: el visitante ve una página no publicada';
  end if;
  if exists (select 1 from public.preguntas_frecuentes where not activa) then
    raise exception 'PRUEBA FALLIDA C01: el visitante ve preguntas inactivas';
  end if;
  if not exists (select 1 from public.preguntas_frecuentes where pregunta = '¿Pregunta activa de prueba?') then
    raise exception 'PRUEBA FALLIDA C01: el visitante no ve una pregunta activa';
  end if;
  raise notice 'C01 ok: el visitante lee configuración, páginas publicadas y preguntas activas';
end $$;

do $$ begin
  perform public.aceptar_paginas(array['terminos']);
  raise exception 'PRUEBA FALLIDA C02: el visitante registró una aceptación';
exception when insufficient_privilege then
  raise notice 'C02 ok: el visitante no puede registrar aceptaciones';
end $$;

reset role;

-- ── Cliente ──
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000002a1', true);

do $$
declare n int;
begin
  update public.configuracion set banco = 'Banco falso', clabe = '012345678901234567';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'PRUEBA FALLIDA C03: el cliente cambió los datos bancarios'; end if;
  update public.paginas set contenido = 'Hackeado';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'PRUEBA FALLIDA C03: el cliente editó una página'; end if;
  begin
    insert into public.preguntas_frecuentes (pregunta, respuesta) values ('x', 'y');
    raise exception 'PRUEBA FALLIDA C03: el cliente agregó una pregunta';
  exception when insufficient_privilege then null;
  end;
  raise notice 'C03 ok: el cliente no edita configuración, páginas ni preguntas';
end $$;

do $$
declare n int;
begin
  n := public.aceptar_paginas(array['aviso-de-privacidad', 'terminos', 'prueba-borrador']);
  if n <> 2 then raise exception 'PRUEBA FALLIDA C04: registró % aceptaciones (esperado 2)', n; end if;
  n := public.aceptar_paginas(array['terminos']);
  if n <> 0 then raise exception 'PRUEBA FALLIDA C04: duplicó una aceptación'; end if;
  if (select count(*) from public.aceptaciones_legales) <> 2 then
    raise exception 'PRUEBA FALLIDA C04: el cliente no ve exactamente sus 2 aceptaciones';
  end if;
  raise notice 'C04 ok: el cliente acepta la versión vigente, sin duplicados ni páginas ocultas';
end $$;

do $$ begin
  insert into public.pagos (reservacion_id, monto, metodo, estado, tipo, comprobante_path)
  values ('a0000000-0000-4000-8000-000000000220', 300, 'Transferencia', 'pendiente', 'anticipo',
          'a0000000-0000-4000-8000-0000000002ad/robado.pdf');
  raise exception 'PRUEBA FALLIDA C05: aceptó un comprobante de una carpeta ajena';
exception when insufficient_privilege then
  raise notice 'C05 ok: rechaza comprobantes fuera de la carpeta del cliente';
end $$;

insert into public.pagos (reservacion_id, monto, metodo, estado, tipo, comprobante_path)
values ('a0000000-0000-4000-8000-000000000220', 300, 'Transferencia', 'pendiente', 'anticipo',
        'a0000000-0000-4000-8000-0000000002a1/a0000000-0000-4000-8000-000000000220/comprobante.pdf');
do $$ begin
  if (select count(*) from public.pagos where comprobante_path like 'a0000000-0000-4000-8000-0000000002a1/%') <> 1 then
    raise exception 'PRUEBA FALLIDA C06: no guardó el comprobante en la carpeta propia';
  end if;
  raise notice 'C06 ok: acepta el comprobante en la carpeta del cliente';
end $$;

reset role;

-- ── Administrador ──
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000002ad', true);

do $$
declare v_antes int; v_despues int;
begin
  update public.configuracion
     set banco = 'BBVA', titular_cuenta = 'Animayuks Prueba', clabe = '012180001234567891';
  if (select banco from public.configuracion) <> 'BBVA' then
    raise exception 'PRUEBA FALLIDA C07: el admin no pudo capturar los datos bancarios';
  end if;
  -- Esta prueba mide el texto: si el documento ya tiene PDF, se le quita (dentro de la transacción de prueba)
  update public.paginas set pdf_ruta = null, pdf_nombre = null, pdf_bytes = null where slug = 'terminos' and pdf_ruta is not null;
  select version into v_antes from public.paginas where slug = 'terminos';
  update public.paginas set titulo = 'Términos (título nuevo)' where slug = 'terminos';
  if (select version from public.paginas where slug = 'terminos') <> v_antes then
    raise exception 'PRUEBA FALLIDA C07: cambiar solo el título subió la versión';
  end if;
  update public.paginas set contenido = contenido || E'\n4. Cláusula nueva.' where slug = 'terminos';
  select version into v_despues from public.paginas where slug = 'terminos';
  if v_despues <> v_antes + 1 then
    raise exception 'PRUEBA FALLIDA C07: cambiar el contenido no subió la versión (% → %)', v_antes, v_despues;
  end if;
  if (select count(*) from public.aceptaciones_legales) < 2 then
    raise exception 'PRUEBA FALLIDA C07: el admin no ve las aceptaciones de los clientes';
  end if;
  raise notice 'C07 ok: el admin edita datos bancarios y páginas; la versión sube solo con el contenido';
end $$;

do $$ begin
  update public.configuracion set clabe = '01218000123456789';
  raise exception 'PRUEBA FALLIDA C08: aceptó una CLABE de 17 dígitos';
exception when check_violation then
  begin
    update public.configuracion set clabe = '01218000123456789X';
    raise exception 'PRUEBA FALLIDA C08: aceptó una CLABE con letras';
  exception when check_violation then
    raise notice 'C08 ok: rechaza CLABE inválidas';
  end;
end $$;

do $$ begin
  update public.configuracion set retencion_minutos = 0;
  raise exception 'PRUEBA FALLIDA C09: aceptó una retención de 0 minutos';
exception when check_violation then
  begin
    insert into public.horario_franjas (dia_semana, abre, cierra, modo, intervalo_min) values (3, '08:00', '09:00', 'intervalo', 10);
    raise exception 'PRUEBA FALLIDA C09: aceptó un intervalo de 10 minutos';
  exception when check_violation then
    raise notice 'C09 ok: valida retención e intervalo de horarios';
  end;
end $$;

do $$ begin
  insert into public.pagos (reservacion_id, monto, metodo, tipo, comprobante_path)
  values ('a0000000-0000-4000-8000-000000000220', 100, 'Transferencia', 'abono', 'cualquier/ruta.pdf');
  raise notice 'C10 ok: el admin puede registrar comprobantes en cualquier carpeta';
end $$;

reset role;

do $$ begin raise notice 'Batería 02 completa: 10 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
