import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CircleCheck, UserPlus, X } from 'lucide-react'
import { useAuth } from '../auth'
import { crearReservacion, horariosDisponibles, mensajeError, zonaPorCP } from '../lib/api'
import { obtenerClientes, registrarPago } from '../lib/apiAdmin'
import { useModalidades, useShows } from '../lib/consultas'
import { hora, hoy, instanteLocal, pesos } from '../lib/format'
import { useStore } from '../store'
import { Boton, Campo, Cargando, Input, Select } from '../components/ui'
import { Encabezado } from './AdminLayout'

const EXCEPCIONES = /^(FUERA_DE_COBERTURA|ANTICIPACION|FUERA_DE_HORARIO|FECHA_BLOQUEADA|DIA_LLENO|MOTIVO_REQUERIDO|FECHA_PASADA)/

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
  const { usuario } = useAuth()
  const { avisar } = useStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const shows = useShows()
  const { data: modalidades } = useModalidades()
  const clientes = useQuery({ queryKey: ['admin-clientes'], queryFn: obtenerClientes })

  const [busqueda, setBusqueda] = useState('')
  const [cliente, setCliente] = useState(null)
  const [nuevo, setNuevo] = useState(false)
  const [nc, setNc] = useState({ nombre: '', telefono: '', correo: '' })
  const [f, setF] = useState({ showId: '', paqueteId: '', modalidad: '', cp: '', calle: '', colonia: '', referencias: '', fecha: '', hora: '', canal: 'Presencial', pago: '', metodo: 'Efectivo', descuento: '' })
  const [zona, setZona] = useState(undefined) // undefined: sin revisar, null: sin cobertura
  const [excepcion, setExcepcion] = useState(null) // mensaje de la regla que se está saltando
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  const activos = (shows.data ?? []).filter((s) => s.activo)
  const show = activos.find((s) => s.id === f.showId) ?? null
  const paquetes = show?.paquetes.filter((p) => p.activo) ?? []
  const paquete = paquetes.find((p) => p.id === f.paqueteId) ?? null
  const pideModalidad = !!show?.pide_modalidad
  const modalidad = pideModalidad ? (modalidades ?? []).find((m) => m.id === f.modalidad) ?? null : null

  useEffect(() => {
    if (!f.showId && activos[0]) setF((x) => ({ ...x, showId: activos[0].id, paqueteId: activos[0].paquetes.find((p) => p.activo)?.id ?? '' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activos.length])

  // La cobertura se revisa sola al completar el código postal
  useEffect(() => {
    let vigente = true
    if (f.cp.length !== 5) {
      setZona(undefined)
      return undefined
    }
    zonaPorCP(f.cp).then((z) => vigente && setZona(z)).catch(() => vigente && setZona(undefined))
    return () => { vigente = false }
  }, [f.cp])

  const libres = useQuery({
    queryKey: ['horarios', f.showId, f.paqueteId || null, [], f.cp, f.fecha],
    queryFn: () => horariosDisponibles({ showId: f.showId, paqueteId: f.paqueteId || null, extras: [], cp: f.cp, fecha: f.fecha }),
    enabled: !!f.showId && !!f.fecha && !!zona,
  })

  const coincidencias = busqueda.trim().length > 1
    ? (clientes.data ?? []).filter((c) => `${c.nombre} ${c.telefono} ${c.correo}`.toLowerCase().includes(busqueda.trim().toLowerCase())).slice(0, 6)
    : []

  const subtotal = Number(paquete?.precio ?? show?.precio_base ?? 0) + Number(modalidad?.cargo ?? 0)
  const total = Math.max(0, subtotal + Number(zona?.cargo_traslado ?? 0) - (Number(f.descuento) || 0))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!cliente && !nuevo) return setError('Elige un cliente o registra uno nuevo.')
    if (nuevo && (!nc.nombre.trim() || !nc.telefono.trim())) return setError('Escribe al menos el nombre y el teléfono del cliente.')
    if (!show) return setError('Elige un show.')
    if (f.cp.length !== 5 || !f.calle.trim() || !f.colonia.trim()) return setError('Escribe el código postal, la calle y la colonia del evento.')
    if (!f.fecha || !f.hora) return setError('Elige fecha y hora.')

    setGuardando(true)
    try {
      const r = await crearReservacion({
        p_show_id: show.id,
        p_paquete_id: paquete?.id ?? null,
        p_inicio: instanteLocal(f.fecha, f.hora),
        p_codigo_postal: f.cp,
        p_calle: f.calle,
        p_colonia: f.colonia,
        p_referencias: f.referencias || null,
        p_extras: [],
        p_evento: { modalidad_id: modalidad?.id ?? null },
        ...(cliente
          ? { p_cliente_id: cliente.id }
          : { p_cliente: { nombre: nc.nombre.trim(), telefono: nc.telefono.trim(), correo: nc.correo.trim() } }),
        p_canal: f.canal,
        p_descuento: Number(f.descuento) || 0,
        p_forzar: !!excepcion && !!motivo.trim(),
        p_motivo: motivo.trim() || null,
      })
      const pago = Number(f.pago)
      if (pago > 0) {
        await registrarPago({
          reservacion_id: r.id, monto: pago, metodo: f.metodo, estado: 'aprobado', registrado_por: usuario.id,
          tipo: pago >= Number(r.total) ? 'liquidacion' : 'anticipo',
        })
      }
      await Promise.all(['admin-reservaciones', 'admin-clientes', 'admin-pagos'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
      queryClient.invalidateQueries({ queryKey: ['disponibilidad'] })
      avisar(`Reservación ${r.folio} guardada`)
      navigate('/admin/agenda')
    } catch (err) {
      const texto = err.message ?? ''
      if (EXCEPCIONES.test(texto)) {
        setExcepcion(mensajeError(err))
        setError(motivo.trim() ? mensajeError(err) : 'Esta reservación rompe una regla. Escribe el motivo abajo para guardarla de todos modos.')
      } else if (err.code === '23505') {
        setError('Ya existe un cliente con ese correo. Búscalo en lugar de registrarlo.')
      } else {
        setError(mensajeError(err))
      }
    } finally {
      setGuardando(false)
    }
  }

  if (shows.isLoading) return <Cargando />

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
                  <p className="num text-sm text-tinta-soft">{[cliente.telefono, cliente.correo].filter(Boolean).join(', ')}</p>
                </div>
                <button type="button" onClick={() => setCliente(null)} className="rounded-full p-2 hover:bg-white" aria-label="Quitar cliente"><X className="size-4" /></button>
              </div>
            ) : nuevo ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo etiqueta="Nombre"><Input value={nc.nombre} onChange={(e) => setNc({ ...nc, nombre: e.target.value })} autoFocus /></Campo>
                <Campo etiqueta="Teléfono"><Input type="tel" value={nc.telefono} onChange={(e) => setNc({ ...nc, telefono: e.target.value })} /></Campo>
                <Campo etiqueta="Correo (opcional)"><Input type="email" value={nc.correo} onChange={(e) => setNc({ ...nc, correo: e.target.value })} /></Campo>
                <button type="button" onClick={() => setNuevo(false)} className="text-left text-sm font-semibold text-selva-700 underline sm:col-span-3">Buscar un cliente existente</button>
              </div>
            ) : (
              <div>
                <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Busca por nombre, teléfono o correo" aria-label="Buscar cliente" />
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
                {busqueda.trim().length > 1 && coincidencias.length === 0 && <p className="mt-2 text-sm text-tinta-soft">No encontramos a nadie con esos datos.</p>}
                <button type="button" onClick={() => setNuevo(true)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-selva-700">
                  <UserPlus className="size-4" /> Registrar cliente nuevo
                </button>
              </div>
            )}
          </Bloque>

          <Bloque titulo="Show">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Show">
                <Select value={f.showId} onChange={(e) => {
                  const s = activos.find((x) => x.id === e.target.value)
                  setF((x) => ({ ...x, showId: e.target.value, paqueteId: s?.paquetes.find((p) => p.activo)?.id ?? '' }))
                }}>
                  {activos.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </Select>
              </Campo>
              {paquetes.length > 0 && (
                <Campo etiqueta="Paquete">
                  <Select value={f.paqueteId} onChange={(e) => set('paqueteId', e.target.value)}>
                    {paquetes.map((p) => <option key={p.id} value={p.id}>{p.nombre}, {pesos(p.precio)}</option>)}
                  </Select>
                </Campo>
              )}
            </div>
            {pideModalidad && (
              <Campo etiqueta="Tipo de evento" className="mt-4">
                <Select value={f.modalidad} onChange={(e) => set('modalidad', e.target.value)}>
                  <option value="">Ninguno de estos (sin costo extra)</option>
                  {(modalidades ?? []).map((m) => <option key={m.id} value={m.id}>{m.nombre}, +{pesos(m.cargo)}{m.activo ? '' : ' (apagado)'}</option>)}
                </Select>
              </Campo>
            )}
          </Bloque>

          <Bloque titulo="Lugar, fecha y hora">
            <div className="grid gap-3 sm:grid-cols-[140px_1fr_1fr]">
              <Campo etiqueta="Código postal">
                <Input inputMode="numeric" maxLength={5} value={f.cp} onChange={(e) => set('cp', e.target.value.replace(/\D/g, ''))} />
              </Campo>
              <Campo etiqueta="Calle y número"><Input value={f.calle} onChange={(e) => set('calle', e.target.value)} /></Campo>
              <Campo etiqueta="Colonia"><Input value={f.colonia} onChange={(e) => set('colonia', e.target.value)} /></Campo>
            </div>
            <Campo etiqueta="Referencias (opcional)" className="mt-3"><Input value={f.referencias} onChange={(e) => set('referencias', e.target.value)} /></Campo>
            {zona && <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-ok"><CircleCheck className="size-4" /> {zona.nombre}, traslado {pesos(zona.cargo_traslado)}</p>}
            {zona === null && <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-alerta"><AlertTriangle className="size-4" /> Fuera de cobertura: necesitarás escribir un motivo para guardar.</p>}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Fecha"><Input type="date" value={f.fecha} min={hoy()} onChange={(e) => set('fecha', e.target.value)} /></Campo>
              <Campo etiqueta="Hora de inicio"><Input type="time" value={f.hora} onChange={(e) => set('hora', e.target.value)} /></Campo>
            </div>
            {libres.data && (
              <div className="mt-2">
                <p className="text-sm text-tinta-soft">{libres.data.length ? 'Horarios libres ese día:' : 'No hay horarios libres ese día según las reglas en línea.'}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {libres.data.map((h) => {
                    const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' }).format(new Date(h.inicio))
                    return (
                      <button key={h.inicio} type="button" onClick={() => set('hora', t)} className={`num h-8 rounded-full px-3 text-sm font-medium ring-1 ring-inset ${f.hora === t ? 'bg-selva-600 text-white ring-selva-600' : 'bg-white ring-linea hover:bg-butaca'}`}>
                        {hora(h.inicio)}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {(excepcion || zona === null) && (
              <div className="mt-4 rounded-xl bg-alerta-soft p-4">
                <p className="text-sm font-semibold">{excepcion ?? 'Fuera de cobertura.'}</p>
                <Campo etiqueta="Motivo para guardar de todos modos (queda registrado)" className="mt-2">
                  <Input value={motivo} onChange={(e) => { setMotivo(e.target.value); if (!excepcion) setExcepcion('Fuera de cobertura.') }} />
                </Campo>
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
                <Campo etiqueta="Pago recibido"><Input inputMode="decimal" value={f.pago} onChange={(e) => set('pago', e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" /></Campo>
                <Campo etiqueta="Método">
                  <Select value={f.metodo} onChange={(e) => set('metodo', e.target.value)}><option>Efectivo</option><option>Transferencia</option><option>Terminal</option></Select>
                </Campo>
              </div>
              <Campo etiqueta="Descuento (opcional)"><Input inputMode="decimal" value={f.descuento} onChange={(e) => set('descuento', e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" /></Campo>
            </div>
            <dl className="num mt-5 space-y-1 border-t border-linea pt-4 text-[15px]">
              <div className="flex justify-between"><dt className="text-tinta-soft">Total</dt><dd className="text-lg font-bold">{pesos(total)}</dd></div>
              <div className="flex justify-between"><dt className="text-tinta-soft">Saldo</dt><dd className="font-semibold">{pesos(Math.max(0, total - (Number(f.pago) || 0)))}</dd></div>
            </dl>
            {error && <p role="alert" className="mt-4 rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
            <Boton type="submit" className="mt-4 w-full" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar reservación'}</Boton>
            <p className="mt-2 text-center text-xs text-tinta-soft">Si el cliente tiene correo, le avisamos automáticamente.</p>
          </Bloque>
        </div>
      </div>
    </form>
  )
}
