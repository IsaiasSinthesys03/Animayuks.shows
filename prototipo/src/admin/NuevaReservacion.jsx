import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CircleCheck, UserPlus, X } from 'lucide-react'
import { EXTRAS, HORARIOS, SHOWS, showPorId, zonaPorCP } from '../data/mock'
import { nuevoFolio, pesos } from '../lib/format'
import { useStore } from '../store'
import { Boton, Campo, Input, Select } from '../components/ui'
import { Encabezado } from './AdminLayout'

function Bloque({ titulo, children }) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
      <h2 className="mb-4 font-bold">{titulo}</h2>
      {children}
    </section>
  )
}

/** Registro rápido de reservaciones presenciales o telefónicas (RF-ADR-03 a 06). */
export default function NuevaReservacion() {
  const { clientes, agregarCliente, agregarReservacion, ocupacion, avisar } = useStore()
  const navigate = useNavigate()

  const [busqueda, setBusqueda] = useState('')
  const [cliente, setCliente] = useState(null)
  const [nuevo, setNuevo] = useState(false)
  const [nc, setNc] = useState({ nombre: '', telefono: '', correo: '' })
  const [f, setF] = useState({ showId: SHOWS[0].id, paqueteId: SHOWS[0].paquetes[0].id, extras: [], cp: '', calle: '', fecha: '', hora: '', canal: 'Presencial', pago: '', metodo: 'Efectivo', ajuste: '', motivoAjuste: '', forzar: false, motivoForzar: '' })
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const [error, setError] = useState('')

  const coincidencias = busqueda.length > 1 ? clientes.filter((c) => `${c.nombre} ${c.telefono}`.toLowerCase().includes(busqueda.toLowerCase())).slice(0, 5) : []
  const show = showPorId(f.showId)
  const paquete = show.paquetes.find((p) => p.id === f.paqueteId) ?? show.paquetes[0]
  const zona = f.cp.length === 5 ? zonaPorCP(f.cp) : undefined
  const conflicto = useMemo(() => (f.fecha && f.hora ? ocupacion(f.fecha) : null), [f.fecha, f.hora, ocupacion])
  const ocupado = conflicto && (conflicto.bloqueado || conflicto.ocupados.includes(f.hora))
  const total = paquete.precio + EXTRAS.filter((e) => f.extras.includes(e.id)).reduce((a, e) => a + e.precio, 0) + (zona?.cargo ?? 0) - (Number(f.ajuste) || 0)
  const requiereExcepcion = zona === null || ocupado

  const guardar = (e) => {
    e.preventDefault()
    let c = cliente
    if (!c && nuevo) {
      if (!nc.nombre.trim() || !nc.telefono.trim()) return setError('Escribe al menos nombre y teléfono del cliente nuevo.')
      c = { id: `c${Date.now()}`, ...nc, zona: zona?.nombre ?? '', etiquetas: [], origen: f.canal, alta: '2026-10-28' }
      agregarCliente(c)
    }
    if (!c) return setError('Elige un cliente o registra uno nuevo.')
    if (!f.cp || !f.calle.trim()) return setError('Escribe el código postal y la dirección del evento.')
    if (!f.fecha || !f.hora) return setError('Elige fecha y hora.')
    if (requiereExcepcion && (!f.forzar || !f.motivoForzar.trim())) return setError('Hay una advertencia. Marca la excepción y escribe el motivo para guardar de todos modos.')
    const r = {
      folio: nuevoFolio(),
      clienteId: c.id,
      showId: show.id,
      paquete: paquete.nombre,
      fecha: f.fecha,
      hora: f.hora,
      zona: zona?.nombre ?? 'Fuera de cobertura',
      direccion: `${f.calle}, ${f.cp}`,
      total,
      pagado: Number(f.pago) || 0,
      estado: Number(f.pago) > 0 ? 'confirmada' : 'pendiente',
      canal: f.canal,
      evento: 'Evento',
    }
    agregarReservacion(r)
    avisar(`Reservación ${r.folio} guardada`)
    navigate('/admin/agenda')
  }

  return (
    <form onSubmit={guardar} noValidate>
      <Encabezado titulo="Nueva reservación" descripcion="Para clientes que reservan en persona, por teléfono o por WhatsApp." />

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Bloque titulo="Cliente">
            {cliente ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-ok-soft px-4 py-3">
                <div>
                  <p className="font-semibold">{cliente.nombre}</p>
                  <p className="num text-sm text-tinta-soft">{cliente.telefono}{cliente.correo ? `, ${cliente.correo}` : ''}</p>
                </div>
                <button type="button" onClick={() => setCliente(null)} className="rounded-full p-2 hover:bg-white" aria-label="Quitar cliente"><X className="size-4" /></button>
              </div>
            ) : nuevo ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo etiqueta="Nombre"><Input value={nc.nombre} onChange={(e) => setNc({ ...nc, nombre: e.target.value })} autoFocus /></Campo>
                <Campo etiqueta="Teléfono"><Input type="tel" value={nc.telefono} onChange={(e) => setNc({ ...nc, telefono: e.target.value })} /></Campo>
                <Campo etiqueta="Correo (opcional)"><Input type="email" value={nc.correo} onChange={(e) => setNc({ ...nc, correo: e.target.value })} /></Campo>
                <button type="button" onClick={() => setNuevo(false)} className="text-left text-sm font-semibold text-telon-700 underline sm:col-span-3">Buscar un cliente existente</button>
              </div>
            ) : (
              <div>
                <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Busca por nombre o teléfono, ej. Jorge" aria-label="Buscar cliente" />
                {coincidencias.length > 0 && (
                  <ul className="mt-2 divide-y divide-linea rounded-xl ring-1 ring-linea">
                    {coincidencias.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => setCliente(c)} className="flex w-full justify-between gap-3 px-4 py-2.5 text-left hover:bg-butaca">
                          <span className="font-medium">{c.nombre}</span>
                          <span className="num text-sm text-tinta-soft">{c.telefono}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={() => setNuevo(true)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-telon-700">
                  <UserPlus className="size-4" /> Registrar cliente nuevo
                </button>
              </div>
            )}
          </Bloque>

          <Bloque titulo="Show">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Show">
                <Select value={f.showId} onChange={(e) => setF((x) => ({ ...x, showId: e.target.value, paqueteId: showPorId(e.target.value).paquetes[0].id }))}>
                  {SHOWS.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </Select>
              </Campo>
              <Campo etiqueta="Paquete">
                <Select value={paquete.id} onChange={(e) => set('paqueteId', e.target.value)}>
                  {show.paquetes.map((p) => <option key={p.id} value={p.id}>{p.nombre}, {pesos(p.precio)}</option>)}
                </Select>
              </Campo>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {EXTRAS.map((e) => {
                const on = f.extras.includes(e.id)
                return (
                  <button key={e.id} type="button" aria-pressed={on} onClick={() => set('extras', on ? f.extras.filter((x) => x !== e.id) : [...f.extras, e.id])} className={`h-9 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset ${on ? 'bg-tinta text-white ring-tinta' : 'bg-white ring-linea hover:bg-butaca'}`}>
                    {e.nombre} <span className="num opacity-70">+{pesos(e.precio)}</span>
                  </button>
                )
              })}
            </div>
          </Bloque>

          <Bloque titulo="Lugar, fecha y hora">
            <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
              <Campo etiqueta="Código postal">
                <Input inputMode="numeric" maxLength={5} value={f.cp} onChange={(e) => set('cp', e.target.value.replace(/\D/g, ''))} />
              </Campo>
              <Campo etiqueta="Calle, número y colonia"><Input value={f.calle} onChange={(e) => set('calle', e.target.value)} /></Campo>
            </div>
            {zona && <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-ok"><CircleCheck className="size-4" /> {zona.nombre}, traslado {pesos(zona.cargo)}</p>}
            {zona === null && <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-alerta"><AlertTriangle className="size-4" /> Fuera de cobertura. En línea se rechazaría.</p>}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Fecha"><Input type="date" value={f.fecha} min="2026-10-28" onChange={(e) => set('fecha', e.target.value)} /></Campo>
              <Campo etiqueta="Hora de inicio">
                <Select value={f.hora} onChange={(e) => set('hora', e.target.value)}>
                  <option value="">Elige</option>
                  {HORARIOS.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </Campo>
            </div>
            {conflicto && (ocupado ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-alerta"><AlertTriangle className="size-4" /> {conflicto.bloqueado ? `Día bloqueado: ${conflicto.bloqueado}` : 'Ya hay una función a esa hora.'}</p>
            ) : (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-ok"><CircleCheck className="size-4" /> Horario libre</p>
            ))}

            {requiereExcepcion && (
              <div className="mt-4 rounded-xl bg-alerta-soft p-4">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={f.forzar} onChange={(e) => set('forzar', e.target.checked)} className="accent-telon-600" /> Guardar de todos modos (queda en la bitácora)
                </label>
                {f.forzar && <Input value={f.motivoForzar} onChange={(e) => set('motivoForzar', e.target.value)} placeholder="Motivo, ej. cliente acepta pagar traslado extra" />}
              </div>
            )}
          </Bloque>
        </div>

        <div className="space-y-5 xl:sticky xl:top-20 xl:self-start">
          <Bloque titulo="Pago y origen">
            <div className="space-y-3">
              <Campo etiqueta="¿Cómo llegó?">
                <Select value={f.canal} onChange={(e) => set('canal', e.target.value)}>
                  {['Presencial', 'Teléfono', 'WhatsApp', 'Redes sociales', 'Recomendación'].map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Pago recibido"><Input inputMode="numeric" value={f.pago} onChange={(e) => set('pago', e.target.value.replace(/\D/g, ''))} placeholder="0" /></Campo>
                <Campo etiqueta="Método">
                  <Select value={f.metodo} onChange={(e) => set('metodo', e.target.value)}><option>Efectivo</option><option>Transferencia</option><option>Terminal</option></Select>
                </Campo>
              </div>
              <Campo etiqueta="Descuento manual (opcional)"><Input inputMode="numeric" value={f.ajuste} onChange={(e) => set('ajuste', e.target.value.replace(/\D/g, ''))} placeholder="0" /></Campo>
            </div>
            <dl className="num mt-5 space-y-1 border-t border-linea pt-4 text-[15px]">
              <div className="flex justify-between"><dt className="text-tinta-soft">Total</dt><dd className="text-lg font-bold">{pesos(total)}</dd></div>
              <div className="flex justify-between"><dt className="text-tinta-soft">Saldo</dt><dd className="font-semibold">{pesos(Math.max(0, total - (Number(f.pago) || 0)))}</dd></div>
            </dl>
            {error && <p role="alert" className="mt-4 rounded-xl bg-telon-50 px-3 py-2 text-sm font-medium text-telon-700">{error}</p>}
            <Boton type="submit" className="mt-4 w-full">Guardar reservación</Boton>
            <p className="mt-2 text-center text-xs text-tinta-soft">Si el cliente tiene correo, le enviamos la confirmación.</p>
          </Bloque>
        </div>
      </div>
    </form>
  )
}
