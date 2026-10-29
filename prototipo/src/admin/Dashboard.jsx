import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarOff, CircleDollarSign, Plus } from 'lucide-react'
import { HOY, showPorId } from '../data/mock'
import { deISO, fechaCorta, hora12, isoFecha, pesos } from '../lib/format'
import { useStore } from '../store'
import { Estado } from '../components/ui'
import { Encabezado } from './AdminLayout'
import DetalleReservacion from './DetalleReservacion'

const INGRESOS = [
  { mes: 'May', v: 38400 },
  { mes: 'Jun', v: 46200 },
  { mes: 'Jul', v: 52900 },
  { mes: 'Ago', v: 41100 },
  { mes: 'Sep', v: 44800 },
  { mes: 'Oct', v: 57300 },
]

export default function Dashboard() {
  const { reservaciones, clientes } = useStore()
  const [abierta, setAbierta] = useState(null)

  const activas = reservaciones.filter((r) => r.estado !== 'cancelada')
  const en7 = new Date(HOY)
  en7.setDate(en7.getDate() + 7)
  const proximas = activas
    .filter((r) => deISO(r.fecha) >= HOY && deISO(r.fecha) <= en7 && r.estado !== 'realizada')
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
  const pendientes = activas.filter((r) => r.estado === 'pendiente')
  const porCobrar = activas.filter((r) => r.estado !== 'realizada').reduce((a, r) => a + (r.total - r.pagado), 0)
  const delMes = activas.filter((r) => r.fecha.startsWith('2026-10') || r.fecha.startsWith('2026-11'))
  const maxIngreso = Math.max(...INGRESOS.map((i) => i.v))
  const nombre = (id) => clientes.find((c) => c.id === id)?.nombre

  const hoyISO = isoFecha(HOY)
  const manana = new Date(HOY)
  manana.setDate(manana.getDate() + 1)

  return (
    <>
      <Encabezado titulo="Buenos días, Raúl" descripcion={`Tienes ${proximas.length} funciones en los próximos 7 días.`}>
        <Link to="/admin/disponibilidad" className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-linea ring-inset hover:bg-butaca">
          <CalendarOff className="size-4" /> Bloquear fecha
        </Link>
        <Link to="/admin/reservaciones/nueva" className="inline-flex h-10 items-center gap-2 rounded-full bg-telon-600 px-4 text-sm font-semibold text-white hover:bg-telon-700">
          <Plus className="size-4" /> Nueva reservación
        </Link>
      </Encabezado>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Funciones oct–nov', delMes.length, null],
          ['Cobrado en octubre', pesos(57300), 'text-ok'],
          ['Saldo por cobrar', pesos(porCobrar), 'text-alerta'],
          ['Clientes registrados', clientes.length, null],
        ].map(([t, v, c]) => (
          <div key={t} className="rounded-2xl bg-white p-4 ring-1 ring-linea">
            <dt className="text-sm text-tinta-soft">{t}</dt>
            <dd className={`num mt-1 text-2xl font-bold ${c ?? ''}`}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl bg-white ring-1 ring-linea">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="font-bold">Próximas funciones</h2>
            <Link to="/admin/agenda" className="text-sm font-semibold text-telon-700 underline">Abrir agenda</Link>
          </div>
          <ul className="mt-2 divide-y divide-linea">
            {proximas.map((r) => {
              const etiquetaDia = r.fecha === hoyISO ? 'Hoy' : r.fecha === isoFecha(manana) ? 'Mañana' : fechaCorta(r.fecha)
              return (
                <li key={r.folio}>
                  <button onClick={() => setAbierta(r.folio)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-butaca/60">
                    <span className="w-20 shrink-0">
                      <span className="block text-sm font-semibold first-letter:uppercase">{etiquetaDia}</span>
                      <span className="num block text-sm text-tinta-soft">{hora12(r.hora)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{showPorId(r.showId).nombre}</span>
                      <span className="block truncate text-sm text-tinta-soft">{nombre(r.clienteId)}, {r.zona}</span>
                    </span>
                    <span className="hidden text-right sm:block">
                      <Estado estado={r.estado} />
                      {r.total - r.pagado > 0 && <span className="num mt-1 block text-xs text-tinta-soft">Saldo {pesos(r.total - r.pagado)}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
            <h2 className="font-bold">Requiere tu atención</h2>
            <ul className="mt-3 space-y-2">
              {pendientes.map((r) => (
                <li key={r.folio}>
                  <button onClick={() => setAbierta(r.folio)} className="flex w-full gap-3 rounded-xl bg-alerta-soft px-3 py-2.5 text-left hover:brightness-[0.98]">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alerta" />
                    <span className="text-sm">
                      <span className="font-semibold">{r.folio}</span> sin anticipo: {showPorId(r.showId).nombre}, {fechaCorta(r.fecha)}
                    </span>
                  </button>
                </li>
              ))}
              <li className="flex gap-3 rounded-xl bg-butaca px-3 py-2.5 text-sm">
                <CircleDollarSign className="mt-0.5 size-4 shrink-0 text-tinta-soft" />
                <span><span className="font-semibold">1 comprobante</span> de transferencia por revisar</span>
              </li>
            </ul>
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
            <h2 className="font-bold">Ingresos cobrados por mes</h2>
            <div className="mt-4 flex h-40 items-end gap-3" role="img" aria-label="Ingresos de mayo a octubre: el mes más alto fue octubre con 57,300 pesos">
              {INGRESOS.map((i, idx) => (
                <div key={i.mes} className="flex h-full flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="num text-[11px] text-tinta-soft">{Math.round(i.v / 1000)}k</span>
                    <div className={`w-full rounded-t-md ${idx === INGRESOS.length - 1 ? 'bg-telon-600' : 'bg-telon-200'}`} style={{ height: `${(i.v / maxIngreso) * 80}%` }} />
                  </div>
                  <span className="text-xs text-tinta-soft">{i.mes}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <DetalleReservacion folio={abierta} onCerrar={() => setAbierta(null)} />
    </>
  )
}
