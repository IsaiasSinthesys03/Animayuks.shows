import { Interruptor } from './AdminLayout'

// Cada media hora, de 6:00 a. m. a 11:30 p. m.
const HORAS = Array.from({ length: 36 }, (_, i) => {
  const minutos = 6 * 60 + i * 30
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
})
const PARTES = [
  { nombre: 'Mañana', desde: '00:00', hasta: '11:59' },
  { nombre: 'Tarde', desde: '12:00', hasta: '18:59' },
  { nombre: 'Noche', desde: '19:00', hasta: '23:59' },
]

const textoHora = (h) => {
  const [hh, mm] = h.split(':').map(Number)
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'a. m.' : 'p. m.'}`
}

function ListaHoras({ valor, opciones, onCambio, etiqueta }) {
  // Una hora guardada fuera de las medias horas (9:15) se conserva como opción
  const lista = opciones.includes(valor) ? opciones : [...opciones, valor].sort()
  return (
    <select value={valor} onChange={(e) => onCambio(e.target.value)} aria-label={etiqueta} className="num h-10 cursor-pointer rounded-lg border border-linea bg-white px-2 text-[15px] hover:border-tinta-soft focus:border-selva-500 focus:ring-2 focus:ring-selva-100 focus:outline-none">
      {PARTES.map((p) => {
        const horas = lista.filter((h) => h >= p.desde && h <= p.hasta)
        if (horas.length === 0) return null
        return (
          <optgroup key={p.nombre} label={p.nombre}>
            {horas.map((h) => <option key={h} value={h}>{textoHora(h)}</option>)}
          </optgroup>
        )
      })}
    </select>
  )
}

/** Un día de la semana: encendido o no, de qué hora a qué hora, y copiar a los demás días */
export default function FilaHorario({ dia, activo, abre, cierra, onCambio, onCopiar }) {
  const cambiarInicio = (nuevo) => {
    if (cierra > nuevo) return onCambio({ abre: nuevo })
    // Para que nunca quede un horario imposible, el cierre se recorre una hora
    const siguiente = HORAS[Math.min(HORAS.indexOf(nuevo) + 2, HORAS.length - 1)]
    onCambio({ abre: nuevo, cierra: siguiente > nuevo ? siguiente : HORAS[HORAS.length - 1] })
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <Interruptor activo={activo} etiqueta={`Dar servicio los ${dia.toLowerCase()}`} onCambio={() => onCambio({ activo: !activo })} />
      <span className="w-24 font-medium">{dia}</span>
      {activo ? (
        <>
          <span className="flex items-center gap-2 text-sm">
            <ListaHoras valor={abre} opciones={HORAS.slice(0, -1)} onCambio={cambiarInicio} etiqueta={`${dia}, desde`} />
            a
            <ListaHoras valor={cierra} opciones={HORAS.filter((h) => h > abre)} onCambio={(h) => onCambio({ cierra: h })} etiqueta={`${dia}, hasta`} />
          </span>
          <button type="button" onClick={onCopiar} aria-label={`Copiar el horario del ${dia.toLowerCase()} a los demás días encendidos`} className="text-sm font-semibold text-selva-700 underline">
            Copiar a todos
          </button>
        </>
      ) : (
        <span className="text-sm text-tinta-soft">Sin servicio</span>
      )}
    </li>
  )
}
