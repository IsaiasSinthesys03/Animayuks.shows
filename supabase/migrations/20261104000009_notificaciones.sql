-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 9: correos de reservación (bandeja de salida + Resend)
--
--   trigger en reservaciones / pagos ──► notificaciones (pendiente, ya renderizado)
--   cron cada minuto: enviar_pendientes() ──pg_net──► API de Resend
--   cron cada minuto: revisar_envios()    ◄── net._http_response
--   cron cada hora:   encolar_recordatorios(), encolar_resumen_diario()
--
-- La API key de Resend NO está en este archivo: vive cifrada en Supabase Vault
-- con el nombre 'resend_api_key' (se carga aparte, ver supabase/README.md).
-- Plan: MD/Plan_Etapa_2.md, sección 4 (migración 9).
-- ═════════════════════════════════════════════════════════════════════════════

-- Todo el archivo se aplica completo o no se aplica nada.
begin;

-- En Supabase la extensión está disponible; en la base local de pruebas se usa una imitación
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end $$;

-- ── Configuración ───────────────────────────────────────────────────────────
alter table public.configuracion
  add column remitente_correo text not null default 'Animayuks <reservas@animayuks.com>',
  add column sitio_url        text not null default 'https://animayuks.com';

-- ── Tablas ──────────────────────────────────────────────────────────────────
create table public.plantillas_correo (
  clave          text primary key,
  destinatario   text not null check (destinatario in ('cliente', 'dueno')),
  descripcion    text not null,
  asunto         text not null,
  titulo         text not null,       -- encabezado grande del correo
  cuerpo         text not null,       -- HTML con variables {{clave}}; las que terminan en _html van sin escapar
  boton_texto    text,
  activa         boolean not null default true,
  actualizado_en timestamptz not null default now()
);
create trigger plantillas_actualizado before update on public.plantillas_correo
  for each row execute function public.tocar_actualizado();
create trigger bitacora_plantillas after insert or update or delete on public.plantillas_correo
  for each row execute function public.registrar_bitacora();

create table public.notificaciones (
  id              bigint generated always as identity primary key,
  plantilla       text not null references public.plantillas_correo (clave),
  reservacion_id  uuid references public.reservaciones (id) on delete set null,
  pago_id         uuid references public.pagos (id) on delete set null,
  clave           text,                  -- distingue envíos repetibles (ej. cada reprogramación)
  destinatario    text,
  asunto          text not null,
  html            text not null,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'enviando', 'enviada', 'fallida', 'omitida')),
  intentos        int not null default 0,
  proximo_intento timestamptz not null default now(),
  request_id      bigint,
  enviando_desde  timestamptz,
  respuesta       text,
  error           text,
  creado_en       timestamptz not null default now(),
  enviado_en      timestamptz,
  -- El mismo aviso nunca sale dos veces (RF-NOT-07)
  constraint notificaciones_sin_duplicados unique nulls not distinct (plantilla, reservacion_id, pago_id, clave)
);
create index notificaciones_pendientes_idx on public.notificaciones (proximo_intento) where estado = 'pendiente';
create index notificaciones_enviando_idx on public.notificaciones (id) where estado = 'enviando';
create index notificaciones_reservacion_idx on public.notificaciones (reservacion_id);

-- ── Formato en español ──────────────────────────────────────────────────────
-- El servidor está en inglés: los nombres se escriben aquí, no con to_char('TMDay').
create or replace function public.fecha_es(p timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  with l as (select p at time zone (select zona_horaria from public.configuracion where id = 1) as t)
  select (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])[extract(dow from t)::int + 1]
         || ' ' || extract(day from t)::int || ' de '
         || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from t)::int]
         || ' de ' || extract(year from t)::int
    from l;
$$;

create or replace function public.hora_es(p timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  with l as (select p at time zone (select zona_horaria from public.configuracion where id = 1) as t)
  select ((extract(hour from t)::int + 11) % 12 + 1) || ':' || to_char(t, 'MI') || ' '
         || case when extract(hour from t) < 12 then 'a. m.' else 'p. m.' end
    from l;
$$;

create or replace function public.pesos(n numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select '$' || to_char(coalesce(n, 0), 'FM999,999,990.00');
$$;

create or replace function public.escapar_html(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

-- Reemplaza {{clave}} por su valor. Las claves que terminan en _html se insertan tal cual
-- (las arma el sistema ya escapadas); todas las demás se escapan. Las que no existen quedan vacías.
create or replace function public.renderizar(p_texto text, p_datos jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  r record;
  salida text := p_texto;
begin
  for r in select key, value from jsonb_each_text(coalesce(p_datos, '{}')) loop
    salida := replace(salida, '{{' || r.key || '}}',
                      case when r.key like '%\_html' then coalesce(r.value, '') else public.escapar_html(r.value) end);
  end loop;
  return regexp_replace(salida, '\{\{[a-z0-9_]+\}\}', '', 'g');
end;
$$;

-- Diseño común: el mismo de los correos de cuenta (encabezado oscuro, botón rojo)
create or replace function public.envolver_correo(p_titulo text, p_cuerpo text, p_boton text, p_enlace text, p_sitio text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1f6;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">'
      || '<tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">'
      || '<tr><td style="background:#1e1a2e;padding:24px 32px;"><span style="font-size:26px;font-weight:900;letter-spacing:0.5px;color:#ffffff;text-transform:uppercase;">Animayuks</span></td></tr>'
      || '<tr><td style="padding:32px;color:#1e1a2e;font-size:16px;line-height:1.55;">'
      || '<p style="margin:0 0 16px;font-size:22px;font-weight:700;">' || p_titulo || '</p>'
      || p_cuerpo
      || case when p_boton is not null and p_enlace is not null
              then '<p style="margin:24px 0 0;"><a href="' || p_enlace || '" style="display:inline-block;background:#a3122a;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;">' || p_boton || '</a></p>'
              else '' end
      || '</td></tr>'
      || '<tr><td style="padding:20px 32px;background:#f3f1f6;color:#5e5873;font-size:12px;">Animayuks, shows para tu evento. <a href="' || p_sitio || '" style="color:#5e5873;">' || replace(replace(p_sitio, 'https://', ''), 'http://', '') || '</a></td></tr>'
      || '</table></td></tr></table>';
$$;

-- ── Datos de una reservación para las plantillas ────────────────────────────
create or replace function public.reembolso_estimado(p_res public.reservaciones)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
           when extract(epoch from (p_res.inicio - coalesce(p_res.cancelada_en, now()))) / 86400 >= c.cancelacion_dias_reembolso
           then round(p_res.total_pagado * (1 - c.cancelacion_comision_pct / 100), 2)
           else 0
         end
    from public.configuracion c where c.id = 1;
$$;

create or replace function public.datos_correo(p_reservacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
        '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f1f6;border-radius:12px;margin:0 0 16px;"><tr><td style="padding:16px 20px;font-size:15px;line-height:1.7;">'
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
$$;

-- ── Encolar un correo ───────────────────────────────────────────────────────
create or replace function public.encolar_correo(
  p_plantilla      text,
  p_reservacion_id uuid,
  p_pago_id        uuid default null,
  p_extra          jsonb default '{}',
  p_clave          text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- ── Triggers ────────────────────────────────────────────────────────────────
create or replace function public.notificar_reservacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.estado = 'confirmada' then
      perform public.encolar_correo('reservacion_confirmada', new.id);
    elsif new.canal = 'En línea' then
      perform public.encolar_correo('reservacion_recibida', new.id);
    end if;
    perform public.encolar_correo('aviso_nueva_reservacion', new.id);
    return null;
  end if;

  if new.estado is distinct from old.estado then
    case new.estado
      when 'confirmada' then perform public.encolar_correo('reservacion_confirmada', new.id);
      when 'cancelada'  then
        perform public.encolar_correo('reservacion_cancelada', new.id);
        perform public.encolar_correo('aviso_cancelacion', new.id);
      when 'expirada'   then perform public.encolar_correo('reservacion_expirada', new.id);
      else null;
    end case;
  end if;

  if new.inicio is distinct from old.inicio and new.estado in ('pendiente', 'confirmada') then
    perform public.encolar_correo('reservacion_reprogramada', new.id, null,
      jsonb_build_object('fecha_anterior', public.fecha_es(old.inicio), 'hora_anterior', public.hora_es(old.inicio)),
      new.inicio::text);
    perform public.encolar_correo('aviso_reprogramacion', new.id, null,
      jsonb_build_object('fecha_anterior', public.fecha_es(old.inicio), 'hora_anterior', public.hora_es(old.inicio)),
      new.inicio::text);
  end if;
  return null;
end;
$$;

create trigger reservaciones_notificar after insert or update of estado, inicio on public.reservaciones
  for each row execute function public.notificar_reservacion();

create or replace function public.notificar_pago()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare extra jsonb;
begin
  extra := jsonb_build_object('monto', public.pesos(new.monto), 'metodo', new.metodo,
                              'motivo', coalesce(nullif(trim(new.nota), ''), 'No pudimos validar el comprobante.'));

  if new.estado = 'aprobado' and new.tipo <> 'reembolso'
     and (tg_op = 'INSERT' or old.estado is distinct from 'aprobado') then
    perform public.encolar_correo('pago_recibido', new.reservacion_id, new.id, extra);
  end if;
  if tg_op = 'INSERT' and new.estado = 'pendiente' and new.comprobante_path is not null then
    perform public.encolar_correo('aviso_comprobante', new.reservacion_id, new.id, extra);
  end if;
  if tg_op = 'UPDATE' and old.estado = 'pendiente' and new.estado = 'rechazado' then
    perform public.encolar_correo('comprobante_rechazado', new.reservacion_id, new.id, extra);
  end if;
  return null;
end;
$$;

-- El nombre empieza con "pagos_zz" para correr DESPUÉS de pagos_recalcular (orden alfabético):
-- así el correo ya muestra el total pagado y el saldo actualizados.
create trigger pagos_zz_notificar after insert or update of estado on public.pagos
  for each row execute function public.notificar_pago();

-- ── Envío y revisión (pg_net → Resend) ──────────────────────────────────────
create or replace function public.enviar_pendientes(p_limite int default 10)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg   public.configuracion;
  llave text;
  n     record;
  v_req bigint;
  total int := 0;
begin
  select decrypted_secret into llave from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if llave is null then
    raise warning 'Falta el secreto resend_api_key en Vault: no se envían correos';
    return 0;
  end if;
  select * into cfg from public.configuracion where id = 1;

  for n in
    select * from public.notificaciones
     where estado = 'pendiente' and proximo_intento <= now()
     order by id
     limit p_limite
     for update skip locked
  loop
    v_req := net.http_post(
      url     := 'https://api.resend.com/emails',
      body    := jsonb_build_object(
                   'from', cfg.remitente_correo,
                   'to', jsonb_build_array(n.destinatario),
                   'reply_to', coalesce(cfg.correo_avisos, 'reservas@animayuks.com'),
                   'subject', n.asunto,
                   'html', n.html),
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || llave,
                   -- Resend no repite un envío con la misma llave: un reintento nunca duplica el correo
                   'Idempotency-Key', 'ay-notificacion-' || n.id),
      timeout_milliseconds := 10000
    );
    update public.notificaciones
       set estado = 'enviando', request_id = v_req, enviando_desde = now(), intentos = intentos + 1
     where id = n.id;
    total := total + 1;
  end loop;
  return total;
end;
$$;

create or replace function public.revisar_envios()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n          record;
  v_hay      boolean;
  v_status   int;
  v_content  text;
  v_error    text;
  falla      text;
  total      int := 0;
begin
  for n in select * from public.notificaciones where estado = 'enviando' order by id for update skip locked loop
    v_status := null; v_content := null; v_error := null;
    select r.status_code, r.content, r.error_msg into v_status, v_content, v_error
      from net._http_response r where r.id = n.request_id;
    v_hay := found;

    if v_hay and v_status between 200 and 299 then
      update public.notificaciones
         set estado = 'enviada', enviado_en = now(), respuesta = left(v_content, 500), error = null
       where id = n.id;
      total := total + 1;
      continue;
    elsif v_hay then
      falla := coalesce(v_status::text, 'sin código') || ': '
               || left(coalesce(nullif(v_error, ''), v_content, 'sin detalle'), 500);
    elsif n.enviando_desde < now() - interval '5 minutes' then
      falla := 'sin respuesta de Resend después de 5 minutos';
    else
      continue;  -- todavía no llega la respuesta
    end if;

    -- Errores 4xx (salvo 429) no se arreglan reintentando: correo inválido, datos mal formados, etc.
    if n.intentos >= 3 or coalesce(v_status between 400 and 499 and v_status <> 429, false) then
      update public.notificaciones set estado = 'fallida', error = falla where id = n.id;
    else
      update public.notificaciones
         set estado = 'pendiente', error = falla,
             proximo_intento = now() + make_interval(mins => power(4, n.intentos - 1)::int)   -- 1, 4, 16 min
       where id = n.id;
    end if;
    total := total + 1;
  end loop;
  return total;
end;
$$;

-- El panel podrá reintentar un correo fallido (RF-NOT-07)
create or replace function public.reintentar_correo(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede reintentar correos' using errcode = '42501';
  end if;
  update public.notificaciones
     set estado = 'pendiente', intentos = 0, proximo_intento = now(), error = null
   where id = p_id and estado in ('fallida', 'omitida') and destinatario is not null;
  return found;
end;
$$;

-- ── Recordatorios y resumen diario ──────────────────────────────────────────
-- El cron corre cada hora; solo encolan a la hora configurada (o con p_forzar).
create or replace function public.encolar_recordatorios(p_forzar boolean default false)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg  public.configuracion;
  hoy  date;
  r    record;
  n    int := 0;
begin
  select * into cfg from public.configuracion where id = 1;
  hoy := (now() at time zone cfg.zona_horaria)::date;
  if not p_forzar and extract(hour from now() at time zone cfg.zona_horaria) <> extract(hour from cfg.hora_recordatorio) then
    return 0;
  end if;
  for r in
    select id from public.reservaciones
     where estado = 'confirmada' and (inicio at time zone cfg.zona_horaria)::date = hoy + 2
  loop
    if public.encolar_correo('recordatorio', r.id, null, '{}', 'recordatorio') is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

create or replace function public.encolar_resumen_diario(p_forzar boolean default false)
returns int
language plpgsql
security definer
set search_path = ''
as $$
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
      || '<tr><td style="padding:12px 0;border-top:1px solid #e3e0ea;vertical-align:top;width:90px;font-weight:700;">'
      || public.escapar_html(public.hora_es(r.inicio)) || '</td>'
      || '<td style="padding:12px 0;border-top:1px solid #e3e0ea;font-size:15px;">'
      || '<strong>' || public.escapar_html(r.show_nombre) || '</strong> · ' || public.escapar_html(r.folio) || '<br>'
      || public.escapar_html(r.cliente_nombre) || ', ' || public.escapar_html(coalesce(r.cliente_telefono, 'sin teléfono')) || '<br>'
      || public.escapar_html(concat_ws(', ', r.calle, r.colonia, r.municipio)) || '<br>'
      || 'Saldo: <strong>' || public.escapar_html(public.pesos(greatest(r.total - r.total_pagado, 0))) || '</strong>'
      || case when r.estado = 'pendiente' then ' <span style="color:#b45309;">(sin anticipo)</span>' else '' end
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
$$;

-- ── Seguridad ───────────────────────────────────────────────────────────────
alter table public.plantillas_correo enable row level security;
alter table public.notificaciones    enable row level security;
revoke all on public.plantillas_correo, public.notificaciones from anon, authenticated;
grant select, update on public.plantillas_correo to authenticated;
grant select on public.notificaciones to authenticated;

create policy "plantillas: admin consulta" on public.plantillas_correo
  for select to authenticated using (public.es_admin());
create policy "plantillas: admin edita" on public.plantillas_correo
  for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "notificaciones: admin consulta" on public.notificaciones
  for select to authenticated using (public.es_admin());

do $$
declare f text;
begin
  foreach f in array array[
    'public.datos_correo(uuid)', 'public.encolar_correo(text, uuid, uuid, jsonb, text)',
    'public.enviar_pendientes(int)', 'public.revisar_envios()',
    'public.encolar_recordatorios(boolean)', 'public.encolar_resumen_diario(boolean)',
    'public.notificar_reservacion()', 'public.notificar_pago()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
revoke execute on function public.reintentar_correo(bigint) from public, anon;
grant execute on function public.reintentar_correo(bigint) to authenticated;

-- ── Plantillas ──────────────────────────────────────────────────────────────
insert into public.plantillas_correo (clave, destinatario, descripcion, asunto, titulo, cuerpo, boton_texto) values
('reservacion_recibida', 'cliente', 'Reservación en línea creada, falta el anticipo',
 'Recibimos tu reservación {{folio}}', '¡Ya casi, {{nombre}}!',
 '<p style="margin:0 0 16px;">Apartamos <strong>{{show}}</strong> ({{paquete}}) para el <strong>{{fecha}}</strong> a las <strong>{{hora}}</strong> en {{direccion}}.</p>'
 '<p style="margin:0 0 8px;">Para confirmarla, paga el anticipo de <strong>{{anticipo}}</strong> (total {{total}}) antes del <strong>{{vence}}</strong>. Si no lo recibimos a tiempo, el horario se libera.</p>'
 '{{datos_pago_html}}<p style="margin:0 0 16px;">{{instrucciones_pago}}</p>'
 '<p style="margin:0;color:#5e5873;font-size:14px;">Folio: <strong>{{folio}}</strong></p>',
 'Ver mi reservación'),
('reservacion_confirmada', 'cliente', 'La reservación quedó confirmada',
 'Tu función está confirmada: {{folio}}', '¡Función confirmada!',
 '<p style="margin:0 0 16px;">{{nombre}}, tu reservación de <strong>{{show}}</strong> está confirmada para el <strong>{{fecha}}</strong> a las <strong>{{hora}}</strong>.</p>'
 '<p style="margin:0 0 16px;">Dirección: {{direccion}}</p>'
 '<p style="margin:0 0 16px;">Pagado: <strong>{{pagado}}</strong> de {{total}}. Saldo para el día del evento: <strong>{{saldo}}</strong>.</p>'
 '<p style="margin:0;color:#5e5873;font-size:14px;">Los artistas llegan unos 30 minutos antes para montar. Folio: {{folio}}</p>',
 'Ver mi reservación'),
('pago_recibido', 'cliente', 'Recibo de un pago aprobado',
 'Recibimos tu pago de {{monto}}', 'Pago recibido',
 '<p style="margin:0 0 16px;">Registramos tu pago de <strong>{{monto}}</strong> ({{metodo}}) para la reservación <strong>{{folio}}</strong> de {{show}}, el {{fecha}}.</p>'
 '<p style="margin:0;">Total pagado: <strong>{{pagado}}</strong> de {{total}}. Saldo pendiente: <strong>{{saldo}}</strong>.</p>',
 'Ver mi reservación'),
('comprobante_rechazado', 'cliente', 'El administrador rechazó un comprobante',
 'No pudimos validar tu comprobante ({{folio}})', 'Revisa tu comprobante',
 '<p style="margin:0 0 16px;">{{nombre}}, no pudimos validar el comprobante de <strong>{{monto}}</strong> para la reservación <strong>{{folio}}</strong>.</p>'
 '<p style="margin:0 0 16px;">Motivo: {{motivo}}</p>'
 '<p style="margin:0;">Sube un comprobante nuevo desde Mis reservaciones o escríbenos por WhatsApp.</p>',
 'Subir comprobante'),
('reservacion_reprogramada', 'cliente', 'La reservación cambió de fecha',
 'Cambiamos la fecha de tu reservación {{folio}}', 'Nueva fecha confirmada',
 '<p style="margin:0 0 16px;">Tu reservación de <strong>{{show}}</strong> cambió de fecha.</p>'
 '<p style="margin:0 0 8px;color:#5e5873;">Antes: {{fecha_anterior}} a las {{hora_anterior}}</p>'
 '<p style="margin:0 0 16px;">Ahora: <strong>{{fecha}}</strong> a las <strong>{{hora}}</strong></p>'
 '<p style="margin:0;color:#5e5873;font-size:14px;">Dirección: {{direccion}}. Folio: {{folio}}</p>',
 'Ver mi reservación'),
('reservacion_cancelada', 'cliente', 'La reservación se canceló',
 'Tu reservación {{folio}} fue cancelada', 'Reservación cancelada',
 '<p style="margin:0 0 16px;">Cancelamos tu reservación de <strong>{{show}}</strong> del {{fecha}} a las {{hora}}.</p>'
 '<p style="margin:0 0 16px;">Monto a reembolsar según la política de cancelación: <strong>{{reembolso}}</strong>. Si hay reembolso, te contactaremos para hacerlo.</p>'
 '<p style="margin:0;color:#5e5873;font-size:14px;">Folio: {{folio}}</p>',
 'Reservar otra fecha'),
('reservacion_expirada', 'cliente', 'Venció el plazo del anticipo',
 'Se liberó el horario de tu reservación {{folio}}', 'Se venció el plazo para el anticipo',
 '<p style="margin:0 0 16px;">{{nombre}}, no recibimos el anticipo de la reservación <strong>{{folio}}</strong> ({{show}}, {{fecha}} a las {{hora}}) a tiempo, así que liberamos el horario.</p>'
 '<p style="margin:0;">Si todavía quieres el show, puedes reservar de nuevo; revisa que la fecha siga disponible.</p>',
 'Reservar de nuevo'),
('recordatorio', 'cliente', 'Recordatorio dos días antes del evento',
 'Tu función es el {{fecha}}', 'Faltan dos días',
 '<p style="margin:0 0 16px;">{{nombre}}, te recordamos que <strong>{{show}}</strong> es el <strong>{{fecha}}</strong> a las <strong>{{hora}}</strong>.</p>'
 '<p style="margin:0 0 16px;">Dirección: {{direccion}}</p>'
 '<p style="margin:0;">Saldo a pagar el día del evento: <strong>{{saldo}}</strong>. Los artistas llegan unos 30 minutos antes para montar.</p>',
 'Ver mi reservación'),
('aviso_nueva_reservacion', 'dueno', 'Aviso al dueño: reservación nueva',
 'Nueva reservación {{folio}}: {{show}}, {{fecha}}', 'Nueva reservación',
 '<p style="margin:0 0 16px;"><strong>{{show}}</strong> ({{paquete}}), {{fecha}} a las {{hora}}.</p>'
 '<p style="margin:0 0 16px;">Cliente: {{nombre_completo}}, {{telefono_cliente}}, {{correo_cliente}}<br>Dirección: {{direccion}}<br>Canal: {{canal}}</p>'
 '<p style="margin:0;">Total {{total}}, anticipo {{anticipo}}. Folio {{folio}}.</p>',
 'Abrir el panel'),
('aviso_comprobante', 'dueno', 'Aviso al dueño: el cliente subió un comprobante',
 'Comprobante por revisar: {{folio}} ({{monto}})', 'Comprobante por revisar',
 '<p style="margin:0 0 16px;">{{nombre_completo}} subió un comprobante de <strong>{{monto}}</strong> para la reservación <strong>{{folio}}</strong> ({{show}}, {{fecha}}).</p>'
 '<p style="margin:0;">Revísalo y apruébalo o recházalo en el panel.</p>',
 'Revisar en el panel'),
('aviso_reprogramacion', 'dueno', 'Aviso al dueño: cambio de fecha',
 'Cambio de fecha: {{folio}}', 'Una reservación cambió de fecha',
 '<p style="margin:0 0 16px;"><strong>{{show}}</strong> de {{nombre_completo}} ({{telefono_cliente}}).</p>'
 '<p style="margin:0 0 8px;color:#5e5873;">Antes: {{fecha_anterior}} a las {{hora_anterior}}</p>'
 '<p style="margin:0;">Ahora: <strong>{{fecha}}</strong> a las <strong>{{hora}}</strong>. Folio {{folio}}.</p>',
 'Abrir la agenda'),
('aviso_cancelacion', 'dueno', 'Aviso al dueño: reservación cancelada',
 'Cancelada: {{folio}} ({{show}}, {{fecha}})', 'Reservación cancelada',
 '<p style="margin:0 0 16px;"><strong>{{show}}</strong> de {{nombre_completo}} ({{telefono_cliente}}), {{fecha}} a las {{hora}}.</p>'
 '<p style="margin:0;">Pagado {{pagado}}. Reembolso según la política: <strong>{{reembolso}}</strong>. El horario quedó libre.</p>',
 'Abrir el panel'),
('resumen_diario', 'dueno', 'Funciones del día siguiente',
 'Mañana tienes {{cuantas}} función(es)', 'Funciones del {{fecha_resumen}}',
 '{{lista_funciones_html}}',
 'Abrir la agenda')
on conflict (clave) do nothing;


-- ── Trabajos de cron ────────────────────────────────────────────────────────
select cron.schedule('ay-enviar-correos',  '* * * * *', 'select public.enviar_pendientes()');
select cron.schedule('ay-revisar-envios',  '* * * * *', 'select public.revisar_envios()');
select cron.schedule('ay-recordatorios',   '0 * * * *', 'select public.encolar_recordatorios()');
select cron.schedule('ay-resumen-diario',  '0 * * * *', 'select public.encolar_resumen_diario()');

commit;
