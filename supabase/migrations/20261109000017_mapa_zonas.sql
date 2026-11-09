-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 17: mapa de zonas de cobertura
-- Contornos de códigos postales (SEPOMEX, CC BY 4.0) y funciones que los cruzan
-- con las zonas. El público solo recibe formas, sin ningún dato de zona.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create table public.cp_contornos (
  codigo_postal text primary key check (codigo_postal ~ '^\d{5}$'),
  geometria     jsonb not null check (geometria ->> 'type' in ('Polygon', 'MultiPolygon'))
);
alter table public.cp_contornos enable row level security;
revoke all on public.cp_contornos from anon, authenticated;

-- La zona que le corresponde a un CP, aunque esté pausada: la más específica decide
create or replace function public.zona_ganadora(p_cp text)
returns public.zonas
language sql
stable
security definer
set search_path = ''
as $$
  select z.*
    from public.zonas z
    left join public.catalogo_cp c on c.codigo_postal = p_cp
   cross join lateral (
     select greatest(
       (select 100 + max(length(prefijo)) from unnest(z.codigos_postales) as prefijo where p_cp like prefijo || '%'),
       case when c.estado || '|' || c.municipio = any (z.municipios) then 50 end,
       case when c.estado = any (z.estados) then 10 end
     ) as rango
   ) r
   where p_cp ~ '^\d{5}$'
     and r.rango is not null
   order by r.rango desc, z.activa desc
   limit 1;
$$;
revoke execute on function public.zona_ganadora(text) from public, anon, authenticated;

create or replace function public.zona_por_cp(p_cp text)
returns public.zonas
language sql
stable
security definer
set search_path = ''
as $$
  select g.* from public.zona_ganadora(p_cp) g where g.activa;
$$;

-- Público: solo las formas de lo que tiene servicio
create or replace function public.mapa_cobertura()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(jsonb_build_object('type', 'Feature', 'properties', '{}'::jsonb, 'geometry', c.geometria)), '[]'::jsonb)
  )
    from public.cp_contornos c
   where (public.zona_por_cp(c.codigo_postal)).id is not null;
$$;
revoke execute on function public.mapa_cobertura() from public;
grant execute on function public.mapa_cobertura() to anon, authenticated;

-- Panel: el detalle completo, incluidas las zonas pausadas
create or replace function public.mapa_zonas_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_features jsonb;
  v_sin      jsonb;
begin
  if not public.es_admin() then
    raise exception 'SIN_PERMISO: solo un administrador puede ver este mapa' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'type', 'Feature',
           'geometry', x.geometria,
           'properties', jsonb_build_object(
             'cp', x.codigo_postal, 'colonias', coalesce(array_to_string(cat.colonias, ', '), ''),
             'zona_id', (x.z).id, 'zona', (x.z).nombre, 'color', (x.z).color, 'activa', (x.z).activa,
             'costo', (x.z).cargo_traslado, 'horario', (x.z).horario)
         )), '[]'::jsonb)
    into v_features
    from (
      select c.codigo_postal, c.geometria, public.zona_ganadora(c.codigo_postal) as z
        from public.cp_contornos c
    ) x
    left join public.catalogo_cp cat on cat.codigo_postal = x.codigo_postal
   where (x.z).id is not null;

  select coalesce(jsonb_agg(jsonb_build_object('cp', t.codigo_postal, 'colonias', array_to_string(t.colonias, ', ')) order by t.codigo_postal), '[]'::jsonb)
    into v_sin
    from (
      select c.codigo_postal, c.colonias
        from public.catalogo_cp c
       where not exists (select 1 from public.cp_contornos k where k.codigo_postal = c.codigo_postal)
         and exists (
           select 1 from public.zonas z
            where c.codigo_postal = any (z.codigos_postales)
               or c.estado = any (z.estados)
               or c.estado || '|' || c.municipio = any (z.municipios))
    ) t;

  return jsonb_build_object('type', 'FeatureCollection', 'features', v_features, 'sin_contorno', v_sin);
end;
$$;
revoke execute on function public.mapa_zonas_admin() from public, anon;
grant execute on function public.mapa_zonas_admin() to authenticated;

commit;
