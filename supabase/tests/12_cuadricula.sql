-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 12: cuadrícula de códigos postales (migración 19). Se deshace con rollback.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000ca1', 'cuad.cliente@prueba.invalid', '{"nombre":"Cliente Cuad"}'),
  ('a0000000-0000-4000-8000-000000000cad', 'cuad.admin@prueba.invalid',   '{"nombre":"Admin Cuad"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-000000000cad';

insert into public.catalogo_cp (codigo_postal, estado, municipio, colonias, busqueda) values
  ('00701', 'Estado Cuad', 'Villa A', array['Norte'], 'x'),
  ('00702', 'Estado Cuad', 'Villa B', array['Sur'],   'x');
insert into public.cp_contornos (codigo_postal, geometria)
select c, '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}'::jsonb from unnest(array['00701','00702']) c;
insert into public.zonas (id, nombre, municipios, activa)
values ('a0000000-0000-4000-8000-000000000c01', 'Cuad villa A', array['Estado Cuad|Villa A'], false);

select set_config('prueba.contornos', (select count(*) from public.cp_contornos)::text, true);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  perform public.cuadricula_cp_admin();
  raise exception 'PRUEBA FALLIDA Q01: el visitante obtuvo la cuadrícula';
exception when insufficient_privilege then
  raise notice 'Q01 ok: el visitante no obtiene la cuadrícula';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000ca1', true);
do $$ begin
  perform public.cuadricula_cp_admin();
  raise exception 'PRUEBA FALLIDA Q02: el cliente obtuvo la cuadrícula';
exception when insufficient_privilege then
  raise notice 'Q02 ok: el cliente no obtiene la cuadrícula';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000cad', true);
do $$
declare
  m jsonb := public.cuadricula_cp_admin();
  a jsonb;
  b jsonb;
begin
  if jsonb_array_length(m -> 'features') <> current_setting('prueba.contornos')::int then
    raise exception 'PRUEBA FALLIDA Q03: no trae todos los contornos';
  end if;
  raise notice 'Q03 ok: trae todos los contornos';
  select f -> 'properties' into a from jsonb_array_elements(m -> 'features') f where f -> 'properties' ->> 'cp' = '00701';
  select f -> 'properties' into b from jsonb_array_elements(m -> 'features') f where f -> 'properties' ->> 'cp' = '00702';
  if a ->> 'zona_id' is distinct from 'a0000000-0000-4000-8000-000000000c01' or a ->> 'municipio' <> 'Villa A' or a ->> 'colonias' <> 'Norte' then
    raise exception 'PRUEBA FALLIDA Q04: el CP de zona pausada por municipio salió %', a;
  end if;
  if b -> 'zona_id' <> 'null'::jsonb then
    raise exception 'PRUEBA FALLIDA Q04: el CP sin zona trae zona';
  end if;
  if m::text ~ 'cargo_traslado|costo' then
    raise exception 'PRUEBA FALLIDA Q04: expone costos';
  end if;
  raise notice 'Q04 ok: marca qué códigos tienen zona (también por municipio y pausada) y cuáles no, sin costos';
end $$;
reset role;

do $$ begin raise notice 'Batería 12 completa: 4 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
