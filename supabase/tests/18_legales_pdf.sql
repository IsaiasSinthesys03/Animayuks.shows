-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 18: documentos legales en PDF, historial de versiones y avisos
--
-- Corre dentro de una transacción que se DESHACE al final (rollback).
-- ═════════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000018a1', 'legal1@prueba.invalid', '{"nombre":"Cliente Antiguo"}'),
  ('a0000000-0000-4000-8000-0000000018a2', 'legal2@prueba.invalid', '{"nombre":"Cliente Nuevo"}'),
  ('a0000000-0000-4000-8000-0000000018ad', 'legal.admin@prueba.invalid', '{"nombre":"Admin Legal"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000018ad';

do $$ begin
  if exists (select 1 from public.paginas p where not exists (select 1 from public.paginas_versiones v where v.slug = p.slug and v.version = p.version)) then
    raise exception 'PRUEBA FALLIDA L01: hay documentos sin su versión vigente en el historial';
  end if;
  raise notice 'L01 ok: cada documento tiene su versión vigente en el historial';
end $$;

-- El cliente antiguo acepta las versiones vigentes
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000018a1', true);
do $$ begin
  perform public.aceptar_paginas(array['aviso-de-privacidad', 'terminos', 'politica-de-cancelacion']);
  if exists (select 1 from public.legales_pendientes()) then
    raise exception 'PRUEBA FALLIDA L06: con todo aceptado aún hay pendientes';
  end if;
end $$;
reset role;

-- ── Admin sube y publica un PDF ─────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000018ad', true);
do $$
declare v_antes int; v int;
begin
  select version into v_antes from public.paginas where slug = 'terminos';
  insert into storage.objects (bucket_id, name) values ('legales', 'terminos/20261112-terminos.pdf'), ('legales', 'aviso-de-privacidad/otro.pdf');
  v := public.publicar_pdf_legal('terminos', 'terminos/20261112-terminos.pdf', 'terminos_v2.pdf', 250000);
  if v <> v_antes + 1
     or (select pdf_ruta from public.paginas where slug = 'terminos') <> 'terminos/20261112-terminos.pdf'
     or not exists (select 1 from public.paginas_versiones where slug = 'terminos' and version = v and pdf_nombre = 'terminos_v2.pdf' and publicado_por = auth.uid())
     or (select vigente_desde from public.paginas where slug = 'terminos') < now() - interval '1 minute' then
    raise exception 'PRUEBA FALLIDA L02: publicar no subió la versión o no guardó el historial';
  end if;
  perform set_config('prueba.v', v::text, true);
  raise notice 'L02 ok: publicar un PDF crea la versión %, la guarda en el historial y cambia "vigente desde"', v;

  begin
    perform public.publicar_pdf_legal('terminos', 'aviso-de-privacidad/otro.pdf', 'x.pdf', 10);
    raise exception 'PRUEBA FALLIDA L03: aceptó un PDF de la carpeta de otro documento';
  exception when others then if sqlerrm not like 'PDF_INVALIDO%' then raise; end if;
  end;
  begin
    perform public.publicar_pdf_legal('terminos', 'terminos/no-existe.pdf', 'x.pdf', 10);
    raise exception 'PRUEBA FALLIDA L03: aceptó un PDF que no existe';
  exception when others then if sqlerrm not like 'PDF_INVALIDO%' then raise; end if;
  end;
  insert into storage.objects (bucket_id, name) values ('landing', 'terminos/imagen.pdf');
  begin
    perform public.publicar_pdf_legal('terminos', 'terminos/imagen.pdf', 'x.pdf', 10);
    raise exception 'PRUEBA FALLIDA L03: aceptó un archivo de otro bucket';
  exception when others then if sqlerrm not like 'PDF_INVALIDO%' then raise; end if;
  end;
  raise notice 'L03 ok: rechaza archivos de otro documento, de otro bucket o que no existen';

  -- Editar el resumen de un documento con PDF no crea versión
  update public.paginas set contenido = 'Resumen nuevo de prueba' where slug = 'terminos';
  if (select version from public.paginas where slug = 'terminos') <> v
     or (select contenido from public.paginas_versiones where slug = 'terminos' and version = v) <> 'Resumen nuevo de prueba' then
    raise exception 'PRUEBA FALLIDA L04: editar el resumen cambió la versión o no actualizó el historial';
  end if;
  -- Sin PDF, editar el texto sí crea versión (como antes). Si ya tiene PDF, se le quita dentro de la prueba
  update public.paginas set pdf_ruta = null, pdf_nombre = null, pdf_bytes = null where slug = 'politica-de-cancelacion' and pdf_ruta is not null;
  select version into v_antes from public.paginas where slug = 'politica-de-cancelacion';
  update public.paginas set contenido = contenido || ' (editado)' where slug = 'politica-de-cancelacion';
  if (select version from public.paginas where slug = 'politica-de-cancelacion') <> v_antes + 1 then
    raise exception 'PRUEBA FALLIDA L04: sin PDF, editar el texto no creó versión';
  end if;
  raise notice 'L04 ok: el resumen de un documento con PDF no crea versión; sin PDF el texto sí';
end $$;
reset role;

-- ── Avisos al cliente ───────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000018a1', true);
do $$ begin
  if (select string_agg(slug, ',' order by slug) from public.legales_pendientes()) <> 'politica-de-cancelacion,terminos' then
    raise exception 'PRUEBA FALLIDA L06: pendientes tras publicar: %', (select string_agg(slug, ',' order by slug) from public.legales_pendientes());
  end if;
  perform public.aceptar_paginas(array['terminos', 'politica-de-cancelacion']);
  if not exists (select 1 from public.aceptaciones_legales where usuario_id = auth.uid() and slug = 'terminos' and version = current_setting('prueba.v')::int) then
    raise exception 'PRUEBA FALLIDA L05: no guardó la aceptación de la versión del PDF';
  end if;
  raise notice 'L05 ok: aceptar guarda la versión del PDF vigente';
  if exists (select 1 from public.legales_pendientes()) then
    raise exception 'PRUEBA FALLIDA L06: tras aceptar sigue habiendo pendientes';
  end if;
  raise notice 'L06 ok: tras una versión nueva se pide aceptarla, y al aceptar ya no hay pendientes';

  -- El cliente no publica ni ve conteos; no puede subir archivos
  begin
    perform public.publicar_pdf_legal('terminos', 'terminos/20261112-terminos.pdf', 'x.pdf', 10);
    raise exception 'PRUEBA FALLIDA L08: el cliente publicó un PDF';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.aceptaciones_por_version('terminos');
    raise exception 'PRUEBA FALLIDA L08: el cliente vio los conteos';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('legales', 'terminos/cliente.pdf');
    raise exception 'PRUEBA FALLIDA L10: el cliente subió un archivo legal';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000018a2', true);
do $$ begin
  if exists (select 1 from public.legales_pendientes()) then
    raise exception 'PRUEBA FALLIDA L07: se le piden documentos a quien nunca aceptó ni reservó';
  end if;
  raise notice 'L07 ok: no se le pide nada a quien nunca aceptó ni reservó (se le pide al registrarse o reservar)';
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  if not exists (select 1 from public.paginas_versiones where slug = 'terminos') then
    raise exception 'PRUEBA FALLIDA L08: el visitante no ve el historial de un documento publicado';
  end if;
  begin
    perform * from public.legales_pendientes();
    raise exception 'PRUEBA FALLIDA L08: el visitante llamó legales_pendientes';
  exception when insufficient_privilege then null;
  end;
  raise notice 'L08 ok: el visitante solo lee; el cliente no publica PDF ni ve conteos';
end $$;
reset role;

-- ── Admin: conteos y archivos inmutables ───────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000018ad', true);
do $$
declare n int;
begin
  if (select clientes from public.aceptaciones_por_version('terminos') where version = current_setting('prueba.v')::int) <> 1 then
    raise exception 'PRUEBA FALLIDA L09: conteo de aceptaciones de la versión nueva incorrecto';
  end if;
  raise notice 'L09 ok: el admin ve cuántos clientes aceptaron cada versión';

  update storage.objects set name = 'terminos/cambiado.pdf' where bucket_id = 'legales' and name = 'terminos/20261112-terminos.pdf';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'PRUEBA FALLIDA L10: el admin cambió un PDF publicado'; end if;
  -- En Supabase un borrado directo lanza error; en la base local simplemente no borra nada
  begin
    delete from storage.objects where bucket_id = 'legales' and name = 'terminos/20261112-terminos.pdf';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'PRUEBA FALLIDA L10: el admin borró un PDF publicado'; end if;
  exception when others then
    if sqlerrm like 'PRUEBA FALLIDA%' then raise; end if;
  end;
end $$;
reset role;

do $$ begin
  if not exists (select 1 from storage.objects where bucket_id = 'legales' and name = 'terminos/20261112-terminos.pdf') then
    raise exception 'PRUEBA FALLIDA L10: el PDF publicado desapareció';
  end if;
  raise notice 'L10 ok: solo el admin sube PDF legales, y nadie los cambia ni los borra';
end $$;

do $$ begin raise notice 'Batería 18 completa: 10 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
