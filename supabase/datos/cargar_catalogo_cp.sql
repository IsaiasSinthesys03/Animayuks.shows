-- Carga el catálogo de códigos postales de México. Se puede repetir sin problema.
-- Se corre desde esta carpeta, con la migración 13 ya aplicada:
--   cd supabase/datos && psql "$AY_DB_URL" -v ON_ERROR_STOP=1 -f cargar_catalogo_cp.sql
-- Datos: GeoNames (https://www.geonames.org), licencia CC BY 4.0. Se conservan solo
-- CP, estado, municipio y colonias; los nombres de 5 estados se abreviaron.
begin;

create temp table carga_cp (codigo_postal text, estado text, municipio text, colonias text) on commit drop;
\copy carga_cp from 'catalogo_cp.csv' with (format csv, header true)

insert into public.catalogo_cp (codigo_postal, estado, municipio, colonias, busqueda)
select codigo_postal, estado, municipio, string_to_array(colonias, '|'),
       public.normalizar_texto(codigo_postal || ' ' || municipio || ' ' || estado || ' ' || replace(colonias, '|', ' '))
  from carga_cp
on conflict (codigo_postal) do update
   set estado = excluded.estado, municipio = excluded.municipio,
       colonias = excluded.colonias, busqueda = excluded.busqueda;

commit;
