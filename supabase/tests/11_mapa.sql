-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 11: mapa de zonas (migración 17). Se deshace al final con rollback.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000ba1', 'mapa.cliente@prueba.invalid', '{"nombre":"Cliente Mapa"}'),
  ('a0000000-0000-4000-8000-000000000bad', 'mapa.admin@prueba.invalid',   '{"nombre":"Admin Mapa"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-000000000bad';

delete from public.cp_contornos;
insert into public.catalogo_cp (codigo_postal, estado, municipio, colonias, busqueda) values
  ('00801', 'Estado Mapa', 'Ciudad A', array['Uno'],  'x'),
  ('00802', 'Estado Mapa', 'Ciudad A', array['Dos'],  'x'),
  ('00803', 'Estado Mapa', 'Ciudad B', array['Tres'], 'x'),
  ('00804', 'Estado Mapa', 'Ciudad C', array['Sin forma'], 'x'),
  ('00805', 'Otro Mapa',   'Ciudad A', array['Fuera'], 'x');
insert into public.cp_contornos (codigo_postal, geometria)
select c, '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}'::jsonb from unnest(array['00801','00802','00803','00805']) c;

insert into public.zonas (id, nombre, estados, municipios, codigos_postales, cargo_traslado, color, activa) values
  ('a0000000-0000-4000-8000-000000000b01', 'Mapa estado', array['Estado Mapa'], '{}', '{}', 900, '#111111', true),
  ('a0000000-0000-4000-8000-000000000b02', 'Mapa colonia', '{}', '{}', array['00802'], 200, '#222222', true),
  ('a0000000-0000-4000-8000-000000000b03', 'Mapa pausada', '{}', array['Estado Mapa|Ciudad B'], '{}', 300, '#333333', false);

do $$ begin
  begin
    insert into public.cp_contornos values ('00806', '{"type":"Point","coordinates":[0,0]}');
    raise exception 'PRUEBA FALLIDA M01: aceptó una geometría que no es área';
  exception when check_violation then null;
  end;
  raise notice 'M01 ok: solo acepta áreas';
end $$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare m jsonb := public.mapa_cobertura();
begin
  -- 00801 y 00802 con servicio; 00803 es de una zona pausada; 00805 no tiene zona
  if jsonb_array_length(m -> 'features') <> 2 then
    raise exception 'PRUEBA FALLIDA M02: el mapa público trae % áreas', jsonb_array_length(m -> 'features');
  end if;
  raise notice 'M02 ok: el mapa público solo trae lo que tiene servicio, sin zonas pausadas';
  if exists (select 1 from jsonb_array_elements(m -> 'features') f where f -> 'properties' <> '{}'::jsonb)
     or m::text ~ 'Mapa estado|Mapa colonia|900' then
    raise exception 'PRUEBA FALLIDA M03: el mapa público expone datos de zona';
  end if;
  raise notice 'M03 ok: el mapa público no expone datos de zona';
  begin
    perform 1 from public.cp_contornos;
    raise exception 'PRUEBA FALLIDA M04: el visitante leyó los contornos directo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.zona_ganadora('00801');
    raise exception 'PRUEBA FALLIDA M04: el visitante llamó una función interna';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mapa_zonas_admin();
    raise exception 'PRUEBA FALLIDA M04: el visitante abrió el mapa del panel';
  exception when insufficient_privilege then null;
  end;
  raise notice 'M04 ok: el visitante no accede a contornos, funciones internas ni al mapa del panel';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000ba1', true);
do $$ begin
  perform public.mapa_zonas_admin();
  raise exception 'PRUEBA FALLIDA M05: el cliente abrió el mapa del panel';
exception when insufficient_privilege then
  raise notice 'M05 ok: el cliente no abre el mapa del panel';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000bad', true);
do $$
declare
  m jsonb := public.mapa_zonas_admin();
  zona_de text;
begin
  if jsonb_array_length(m -> 'features') <> 3 then
    raise exception 'PRUEBA FALLIDA M06: el panel trae % áreas', jsonb_array_length(m -> 'features');
  end if;
  select f -> 'properties' ->> 'zona' into zona_de from jsonb_array_elements(m -> 'features') f where f -> 'properties' ->> 'cp' = '00802';
  if zona_de is distinct from 'Mapa colonia' then
    raise exception 'PRUEBA FALLIDA M06: 00802 quedó en %', zona_de;
  end if;
  select f -> 'properties' ->> 'activa' into zona_de from jsonb_array_elements(m -> 'features') f where f -> 'properties' ->> 'cp' = '00803';
  if zona_de is distinct from 'false' then
    raise exception 'PRUEBA FALLIDA M06: la zona pausada no se marcó';
  end if;
  raise notice 'M06 ok: el panel expande estado y respeta lo más específico, con pausadas marcadas';
  if not exists (select 1 from jsonb_array_elements(m -> 'sin_contorno') s where s ->> 'cp' = '00804') then
    raise exception 'PRUEBA FALLIDA M07: no listó el CP sin contorno';
  end if;
  raise notice 'M07 ok: lista los códigos sin contorno';
end $$;
reset role;

do $$ begin
  if (public.zona_por_cp('00804')).nombre is distinct from 'Mapa estado' then
    raise exception 'PRUEBA FALLIDA M08: un CP sin contorno perdió cobertura';
  end if;
  if (public.zona_por_cp('00803')).id is not null then
    raise exception 'PRUEBA FALLIDA M08: una zona pausada dio cobertura';
  end if;
  raise notice 'M08 ok: sin contorno se puede reservar, y pausar sigue quitando cobertura';
end $$;

do $$ begin raise notice 'Batería 11 completa: 8 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
