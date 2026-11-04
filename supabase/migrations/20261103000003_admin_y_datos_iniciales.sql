-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 3: administrador y datos iniciales
-- Configuración por defecto, horario, zonas y el catálogo de ejemplo del
-- prototipo. Cuando el cliente entregue su información real, se edita desde
-- el panel o se reemplaza con otra migración.
-- Se puede ejecutar más de una vez sin duplicar datos.
-- ═════════════════════════════════════════════════════════════════════════════

-- Todo el archivo se aplica completo o no se aplica nada.
begin;

-- ── Administrador ───────────────────────────────────────────────────────────
-- Perfiles para usuarios que ya existían antes del trigger al_crear_usuario
insert into public.perfiles (id)
select u.id from auth.users u
on conflict (id) do nothing;

update public.perfiles p
   set rol = 'admin'
  from auth.users u
 where u.id = p.id
   and lower(u.email) = 'picafresa.codex@gmail.com';

-- ── Configuración del negocio ───────────────────────────────────────────────
insert into public.configuracion (id, nombre_negocio, whatsapp, correo_contacto)
values (1, 'Animayuks', '523312345678', 'reservas@animayuks.com')
on conflict (id) do nothing;

-- 0 = domingo … 6 = sábado
insert into public.horario_servicio (dia_semana, activo, abre, cierra) values
  (0, true,  '09:00', '21:00'),
  (1, false, '10:00', '20:00'),
  (2, true,  '10:00', '20:00'),
  (3, true,  '10:00', '20:00'),
  (4, true,  '10:00', '20:00'),
  (5, true,  '10:00', '22:00'),
  (6, true,  '09:00', '23:00')
on conflict (dia_semana) do nothing;

-- ── Zonas de cobertura (ejemplo: zona metropolitana de Guadalajara) ─────────
insert into public.zonas (nombre, codigos_postales, cargo_traslado, traslado_min, activa, color) values
  ('Guadalajara', array['441','442','443','444','445','446','447','448','449'], 0,   20, true,  '#a3122a'),
  ('Zapopan',     array['450','451','452'],                                      350, 35, true,  '#f2b705'),
  ('Tlaquepaque', array['455'],                                                  350, 30, true,  '#0f7b6c'),
  ('Tonalá',      array['454'],                                                  500, 40, true,  '#3b2a8f'),
  ('Tlajomulco',  array['456'],                                                  800, 60, false, '#5e5873')
on conflict (nombre) do nothing;

-- ── Catálogo de ejemplo ─────────────────────────────────────────────────────
insert into public.categorias (nombre, orden) values
  ('Infantil', 1), ('Bodas y XV años', 2), ('Corporativo', 3)
on conflict (nombre) do nothing;

insert into public.extras (nombre, precio, minutos, orden) values
  ('Media hora extra', 900, 30, 1),
  ('Equipo de sonido', 750, 0, 2),
  ('Foto del recuerdo impresa (30 pzs)', 1100, 0, 3),
  ('Pintacaritas durante 1 h', 850, 0, 4)
on conflict (nombre) do nothing;

insert into public.shows (slug, nombre, categoria_id, resumen, descripcion, duracion_min, montaje_min, desmontaje_min, artistas, requisitos, precio_base, destacado, orden)
select s.slug, s.nombre, c.id, s.resumen, s.descripcion, s.duracion, s.montaje, s.desmontaje, s.artistas, s.requisitos, s.precio, s.destacado, s.orden
  from (values
    ('circo-de-bolsillo', 'Circo de Bolsillo', 'Infantil',
     'Acrobacia, malabares y un payaso que nunca encuentra su sombrero.',
     'Tres artistas convierten tu patio o salón en una pista de circo. Malabares con antorchas de luz, acrobacia en piso, globoflexia y un número final donde los niños forman parte del espectáculo.',
     60, 30, 20, 3, array['Espacio libre de 4 × 4 m', 'Toma de corriente a menos de 10 m', 'Techo de al menos 3 m si es interior'], 3800, true, 1),
    ('magia-en-la-sala', 'Magia en la Sala', 'Infantil',
     'Ilusionismo de cerca: cartas, monedas y una paloma que aparece en tu mano.',
     'Un mago, una mesa y muchas sorpresas. Ideal para fiestas en casa: la magia ocurre a medio metro del público. Incluye un número donde el festejado se vuelve asistente del mago.',
     50, 20, 15, 1, array['Mesa de 1 m', 'Público sentado frente al mago'], 3200, true, 2),
    ('burbujas-gigantes', 'Burbujas Gigantes', 'Infantil',
     'Burbujas donde cabe un niño entero, humo dentro de esferas y mucha ciencia.',
     'Un show de ciencia divertida con burbujas de hasta 3 metros, burbujas de humo, burbujas cuadradas y el momento estrella: meter a un niño dentro de una burbuja.',
     45, 20, 20, 2, array['Preferentemente al aire libre', 'Piso que se pueda mojar'], 2900, true, 3),
    ('titeres-del-callejon', 'Títeres del Callejón', 'Infantil',
     'Teatro de títeres con canciones en vivo y un villano que siempre pierde.',
     'Teatrino portátil, títeres hechos a mano y música en vivo. Obras de 40 minutos para niños de 2 a 8 años, con canciones que el público aprende y canta.',
     50, 25, 20, 2, array['Espacio de 3 × 2 m', 'Público sentado en el piso o sillas bajas'], 2600, false, 4),
    ('noche-de-boleros', 'Noche de Boleros', 'Bodas y XV años',
     'Trío romántico con requinto, para el brindis o la cena.',
     'Trío de voces y guitarras con repertorio clásico de bolero y canción romántica. Pueden acompañar la entrada de los novios, el brindis y la cena. Repertorio personalizable.',
     90, 15, 10, 3, array['Tres sillas sin brazos', 'Toma de corriente si el salón es grande'], 6500, false, 5),
    ('batucada-carnaval', 'Batucada Carnaval', 'Corporativo',
     'Percusión brasileña, zanqueros y confeti para abrir la pista.',
     'Ocho percusionistas y dos zanqueros entran por sorpresa y levantan a todo el salón. Ideal para posadas, aniversarios de empresa y para abrir la pista en bodas.',
     40, 20, 15, 10, array['Acceso amplio al salón', 'Aviso al venue (volumen alto)'], 7800, false, 6)
  ) as s(slug, nombre, categoria, resumen, descripcion, duracion, montaje, desmontaje, artistas, requisitos, precio, destacado, orden)
  join public.categorias c on c.nombre = s.categoria
on conflict (slug) do nothing;

insert into public.paquetes (show_id, nombre, precio, duracion_min, incluye, orden)
select sh.id, p.nombre, p.precio, p.duracion, p.incluye, p.orden
  from (values
    ('circo-de-bolsillo',    'Función',                 3800,  null::int, array['60 min de show', 'Globoflexia para 20 niños'], 1),
    ('circo-de-bolsillo',    'Función + taller',        4900,  90,        array['60 min de show', 'Taller de malabares de 30 min', 'Globoflexia para 30 niños'], 2),
    ('circo-de-bolsillo',    'Gran carpa',              6800,  105,       array['75 min de show', 'Taller de malabares', 'Zanquero de bienvenida', 'Sonido incluido'], 3),
    ('magia-en-la-sala',     'Función',                 3200,  null,      array['50 min de magia', 'Diploma de mago para el festejado'], 1),
    ('magia-en-la-sala',     'Función + magia de mesa', 4400,  90,        array['50 min de show', '40 min de magia entre mesas'], 2),
    ('burbujas-gigantes',    'Función',                 2900,  null,      array['45 min de show'], 1),
    ('burbujas-gigantes',    'Función + zona libre',    3700,  75,        array['45 min de show', '30 min de burbujas libres para los niños'], 2),
    ('titeres-del-callejon', 'Función',                 2600,  null,      array['Obra de 40 min', '10 min de convivencia con los títeres'], 1),
    ('noche-de-boleros',     '90 minutos',              6500,  null,      array['90 min en dos sets', 'Tres canciones a elección'], 1),
    ('noche-de-boleros',     'Toda la cena',            9200,  150,       array['150 min', 'Entrada de novios', 'Repertorio a elección'], 2),
    ('batucada-carnaval',    'Entrada sorpresa',        7800,  null,      array['40 min', '8 percusionistas', '2 zanqueros'], 1),
    ('batucada-carnaval',    'Carnaval completo',       11500, 60,        array['60 min', 'Bailarinas', 'Cañones de confeti'], 2)
  ) as p(slug, nombre, precio, duracion, incluye, orden)
  join public.shows sh on sh.slug = p.slug
on conflict (show_id, nombre) do nothing;

commit;

-- Comprobación rápida: debe mostrar el correo del admin con rol 'admin'
select u.email, p.rol
  from public.perfiles p join auth.users u on u.id = p.id
 order by p.rol, u.email;
