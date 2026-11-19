-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 30: fechas de venta y temporada por show
-- · venta_desde / venta_hasta: entre qué días los clientes pueden reservarlo
--   (fuera de ese periodo no aparece en el sitio ni se puede reservar).
-- · evento_desde / evento_hasta: entre qué días se puede presentar.
-- · Vacías = sin límite (como hasta ahora). El admin puede salirse con motivo,
--   y las reservaciones ya hechas no se cancelan ni se bloquean al reprogramar
--   por el periodo de venta. validar_horario reconstruida desde su versión viva.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

alter table public.shows
  add column venta_desde  date,
  add column venta_hasta  date,
  add column evento_desde date,
  add column evento_hasta date,
  add constraint shows_venta_rango  check (venta_desde is null or venta_hasta is null or venta_desde <= venta_hasta),
  add constraint shows_evento_rango check (evento_desde is null or evento_hasta is null or evento_desde <= evento_hasta);

CREATE OR REPLACE FUNCTION public.validar_horario(p_inicio timestamp with time zone, p_fin timestamp with time zone, p_bloque tstzrange, p_excluir_reservacion uuid DEFAULT NULL::uuid, p_zona_id uuid DEFAULT NULL::uuid, p_show_id uuid DEFAULT NULL::uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg        public.configuracion;
  v_ini      timestamp;
  v_fin      timestamp;
  v_limite   int;
  v_usados   int;
  problemas  text[] := '{}';
  v_show     public.shows;
begin
  select * into cfg from public.configuracion where id = 1;

  if p_inicio < now() then
    problemas := array_append(problemas, 'fecha pasada');
  end if;
  if p_inicio < now() + make_interval(hours => cfg.anticipacion_min_horas)
     or p_inicio > now() + make_interval(days => cfg.anticipacion_max_dias) then
    problemas := array_append(problemas, 'anticipación');
  end if;

  -- Debe ser una hora que ofrece alguna franja de ese día y terminar dentro de ella
  v_ini := p_inicio at time zone cfg.zona_horaria;
  v_fin := p_fin at time zone cfg.zona_horaria;
  if extract(second from v_ini) <> 0
     or not exists (
       select 1 from public.inicios_de_franjas(public.franjas_del_dia(v_ini::date, p_show_id),
                                               (extract(epoch from (p_fin - p_inicio)) / 60)::int) i
        where i.inicio = v_ini::time
     ) then
    problemas := array_append(problemas, 'fuera de horario');
  end if;

  -- Temporada del show: solo se presenta entre evento_desde y evento_hasta.
  -- Periodo de venta: los clientes solo reservan entre venta_desde y venta_hasta
  -- (no aplica al admin ni al cambiar de fecha una reservación ya hecha).
  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is not null and not ('fuera de horario' = any (problemas)) and (
       (v_show.evento_desde is not null and v_ini::date < v_show.evento_desde)
    or (v_show.evento_hasta is not null and v_ini::date > v_show.evento_hasta)
    or (p_excluir_reservacion is null and not public.es_admin() and (
          (v_show.venta_desde is not null and (now() at time zone cfg.zona_horaria)::date < v_show.venta_desde)
       or (v_show.venta_hasta is not null and (now() at time zone cfg.zona_horaria)::date > v_show.venta_hasta)))) then
    problemas := array_append(problemas, 'fuera de horario');
  end if;

  if exists (select 1 from public.bloqueos b where tstzrange(b.inicio, b.fin) && p_bloque) then
    problemas := array_append(problemas, 'fecha bloqueada');
  end if;

  if exists (
    select 1 from public.reservaciones r
     where r.estado in ('pendiente', 'confirmada')
       and r.bloque && p_bloque
       and r.id is distinct from p_excluir_reservacion
  ) then
    problemas := array_append(problemas, 'ocupado');
  end if;

  -- Horarios apartados por otras personas (RN-08); los apartados propios no estorban
  if not ('ocupado' = any (problemas)) and exists (
    select 1 from public.retenciones t
     where t.expira_en > now()
       and t.bloque && p_bloque
       and t.usuario_id is distinct from auth.uid()
  ) then
    problemas := array_append(problemas, 'ocupado');
  end if;

  -- Máximo de shows del día: reservaciones vivas + apartados vigentes de otros
  v_limite := public.limite_del_dia(v_ini::date);
  if v_limite is not null then
    select (select count(*) from public.reservaciones r
             where r.estado in ('pendiente', 'confirmada')
               and (r.inicio at time zone cfg.zona_horaria)::date = v_ini::date
               and r.id is distinct from p_excluir_reservacion)
         + (select count(*) from public.retenciones t
             where t.expira_en > now()
               and (t.inicio at time zone cfg.zona_horaria)::date = v_ini::date
               and t.usuario_id is distinct from auth.uid())
      into v_usados;
    if v_usados >= v_limite then
      problemas := array_append(problemas, 'día lleno');
    end if;
  end if;

  return problemas;
end;
$function$;

commit;
