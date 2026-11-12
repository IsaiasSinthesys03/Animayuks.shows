-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 27: más información en el detalle de la reservación (panel)
-- · El admin puede ver qué versión de cada documento legal aceptó un cliente
--   y cuándo (hoy cada cliente solo ve las suyas).
-- · historial_reservacion(): los cambios relevantes de una reservación y sus
--   pagos, con quién y cuándo, leídos de la bitácora que ya existe.
-- Solo agrega lectura para el admin: compatible con el sitio publicado.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create policy "aceptaciones: admin consulta" on public.aceptaciones_legales
  for select to authenticated using (public.es_admin());

create or replace function public.historial_reservacion(p_reservacion_id uuid)
returns table (creado_en timestamptz, entidad text, accion text, quien text, cambios jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claves_res  constant text[] := array['estado', 'inicio', 'total', 'descuento', 'calle', 'colonia', 'codigo_postal', 'motivo_cancelacion', 'motivo_excepcion'];
  claves_pago constant text[] := array['estado', 'monto', 'metodo', 'tipo', 'nota'];
begin
  if not public.es_admin() then
    raise exception 'SOLO_ADMIN: solo el administrador' using errcode = '42501';
  end if;
  return query
  select x.creado_en, x.entidad, x.accion, x.quien, x.cambios
    from (
      select b.id, b.creado_en, b.entidad, b.accion,
             case when b.usuario_id is null then 'Sistema'
                  else coalesce(c.nombre, 'Usuario') || case when p.rol = 'admin' then ' (admin)' else '' end end as quien,
             (select jsonb_object_agg(k, jsonb_build_array(b.antes -> k, b.despues -> k))
                from unnest(case when b.entidad = 'pagos' then claves_pago else claves_res end) k
               where b.accion <> 'update' and coalesce(b.despues, b.antes) ? k
                  or b.accion = 'update' and (b.antes -> k) is distinct from (b.despues -> k)) as cambios
        from public.bitacora b
        left join public.clientes c on c.usuario_id = b.usuario_id
        left join public.perfiles p on p.id = b.usuario_id
       where (b.entidad = 'reservaciones' and b.entidad_id = p_reservacion_id::text)
          or (b.entidad = 'pagos' and coalesce(b.despues, b.antes) ->> 'reservacion_id' = p_reservacion_id::text)
    ) x
   where x.accion <> 'update' or x.cambios is not null
   order by x.creado_en, x.id;
end;
$$;

revoke execute on function public.historial_reservacion(uuid) from public, anon;
grant execute on function public.historial_reservacion(uuid) to authenticated;

commit;
