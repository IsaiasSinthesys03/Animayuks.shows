-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 29: la franja marca cuándo puede EMPEZAR el show
-- · Antes: el show debía terminar antes del cierre de su franja.
-- · Ahora: se ofrecen las horas de inicio desde la apertura y antes del cierre;
--   el show puede terminar después, incluso pasada la medianoche.
--   Ej.: franja 17:00–23:59 cada 30 min → inicios de 17:00 a 23:30.
-- · Siguen valiendo: no encimarse con otra reservación (con traslado y
--   montaje), bloqueos, máximo por día (cuenta el día en que empieza) y
--   anticipación. Funciones reconstruidas desde su versión viva.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

CREATE OR REPLACE FUNCTION public.inicios_de_franjas(p_franjas jsonb, p_duracion_min integer)
 RETURNS TABLE(inicio time without time zone)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  f       jsonb;
  abre_m  int;
  cierra_m int;
  paso    int;
  m       int;
  h       jsonb;
begin
  for f in select * from jsonb_array_elements(coalesce(p_franjas, '[]'::jsonb)) loop
    abre_m   := extract(epoch from (f ->> 'abre')::time)::int / 60;
    cierra_m := extract(epoch from (f ->> 'cierra')::time)::int / 60;
    if f ->> 'modo' = 'horas' then
      for h in select * from jsonb_array_elements(coalesce(f -> 'horas', '[]'::jsonb)) loop
        m := extract(epoch from (h #>> '{}')::time)::int / 60;
        if m >= abre_m and m < cierra_m then
          inicio := make_time(m / 60, m % 60, 0);
          return next;
        end if;
      end loop;
    else
      paso := greatest(coalesce((f ->> 'intervalo_min')::int, 60), 5);
      m := abre_m;
      while m < cierra_m loop
        inicio := make_time(m / 60, m % 60, 0);
        return next;
        m := m + paso;
      end loop;
    end if;
  end loop;
end;
$function$;

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
