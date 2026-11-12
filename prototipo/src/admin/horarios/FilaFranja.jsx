import { Trash2, X } from 'lucide-react'
import SelectHora from './SelectHora'
import { HORAS, HORAS_CIERRE, INTERVALOS, aMinutos, textoHoraCorta } from './util'

const claseSegmento = (activo) =>
  `h-8 rounded-md px-3 text-sm font-semibold transition-colors ${activo ? 'bg-white shadow-sm' : 'text-tinta-soft hover:text-tinta'}`

/** Una franja: de qué hora a qué hora y cómo se ofrecen las horas de inicio */
export default function FilaFranja({ franja: f, nombreDia, onCambio, onQuitar }) {
  const etiqueta = `${nombreDia}, franja de ${textoHoraCorta(f.abre)}`
  const enLista = INTERVALOS.some((x) => x.min === Number(f.intervalo_min))
  const disponibles = HORAS.filter((h) => h >= f.abre && h < f.cierra && !f.horas.includes(h))

  const cambiarInicio = (nuevo) => {
    if (f.cierra > nuevo) return onCambio({ abre: nuevo })
    // Para que nunca quede imposible, el cierre se recorre dos horas
    const m = Math.min(aMinutos(nuevo) + 120, 23 * 60 + 59)
    onCambio({ abre: nuevo, cierra: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` })
  }

  return (
    <li className="rounded-xl bg-butaca/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 text-sm">
          <SelectHora valor={f.abre} opciones={HORAS} onCambio={cambiarInicio} etiqueta={`${etiqueta}: desde`} />
          a
          <SelectHora valor={f.cierra} opciones={HORAS_CIERRE.filter((h) => h > f.abre)} onCambio={(h) => onCambio({ cierra: h })} etiqueta={`${etiqueta}: hasta`} />
        </span>
        <button type="button" onClick={onQuitar} aria-label={`Quitar ${etiqueta}`} className="ml-auto rounded-full p-2 text-tinta-soft hover:bg-error-soft hover:text-error">
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label={`${etiqueta}: cómo se ofrecen las horas`} className="inline-flex rounded-lg bg-linea/60 p-0.5">
          <button type="button" role="radio" aria-checked={f.modo === 'intervalo'} onClick={() => onCambio({ modo: 'intervalo' })} className={claseSegmento(f.modo === 'intervalo')}>Cada…</button>
          <button type="button" role="radio" aria-checked={f.modo === 'horas'} onClick={() => onCambio({ modo: 'horas' })} className={claseSegmento(f.modo === 'horas')}>Horas exactas</button>
        </div>

        {f.modo === 'intervalo' && (
          <span className="flex items-center gap-2">
            <select
              value={enLista ? String(f.intervalo_min) : 'otro'}
              onChange={(e) => onCambio({ intervalo_min: e.target.value === 'otro' ? 45 : Number(e.target.value) })}
              aria-label={`${etiqueta}: cada cuánto`}
              className="h-9 cursor-pointer rounded-lg border border-linea bg-white px-2 text-sm focus:border-selva-500 focus:outline-none"
            >
              {INTERVALOS.map((x) => <option key={x.min} value={x.min}>{x.texto}</option>)}
              <option value="otro">Otro…</option>
            </select>
            {!enLista && (
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="number" min={15} max={480} step={5} value={f.intervalo_min}
                  onChange={(e) => onCambio({ intervalo_min: e.target.value === '' ? '' : Number(e.target.value) })}
                  aria-label={`${etiqueta}: minutos entre horas`}
                  className="num h-9 w-20 rounded-lg border border-linea bg-white px-2 text-sm focus:border-selva-500 focus:outline-none"
                />
                min
              </label>
            )}
          </span>
        )}

        {f.modo === 'horas' && (
          <span className="flex flex-wrap items-center gap-1.5">
            {[...f.horas].sort().map((h) => (
              <span key={h} className="num inline-flex h-8 items-center gap-1 rounded-full bg-white pr-1 pl-3 text-sm font-semibold ring-1 ring-linea">
                {textoHoraCorta(h)}
                <button type="button" onClick={() => onCambio({ horas: f.horas.filter((x) => x !== h) })} aria-label={`Quitar ${textoHoraCorta(h)}`} className="rounded-full p-1 text-tinta-soft hover:bg-butaca hover:text-tinta">
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            {disponibles.length > 0 && (
              <SelectHora
                valor=""
                vacio="+ Agregar hora"
                opciones={disponibles}
                onCambio={(h) => onCambio({ horas: [...f.horas, h] })}
                etiqueta={`${etiqueta}: agregar hora`}
                className="h-8 text-sm"
              />
            )}
          </span>
        )}
      </div>
    </li>
  )
}
