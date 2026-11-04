-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 7: reprogramar una reservación (RN-12, RF-MRS-04, RF-ADR-09)
-- El cliente cambia la fecha una vez, con 72 h de anticipación y sujeto a
-- disponibilidad. El administrador no tiene esos límites, pero si se salta una
-- regla de horario (anticipación, horario de servicio, bloqueo, cobertura)
-- debe escribir el motivo. El precio no cambia.
-- Plan: MD/Plan_Etapa_2.md, sección 4 (migración 7).
-- ═════════════════════════════════════════════════════════════════════════════

-- Todo el archivo se aplica completo o no se aplica nada.
begin;

create or replace function public.reprogramar_reservacion(
  p_reservacion_id uuid,
  p_nuevo_inicio   timestamptz,
  p_motivo         text default null
)
returns public.reservaciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin       boolean := public.es_admin();
  cfg         public.configuracion;
  v_res       public.reservaciones;
  v_extras    uuid[];
  h           record;
  v_problemas text[];
  v_saltos    text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA: inicia sesión para cambiar la fecha' using errcode = '42501';
  end if;

  select * into cfg from public.configuracion where id = 1;

  perform public.bloquear_agenda();

  select r.* into v_res
    from public.reservaciones r
    join public.clientes c on c.id = r.cliente_id
   where r.id = p_reservacion_id
     and (c.usuario_id = auth.uid() or admin)
   for update of r;

  if v_res.id is null then
    raise exception 'NO_ENCONTRADA: reservación no encontrada' using errcode = '42501';
  end if;
  if v_res.estado not in ('pendiente', 'confirmada') then
    raise exception 'NO_REPROGRAMABLE: esta reservación ya está %', v_res.estado;
  end if;

  -- Reglas del cliente (RN-12)
  if not admin then
    if now() > v_res.inicio - make_interval(hours => cfg.reprogramacion_min_horas) then
      raise exception 'REPROGRAMACION_TARDE: solo puedes cambiar la fecha con al menos % horas de anticipación', cfg.reprogramacion_min_horas;
    end if;
    if v_res.reprogramaciones >= cfg.reprogramaciones_max then
      raise exception 'REPROGRAMACION_LIMITE: ya cambiaste la fecha de esta reservación % vez', cfg.reprogramaciones_max;
    end if;
  end if;

  -- Mismo show, paquete, extras y dirección; solo cambia la fecha
  select coalesce(array_agg(extra_id), '{}') into v_extras
    from public.reservacion_extras where reservacion_id = v_res.id;

  select * into h from public.calcular_horario(v_res.show_id, v_res.paquete_id, v_extras, v_res.codigo_postal, p_nuevo_inicio, true);

  if h.zona_id is null then
    if admin then
      v_saltos := array_append(v_saltos, 'fuera de cobertura');
    else
      raise exception 'FUERA_DE_COBERTURA: por ahora no damos servicio en el código postal %', v_res.codigo_postal;
    end if;
  end if;

  -- La propia reservación no cuenta como ocupada
  v_problemas := public.validar_horario(p_nuevo_inicio, h.fin, h.bloque, v_res.id);

  if 'anticipación' = any (v_problemas) or 'fecha pasada' = any (v_problemas) then
    if admin then
      v_saltos := array_append(v_saltos, 'anticipación');
    else
      raise exception 'ANTICIPACION: las reservaciones en línea se hacen con al menos % horas de anticipación', cfg.anticipacion_min_horas;
    end if;
  end if;
  if 'fuera de horario' = any (v_problemas) then
    if admin then
      v_saltos := array_append(v_saltos, 'fuera de horario');
    else
      raise exception 'FUERA_DE_HORARIO: ese día u hora no damos servicio';
    end if;
  end if;
  if 'fecha bloqueada' = any (v_problemas) then
    if admin then
      v_saltos := array_append(v_saltos, 'fecha bloqueada');
    else
      raise exception 'FECHA_BLOQUEADA: ese horario no está disponible';
    end if;
  end if;
  if 'ocupado' = any (v_problemas) then
    raise exception 'HORARIO_OCUPADO: este horario acaba de ser reservado, elige otro' using errcode = '23P01';
  end if;

  if array_length(v_saltos, 1) > 0 and coalesce(trim(p_motivo), '') = '' then
    raise exception 'MOTIVO_REQUERIDO: para guardar con excepción (%), escribe el motivo', array_to_string(v_saltos, ', ');
  end if;

  begin
    update public.reservaciones
       set inicio           = p_nuevo_inicio,
           fin              = h.fin,
           bloque           = h.bloque,
           reprogramaciones = reprogramaciones + 1,
           motivo_excepcion = case when array_length(v_saltos, 1) > 0
                                   then concat_ws(' | ', motivo_excepcion,
                                                  'reprogramación (' || array_to_string(v_saltos, ', ') || '): ' || p_motivo)
                                   else motivo_excepcion end
     where id = v_res.id
     returning * into v_res;
  exception when exclusion_violation then
    raise exception 'HORARIO_OCUPADO: este horario acaba de ser reservado, elige otro' using errcode = '23P01';
  end;

  -- Si quien reprograma tenía un horario apartado, ya no hace falta
  delete from public.retenciones where usuario_id = auth.uid();

  return v_res;
end;
$$;

revoke execute on function public.reprogramar_reservacion(uuid, timestamptz, text) from public, anon;
grant execute on function public.reprogramar_reservacion(uuid, timestamptz, text) to authenticated;

commit;
