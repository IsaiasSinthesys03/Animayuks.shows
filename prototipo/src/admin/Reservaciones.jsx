import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, Plus, Search } from 'lucide-react'
import { descargarCSV, obtenerReservaciones } from '../lib/apiAdmin'
import { useShows } from '../lib/consultas'
import { diaDe, fechaCorta, hora, pesos, saldoDe } from '../lib/format'
import { Boton, Cargando, ESTADOS, ErrorCarga, Estado } from '../components/ui'
import { Encabezado } from './AdminLayout'
import DetalleReservacion from './DetalleReservacion'

export default function Reservaciones() {
  const consulta = useQuery({ queryKey: ['admin-reservaciones'], queryFn: () => obtenerReservaciones() })
  const { data: shows } = useShows()
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState('todos')
  const [show, setShow] = useState('todos')
  const [canal, setCanal] = useState('todos')
  const [abiertaId, setAbiertaId] = useState(null)

  const todas = consulta.data ?? []
  const canales = [...new Set(todas.map((r) => r.canal))]
  const abierta = todas.find((r) => r.id === abiertaId)

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return todas.filter(
      (r) =>
        (estado === 'todos' || r.estado === estado) &&
        (show === 'todos' || r.show_id === show) &&
        (canal === 'todos' || r.canal === canal) &&
        `${r.folio} ${r.clientes?.nombre} ${r.clientes?.telefono} ${r.clientes?.correo}`.toLowerCase().includes(t),
    )
  }, [todas, estado, show, canal, q])

  const exportar = () =>
    descargarCSV(
      'reservaciones.csv',
      ['Folio', 'Fecha', 'Hora', 'Show', 'Paquete', 'Cliente', 'Teléfono', 'Correo', 'Dirección', 'Zona', 'Canal', 'Estado', 'Total', 'Pagado', 'Saldo'],
      lista.map((r) => [
        r.folio, diaDe(r.inicio), hora(r.inicio), r.shows?.nombre, r.paquetes?.nombre, r.clientes?.nombre, r.clientes?.telefono, r.clientes?.correo,
        `${r.calle}, ${r.colonia}, ${r.codigo_postal}`, r.zonas?.nombre, r.canal, ESTADOS[r.estado]?.etiqueta ?? r.estado, r.total, r.total_pagado, saldoDe(r),
      ]),
    )

  const filtro = 'h-10 rounded-full border border-linea bg-white px-3 text-sm'

  return (
    <>
      <Encabezado titulo="Reservaciones" descripcion={consulta.data ? `${lista.length} de ${todas.length} reservaciones` : undefined}>
        <Boton tam="sm" variante="secundario" onClick={exportar} disabled={lista.length === 0}><Download className="size-4" /> Exportar</Boton>
        <Boton tam="sm" as={Link} to="/admin/reservaciones/nueva"><Plus className="size-4" /> Nueva reservación</Boton>
      </Encabezado>

      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative min-w-60 flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tinta-soft" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Folio, cliente, teléfono o correo" className="h-10 w-full rounded-full border border-linea bg-white pr-4 pl-10 text-sm focus:border-telon-500 focus:outline-none" />
        </label>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={filtro} aria-label="Estado">
          <option value="todos">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
        </select>
        <select value={show} onChange={(e) => setShow(e.target.value)} className={filtro} aria-label="Show">
          <option value="todos">Todos los shows</option>
          {(shows ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} className={filtro} aria-label="Canal">
          <option value="todos">Todos los canales</option>
          {canales.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {consulta.isLoading && <Cargando />}
      {consulta.isError && <ErrorCarga onReintentar={consulta.refetch} />}

      {consulta.data && lista.length === 0 && (
        <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-linea">
          <p className="font-semibold">{todas.length ? 'Ninguna reservación coincide con los filtros.' : 'Todavía no hay reservaciones.'}</p>
          {todas.length > 0 && <button className="mt-2 text-sm font-semibold text-telon-700 underline" onClick={() => { setQ(''); setEstado('todos'); setShow('todos'); setCanal('todos') }}>Quitar filtros</button>}
        </div>
      )}

      {lista.length > 0 && (
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
                  <tr key={r.id} onClick={() => setAbiertaId(r.id)} className="cursor-pointer hover:bg-butaca/50">
                    <td className="num px-4 py-3 font-semibold"><button className="hover:underline" onClick={() => setAbiertaId(r.id)}>{r.folio}</button></td>
                    <td className="num px-4 py-3 whitespace-nowrap">{fechaCorta(r.inicio)}, {hora(r.inicio)}</td>
                    <td className="px-4 py-3">{r.shows?.nombre}</td>
                    <td className="px-4 py-3">{r.clientes?.nombre}</td>
                    <td className="px-4 py-3">{r.zonas?.nombre ?? 'Fuera de zona'}</td>
                    <td className="px-4 py-3 text-tinta-soft">{r.canal}</td>
                    <td className="num px-4 py-3">{saldoDe(r) > 0 ? pesos(saldoDe(r)) : <span className="text-ok">Liquidado</span>}</td>
                    <td className="px-4 py-3"><Estado estado={r.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas en móvil */}
          <ul className="space-y-2 md:hidden">
            {lista.map((r) => (
              <li key={r.id}>
                <button onClick={() => setAbiertaId(r.id)} className="w-full rounded-2xl bg-white p-4 text-left ring-1 ring-linea">
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-sm font-semibold">{r.folio}</span>
                    <Estado estado={r.estado} />
                  </div>
                  <p className="mt-1.5 font-semibold">{r.shows?.nombre}</p>
                  <p className="text-sm text-tinta-soft">{r.clientes?.nombre}</p>
                  <p className="num mt-1 text-sm">{fechaCorta(r.inicio)}, {hora(r.inicio)}{r.zonas?.nombre ? `, ${r.zonas.nombre}` : ''}</p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {abierta && <DetalleReservacion key={abierta.id} r={abierta} onCerrar={() => setAbiertaId(null)} />}
    </>
  )
}
