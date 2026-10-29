import { useState } from 'react'
import { Download, MessageCircle, Phone, Search } from 'lucide-react'
import { showPorId } from '../data/mock'
import { fechaCorta, pesos } from '../lib/format'
import { useStore } from '../store'
import { Boton, Estado, Panel } from '../components/ui'
import { Encabezado } from './AdminLayout'

export default function Clientes() {
  const { clientes, reservaciones, avisar } = useStore()
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(null)

  const resumen = (id) => {
    const rs = reservaciones.filter((r) => r.clienteId === id && r.estado !== 'cancelada')
    return { n: rs.length, gastado: rs.reduce((a, r) => a + r.pagado, 0), ultima: rs.map((r) => r.fecha).sort().at(-1) }
  }
  const lista = clientes.filter((c) => `${c.nombre} ${c.telefono} ${c.correo}`.toLowerCase().includes(q.toLowerCase()))
  const c = clientes.find((x) => x.id === abierto)

  return (
    <>
      <Encabezado titulo="Clientes" descripcion={`${clientes.length} clientes, en línea y presenciales`}>
        <Boton tam="sm" variante="secundario" onClick={() => avisar('Clientes exportados a CSV (simulado)')}><Download className="size-4" /> Exportar</Boton>
      </Encabezado>

      <label className="relative mb-4 block max-w-md">
        <span className="sr-only">Buscar cliente</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tinta-soft" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, teléfono o correo" className="h-10 w-full rounded-full border border-linea bg-white pr-4 pl-10 text-sm focus:border-telon-500 focus:outline-none" />
      </label>

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-linea">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-linea bg-butaca/50 text-tinta-soft">
            <tr>{['Cliente', 'Teléfono', 'Zona', 'Funciones', 'Pagado', 'Última', 'Origen'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {lista.map((cl) => {
              const r = resumen(cl.id)
              return (
                <tr key={cl.id} onClick={() => setAbierto(cl.id)} className="cursor-pointer hover:bg-butaca/50">
                  <td className="px-4 py-3">
                    <button className="font-semibold hover:underline">{cl.nombre}</button>
                    {cl.etiquetas.map((t) => <span key={t} className="ml-2 rounded-full bg-marquesina-soft px-2 py-0.5 text-xs font-semibold">{t}</span>)}
                  </td>
                  <td className="num px-4 py-3">{cl.telefono}</td>
                  <td className="px-4 py-3">{cl.zona}</td>
                  <td className="num px-4 py-3">{r.n}</td>
                  <td className="num px-4 py-3">{pesos(r.gastado)}</td>
                  <td className="num px-4 py-3">{r.ultima ? fechaCorta(r.ultima) : 'Sin funciones'}</td>
                  <td className="px-4 py-3 text-tinta-soft">{cl.origen}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Panel abierto={!!c} onCerrar={() => setAbierto(null)} titulo="Ficha del cliente">
        {c && (
          <div className="space-y-6 p-5">
            <div>
              <p className="text-xl font-bold">{c.nombre}</p>
              <p className="text-sm text-tinta-soft">Cliente desde {fechaCorta(c.alta)}, registrado {c.origen === 'En línea' ? 'en línea' : `por ${c.origen.toLowerCase()}`}</p>
              <div className="mt-3 flex gap-2">
                <Boton tam="sm" variante="secundario"><Phone className="size-4" /> {c.telefono}</Boton>
                <Boton tam="sm" variante="secundario"><MessageCircle className="size-4" /> WhatsApp</Boton>
              </div>
            </div>
            <dl className="num grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-butaca p-3"><dt className="text-xs text-tinta-soft">Funciones</dt><dd className="text-lg font-bold">{resumen(c.id).n}</dd></div>
              <div className="rounded-2xl bg-butaca p-3"><dt className="text-xs text-tinta-soft">Total pagado</dt><dd className="text-lg font-bold">{pesos(resumen(c.id).gastado)}</dd></div>
            </dl>
            <section>
              <h3 className="font-semibold">Historial</h3>
              <ul className="mt-2 divide-y divide-linea">
                {reservaciones.filter((r) => r.clienteId === c.id).map((r) => (
                  <li key={r.folio} className="flex items-center justify-between gap-3 py-2.5">
                    <span>
                      <span className="block font-medium">{showPorId(r.showId).nombre}</span>
                      <span className="num block text-sm text-tinta-soft">{fechaCorta(r.fecha)}, {r.folio}</span>
                    </span>
                    <Estado estado={r.estado} />
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="font-semibold">Etiquetas</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {['VIP', 'Frecuente', 'Corporativo', 'Conflictivo'].map((t) => (
                  <span key={t} className={`rounded-full px-3 py-1 text-sm font-medium ${c.etiquetas.includes(t) ? 'bg-tinta text-white' : 'bg-butaca text-tinta-soft'}`}>{t}</span>
                ))}
              </div>
            </section>
          </div>
        )}
      </Panel>
    </>
  )
}
