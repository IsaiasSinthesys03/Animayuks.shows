-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 10: ajustes a los correos tras la prueba real (4 nov 2026)
--   · Quita el doble punto: "10:00 a. m.." → "10:00 a. m." (la abreviatura ya
--     cierra la oración).
--   · Los botones "Reservar otra fecha" y "Reservar de nuevo" llevan a /reservar.
-- encolar_correo() se reconstruyó desde su versión viva en Supabase.
-- ═════════════════════════════════════════════════════════════════════════════

-- Todo el archivo se aplica completo o no se aplica nada.
begin;

-- Solo reemplaza el patrón exacto: respeta cualquier otro cambio hecho desde el panel
update public.plantillas_correo
   set cuerpo = replace(replace(replace(replace(cuerpo,
         '{{hora}}.',          '{{hora}}'),
         '{{hora}}</strong>.', '{{hora}}</strong>'),
         '{{vence}}</strong>.', '{{vence}}</strong>'),
         '{{hora_anterior}}.', '{{hora_anterior}}')
 where cuerpo ~ '\{\{(hora|hora_anterior)\}\}(</strong>)?\.|\{\{vence\}\}</strong>\.';

alter table public.plantillas_correo add column ruta_boton text;

update public.plantillas_correo set ruta_boton = '/reservar'
 where clave in ('reservacion_cancelada', 'reservacion_expirada');

CREATE OR REPLACE FUNCTION public.encolar_correo(p_plantilla text, p_reservacion_id uuid, p_pago_id uuid DEFAULT NULL::uuid, p_extra jsonb DEFAULT '{}'::jsonb, p_clave text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg     public.configuracion;
  pl      public.plantillas_correo;
  datos   jsonb;
  dest    text;
  v_id    bigint;
begin
  select * into pl from public.plantillas_correo where clave = p_plantilla;
  if pl.clave is null or not pl.activa then
    return null;
  end if;
  select * into cfg from public.configuracion where id = 1;

  datos := public.datos_correo(p_reservacion_id) || coalesce(p_extra, '{}');
  -- Los avisos al dueño llevan al panel; los del cliente, a Mis reservaciones
  if pl.destinatario = 'dueno' and not (coalesce(p_extra, '{}') ? 'enlace') then
    datos := datos || jsonb_build_object('enlace', cfg.sitio_url || '/admin');
  end if;
  -- Algunas plantillas tienen su propio destino para el botón (ej. volver a reservar)
  if pl.ruta_boton is not null then
    datos := datos || jsonb_build_object('enlace', cfg.sitio_url || pl.ruta_boton);
  end if;

  if pl.destinatario = 'dueno' then
    dest := cfg.correo_avisos;
  else
    select nullif(trim(c.correo), '') into dest
      from public.reservaciones r join public.clientes c on c.id = r.cliente_id
     where r.id = p_reservacion_id;
  end if;

  insert into public.notificaciones (plantilla, reservacion_id, pago_id, clave, destinatario, asunto, html, estado)
  values (
    p_plantilla, p_reservacion_id, p_pago_id, p_clave, dest,
    public.renderizar(pl.asunto, datos),
    public.envolver_correo(public.renderizar(pl.titulo, datos), public.renderizar(pl.cuerpo, datos),
                           pl.boton_texto, datos ->> 'enlace', cfg.sitio_url),
    case when dest is null then 'omitida' else 'pendiente' end
  )
  on conflict on constraint notificaciones_sin_duplicados do nothing
  returning id into v_id;

  return v_id;
end;
$function$;

commit;
