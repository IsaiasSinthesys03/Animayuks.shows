// Datos simulados del prototipo. Nada aquí se conecta a un backend.

export const HOY = new Date(2026, 9, 28) // 28 oct 2026

export const NEGOCIO = {
  nombre: 'Telón',
  ciudad: 'Guadalajara',
  whatsapp: '33 1234 5678',
  correo: 'reservas@telonshows.mx',
}

export const CATEGORIAS = ['Infantil', 'Bodas y XV años', 'Corporativo']

export const SHOWS = [
  {
    id: 'circo-de-bolsillo',
    nombre: 'Circo de Bolsillo',
    categoria: 'Infantil',
    resumen: 'Acrobacia, malabares y un payaso que nunca encuentra su sombrero.',
    descripcion:
      'Tres artistas convierten tu patio o salón en una pista de circo. Malabares con antorchas de luz, acrobacia en piso, globoflexia y un número final donde los niños forman parte del espectáculo.',
    duracion: 60,
    artistas: 3,
    precio: 3800,
    calificacion: 4.9,
    resenas: 128,
    cartel: { fondo: 'bg-telon-600', texto: 'text-white', acento: 'text-marquesina' },
    requisitos: ['Espacio libre de 4 × 4 m', 'Toma de corriente a menos de 10 m', 'Techo de al menos 3 m si es interior'],
    paquetes: [
      { id: 'basico', nombre: 'Función', precio: 3800, incluye: ['60 min de show', 'Globoflexia para 20 niños'] },
      { id: 'plus', nombre: 'Función + taller', precio: 4900, incluye: ['60 min de show', 'Taller de malabares de 30 min', 'Globoflexia para 30 niños'] },
      { id: 'premium', nombre: 'Gran carpa', precio: 6800, incluye: ['75 min de show', 'Taller de malabares', 'Zanquero de bienvenida', 'Sonido incluido'] },
    ],
  },
  {
    id: 'magia-en-la-sala',
    nombre: 'Magia en la Sala',
    categoria: 'Infantil',
    resumen: 'Ilusionismo de cerca: cartas, monedas y una paloma que aparece en tu mano.',
    descripcion:
      'Un mago, una mesa y muchas sorpresas. Ideal para fiestas en casa: la magia ocurre a medio metro del público. Incluye un número donde el festejado se vuelve asistente del mago.',
    duracion: 50,
    artistas: 1,
    precio: 3200,
    calificacion: 4.8,
    resenas: 96,
    cartel: { fondo: 'bg-tinta', texto: 'text-white', acento: 'text-marquesina' },
    requisitos: ['Mesa de 1 m', 'Público sentado frente al mago'],
    paquetes: [
      { id: 'basico', nombre: 'Función', precio: 3200, incluye: ['50 min de magia', 'Diploma de mago para el festejado'] },
      { id: 'plus', nombre: 'Función + magia de mesa', precio: 4400, incluye: ['50 min de show', '40 min de magia entre mesas'] },
    ],
  },
  {
    id: 'burbujas-gigantes',
    nombre: 'Burbujas Gigantes',
    categoria: 'Infantil',
    resumen: 'Burbujas donde cabe un niño entero, humo dentro de esferas y mucha ciencia.',
    descripcion:
      'Un show de ciencia divertida con burbujas de hasta 3 metros, burbujas de humo, burbujas cuadradas y el momento estrella: meter a un niño dentro de una burbuja.',
    duracion: 45,
    artistas: 2,
    precio: 2900,
    calificacion: 4.7,
    resenas: 74,
    cartel: { fondo: 'bg-marquesina', texto: 'text-tinta', acento: 'text-telon-700' },
    requisitos: ['Preferentemente al aire libre', 'Piso que se pueda mojar'],
    paquetes: [
      { id: 'basico', nombre: 'Función', precio: 2900, incluye: ['45 min de show'] },
      { id: 'plus', nombre: 'Función + zona libre', precio: 3700, incluye: ['45 min de show', '30 min de burbujas libres para los niños'] },
    ],
  },
  {
    id: 'titeres-del-callejon',
    nombre: 'Títeres del Callejón',
    categoria: 'Infantil',
    resumen: 'Teatro de títeres con canciones en vivo y un villano que siempre pierde.',
    descripcion:
      'Teatrino portátil, títeres hechos a mano y música en vivo. Obras de 40 minutos para niños de 2 a 8 años, con canciones que el público aprende y canta.',
    duracion: 50,
    artistas: 2,
    precio: 2600,
    calificacion: 4.9,
    resenas: 51,
    cartel: { fondo: 'bg-ok', texto: 'text-white', acento: 'text-marquesina' },
    requisitos: ['Espacio de 3 × 2 m', 'Público sentado en el piso o sillas bajas'],
    paquetes: [{ id: 'basico', nombre: 'Función', precio: 2600, incluye: ['Obra de 40 min', '10 min de convivencia con los títeres'] }],
  },
  {
    id: 'noche-de-boleros',
    nombre: 'Noche de Boleros',
    categoria: 'Bodas y XV años',
    resumen: 'Trío romántico con requinto, para el brindis o la cena.',
    descripcion:
      'Trío de voces y guitarras con repertorio clásico de bolero y canción romántica. Pueden acompañar la entrada de los novios, el brindis y la cena. Repertorio personalizable.',
    duracion: 90,
    artistas: 3,
    precio: 6500,
    calificacion: 5.0,
    resenas: 39,
    cartel: { fondo: 'bg-telon-900', texto: 'text-white', acento: 'text-telon-200' },
    requisitos: ['Tres sillas sin brazos', 'Toma de corriente si el salón es grande'],
    paquetes: [
      { id: 'basico', nombre: '90 minutos', precio: 6500, incluye: ['90 min en dos sets', 'Tres canciones a elección'] },
      { id: 'plus', nombre: 'Toda la cena', precio: 9200, incluye: ['150 min', 'Entrada de novios', 'Repertorio a elección'] },
    ],
  },
  {
    id: 'batucada-carnaval',
    nombre: 'Batucada Carnaval',
    categoria: 'Corporativo',
    resumen: 'Percusión brasileña, zanqueros y confeti para abrir la pista.',
    descripcion:
      'Ocho percusionistas y dos zanqueros entran por sorpresa y levantan a todo el salón. Ideal para posadas, aniversarios de empresa y para abrir la pista en bodas.',
    duracion: 40,
    artistas: 10,
    precio: 7800,
    calificacion: 4.8,
    resenas: 22,
    cartel: { fondo: 'bg-[#3b2a8f]', texto: 'text-white', acento: 'text-marquesina' },
    requisitos: ['Acceso amplio al salón', 'Aviso al venue (volumen alto)'],
    paquetes: [
      { id: 'basico', nombre: 'Entrada sorpresa', precio: 7800, incluye: ['40 min', '8 percusionistas', '2 zanqueros'] },
      { id: 'plus', nombre: 'Carnaval completo', precio: 11500, incluye: ['60 min', 'Bailarinas', 'Cañones de confeti'] },
    ],
  },
]

export const EXTRAS = [
  { id: 'tiempo', nombre: 'Media hora extra', precio: 900 },
  { id: 'sonido', nombre: 'Equipo de sonido', precio: 750 },
  { id: 'foto', nombre: 'Foto del recuerdo impresa (30 pzs)', precio: 1100 },
  { id: 'pinta', nombre: 'Pintacaritas durante 1 h', precio: 850 },
]

export const ZONAS = [
  { id: 'gdl', nombre: 'Guadalajara', prefijos: ['441', '442', '443', '444', '445', '446', '447', '448', '449'], cargo: 0, traslado: 20, activa: true, color: 'bg-telon-600' },
  { id: 'zap', nombre: 'Zapopan', prefijos: ['450', '451', '452'], cargo: 350, traslado: 35, activa: true, color: 'bg-marquesina' },
  { id: 'tlq', nombre: 'Tlaquepaque', prefijos: ['455'], cargo: 350, traslado: 30, activa: true, color: 'bg-ok' },
  { id: 'ton', nombre: 'Tonalá', prefijos: ['454'], cargo: 500, traslado: 40, activa: true, color: 'bg-[#3b2a8f]' },
  { id: 'tlj', nombre: 'Tlajomulco', prefijos: ['456'], cargo: 800, traslado: 60, activa: false, color: 'bg-tinta-soft' },
]

/** Devuelve la zona activa que corresponde a un código postal, o null si no hay cobertura. */
export function zonaPorCP(cp) {
  if (!/^\d{5}$/.test(cp)) return null
  return ZONAS.find((z) => z.activa && z.prefijos.includes(cp.slice(0, 3))) ?? null
}

export const HORARIOS = ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00']

export const BLOQUEOS = [
  { fecha: '2026-11-02', motivo: 'Día de Muertos (descanso)' },
  { fecha: '2026-11-16', motivo: 'Mantenimiento de equipo' },
  { fecha: '2026-11-17', motivo: 'Mantenimiento de equipo' },
]

export const CLIENTES = [
  { id: 'c1', nombre: 'Mariana López Ríos', telefono: '33 1845 2290', correo: 'mariana.lr@gmail.com', zona: 'Zapopan', etiquetas: ['Frecuente'], origen: 'En línea', alta: '2025-03-14' },
  { id: 'c2', nombre: 'Jorge Esparza Villa', telefono: '33 2210 7741', correo: 'jesparza@hotmail.com', zona: 'Guadalajara', etiquetas: [], origen: 'Presencial', alta: '2026-01-22' },
  { id: 'c3', nombre: 'Grupo Ferretero del Bajío', telefono: '33 3615 0098', correo: 'eventos@ferrebajio.mx', zona: 'Guadalajara', etiquetas: ['Corporativo'], origen: 'Teléfono', alta: '2024-11-02' },
  { id: 'c4', nombre: 'Ana Sofía Cárdenas', telefono: '33 1102 6655', correo: 'anasofia.c@gmail.com', zona: 'Tlaquepaque', etiquetas: [], origen: 'En línea', alta: '2026-08-30' },
  { id: 'c5', nombre: 'Luis Fernando Ochoa', telefono: '33 4471 2203', correo: '', zona: 'Tonalá', etiquetas: [], origen: 'Presencial', alta: '2026-10-10' },
  { id: 'c6', nombre: 'Paola y Ricardo (boda)', telefono: '33 1987 3321', correo: 'paoyricardo@gmail.com', zona: 'Zapopan', etiquetas: ['VIP'], origen: 'WhatsApp', alta: '2026-05-18' },
  { id: 'c7', nombre: 'Daniela Murguía', telefono: '33 2765 4410', correo: 'dani.murguia@outlook.com', zona: 'Guadalajara', etiquetas: ['Frecuente'], origen: 'En línea', alta: '2025-07-09' },
  { id: 'c8', nombre: 'Colegio Montessori Arcos', telefono: '33 3122 8890', correo: 'direccion@montessoriarcos.edu.mx', zona: 'Zapopan', etiquetas: ['Corporativo'], origen: 'Teléfono', alta: '2026-02-01' },
]

// estado: pendiente | confirmada | realizada | cancelada
export const RESERVACIONES = [
  { folio: 'SHW-26-7K4Q9', clienteId: 'c1', showId: 'circo-de-bolsillo', paquete: 'Función + taller', fecha: '2026-10-31', hora: '16:00', zona: 'Zapopan', direccion: 'Av. Patria 1840, Jardines Universidad, 45110', total: 5250, pagado: 1575, estado: 'confirmada', canal: 'En línea', evento: 'Cumpleaños de Emilio (6 años)' },
  { folio: 'SHW-26-2MZ8T', clienteId: 'c2', showId: 'magia-en-la-sala', paquete: 'Función', fecha: '2026-10-31', hora: '12:00', zona: 'Guadalajara', direccion: 'Calle Libertad 1205, Americana, 44160', total: 3200, pagado: 3200, estado: 'confirmada', canal: 'Presencial', evento: 'Cumpleaños de Sofía (5 años)' },
  { folio: 'SHW-26-9PLX3', clienteId: 'c3', showId: 'batucada-carnaval', paquete: 'Carnaval completo', fecha: '2026-11-07', hora: '20:00', zona: 'Guadalajara', direccion: 'Av. Vallarta 3233, Vallarta Poniente, 44690', total: 11500, pagado: 3450, estado: 'confirmada', canal: 'Teléfono', evento: 'Aniversario 25 años' },
  { folio: 'SHW-26-4HNB7', clienteId: 'c4', showId: 'burbujas-gigantes', paquete: 'Función + zona libre', fecha: '2026-11-01', hora: '14:00', zona: 'Tlaquepaque', direccion: 'Calle Morelos 88, Centro, 45500', total: 4050, pagado: 0, estado: 'pendiente', canal: 'En línea', evento: 'Cumpleaños de Iker (4 años)' },
  { folio: 'SHW-26-6RTW2', clienteId: 'c5', showId: 'titeres-del-callejon', paquete: 'Función', fecha: '2026-11-08', hora: '12:00', zona: 'Tonalá', direccion: 'Av. Tonaltecas 410, Centro, 45400', total: 3100, pagado: 1000, estado: 'confirmada', canal: 'Presencial', evento: 'Bautizo' },
  { folio: 'SHW-26-8CVM5', clienteId: 'c6', showId: 'noche-de-boleros', paquete: 'Toda la cena', fecha: '2026-11-14', hora: '20:00', zona: 'Zapopan', direccion: 'Jardín Los Encinos, Camino a Tesistán km 3, 45200', total: 9550, pagado: 2865, estado: 'confirmada', canal: 'WhatsApp', evento: 'Boda Paola y Ricardo' },
  { folio: 'SHW-26-3DQS1', clienteId: 'c7', showId: 'circo-de-bolsillo', paquete: 'Función', fecha: '2026-11-01', hora: '16:00', zona: 'Guadalajara', direccion: 'Calle Garibaldi 1530, Santa Teresita, 44600', total: 3800, pagado: 1140, estado: 'confirmada', canal: 'En línea', evento: 'Cumpleaños de Valentina (7 años)' },
  { folio: 'SHW-26-5JYH8', clienteId: 'c8', showId: 'magia-en-la-sala', paquete: 'Función + magia de mesa', fecha: '2026-11-21', hora: '10:00', zona: 'Zapopan', direccion: 'Av. Base Aérea 2150, Arcos de Zapopan, 45130', total: 4750, pagado: 0, estado: 'pendiente', canal: 'Teléfono', evento: 'Festival de fin de bimestre' },
  { folio: 'SHW-26-1WKE4', clienteId: 'c1', showId: 'burbujas-gigantes', paquete: 'Función', fecha: '2026-09-20', hora: '14:00', zona: 'Zapopan', direccion: 'Av. Patria 1840, Jardines Universidad, 45110', total: 3250, pagado: 3250, estado: 'realizada', canal: 'En línea', evento: 'Fiesta de fin de verano' },
  { folio: 'SHW-26-0ZGF6', clienteId: 'c7', showId: 'titeres-del-callejon', paquete: 'Función', fecha: '2026-10-11', hora: '12:00', zona: 'Guadalajara', direccion: 'Calle Garibaldi 1530, Santa Teresita, 44600', total: 2600, pagado: 2600, estado: 'realizada', canal: 'En línea', evento: 'Cumpleaños de Tomás (3 años)' },
  { folio: 'SHW-26-7UBN0', clienteId: 'c2', showId: 'burbujas-gigantes', paquete: 'Función', fecha: '2026-11-07', hora: '12:00', zona: 'Guadalajara', direccion: 'Calle Libertad 1205, Americana, 44160', total: 2900, pagado: 0, estado: 'cancelada', canal: 'Presencial', evento: 'Kermés escolar' },
  { folio: 'SHW-26-2AAX9', clienteId: 'c4', showId: 'magia-en-la-sala', paquete: 'Función', fecha: '2026-10-29', hora: '18:00', zona: 'Tlaquepaque', direccion: 'Calle Independencia 210, Centro, 45500', total: 3550, pagado: 1065, estado: 'confirmada', canal: 'En línea', evento: 'Cumpleaños de Regina (9 años)' },
]

export const showPorId = (id) => SHOWS.find((s) => s.id === id)

export const ESTADOS = {
  pendiente: { etiqueta: 'Pendiente', clase: 'bg-alerta-soft text-alerta' },
  confirmada: { etiqueta: 'Confirmada', clase: 'bg-ok-soft text-ok' },
  realizada: { etiqueta: 'Realizada', clase: 'bg-butaca text-tinta-soft' },
  cancelada: { etiqueta: 'Cancelada', clase: 'bg-telon-50 text-telon-700' },
}
