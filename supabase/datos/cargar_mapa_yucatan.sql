-- Carga el catálogo oficial de Yucatán y los contornos de sus códigos postales.
-- Fuente: Correos de México y SEPOMEX (CC BY 4.0). Se puede repetir sin problema.
--   cd supabase/datos && psql "$AY_DB_URL" -v ON_ERROR_STOP=1 -f cargar_mapa_yucatan.sql
begin;

create temp table carga_catalogo (codigo_postal text, estado text, municipio text, colonias text) on commit drop;
\copy carga_catalogo from 'catalogo_yucatan.csv' with (format csv, header true)

insert into public.catalogo_cp (codigo_postal, estado, municipio, colonias, busqueda)
select codigo_postal, estado, municipio, string_to_array(colonias, '|'),
       public.normalizar_texto(codigo_postal || ' ' || municipio || ' ' || estado || ' ' || replace(colonias, '|', ' '))
  from carga_catalogo
on conflict (codigo_postal) do update
   set estado = excluded.estado, municipio = excluded.municipio,
       colonias = excluded.colonias, busqueda = excluded.busqueda;

create temp table carga_contornos (codigo_postal text, geometria text) on commit drop;
\copy carga_contornos from 'contornos_yucatan.csv' with (format csv, header true)

insert into public.cp_contornos (codigo_postal, geometria)
select codigo_postal, geometria::jsonb from carga_contornos
on conflict (codigo_postal) do update set geometria = excluded.geometria;

commit;
