// Utilidades del editor de horarios (franjas)

export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const ORDEN = [1, 2, 3, 4, 5, 6, 0] // la semana empieza en lunes
export const MAX_FRANJAS = 6

const aTexto = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export const aMinutos = (h) => {
  const [hh, mm] = h.split(':').map(Number)
  return hh * 60 + mm
}

/** Cada 15 minutos, de 6:00 a. m. a 11:45 p. m. */
export const HORAS = Array.from({ length: 72 }, (_, i) => aTexto(6 * 60 + i * 15))
/** Para el cierre se puede llegar hasta las 11:59 p. m. */
export const HORAS_CIERRE = [...HORAS.slice(1), '23:59']

export const textoHora = (h) => {
  const [hh, mm] = h.split(':').map(Number)
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'a. m.' : 'p. m.'}`
}
export const textoHoraCorta = (h) => {
  const [hh, mm] = h.split(':').map(Number)
  return `${hh % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${hh < 12 ? 'a. m.' : 'p. m.'}`
}

export const INTERVALOS = [
  { min: 30, texto: '30 min' },
  { min: 60, texto: '1 hora' },
  { min: 90, texto: '1 h 30 min' },
  { min: 120, texto: '2 horas' },
  { min: 150, texto: '2 h 30 min' },
  { min: 180, texto: '3 horas' },
  { min: 240, texto: '4 horas' },
]
export const textoIntervalo = (min) => INTERVALOS.find((x) => x.min === min)?.texto ?? `${min} min`

let contador = 0
export const nuevaClave = () => `f${++contador}`

export const nuevaFranja = (abre = '10:00', cierra = '14:00') => ({ clave: nuevaClave(), abre, cierra, modo: 'intervalo', intervalo_min: 120, horas: [] })

export const PLANTILLAS = [
  { nombre: 'Mañanas', franjas: [['09:00', '14:00']] },
  { nombre: 'Tardes', franjas: [['15:00', '21:00']] },
  { nombre: 'Mañana y tarde', franjas: [['09:00', '13:00'], ['16:00', '21:00']] },
  { nombre: 'Todo el día', franjas: [['09:00', '21:00']] },
]

/** De la base (abre "09:00:00", horas ["16:00:00"]) al editor */
export const desdeBase = (filas) =>
  [...(filas ?? [])]
    .sort((a, b) => a.abre.localeCompare(b.abre))
    .map((f) => ({
      clave: nuevaClave(),
      abre: f.abre.slice(0, 5),
      cierra: f.cierra.slice(0, 5),
      modo: f.modo,
      intervalo_min: f.intervalo_min ?? 120,
      horas: (f.horas ?? []).map((h) => h.slice(0, 5)),
    }))

/** Del editor a lo que guardan las funciones del servidor */
export const aBase = (franjas) =>
  franjas.map((f) => ({
    abre: f.abre,
    cierra: f.cierra,
    modo: f.modo,
    ...(f.modo === 'horas' ? { horas: [...f.horas].sort() } : { intervalo_min: Number(f.intervalo_min) }),
  }))

/** Primer problema de un día, en palabras, o null si está bien */
export function problemaFranjas(franjas, nombreDia) {
  const lista = [...franjas].sort((a, b) => a.abre.localeCompare(b.abre))
  for (const [i, f] of lista.entries()) {
    const rango = `${textoHora(f.abre)} a ${textoHora(f.cierra)}`
    if (f.cierra <= f.abre) return `${nombreDia}: la franja de ${rango} termina antes de empezar.`
    if (f.modo === 'horas') {
      if (f.horas.length === 0) return `${nombreDia}: la franja de ${rango} no tiene horas. Agrega al menos una.`
      if (f.horas.some((h) => h < f.abre || h >= f.cierra)) return `${nombreDia}: hay horas fuera de la franja de ${rango}.`
    } else {
      const m = Number(f.intervalo_min)
      if (!(m >= 15 && m <= 480 && m % 5 === 0)) return `${nombreDia}: el intervalo debe ser de 15 a 480 minutos, en múltiplos de 5.`
    }
    const siguiente = lista[i + 1]
    if (siguiente && siguiente.abre < f.cierra) return `${nombreDia}: dos franjas se enciman (${rango} y ${textoHora(siguiente.abre)} a ${textoHora(siguiente.cierra)}).`
  }
  return null
}

/** "9:00 a. m. a 1:00 p. m., cada 2 horas · 4:00 p. m. a 9:00 p. m., a las 4 p. m. y 6 p. m." */
export const resumenFranjas = (franjas) =>
  franjas.length === 0
    ? 'Sin horario'
    : franjas
        .map((f) => `${textoHoraCorta(f.abre)} a ${textoHoraCorta(f.cierra)}, ${f.modo === 'horas' ? `a las ${f.horas.map(textoHoraCorta).join(', ')}` : `cada ${textoIntervalo(Number(f.intervalo_min))}`}`)
        .join(' · ')
