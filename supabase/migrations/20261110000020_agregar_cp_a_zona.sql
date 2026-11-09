-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 20: agregar un código postal a una zona desde el mapa del panel
-- Solo admin. El trigger de cobertura impide repetir un CP en dos zonas.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.agregar_cp_a_zona(p_zona_id uuid, p_cp text)
returns public.zonas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona public.zonas;
begin
  if not public.es_admin() then
    raise exception 'SIN_PERMISO: solo un administrador puede editar zonas' using errcode = '42501';
  end if;
  if not exists (select 1 from public.catalogo_cp c where c.codigo_postal = p_cp) then
    raise exception 'CP_DESCONOCIDO: el código postal % no está en el catálogo', p_cp;
  end if;

  select * into v_zona from public.zonas where id = p_zona_id for update;
  if v_zona.id is null then
    raise exception 'ZONA_NO_ENCONTRADA: esa zona ya no existe';
  end if;
  if p_cp = any (v_zona.codigos_postales) then
    return v_zona;
  end if;

  update public.zonas
     set codigos_postales = array_append(codigos_postales, p_cp)
   where id = p_zona_id
   returning * into v_zona;
  return v_zona;
end;
$$;
revoke execute on function public.agregar_cp_a_zona(uuid, text) from public, anon;
grant execute on function public.agregar_cp_a_zona(uuid, text) to authenticated;

commit;
