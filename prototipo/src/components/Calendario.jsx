import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { disponibilidadMes } from '../lib/api'
import { hoy } from '../lib/format'
import { ErrorCarga } from './ui'

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Calendario mensual con la disponibilidad real del show en la zona elegida. */
export default function Calendario({ showId, paqueteId, extras, cp, valor, onCambio, minutosExtra = 0 }) {
  const [anioHoy, mesHoy] = hoy().split('-').map(Number)
  const [{ anio, mes }, setMes] = useState(() => {
    if (valor) {
      const [a, m] = valor.split('-').map(Number)
      return { anio: a, mes: m }
    }
    return { anio: anioHoy, mes: mesHoy }
  })

  const consulta = useQuery({
    queryKey: ['disponibilidad', showId, paqueteId ?? null, extras ?? [], cp, anio, mes, minutosExtra],
    queryFn: () => disponibilidadMes({ showId, paqueteId, extras, cp, anio, mes, minutosExtra }),
    enabled: !!showId && !!cp,
    staleTime: 30 * 1000,
  })

  const cambiar = (delta) => {
    const total = anio * 12 + (mes - 1) + delta
    setMes({ anio: Math.floor(total / 12), mes: (total % 12) + 1 })
  }
  const puedeAtras = anio * 12 + mes > anioHoy * 12 + mesHoy

  // La semana empieza en lunes. Se calcula con UTC para no depender de la zona de quien mira
  const offset = (new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() + 6) % 7

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold first-letter:uppercase">{MESES[mes - 1]} de {anio}</p>
        <div className="flex gap-1">
          <button type="button" disabled={!puedeAtras} onClick={() => cambiar(-1)} className="inline-flex size-10 items-center justify-center rounded-full hover:bg-butaca disabled:opacity-30" aria-label="Mes anterior">
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" onClick={() => cambiar(1)} className="inline-flex size-10 items-center justify-center rounded-full hover:bg-butaca" aria-label="Mes siguiente">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      {consulta.isError ? (
        <ErrorCarga onReintentar={consulta.refetch} texto="No pudimos cargar la disponibilidad." />
      ) : (
        <div className="relative mt-3 grid grid-cols-7 gap-1 text-center text-sm">
          {DIAS.map((d, i) => (
            <span key={i} className="py-1 font-semibold text-tinta-soft" aria-label={DIAS_LARGOS[i]}>{d}</span>
          ))}
          {Array.from({ length: offset }).map((_, i) => <span key={`v${i}`} />)}
          {(consulta.data ?? []).map((d) => {
            const numero = Number(d.fecha.slice(8))
            const sel = valor === d.fecha
            const deshab = d.estado === 'no_disponible' || d.estado === 'lleno'
            return (
              <button
                key={d.fecha}
                type="button"
                disabled={deshab}
                onClick={() => onCambio(d.fecha)}
                aria-pressed={sel}
                aria-label={`${numero} de ${MESES[mes - 1]}${d.estado === 'lleno' ? ', lleno' : d.estado === 'pocos' ? ', pocos horarios' : d.estado === 'no_disponible' ? ', no disponible' : ''}`}
                className={`num relative flex aspect-square flex-col items-center justify-center rounded-xl text-[15px] font-semibold transition-colors ${
                  sel ? 'bg-selva-600 text-white'
                    : d.estado === 'no_disponible' ? 'text-tinta-soft/40'
                    : d.estado === 'lleno' ? 'text-tinta-soft/50 line-through'
                    : 'hover:bg-butaca'
                }`}
              >
                {numero}
                {!deshab && !sel && <span className={`absolute bottom-1.5 size-1.5 rounded-full ${d.estado === 'pocos' ? 'bg-maiz' : 'bg-agua'}`} aria-hidden />}
              </button>
            )
          })}
          {consulta.isLoading && (
            <div className="col-span-7 flex items-center justify-center gap-2 py-16 text-tinta-soft">
              <Loader2 className="size-5 animate-spin" /> Buscando fechas libres…
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-tinta-soft">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-ok" /> Disponible</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-maiz" /> Pocos horarios</span>
        <span className="inline-flex items-center gap-1.5"><span className="line-through">15</span> Sin horarios</span>
      </div>
    </div>
  )
}
