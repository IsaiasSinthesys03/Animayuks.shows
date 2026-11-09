-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 13: agregar un CP a una zona desde el mapa (migración 20). Rollback al final.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000da1', 'agregar.cliente@prueba.invalid', '{"nombre":"Cliente Agregar"}'),
  ('a0000000-0000-4000-8000-000000000dad', 'agregar.admin@prueba.invalid',   '{"nombre":"Admin Agregar"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-000000000dad';

insert into public.catalogo_cp (codigo_postal, estado, municipio, colonias, busqueda) values
  ('00601', 'Estado Agregar', 'Villa', array['Una'], 'x'),
  ('00602', 'Estado Agregar', 'Villa', array['Dos'], 'x');
insert into public.cp_contornos (codigo_postal, geometria)
values ('00601', '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}');
insert into public.zonas (id, nombre, codigos_postales) values
  ('a0000000-0000-4000-8000-000000000d01', 'Agregar A', '{}'),
  ('a0000000-0000-4000-8000-000000000d02', 'Agregar B', array['00602']);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000da1', true);
do $$ begin
  perform public.agregar_cp_a_zona('a0000000-0000-4000-8000-000000000d01', '00601');
  raise exception 'PRUEBA FALLIDA G01: el cliente agregó un código';
exception when insufficient_privilege then
  raise notice 'G01 ok: el cliente no puede agregar códigos';
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  perform public.agregar_cp_a_zona('a0000000-0000-4000-8000-000000000d01', '00601');
  raise exception 'PRUEBA FALLIDA G01: el visitante agregó un código';
exception when insufficient_privilege then
  raise notice 'G02 ok: el visitante no puede agregar códigos';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000dad', true);
do $$
declare z public.zonas;
begin
  z := public.agregar_cp_a_zona('a0000000-0000-4000-8000-000000000d01', '00601');
  z := public.agregar_cp_a_zona('a0000000-0000-4000-8000-000000000d01', '00601');
  if z.codigos_postales <> array['00601'] then
    raise exception 'PRUEBA FALLIDA G03: quedó %', z.codigos_postales;
  end if;
  raise notice 'G03 ok: agrega el código sin repetirlo';

  if not exists (select 1 from jsonb_array_elements(public.mapa_zonas_admin() -> 'features') f
                  where f -> 'properties' ->> 'cp' = '00601' and f -> 'properties' ->> 'zona' = 'Agregar A') then
    raise exception 'PRUEBA FALLIDA G04: no apareció en el mapa del panel';
  end if;
  raise notice 'G04 ok: el código agregado aparece en el mapa con su zona';

  begin
    perform public.agregar_cp_a_zona('a0000000-0000-4000-8000-000000000d01', '00602');
    raise exception 'PRUEBA FALLIDA G05: aceptó un código de otra zona';
  exception when unique_violation then
    if sqlerrm not like 'COBERTURA_DUPLICADA%Agregar B%' then raise; end if;
  end;
  begin
    perform public.agregar_cp_a_zona('a0000000-0000-4000-8000-000000000d01', '00699');
    raise exception 'PRUEBA FALLIDA G05: aceptó un código inexistente';
  exception when others then
    if sqlerrm not like 'CP_DESCONOCIDO%' then raise; end if;
  end;
  begin
    perform public.agregar_cp_a_zona('a0000000-0000-4000-8000-0000000d0099', '00601');
    raise exception 'PRUEBA FALLIDA G05: aceptó una zona inexistente';
  exception when others then
    if sqlerrm not like 'ZONA_NO_ENCONTRADA%' then raise; end if;
  end;
  raise notice 'G05 ok: rechaza códigos de otra zona, códigos inexistentes y zonas inexistentes';
end $$;
reset role;

do $$ begin raise notice 'Batería 13 completa: 5 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
