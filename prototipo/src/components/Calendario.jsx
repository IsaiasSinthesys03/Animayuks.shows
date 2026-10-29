import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { HORARIOS, HOY } from '../data/mock'
import { isoFecha } from '../lib/format'
import { useStore } from '../store'

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** Calendario mensual con disponibilidad. Respeta la anticipación mínima de 48 h (RN-04). */
export default function Calendario({ valor, onCambio, anticipacionDias = 2 }) {
  const { ocupacion } = useStore()
  const [mes, setMes] = useState(() => new Date(HOY.getFullYear(), HOY.getMonth(), 1))

  const minimo = new Date(HOY)
  minimo.setDate(minimo.getDate() + anticipacionDias)

  const primero = new Date(mes)
  const offset = (primero.getDay() + 6) % 7
  const diasMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: diasMes }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1))]

  const estadoDia = (d) => {
    if (d < minimo) return 'pasado'
    const { bloqueado, ocupados } = ocupacion(isoFecha(d))
    if (bloqueado || ocupados.length >= HORARIOS.length) return 'lleno'
    if (ocupados.length >= 2) return 'pocos'
    return 'libre'
  }

  const puedeAtras = mes > new Date(HOY.getFullYear(), HOY.getMonth(), 1)

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold first-letter:uppercase">{mes.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</p>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={!puedeAtras}
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-butaca disabled:opacity-30"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-butaca"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-sm" role="grid">
        {DIAS.map((d, i) => (
          <span key={i} className="py-1 font-semibold text-tinta-soft" aria-label={DIAS_LARGOS[i]}>
            {d}
          </span>
        ))}
        {celdas.map((d, i) => {
          if (!d) return <span key={`v${i}`} />
          const iso = isoFecha(d)
          const est = estadoDia(d)
          const sel = valor === iso
          const deshab = est === 'pasado' || est === 'lleno'
          return (
            <button
              key={iso}
              type="button"
              disabled={deshab}
              onClick={() => onCambio(iso)}
              aria-pressed={sel}
              aria-label={`${d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}${est === 'lleno' ? ', sin horarios' : est === 'pocos' ? ', pocos horarios' : ''}`}
              className={`num relative flex aspect-square flex-col items-center justify-center rounded-xl text-[15px] font-semibold transition-colors ${
                sel
                  ? 'bg-telon-600 text-white'
                  : est === 'pasado'
                    ? 'text-tinta-soft/40'
                    : est === 'lleno'
                      ? 'text-tinta-soft/50 line-through'
                      : 'hover:bg-butaca'
              }`}
            >
              {d.getDate()}
              {!deshab && !sel && <span className={`absolute bottom-1.5 size-1.5 rounded-full ${est === 'pocos' ? 'bg-marquesina' : 'bg-ok'}`} aria-hidden />}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-tinta-soft">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-ok" /> Disponible</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-marquesina" /> Pocos horarios</span>
        <span className="inline-flex items-center gap-1.5"><span className="line-through">15</span> Sin horarios</span>
      </div>
    </div>
  )
}
