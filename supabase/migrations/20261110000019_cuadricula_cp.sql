-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 19: cuadrícula de códigos postales para el mapa del panel
-- Todos los contornos, con la zona que les toca o null si no tienen. Solo admin.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.cuadricula_cp_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'SIN_PERMISO: solo un administrador puede ver la cuadrícula' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'type', 'FeatureCollection',
      'features', coalesce(jsonb_agg(jsonb_build_object(
        'type', 'Feature',
        'geometry', k.geometria,
        'properties', jsonb_build_object(
          'cp', k.codigo_postal,
          'municipio', coalesce(c.municipio, ''),
          'colonias', coalesce(array_to_string(c.colonias, ', '), ''),
          'zona_id', (public.zona_ganadora(k.codigo_postal)).id)
      ) order by k.codigo_postal), '[]'::jsonb))
      from public.cp_contornos k
      left join public.catalogo_cp c on c.codigo_postal = k.codigo_postal
  );
end;
$$;
revoke execute on function public.cuadricula_cp_admin() from public, anon;
grant execute on function public.cuadricula_cp_admin() to authenticated;

commit;
