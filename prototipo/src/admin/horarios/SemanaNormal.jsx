import { useState } from 'react'
import { Copy } from 'lucide-react'
import { Boton } from '../../components/ui'
import { Interruptor } from '../AdminLayout'
import EditorFranjas from './EditorFranjas'
import { DIAS, DIAS_CORTOS, ORDEN, nuevaClave, nuevaFranja, resumenFranjas } from './util'

function CopiarA({ origen, onAplicar, onCerrar }) {
  const [destinos, setDestinos] = useState([])
  return (
    <div className="mt-2 rounded-xl bg-butaca p-3">
      <p className="text-sm font-semibold">Copiar el horario del {DIAS[origen].toLowerCase()} a:</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ORDEN.filter((n) => n !== origen).map((n) => {
          const on = destinos.includes(n)
          return (
            <button key={n} type="button" aria-pressed={on} onClick={() => setDestinos(on ? destinos.filter((x) => x !== n) : [...destinos, n])}
              className={`h-8 rounded-full px-3 text-sm font-semibold ring-1 ring-inset ${on ? 'bg-selva-600 text-white ring-selva-600' : 'bg-white ring-linea hover:bg-linea'}`}>
              {DIAS_CORTOS[n]}
            </button>
          )
        })}
        <button type="button" onClick={() => setDestinos(ORDEN.filter((n) => n !== origen))} className="h-8 px-2 text-sm font-semibold text-selva-700 underline">Todos</button>
      </div>
      <div className="mt-3 flex gap-2">
        <Boton tam="sm" type="button" disabled={destinos.length === 0} onClick={() => onAplicar(destinos)}>Copiar</Boton>
        <Boton tam="sm" type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton>
      </div>
    </div>
  )
}

/**
 * Una semana de franjas.
 * modo "general": interruptor por día y máximo de shows (Horarios y bloqueos).
 * modo "show": sin interruptor ni máximo; un día sin franjas es un día sin ese show.
 */
export default function SemanaNormal({ semana, onCambio, modo = 'general' }) {
  const esShow = modo === 'show'
  const [copiando, setCopiando] = useState(null)
  const [abierto, setAbierto] = useState(null) // día con el editor abierto en teléfono

  const cambiarDia = (n, cambios) => onCambio(semana.map((d) => (d.dia_semana === n ? { ...d, ...cambios } : d)))

  const copiar = (origen, destinos) => {
    const o = semana.find((d) => d.dia_semana === origen)
    onCambio(semana.map((d) => (destinos.includes(d.dia_semana)
      ? { ...d, activo: o.activo, max_shows: o.max_shows, franjas: o.franjas.map((f) => ({ ...f, horas: [...f.horas], clave: nuevaClave() })) }
      : d)))
    setCopiando(null)
  }

  return (
    <ul className="divide-y divide-linea">
      {ORDEN.map((n) => {
        const base = semana.find((x) => x.dia_semana === n)
        if (!base) return null
        const d = esShow ? { ...base, activo: base.franjas.length > 0 } : base
        const expandido = d.activo && (abierto === n || abierto === 'todos')
        return (
          <li key={n} className="py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {!esShow && <Interruptor activo={d.activo} etiqueta={`Dar servicio los ${DIAS[n].toLowerCase()}`} onCambio={() => cambiarDia(n, { activo: !d.activo })} />}
              <span className="w-24 font-semibold">{DIAS[n]}</span>
              {d.activo ? (
                <>
                  {!esShow && <label className="flex items-center gap-1.5 text-sm">
                    <span className="text-tinta-soft">Máx. shows</span>
                    <input
                      type="number" min={1} max={20} inputMode="numeric" placeholder="Sin límite"
                      value={d.max_shows ?? ''}
                      onChange={(e) => cambiarDia(n, { max_shows: e.target.value === '' ? null : Math.max(1, Math.min(20, Number(e.target.value))) })}
                      aria-label={`Máximo de shows los ${DIAS[n].toLowerCase()}`}
                      className="num h-9 w-24 rounded-lg border border-linea bg-white px-2 text-sm placeholder:text-tinta-soft/70 focus:border-selva-500 focus:outline-none"
                    />
                  </label>}
                  <span className="ml-auto flex items-center gap-1">
                    <button type="button" onClick={() => setCopiando(copiando === n ? null : n)} className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-sm font-semibold text-selva-700 hover:bg-selva-50">
                      <Copy className="size-3.5" /> Copiar a…
                    </button>
                    <button type="button" onClick={() => setAbierto(expandido ? null : n)} aria-expanded={expandido} className="h-8 rounded-full px-2 text-sm font-semibold text-selva-700 hover:bg-selva-50 md:hidden">
                      {expandido ? 'Cerrar' : 'Editar'}
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm text-tinta-soft">{esShow ? 'Sin horario' : 'Sin servicio'}</span>
                  {esShow && (
                    <button type="button" onClick={() => { cambiarDia(n, { franjas: [nuevaFranja('10:00', '14:00')] }); setAbierto(n) }} className="ml-auto h-8 rounded-full px-2 text-sm font-semibold text-selva-700 hover:bg-selva-50">
                      + Agregar
                    </button>
                  )}
                </>
              )}
            </div>
            {copiando === n && <CopiarA origen={n} onAplicar={(destinos) => copiar(n, destinos)} onCerrar={() => setCopiando(null)} />}
            {d.activo && (
              <>
                {/* En teléfono el día se ve resumido hasta que se abre */}
                {!expandido && <p className="mt-1.5 text-sm text-tinta-soft md:hidden">{resumenFranjas(d.franjas)}</p>}
                <div className={`mt-2 ${expandido ? '' : 'hidden md:block'}`}>
                  <EditorFranjas franjas={d.franjas} nombreDia={DIAS[n]} onCambio={(franjas) => cambiarDia(n, { franjas })} />
                </div>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}
