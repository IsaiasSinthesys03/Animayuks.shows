-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 25: desglose del bloque de cada reservación
-- · Cada reservación guarda cuánto de su bloque es traslado, montaje y
--   desmontaje, con los valores del show en el momento de reservar o
--   reprogramar. Cambiar después el montaje de un show no altera las viejas.
-- · Lo llena un trigger cuando se escribe el bloque: no se tocan las
--   funciones de reservar. El desglose siempre suma exactamente el bloque.
-- · franjas_de_fecha(): franjas de un día para el fondo de la agenda (admin).
-- · Resumen diario por correo: hora de salida y hora en que queda libre.
-- Solo agrega: compatible con el sitio publicado.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

alter table public.reservaciones
  add column traslado_min   int not null default 0 check (traslado_min >= 0),
  add column montaje_min    int not null default 0 check (montaje_min >= 0),
  add column desmontaje_min int not null default 0 check (desmontaje_min >= 0);

-- Reparte el bloque: antes del show = traslado + montaje; después = desmontaje + traslado
create or replace function public.reservaciones_desglose()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_montaje    int;
  v_desmontaje int;
  antes        int;
  despues      int;
begin
  if tg_op = 'UPDATE' and new.bloque is not distinct from old.bloque
     and new.inicio is not distinct from old.inicio and new.fin is not distinct from old.fin then
    return new;
  end if;
  select s.montaje_min, s.desmontaje_min into v_montaje, v_desmontaje from public.shows s where s.id = new.show_id;
  antes   := greatest(round(extract(epoch from (new.inicio - lower(new.bloque))) / 60)::int, 0);
  despues := greatest(round(extract(epoch from (upper(new.bloque) - new.fin)) / 60)::int, 0);
  new.montaje_min    := least(coalesce(v_montaje, 0), antes);
  new.traslado_min   := antes - new.montaje_min;
  new.desmontaje_min := greatest(despues - new.traslado_min, 0);
  return new;
end;
$$;
create trigger reservaciones_desglose before insert or update of bloque, inicio, fin on public.reservaciones
  for each row execute function public.reservaciones_desglose();

-- Relleno de las reservaciones que ya existen (mismo reparto, el bloque manda)
with calculo as (
  select r.id,
         greatest(round(extract(epoch from (r.inicio - lower(r.bloque))) / 60)::int, 0) as antes,
         greatest(round(extract(epoch from (upper(r.bloque) - r.fin)) / 60)::int, 0) as despues,
         s.montaje_min as m
    from public.reservaciones r join public.shows s on s.id = r.show_id
)
update public.reservaciones r
   set montaje_min    = least(c.m, c.antes),
       traslado_min   = c.antes - least(c.m, c.antes),
       desmontaje_min = greatest(c.despues - (c.antes - least(c.m, c.antes)), 0)
  from calculo c
 where c.id = r.id;

-- ── Franjas de una fecha para el fondo de la agenda (admin) ────────────────
create or replace function public.franjas_de_fecha(p_fecha date)
returns table (abre time, cierra time, especial boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_especial boolean;
begin
  if not public.es_admin() then
    raise exception 'SOLO_ADMIN: solo el administrador' using errcode = '42501';
  end if;
  v_especial := exists (select 1 from public.dias_especiales d where d.fecha = p_fecha);
  return query
    select (f ->> 'abre')::time, (f ->> 'cierra')::time, v_especial
      from jsonb_array_elements(public.franjas_del_dia(p_fecha)) f
     order by 1;
end;
$$;
revoke execute on function public.franjas_de_fecha(date) from public, anon;
grant execute on function public.franjas_de_fecha(date) to authenticated;

-- ── Resumen diario: versión viva + salida y hora libre ─────────────────────
CREATE OR REPLACE FUNCTION public.encolar_resumen_diario(p_forzar boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg     public.configuracion;
  manana  date;
  lista   text := '';
  cuantas int := 0;
  r       record;
  primera timestamptz;
  ultima  timestamptz;
  viajes  int := 0;
begin
  select * into cfg from public.configuracion where id = 1;
  manana := (now() at time zone cfg.zona_horaria)::date + 1;
  if not p_forzar and extract(hour from now() at time zone cfg.zona_horaria) <> extract(hour from cfg.hora_resumen_diario) then
    return 0;
  end if;

  for r in
    select res.*, s.nombre as show_nombre, c.nombre as cliente_nombre, c.telefono as cliente_telefono
      from public.reservaciones res
      join public.shows s on s.id = res.show_id
      join public.clientes c on c.id = res.cliente_id
     where res.estado in ('pendiente', 'confirmada')
       and (res.inicio at time zone cfg.zona_horaria)::date = manana
     order by res.inicio
  loop
    cuantas := cuantas + 1;
    primera := least(coalesce(primera, lower(r.bloque)), lower(r.bloque));
    ultima  := greatest(coalesce(ultima, upper(r.bloque)), upper(r.bloque));
    viajes  := viajes + 2 * r.traslado_min;
    lista := lista
      || '<tr><td style="padding:12px 0;border-top:1px solid #dfe7e1;vertical-align:top;width:90px;font-weight:700;">'
      || public.escapar_html(public.hora_es(r.inicio)) || '</td>'
      || '<td style="padding:12px 0;border-top:1px solid #dfe7e1;font-size:15px;">'
      || '<strong>' || public.escapar_html(r.show_nombre) || '</strong> · ' || public.escapar_html(r.folio) || '<br>'
      || '<span style="color:#5e5873;">Sale ' || public.escapar_html(public.hora_es(lower(r.bloque)))
      || ' · Show ' || public.escapar_html(public.hora_es(r.inicio)) || ' a ' || public.escapar_html(public.hora_es(r.fin))
      || ' · Libre ' || public.escapar_html(public.hora_es(upper(r.bloque))) || '</span><br>'
      || public.escapar_html(r.cliente_nombre) || ', ' || public.escapar_html(coalesce(r.cliente_telefono, 'sin teléfono')) || '<br>'
      || public.escapar_html(concat_ws(', ', r.calle, r.colonia, r.municipio)) || '<br>'
      || 'Saldo: <strong>' || public.escapar_html(public.pesos(greatest(r.total - r.total_pagado, 0))) || '</strong>'
      || case when r.estado = 'pendiente' then ' <span style="color:#92600a;">(sin anticipo)</span>' else '' end
      || '</td></tr>';
  end loop;

  if cuantas = 0 then
    return 0;
  end if;

  perform public.encolar_correo('resumen_diario', null, null,
    jsonb_build_object(
      'fecha_resumen', public.fecha_es((manana + time '12:00') at time zone cfg.zona_horaria),
      'cuantas', cuantas::text,
      'lista_funciones_html',
        '<p style="margin:0 0 12px;font-size:15px;">Equipo: sale <strong>' || public.escapar_html(public.hora_es(primera))
        || '</strong>, termina <strong>' || public.escapar_html(public.hora_es(ultima)) || '</strong>'
        || case when viajes > 0 then ' · ' || case when viajes >= 60 then (viajes / 60)::text || ' h ' else '' end
             || case when viajes % 60 > 0 then (viajes % 60)::text || ' min' else '' end || ' en traslados' else '' end
        || '</p>'
        || '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">' || lista || '</table>',
      'enlace', cfg.sitio_url || '/admin/agenda'),
    manana::text);
  return cuantas;
end;
$function$;

commit;
