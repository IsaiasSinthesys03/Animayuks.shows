import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, MessageCircle, Phone, Plus, Search } from 'lucide-react'
import { mensajeError } from '../lib/api'
import { actualizarCliente, crearCliente, descargarCSV, obtenerClientes } from '../lib/apiAdmin'
import { fechaCorta, pesos } from '../lib/format'
import { useStore } from '../store'
import { Boton, Campo, Cargando, ErrorCarga, Estado, Input, Panel } from '../components/ui'
import { Encabezado, Interruptor } from './AdminLayout'

const ETIQUETAS = ['VIP', 'Frecuente', 'Corporativo', 'Conflictivo']
const resumen = (c) => {
  const rs = (c.reservaciones ?? []).filter((r) => !['cancelada', 'expirada', 'rechazada'].includes(r.estado))
  return { n: rs.length, pagado: rs.reduce((a, r) => a + Number(r.total_pagado), 0), ultima: rs.map((r) => r.inicio).sort().at(-1) }
}
const whatsappDe = (t) => {
  const d = (t ?? '').replace(/\D/g, '')
  return d ? `https://wa.me/${d.length === 10 ? `52${d}` : d}` : null
}

function Ficha({ c, onCerrar }) {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const [f, setF] = useState({ nombre: c.nombre, telefono: c.telefono ?? '', correo: c.correo ?? '', notas: c.notas ?? '', motivo_bloqueo: c.motivo_bloqueo ?? '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const r = resumen(c)
  const whatsapp = whatsappDe(c.telefono)

  const guardar = async (cambios, texto) => {
    setGuardando(true)
    setError('')
    try {
      await actualizarCliente(c.id, cambios)
      await queryClient.invalidateQueries({ queryKey: ['admin-clientes'] })
      if (texto) avisar(texto)
    } catch (err) {
      setError(err.code === '23505' ? 'Ya existe otro cliente con ese correo.' : mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Panel abierto onCerrar={onCerrar} titulo="Ficha del cliente">
      <div className="space-y-6 p-5">
        <div className="flex flex-wrap gap-2">
          {c.telefono && <Boton as="a" href={`tel:${c.telefono.replace(/\D/g, '')}`} tam="sm" variante="secundario"><Phone className="size-4" /> {c.telefono}</Boton>}
          {whatsapp && <Boton as="a" href={whatsapp} target="_blank" rel="noreferrer" tam="sm" variante="secundario"><MessageCircle className="size-4" /> WhatsApp</Boton>}
        </div>
        <p className="text-sm text-tinta-soft">
          Cliente desde {fechaCorta(c.creado_en)}, origen {c.origen.toLowerCase()}. {c.usuario_id ? 'Tiene cuenta en el sitio.' : 'Sin cuenta en el sitio.'}
        </p>
        <dl className="num grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-butaca p-3"><dt className="text-xs text-tinta-soft">Funciones</dt><dd className="text-lg font-bold">{r.n}</dd></div>
          <div className="rounded-2xl bg-butaca p-3"><dt className="text-xs text-tinta-soft">Total pagado</dt><dd className="text-lg font-bold">{pesos(r.pagado)}</dd></div>
        </dl>

        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault()
          guardar({ nombre: f.nombre.trim(), telefono: f.telefono.trim() || null, correo: f.correo.trim() || null, notas: f.notas.trim() || null }, 'Cliente actualizado')
        }}>
          <Campo etiqueta="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Teléfono"><Input type="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Campo>
            <Campo etiqueta="Correo"><Input type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} /></Campo>
          </div>
          <Campo etiqueta="Notas internas"><Input value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></Campo>
          {error && <p role="alert" className="rounded-xl bg-telon-50 px-3 py-2 text-sm font-medium text-telon-700">{error}</p>}
          <Boton type="submit" tam="sm" disabled={guardando}>Guardar cambios</Boton>
        </form>

        <section>
          <h3 className="font-semibold">Etiquetas</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {ETIQUETAS.map((t) => {
              const on = c.etiquetas.includes(t)
              return (
                <button key={t} aria-pressed={on} onClick={() => guardar({ etiquetas: on ? c.etiquetas.filter((x) => x !== t) : [...c.etiquetas, t] })} className={`rounded-full px-3 py-1 text-sm font-medium ${on ? 'bg-tinta text-white' : 'bg-butaca text-tinta-soft hover:bg-linea'}`}>{t}</button>
              )
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-linea p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Bloquear para reservar en línea</h3>
              <p className="text-sm text-tinta-soft">Podrás seguir registrando sus reservaciones desde el panel.</p>
            </div>
            <Interruptor activo={c.bloqueado} etiqueta="Bloquear cliente" disabled={guardando}
              onCambio={() => guardar({ bloqueado: !c.bloqueado }, c.bloqueado ? 'Cliente desbloqueado' : 'Cliente bloqueado')} />
          </div>
        </section>

        <section>
          <h3 className="font-semibold">Historial</h3>
          {(c.reservaciones ?? []).length === 0 && <p className="mt-2 text-sm text-tinta-soft">Sin reservaciones todavía.</p>}
          <ul className="mt-2 divide-y divide-linea">
            {[...(c.reservaciones ?? [])].sort((a, b) => new Date(b.inicio) - new Date(a.inicio)).map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                <span>
                  <span className="block font-medium">{x.shows?.nombre}</span>
                  <span className="num block text-sm text-tinta-soft">{fechaCorta(x.inicio)}, {x.folio}</span>
                </span>
                <Estado estado={x.estado} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Panel>
  )
}

function NuevoCliente({ onCerrar }) {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const [f, setF] = useState({ nombre: '', telefono: '', correo: '' })
  const [error, setError] = useState('')
  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.nombre.trim()) return setError('Escribe el nombre.')
    try {
      await crearCliente({ nombre: f.nombre.trim(), telefono: f.telefono.trim() || null, correo: f.correo.trim() || null, origen: 'Presencial' })
      await queryClient.invalidateQueries({ queryKey: ['admin-clientes'] })
      avisar('Cliente registrado')
      onCerrar()
    } catch (err) {
      setError(err.code === '23505' ? 'Ya existe un cliente con ese correo.' : mensajeError(err))
    }
  }
  return (
    <Panel abierto onCerrar={onCerrar} titulo="Registrar cliente">
      <form className="space-y-4 p-5" onSubmit={enviar} noValidate>
        <Campo etiqueta="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus /></Campo>
        <Campo etiqueta="Teléfono"><Input type="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Campo>
        <Campo etiqueta="Correo (opcional)" ayuda="Si después crea una cuenta con este correo, su historial se une solo."><Input type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} /></Campo>
        {error && <p role="alert" className="rounded-xl bg-telon-50 px-3 py-2 text-sm font-medium text-telon-700">{error}</p>}
        <Boton type="submit">Registrar cliente</Boton>
      </form>
    </Panel>
  )
}

export default function Clientes() {
  const consulta = useQuery({ queryKey: ['admin-clientes'], queryFn: obtenerClientes })
  const [q, setQ] = useState('')
  const [abiertoId, setAbiertoId] = useState(null)
  const [nuevo, setNuevo] = useState(false)

  const todos = consulta.data ?? []
  const t = q.trim().toLowerCase()
  const lista = todos.filter((c) => `${c.nombre} ${c.telefono} ${c.correo}`.toLowerCase().includes(t))
  const abierto = todos.find((c) => c.id === abiertoId)

  const exportar = () =>
    descargarCSV('clientes.csv', ['Nombre', 'Teléfono', 'Correo', 'Funciones', 'Pagado', 'Etiquetas', 'Origen'],
      lista.map((c) => {
        const r = resumen(c)
        return [c.nombre, c.telefono, c.correo, r.n, r.pagado, c.etiquetas.join(' '), c.origen]
      }))

  return (
    <>
      <Encabezado titulo="Clientes" descripcion={consulta.data ? `${todos.length} ${todos.length === 1 ? 'cliente' : 'clientes'}, en línea y presenciales` : undefined}>
        <Boton tam="sm" variante="secundario" onClick={exportar} disabled={lista.length === 0}><Download className="size-4" /> Exportar</Boton>
        <Boton tam="sm" onClick={() => setNuevo(true)}><Plus className="size-4" /> Registrar cliente</Boton>
      </Encabezado>

      <label className="relative mb-4 block max-w-md">
        <span className="sr-only">Buscar cliente</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tinta-soft" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, teléfono o correo" className="h-10 w-full rounded-full border border-linea bg-white pr-4 pl-10 text-sm focus:border-telon-500 focus:outline-none" />
      </label>

      {consulta.isLoading && <Cargando />}
      {consulta.isError && <ErrorCarga onReintentar={consulta.refetch} />}
      {consulta.data && lista.length === 0 && (
        <div className="rounded-2xl bg-white p-10 text-center font-semibold ring-1 ring-linea">{todos.length ? 'Nadie coincide con la búsqueda.' : 'Todavía no hay clientes.'}</div>
      )}

      {lista.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-linea">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-linea bg-butaca/50 text-tinta-soft">
              <tr>{['Cliente', 'Teléfono', 'Correo', 'Funciones', 'Pagado', 'Última', 'Origen'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {lista.map((c) => {
                const r = resumen(c)
                return (
                  <tr key={c.id} onClick={() => setAbiertoId(c.id)} className="cursor-pointer hover:bg-butaca/50">
                    <td className="px-4 py-3">
                      <button className="font-semibold hover:underline">{c.nombre}</button>
                      {c.bloqueado && <span className="ml-2 rounded-full bg-telon-50 px-2 py-0.5 text-xs font-semibold text-telon-700">Bloqueado</span>}
                      {c.etiquetas.map((e) => <span key={e} className="ml-2 rounded-full bg-marquesina-soft px-2 py-0.5 text-xs font-semibold">{e}</span>)}
                    </td>
                    <td className="num px-4 py-3">{c.telefono}</td>
                    <td className="px-4 py-3">{c.correo}</td>
                    <td className="num px-4 py-3">{r.n}</td>
                    <td className="num px-4 py-3">{pesos(r.pagado)}</td>
                    <td className="num px-4 py-3 whitespace-nowrap">{r.ultima ? fechaCorta(r.ultima) : 'Sin funciones'}</td>
                    <td className="px-4 py-3 text-tinta-soft">{c.origen}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {abierto && <Ficha key={abierto.id} c={abierto} onCerrar={() => setAbiertoId(null)} />}
      {nuevo && <NuevoCliente onCerrar={() => setNuevo(false)} />}
    </>
  )
}
