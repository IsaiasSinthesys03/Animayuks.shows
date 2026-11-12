import { textoHora } from './util'

const PARTES = [
  { nombre: 'Madrugada', desde: '00:00', hasta: '05:59' },
  { nombre: 'Mañana', desde: '06:00', hasta: '11:59' },
  { nombre: 'Tarde', desde: '12:00', hasta: '18:59' },
  { nombre: 'Noche', desde: '19:00', hasta: '23:59' },
]

/** Lista de horas agrupada en mañana, tarde y noche */
export default function SelectHora({ valor, opciones, onCambio, etiqueta, vacio, className = '' }) {
  // Una hora guardada fuera de la lista (9:10) se conserva como opción
  const lista = !valor || opciones.includes(valor) ? opciones : [...opciones, valor].sort()
  return (
    <select
      value={valor ?? ''}
      onChange={(e) => e.target.value && onCambio(e.target.value)}
      aria-label={etiqueta}
      className={`num h-10 cursor-pointer rounded-lg border border-linea bg-white px-2 text-[15px] hover:border-tinta-soft focus:border-selva-500 focus:ring-2 focus:ring-selva-100 focus:outline-none ${className}`}
    >
      {vacio && <option value="">{vacio}</option>}
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
