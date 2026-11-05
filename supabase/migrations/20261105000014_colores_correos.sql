-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 14: paleta verde en los correos
-- Cambia solo los colores de los correos de reservación, y el color inicial de una
-- zona. Las funciones se reconstruyeron desde su versión viva.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

alter table public.zonas alter column color set default '#287a45';

CREATE OR REPLACE FUNCTION public.envolver_correo(p_titulo text, p_cuerpo text, p_boton text, p_enlace text, p_sitio text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6f3;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">'
      || '<tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">'
      || '<tr><td style="background:#16241c;padding:24px 32px;"><span style="font-size:26px;font-weight:900;letter-spacing:0.5px;color:#ffffff;text-transform:uppercase;">Animayuks</span></td></tr>'
      || '<tr><td style="padding:32px;color:#16241c;font-size:16px;line-height:1.55;">'
      || '<p style="margin:0 0 16px;font-size:22px;font-weight:700;">' || p_titulo || '</p>'
      || p_cuerpo
      || case when p_boton is not null and p_enlace is not null
              then '<p style="margin:24px 0 0;"><a href="' || p_enlace || '" style="display:inline-block;background:#287a45;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;">' || p_boton || '</a></p>'
              else '' end
      || '</td></tr>'
      || '<tr><td style="padding:20px 32px;background:#f2f6f3;color:#55645b;font-size:12px;">Animayuks, shows para tu evento. <a href="' || p_sitio || '" style="color:#55645b;">' || replace(replace(p_sitio, 'https://', ''), 'http://', '') || '</a></td></tr>'
      || '</table></td></tr></table>';
$function$;

CREATE OR REPLACE FUNCTION public.datos_correo(p_reservacion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg  public.configuracion;
  r    public.reservaciones;
  c    public.clientes;
  s    public.shows;
  p    public.paquetes;
  base jsonb;
begin
  select * into cfg from public.configuracion where id = 1;
  base := jsonb_build_object(
    'sitio', cfg.sitio_url,
    'enlace', cfg.sitio_url || '/mi-cuenta',
    'whatsapp', coalesce(cfg.whatsapp, ''),
    'instrucciones_pago', cfg.instrucciones_pago,
    'datos_pago_html',
      case when cfg.clabe is not null then
        '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f2f6f3;border-radius:12px;margin:0 0 16px;"><tr><td style="padding:16px 20px;font-size:15px;line-height:1.7;">'
        || 'Banco: <strong>' || public.escapar_html(cfg.banco) || '</strong><br>'
        || 'Titular: <strong>' || public.escapar_html(cfg.titular_cuenta) || '</strong><br>'
        || 'CLABE: <strong style="letter-spacing:1px;">' || public.escapar_html(cfg.clabe) || '</strong>'
        || '</td></tr></table>'
      else
        '<p style="margin:0 0 16px;">Escríbenos por WhatsApp' || coalesce(' al ' || public.escapar_html(cfg.whatsapp), '')
        || ' y te enviamos los datos para transferir.</p>'
      end
  );
  if p_reservacion_id is null then
    return base;
  end if;

  select * into r from public.reservaciones where id = p_reservacion_id;
  select * into c from public.clientes where id = r.cliente_id;
  select * into s from public.shows where id = r.show_id;
  select * into p from public.paquetes where id = r.paquete_id;

  return base || jsonb_build_object(
    'folio', r.folio,
    'nombre', split_part(coalesce(c.nombre, ''), ' ', 1),
    'nombre_completo', c.nombre,
    'telefono_cliente', coalesce(c.telefono, 'sin teléfono'),
    'correo_cliente', coalesce(c.correo, 'sin correo'),
    'show', s.nombre,
    'paquete', coalesce(p.nombre, 'Función'),
    'fecha', public.fecha_es(r.inicio),
    'hora', public.hora_es(r.inicio),
    'direccion', concat_ws(', ', r.calle, r.colonia, r.codigo_postal, r.municipio),
    'referencias', coalesce(r.referencias, ''),
    'canal', r.canal,
    'total', public.pesos(r.total),
    'anticipo', public.pesos(r.anticipo_requerido),
    'pagado', public.pesos(r.total_pagado),
    'saldo', public.pesos(greatest(r.total - r.total_pagado, 0)),
    'vence', case when r.expira_en is null then '' else public.fecha_es(r.expira_en) || ' a las ' || public.hora_es(r.expira_en) end,
    'reembolso', public.pesos(public.reembolso_estimado(r))
  );
end;
$function$;

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
    lista := lista
      || '<tr><td style="padding:12px 0;border-top:1px solid #dfe7e1;vertical-align:top;width:90px;font-weight:700;">'
      || public.escapar_html(public.hora_es(r.inicio)) || '</td>'
      || '<td style="padding:12px 0;border-top:1px solid #dfe7e1;font-size:15px;">'
      || '<strong>' || public.escapar_html(r.show_nombre) || '</strong> · ' || public.escapar_html(r.folio) || '<br>'
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
      'lista_funciones_html', '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">' || lista || '</table>',
      'enlace', cfg.sitio_url || '/admin/agenda'),
    manana::text);
  return cuantas;
end;
$function$;

commit;
