import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Plus, Search } from 'lucide-react'
import { ESTADOS, SHOWS, showPorId } from '../data/mock'
import { fechaCorta, hora12, pesos } from '../lib/format'
import { useStore } from '../store'
import { Boton, Estado } from '../components/ui'
import { Encabezado } from './AdminLayout'
import DetalleReservacion from './DetalleReservacion'

export default function Reservaciones() {
  const { reservaciones, clientes, avisar } = useStore()
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState('todos')
  const [show, setShow] = useState('todos')
  const [canal, setCanal] = useState('todos')
  const [abierta, setAbierta] = useState(null)

  const nombre = (id) => clientes.find((c) => c.id === id)?.nombre ?? ''
  const canales = [...new Set(reservaciones.map((r) => r.canal))]

  const lista = useMemo(
    () =>
      reservaciones
        .filter(
          (r) =>
            (estado === 'todos' || r.estado === estado) &&
            (show === 'todos' || r.showId === show) &&
            (canal === 'todos' || r.canal === canal) &&
            `${r.folio} ${nombre(r.clienteId)} ${clientes.find((c) => c.id === r.clienteId)?.telefono}`.toLowerCase().includes(q.toLowerCase()),
        )
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [reservaciones, estado, show, canal, q, clientes],
  )

  const filtro = 'h-10 rounded-full border border-linea bg-white px-3 text-sm'

  return (
    <>
      <Encabezado titulo="Reservaciones" descripcion={`${lista.length} de ${reservaciones.length} reservaciones`}>
        <Boton tam="sm" variante="secundario" onClick={() => avisar('Exportado a Excel (simulado)')}><Download className="size-4" /> Exportar</Boton>
        <Boton tam="sm" as={Link} to="/admin/reservaciones/nueva"><Plus className="size-4" /> Nueva reservación</Boton>
      </Encabezado>

      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative min-w-60 flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tinta-soft" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Folio, cliente o teléfono" className="h-10 w-full rounded-full border border-linea bg-white pr-4 pl-10 text-sm focus:border-telon-500 focus:outline-none" />
        </label>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={filtro} aria-label="Estado">
          <option value="todos">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
        </select>
        <select value={show} onChange={(e) => setShow(e.target.value)} className={filtro} aria-label="Show">
          <option value="todos">Todos los shows</option>
          {SHOWS.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} className={filtro} aria-label="Canal">
          <option value="todos">Todos los canales</option>
          {canales.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-linea">
          <p className="font-semibold">Ninguna reservación coincide con los filtros.</p>
          <button className="mt-2 text-sm font-semibold text-telon-700 underline" onClick={() => { setQ(''); setEstado('todos'); setShow('todos'); setCanal('todos') }}>Quitar filtros</button>
        </div>
      ) : (
        <>
          {/* Tabla en escritorio */}
          <div className="hidden overflow-hidden rounded-2xl bg-white ring-1 ring-linea md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-linea bg-butaca/50 text-tinta-soft">
                <tr>
                  {['Folio', 'Fecha', 'Show', 'Cliente', 'Zona', 'Canal', 'Saldo', 'Estado'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {lista.map((r) => (
                  <tr key={r.folio} onClick={() => setAbierta(r.folio)} className="cursor-pointer hover:bg-butaca/50">
                    <td className="num px-4 py-3 font-semibold"><button className="hover:underline" onClick={() => setAbierta(r.folio)}>{r.folio}</button></td>
                    <td className="num px-4 py-3 whitespace-nowrap">{fechaCorta(r.fecha)}, {hora12(r.hora)}</td>
                    <td className="px-4 py-3">{showPorId(r.showId).nombre}</td>
                    <td className="px-4 py-3">{nombre(r.clienteId)}</td>
                    <td className="px-4 py-3">{r.zona}</td>
                    <td className="px-4 py-3 text-tinta-soft">{r.canal}</td>
                    <td className="num px-4 py-3">{r.total - r.pagado > 0 ? pesos(r.total - r.pagado) : <span className="text-ok">Liquidado</span>}</td>
                    <td className="px-4 py-3"><Estado estado={r.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas en móvil */}
          <ul className="space-y-2 md:hidden">
            {lista.map((r) => (
              <li key={r.folio}>
                <button onClick={() => setAbierta(r.folio)} className="w-full rounded-2xl bg-white p-4 text-left ring-1 ring-linea">
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-sm font-semibold">{r.folio}</span>
                    <Estado estado={r.estado} />
                  </div>
                  <p className="mt-1.5 font-semibold">{showPorId(r.showId).nombre}</p>
                  <p className="text-sm text-tinta-soft">{nombre(r.clienteId)}</p>
                  <p className="num mt-1 text-sm">{fechaCorta(r.fecha)}, {hora12(r.hora)}, {r.zona}</p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <DetalleReservacion folio={abierta} onCerrar={() => setAbierta(null)} />
    </>
  )
}
