-- ═════════════════════════════════════════════════════════════════════════════
-- Batería 09: zonas por región (migración 13)
-- Cobertura por estado, municipio y CP, costos y horarios por zona.
-- Crea su propio catálogo con CP inexistentes. Se deshace al final con rollback.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

update public.configuracion
   set anticipacion_min_horas = 48, anticipacion_max_dias = 365, anticipo_porcentaje = 30,
       intervalo_horarios_min = 60, reservaciones_en_linea = true, zona_horaria = 'America/Mexico_City'
 where id = 1;
-- El horario general: solo los sábados de 12:00 a 15:00
update public.horario_servicio set activo = (dia_semana = 6), abre = '12:00', cierra = '15:00';

insert into public.catalogo_cp (codigo_postal, estado, municipio, colonias, busqueda) values
  ('00901', 'Estado Prueba', 'Ciudad Norte', array['Lomas'],   public.normalizar_texto('00901 Ciudad Norte Estado Prueba Lomas')),
  ('00902', 'Estado Prueba', 'Ciudad Norte', array['Mirador'], public.normalizar_texto('00902 Ciudad Norte Estado Prueba Mirador')),
  ('00903', 'Estado Prueba', 'Ciudad Sur',   array['Jardín'],  public.normalizar_texto('00903 Ciudad Sur Estado Prueba Jardín')),
  ('00904', 'Estado Prueba', 'Pueblo',       array['Centro'],  public.normalizar_texto('00904 Pueblo Estado Prueba Centro')),
  ('00905', 'Otro Prueba',   'Pueblo',       array['Centro'],  public.normalizar_texto('00905 Pueblo Otro Prueba Centro'));

insert into public.zonas (id, nombre, estados, municipios, codigos_postales, cargo_traslado, traslado_min, horario) values
  ('a0000000-0000-4000-8000-000000000901', 'Prueba estado', array['Estado Prueba'], '{}', '{}', 900, 0, null),
  ('a0000000-0000-4000-8000-000000000902', 'Prueba norte', '{}', array['Estado Prueba|Ciudad Norte'], '{}', 100, 0,
   '{"6": {"abre": "08:00", "cierra": "11:00"}}'),
  ('a0000000-0000-4000-8000-000000000903', 'Prueba colonia', '{}', '{}', array['00902'], 200, 0, null),
  ('a0000000-0000-4000-8000-000000000904', 'Prueba sur', '{}', array['Estado Prueba|Ciudad Sur'], '{}', 300, 0,
   '{"6": {"abre": "19:00", "cierra": "22:00"}, "0": {"abre": "19:00", "cierra": "22:00"}}');

insert into public.shows (id, slug, nombre, duracion_min, montaje_min, desmontaje_min, precio_base, activo)
values ('a0000000-0000-4000-8000-000000000910', 'prueba-zonas', 'Show zonas', 60, 0, 0, 1000, true);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000009a1', 'zonas.cliente@prueba.invalid', '{"nombre":"Cliente Zonas"}'),
  ('a0000000-0000-4000-8000-0000000009ad', 'zonas.admin@prueba.invalid',   '{"nombre":"Admin Zonas"}');
update public.perfiles set rol = 'admin' where id = 'a0000000-0000-4000-8000-0000000009ad';

do $$
declare sab date := (now() at time zone 'America/Mexico_City')::date + 9;
begin
  sab := sab + ((6 - extract(dow from sab)::int + 7) % 7);
  while exists (select 1 from public.ocupacion(sab - 1, sab + 8))
        or exists (select 1 from public.retenciones r
                    where r.bloque && tstzrange(sab::timestamp at time zone 'America/Mexico_City',
                                                (sab + 8)::timestamp at time zone 'America/Mexico_City')) loop
    sab := sab + 7;
  end loop;
  perform set_config('prueba.sab', sab::text, true);
end $$;

create function pg_temp.h(dias int, hora text) returns timestamptz language sql stable as $$
  select (current_setting('prueba.sab')::date + dias + hora::time) at time zone 'America/Mexico_City'
$$;
grant execute on function pg_temp.h(int, text) to anon, authenticated;

create function pg_temp.horas(p_cp text, dias int) returns text language sql stable as $$
  select coalesce(string_agg(to_char(inicio at time zone 'America/Mexico_City', 'HH24:MI'), ' ' order by inicio), '')
    from public.horarios_disponibles('a0000000-0000-4000-8000-000000000910', null, '{}', p_cp, current_setting('prueba.sab')::date + dias)
$$;

-- ── Cobertura ───────────────────────────────────────────────────────────────
do $$ begin
  if (public.zona_por_cp('00904')).nombre is distinct from 'Prueba estado' then
    raise exception 'PRUEBA FALLIDA Z01: un CP del estado no cayó en la zona del estado';
  end if;
  if (public.zona_por_cp('00905')).id is not null then
    raise exception 'PRUEBA FALLIDA Z01: un municipio homónimo de otro estado tuvo cobertura';
  end if;
  raise notice 'Z01 ok: una zona puede cubrir un estado completo, sin confundir municipios homónimos';

  if (public.zona_por_cp('00901')).nombre is distinct from 'Prueba norte'
     or (public.zona_por_cp('00902')).nombre is distinct from 'Prueba colonia' then
    raise exception 'PRUEBA FALLIDA Z02: lo más específico no ganó';
  end if;
  raise notice 'Z02 ok: lo más específico gana (CP sobre municipio, municipio sobre estado)';

  update public.zonas set activa = false where nombre = 'Prueba norte';
  if (public.zona_por_cp('00901')).id is not null then
    raise exception 'PRUEBA FALLIDA Z03: al pausar la ciudad, el CP pasó a la zona del estado';
  end if;
  update public.zonas set activa = true where nombre = 'Prueba norte';
  raise notice 'Z03 ok: pausar una zona deja sin cobertura sus lugares, no los pasa a otra zona';
end $$;

do $$ begin
  begin
    insert into public.zonas (nombre, municipios) values ('Duplicada mun', array['Estado Prueba|Ciudad Sur']);
    raise exception 'PRUEBA FALLIDA Z04: aceptó un municipio en dos zonas';
  exception when unique_violation then null;
  end;
  begin
    insert into public.zonas (nombre, codigos_postales) values ('Duplicada cp', array['00902']);
    raise exception 'PRUEBA FALLIDA Z04: aceptó un CP en dos zonas';
  exception when unique_violation then null;
  end;
  begin
    insert into public.zonas (nombre, estados) values ('Duplicada est', array['Estado Prueba']);
    raise exception 'PRUEBA FALLIDA Z04: aceptó un estado en dos zonas';
  exception when unique_violation then null;
  end;
  update public.zonas set municipios = municipios where nombre = 'Prueba norte';
  raise notice 'Z04 ok: un mismo lugar no puede estar en dos zonas, y una zona se puede volver a guardar';
end $$;

do $$
declare malo text;
begin
  foreach malo in array array['{}', '[]', '{"7": {"abre": "09:00", "cierra": "10:00"}}', '{"1": {"abre": "10:00", "cierra": "09:00"}}', '{"1": {"abre": "9am", "cierra": "10:00"}}'] loop
    begin
      update public.zonas set horario = malo::jsonb where nombre = 'Prueba norte';
      raise exception 'PRUEBA FALLIDA Z05: aceptó el horario %', malo;
    exception when check_violation then null;
    end;
  end loop;
  raise notice 'Z05 ok: rechaza horarios de zona inválidos';
end $$;

-- ── Horarios por zona ───────────────────────────────────────────────────────
do $$ begin
  if pg_temp.horas('00901', 0) <> '08:00 09:00 10:00' then
    raise exception 'PRUEBA FALLIDA Z06: el norte ofrece: %', pg_temp.horas('00901', 0);
  end if;
  if pg_temp.horas('00903', 0) <> '19:00 20:00 21:00' then
    raise exception 'PRUEBA FALLIDA Z06: el sur ofrece: %', pg_temp.horas('00903', 0);
  end if;
  raise notice 'Z06 ok: el mismo día, el norte se ofrece en la mañana y el sur en la noche';

  if pg_temp.horas('00904', 0) <> '12:00 13:00 14:00' then
    raise exception 'PRUEBA FALLIDA Z07: sin horario propio ofrece: %', pg_temp.horas('00904', 0);
  end if;
  raise notice 'Z07 ok: una zona sin horario propio usa el horario general';

  if pg_temp.horas('00903', 1) <> '19:00 20:00 21:00' or pg_temp.horas('00904', 1) <> '' or pg_temp.horas('00901', 1) <> '' then
    raise exception 'PRUEBA FALLIDA Z08: el domingo: sur %, estado %, norte %', pg_temp.horas('00903', 1), pg_temp.horas('00904', 1), pg_temp.horas('00901', 1);
  end if;
  raise notice 'Z08 ok: el horario propio reemplaza al general, y un día sin horario no tiene servicio';

  if (select estado from public.disponibilidad_mes('a0000000-0000-4000-8000-000000000910', null, '{}', '00901',
        extract(year from current_setting('prueba.sab')::date)::int, extract(month from current_setting('prueba.sab')::date)::int) d
       where d.fecha = current_setting('prueba.sab')::date) <> 'libre' then
    raise exception 'PRUEBA FALLIDA Z09: el calendario del mes no refleja el horario de la zona';
  end if;
  raise notice 'Z09 ok: el calendario del mes usa el horario de la zona';
end $$;

-- ── Cliente ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000009a1', true);

do $$
declare r public.reservaciones;
begin
  begin
    perform public.crear_reservacion('a0000000-0000-4000-8000-000000000910', null, pg_temp.h(0, '12:00'), '00901', 'Calle', 'Lomas');
    raise exception 'PRUEBA FALLIDA Z10: reservó en el norte fuera de su horario';
  exception when others then
    if sqlerrm not like 'FUERA_DE_HORARIO%' then raise; end if;
  end;
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000000910', null, pg_temp.h(0, '09:00'), '00901', 'Calle', 'Lomas');
  if r.cargo_traslado <> 100 or r.total <> 1100 then
    raise exception 'PRUEBA FALLIDA Z10: cobró traslado %, total %', r.cargo_traslado, r.total;
  end if;
  perform set_config('prueba.r1', r.id::text, true);
  r := public.crear_reservacion('a0000000-0000-4000-8000-000000000910', null, pg_temp.h(0, '20:00'), '00903', 'Calle', 'Jardín');
  if r.cargo_traslado <> 300 then
    raise exception 'PRUEBA FALLIDA Z10: el sur cobró %', r.cargo_traslado;
  end if;
  raise notice 'Z10 ok: reservar respeta el horario y cobra el costo de cada zona';
end $$;

do $$ begin
  perform public.apartar_horario('a0000000-0000-4000-8000-000000000910', null, '{}', '00901', pg_temp.h(0, '20:00'));
  raise exception 'PRUEBA FALLIDA Z11: apartó en el norte fuera de su horario';
exception when others then
  if sqlerrm not like 'FUERA_DE_HORARIO%' then raise; end if;
  raise notice 'Z11 ok: apartar un horario también respeta el horario de la zona';
end $$;

do $$
declare n int;
begin
  update public.zonas set cargo_traslado = 0 where nombre = 'Prueba norte';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'PRUEBA FALLIDA Z12: el cliente cambió el costo de una zona'; end if;
  begin
    insert into public.catalogo_cp (codigo_postal, estado, municipio, busqueda) values ('00906', 'x', 'x', 'x');
    raise exception 'PRUEBA FALLIDA Z12: el cliente escribió en el catálogo';
  exception when insufficient_privilege then null;
  end;
  raise notice 'Z12 ok: el cliente no cambia zonas ni catálogo';
end $$;

reset role;

-- ── Administrador ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000009ad', true);
do $$ begin
  -- El admin puede salirse del horario, pero solo dejando el motivo
  begin
    perform public.reprogramar_reservacion(current_setting('prueba.r1')::uuid, pg_temp.h(0, '12:00'), '');
    raise exception 'PRUEBA FALLIDA Z13: el admin reprogramó fuera de horario sin motivo';
  exception when others then
    if sqlerrm not like 'MOTIVO_REQUERIDO%fuera de horario%' then raise; end if;
  end;
  perform public.reprogramar_reservacion(current_setting('prueba.r1')::uuid, pg_temp.h(0, '10:00'), '');
  raise notice 'Z13 ok: reprogramar usa el horario de la zona';
end $$;
reset role;

-- ── Visitante: búsqueda en el catálogo ──────────────────────────────────────
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare t text;
begin
  select string_agg(b.codigo_postal, ',' order by b.codigo_postal) into t from public.catalogo_buscar('JARDIN') b where b.tipo = 'cp';
  if t not like '%00903%' then raise exception 'PRUEBA FALLIDA Z14: buscar sin acento dio %', t; end if;
  if not exists (select 1 from public.catalogo_buscar('ciudad norte') b where b.tipo = 'municipio' and b.municipio = 'Ciudad Norte') then
    raise exception 'PRUEBA FALLIDA Z14: no encontró el municipio';
  end if;
  if not exists (select 1 from public.catalogo_buscar('estado prueba') b where b.tipo = 'estado') then
    raise exception 'PRUEBA FALLIDA Z14: no encontró el estado';
  end if;
  if exists (select 1 from public.catalogo_buscar('x')) or exists (select 1 from public.catalogo_buscar('   ')) then
    raise exception 'PRUEBA FALLIDA Z14: buscó con menos de 2 letras';
  end if;
  if (select cps from public.catalogo_municipios('Estado Prueba') m where m.municipio = 'Ciudad Norte') <> 2 then
    raise exception 'PRUEBA FALLIDA Z14: mal conteo de CP';
  end if;
  raise notice 'Z14 ok: la búsqueda ignora acentos y encuentra estados, municipios y colonias';
end $$;

do $$ begin
  perform public.horario_de_zona(null, 1);
  raise exception 'PRUEBA FALLIDA Z15: el visitante llamó una función interna';
exception when insufficient_privilege then
  raise notice 'Z15 ok: el visitante no llama funciones internas';
end $$;
reset role;

do $$ begin raise notice 'Batería 09 completa: 15 pruebas ok. Deshaciendo los datos de prueba...'; end $$;
rollback;
