-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 10: página de inicio (migración 15)
-- Permisos, vigencia y validaciones. Se deshace al final con rollback.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000aa1', 'landing.cliente@prueba.invalid', '{"nombre":"Cliente Landing"}'),
  ('a0000000-0000-4000-8000-000000000aad', 'landing.admin@prueba.invalid',   '{"nombre":"Admin Landing"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-000000000aad';

delete from public.landing_banners;
delete from public.landing_videos;

insert into public.landing_banners (id, titulo, activo, inicia_en, termina_en, orden) values
  ('a0000000-0000-4000-8000-000000000a01', 'Vigente',  true,  null, null, 1),
  ('a0000000-0000-4000-8000-000000000a02', 'Apagado',  false, null, null, 2),
  ('a0000000-0000-4000-8000-000000000a03', 'Futuro',   true,  now() + interval '1 day', null, 3),
  ('a0000000-0000-4000-8000-000000000a04', 'Vencido',  true,  now() - interval '2 days', now() - interval '1 day', 4);
insert into public.landing_videos (id, titulo, youtube_id, activo) values
  ('a0000000-0000-4000-8000-000000000a11', 'Activo',  'aaaaaaaaaaa', true),
  ('a0000000-0000-4000-8000-000000000a12', 'Apagado', 'bbbbbbbbbbb', false);

-- ── Validaciones ────────────────────────────────────────────────────────────
do $$
declare malo text;
begin
  foreach malo in array array['javascript:alert(1)', 'http://sitio.com', '//sitio.com', 'data:text/html,x', '/\sitio.com'] loop
    begin
      insert into public.landing_banners (titulo, enlace) values ('x', malo);
      raise exception 'PRUEBA FALLIDA L01: aceptó el enlace %', malo;
    exception when check_violation then null;
    end;
  end loop;
  insert into public.landing_banners (titulo, enlace) values ('ok', '/shows'), ('ok', 'https://animayuks.com/x'), ('ok', null);
  raise notice 'L01 ok: solo acepta rutas internas o https';

  foreach malo in array array['https://otro.com/landing/banners/a.mp4', 'https://media.animayuks.com/gallery/a.mp4', 'https://media.animayuks.com/landing/banners/a/../b.mp4'] loop
    begin
      insert into public.landing_banners (titulo, video_url) values ('x', malo);
      raise exception 'PRUEBA FALLIDA L02: aceptó el video %', malo;
    exception when check_violation then null;
    end;
  end loop;
  insert into public.landing_banners (titulo, video_url) values ('ok', 'https://media.animayuks.com/landing/banners/a-1.mp4');
  raise notice 'L02 ok: los videos solo vienen de nuestra carpeta en R2';

  begin
    insert into public.landing_banners (titulo, color) values ('x', 'rojo');
    raise exception 'PRUEBA FALLIDA L03: aceptó un color inválido';
  exception when check_violation then null;
  end;
  begin
    insert into public.landing_banners (titulo, inicia_en, termina_en) values ('x', now(), now() - interval '1 hour');
    raise exception 'PRUEBA FALLIDA L03: aceptó fechas invertidas';
  exception when check_violation then null;
  end;
  begin
    insert into public.landing_videos (titulo, youtube_id) values ('x', 'corto');
    raise exception 'PRUEBA FALLIDA L03: aceptó un ID de YouTube inválido';
  exception when check_violation then null;
  end;
  begin
    insert into public.landing_contenido (id, portada_titulo, cobertura_titulo, pasos_titulo, pasos, shows_titulo, personajes_titulo, videos_titulo)
    values (2, 'x', 'x', 'x', '[1,2,3,4]', 'x', 'x', 'x');
    raise exception 'PRUEBA FALLIDA L03: aceptó una segunda fila de textos';
  exception when check_violation then null;
  end;
  raise notice 'L03 ok: rechaza color, fechas, ID de YouTube y una segunda fila de textos';
end $$;

delete from public.landing_banners where titulo = 'ok';

-- ── Visitante ───────────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $$
declare n int;
begin
  if (select string_agg(titulo, ',') from public.landing_banners) is distinct from 'Vigente' then
    raise exception 'PRUEBA FALLIDA L04: el visitante ve banners no vigentes';
  end if;
  if (select string_agg(titulo, ',') from public.landing_videos) is distinct from 'Activo' then
    raise exception 'PRUEBA FALLIDA L04: el visitante ve videos apagados';
  end if;
  if (select count(*) from public.landing_contenido) <> 1 then
    raise exception 'PRUEBA FALLIDA L04: el visitante no lee los textos';
  end if;
  raise notice 'L04 ok: el visitante solo ve lo vigente y activo';

  begin
    update public.landing_contenido set shows_titulo = 'Hackeado';
    raise exception 'PRUEBA FALLIDA L05: el visitante editó textos';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.landing_banners (titulo) values ('x');
    raise exception 'PRUEBA FALLIDA L05: el visitante creó un banner';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.reordenar_banners(array[]::uuid[]);
    raise exception 'PRUEBA FALLIDA L05: el visitante reordenó';
  exception when insufficient_privilege then null;
  end;
  raise notice 'L05 ok: el visitante no escribe ni reordena';
end $$;
reset role;

-- ── Cliente ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000aa1', true);

do $$
declare n int;
begin
  if (select count(*) from public.landing_banners) <> 1 then
    raise exception 'PRUEBA FALLIDA L06: el cliente ve banners no vigentes';
  end if;
  update public.landing_contenido set shows_titulo = 'Hackeado';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'PRUEBA FALLIDA L06: el cliente editó textos'; end if;
  delete from public.landing_videos;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'PRUEBA FALLIDA L06: el cliente borró videos'; end if;
  begin
    insert into public.landing_banners (titulo) values ('x');
    raise exception 'PRUEBA FALLIDA L06: el cliente creó un banner';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.reordenar_videos(array['a0000000-0000-4000-8000-000000000a11']::uuid[]);
    raise exception 'PRUEBA FALLIDA L06: el cliente reordenó';
  exception when insufficient_privilege then null;
  end;
  raise notice 'L06 ok: el cliente solo lee';
end $$;
reset role;

-- ── Administrador ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000aad', true);

do $$
begin
  if (select count(*) from public.landing_banners) <> 4 then
    raise exception 'PRUEBA FALLIDA L07: el admin no ve todos los banners';
  end if;
  update public.landing_contenido set shows_titulo = 'Nuevo título';
  if (select shows_titulo from public.landing_contenido) <> 'Nuevo título' then
    raise exception 'PRUEBA FALLIDA L07: el admin no editó los textos';
  end if;
  insert into public.landing_videos (titulo, youtube_id) values ('Nuevo', 'ccccccccccc');
  delete from public.landing_videos where youtube_id = 'ccccccccccc';
  raise notice 'L07 ok: el admin ve todo, edita textos, crea y borra';

  perform public.reordenar_banners(array[
    'a0000000-0000-4000-8000-000000000a02', 'a0000000-0000-4000-8000-000000000a01']::uuid[]);
  if (select orden from public.landing_banners where id = 'a0000000-0000-4000-8000-000000000a02') <> 1
     or (select orden from public.landing_banners where id = 'a0000000-0000-4000-8000-000000000a01') <> 2 then
    raise exception 'PRUEBA FALLIDA L08: no reordenó';
  end if;
  raise notice 'L08 ok: el admin reordena';
end $$;
reset role;

do $$ begin
  if not exists (select 1 from public.bitacora where entidad = 'landing_contenido') then
    raise exception 'PRUEBA FALLIDA L09: no quedó en la bitácora';
  end if;
  raise notice 'L09 ok: los cambios quedan en la bitácora';
end $$;

do $$ begin raise notice 'Batería 10 completa: 9 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
