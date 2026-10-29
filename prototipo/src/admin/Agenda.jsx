import { useState } from 'react'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { HOY, ZONAS, showPorId } from '../data/mock'
import { fechaLarga, hora12, isoFecha } from '../lib/format'
import { useStore } from '../store'
import { Boton, Estado } from '../components/ui'
import { Encabezado } from './AdminLayout'
import DetalleReservacion from './DetalleReservacion'

const COLOR_ESTADO = {
  pendiente: 'bg-alerta-soft text-alerta ring-alerta/30',
  confirmada: 'bg-telon-50 text-telon-700 ring-telon-200',
  realizada: 'bg-butaca text-tinta-soft ring-linea',
  cancelada: 'bg-white text-tinta-soft/60 line-through ring-linea',
}

export default function Agenda() {
  const { reservaciones, bloqueos, clientes, avisar } = useStore()
  const [vista, setVista] = useState('mes')
  const [mes, setMes] = useState(new Date(HOY.getFullYear(), HOY.getMonth(), 1))
  const [abierta, setAbierta] = useState(null)
  const [zona, setZona] = useState('todas')
  const [verCanceladas, setVerCanceladas] = useState(false)

  const visibles = reservaciones
    .filter((r) => (zona === 'todas' || r.zona === zona) && (verCanceladas || r.estado !== 'cancelada'))
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))

  const offset = (mes.getDay() + 6) % 7
  const diasMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: diasMes }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1))]
  const prefijoMes = isoFecha(mes).slice(0, 7)
  const delMes = visibles.filter((r) => r.fecha.startsWith(prefijoMes))
  const nombre = (id) => clientes.find((c) => c.id === id)?.nombre

  return (
    <>
      <Encabezado titulo="Agenda">
        <Boton tam="sm" variante="secundario" onClick={() => avisar('Hoja de ruta generada en PDF (simulado)')}>
          <Printer className="size-4" /> Hoja de ruta
        </Boton>
      </Encabezado>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} className="inline-flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-linea hover:bg-butaca" aria-label="Mes anterior"><ChevronLeft className="size-4" /></button>
          <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} className="inline-flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-linea hover:bg-butaca" aria-label="Mes siguiente"><ChevronRight className="size-4" /></button>
          <p className="ml-2 text-lg font-bold first-letter:uppercase">{mes.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={zona} onChange={(e) => setZona(e.target.value)} className="h-9 rounded-full border border-linea bg-white px-3 text-sm" aria-label="Filtrar por zona">
            <option value="todas">Todas las zonas</option>
            {ZONAS.map((z) => <option key={z.id}>{z.nombre}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={verCanceladas} onChange={(e) => setVerCanceladas(e.target.checked)} className="accent-telon-600" /> Canceladas
          </label>
          <div className="flex rounded-full bg-white p-1 ring-1 ring-linea" role="tablist" aria-label="Vista">
            {[['mes', 'Mes'], ['lista', 'Lista']].map(([id, t]) => (
              <button key={id} role="tab" aria-selected={vista === id} onClick={() => setVista(id)} className={`h-7 rounded-full px-3 text-sm font-medium ${vista === id ? 'bg-tinta text-white' : 'text-tinta-soft'}`}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {vista === 'mes' ? (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-linea">
          <div className="grid grid-cols-7 border-b border-linea text-center text-xs font-semibold text-tinta-soft">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => <span key={d} className="py-2">{d}</span>)}
          </div>
          <div className="grid grid-cols-7">
            {celdas.map((d, i) => {
              if (!d) return <div key={`v${i}`} className="min-h-24 border-r border-b border-linea bg-butaca/40 sm:min-h-28" />
              const iso = isoFecha(d)
              const eventos = delMes.filter((r) => r.fecha === iso)
              const bloqueo = bloqueos.find((b) => b.fecha === iso)
              const esHoy = iso === isoFecha(HOY)
              return (
                <div key={iso} className={`min-h-24 border-r border-b border-linea p-1 sm:min-h-28 sm:p-1.5 ${bloqueo ? 'bg-[repeating-linear-gradient(135deg,transparent_0_6px,#f3f1f6_6px_12px)]' : ''}`}>
                  <span className={`num inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold ${esHoy ? 'bg-telon-600 text-white' : ''}`}>{d.getDate()}</span>
                  {bloqueo && <p className="mt-0.5 hidden text-[11px] leading-tight text-tinta-soft sm:block">{bloqueo.motivo}</p>}
                  <div className="mt-0.5 space-y-1">
                    {eventos.map((r) => (
                      <button key={r.folio} onClick={() => setAbierta(r.folio)} className={`block w-full truncate rounded-md px-1 py-0.5 text-left text-[11px] font-semibold ring-1 ring-inset sm:px-1.5 sm:text-xs ${COLOR_ESTADO[r.estado]}`}>
                        <span className="num hidden sm:inline">{r.hora} </span>{showPorId(r.showId).nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {[...new Set(visibles.map((r) => r.fecha))].map((f) => (
            <section key={f}>
              <h2 className="mb-2 text-sm font-semibold text-tinta-soft first-letter:uppercase">{fechaLarga(f)}</h2>
              <ul className="divide-y divide-linea overflow-hidden rounded-2xl bg-white ring-1 ring-linea">
                {visibles.filter((r) => r.fecha === f).map((r) => (
                  <li key={r.folio}>
                    <button onClick={() => setAbierta(r.folio)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-butaca/60">
                      <span className="num w-20 shrink-0 font-semibold">{hora12(r.hora)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{showPorId(r.showId).nombre}</span>
                        <span className="block truncate text-sm text-tinta-soft">{nombre(r.clienteId)}, {r.direccion}</span>
                      </span>
                      <Estado estado={r.estado} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-tinta-soft">
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-telon-50 ring-1 ring-telon-200" /> Confirmada</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-alerta-soft ring-1 ring-alerta/30" /> Pendiente de anticipo</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-butaca ring-1 ring-linea" /> Realizada</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-[repeating-linear-gradient(135deg,white_0_3px,#e3e0ea_3px_6px)] ring-1 ring-linea" /> Día bloqueado</span>
      </div>

      <DetalleReservacion folio={abierta} onCerrar={() => setAbierta(null)} />
    </>
  )
}
