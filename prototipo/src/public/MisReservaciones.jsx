import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Hourglass, Loader2, MapPin } from 'lucide-react'
import { salir, useAuth } from '../auth'
import { cancelarReservacion, horariosDisponibles, mensajeError, misReservaciones, reprogramarReservacion } from '../lib/api'
import { useConfiguracion } from '../lib/consultas'
import { fechaLarga, hora, pesos, saldoDe } from '../lib/format'
import { useStore } from '../store'
import { Boton, Cargando, ErrorCarga, Estado, Miniatura, Panel } from '../components/ui'
import Calendario from '../components/Calendario'
import { DatosTransferencia, SubirComprobante } from '../components/DatosPago'

const ACTIVOS = ['pendiente', 'confirmada']
const esProxima = (r) => ACTIVOS.includes(r.estado) && new Date(r.fin) >= new Date()

function PanelCancelar({ r, cfg, onCerrar }) {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const dias = (new Date(r.inicio) - new Date()) / 86400000
  const conReembolso = dias >= Number(cfg?.cancelacion_dias_reembolso ?? 7)
  const reembolso = conReembolso ? Number(r.total_pagado) * (1 - Number(cfg?.cancelacion_comision_pct ?? 5) / 100) : 0

  const cancelar = async () => {
    setEnviando(true)
    setError('')
    try {
      await cancelarReservacion(r.id, motivo)
      await queryClient.invalidateQueries({ queryKey: ['mis-reservaciones'] })
      avisar(`Reservación ${r.folio} cancelada`)
      onCerrar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-5 p-5">
      <p>Vas a cancelar <span className="font-semibold">{r.shows?.nombre}</span> del {fechaLarga(r.inicio)}.</p>
      {Number(r.total_pagado) > 0 ? (
        <div className={`rounded-2xl p-4 ${conReembolso ? 'bg-ok-soft' : 'bg-alerta-soft'}`}>
          <p className="font-semibold">{conReembolso ? `Te devolvemos ${pesos(reembolso)}` : 'Tu anticipo no es reembolsable'}</p>
          <p className="mt-1 text-sm text-tinta-soft">
            {conReembolso
              ? `Faltan ${cfg?.cancelacion_dias_reembolso ?? 7} días o más: reembolsamos lo pagado menos ${Number(cfg?.cancelacion_comision_pct ?? 5)} % de comisión.`
              : `Faltan menos de ${cfg?.cancelacion_dias_reembolso ?? 7} días para el evento.`}
          </p>
        </div>
      ) : (
        <p className="rounded-2xl bg-butaca p-4 text-[15px]">No has pagado nada, así que no hay reembolso. El horario quedará libre.</p>
      )}
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">¿Por qué cancelas? (opcional)</span>
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-11 w-full rounded-xl border border-linea bg-white px-3">
          <option value="">Elige un motivo</option>
          <option>Cambió la fecha del evento</option>
          <option>Se canceló el evento</option>
          <option>Contraté otro servicio</option>
          <option>Otro</option>
        </select>
      </label>
      {error && <p role="alert" className="rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
      <div className="flex flex-col gap-2">
        <Boton onClick={cancelar} disabled={enviando}>{enviando ? 'Cancelando…' : 'Cancelar reservación'}</Boton>
        <Boton variante="fantasma" onClick={onCerrar}>Conservar mi reservación</Boton>
      </div>
    </div>
  )
}

function PanelCambiarFecha({ r, onCerrar }) {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const [fecha, setFecha] = useState('')
  const [enviando, setEnviando] = useState('')
  const [error, setError] = useState('')
  const extras = (r.reservacion_extras ?? []).map((e) => e.extra_id)

  const horarios = useQuery({
    queryKey: ['horarios', r.show_id, r.paquete_id, extras, r.codigo_postal, fecha],
    queryFn: () => horariosDisponibles({ showId: r.show_id, paqueteId: r.paquete_id, extras, cp: r.codigo_postal, fecha }),
    enabled: !!fecha,
  })

  const cambiar = async (inicio) => {
    setEnviando(inicio)
    setError('')
    try {
      await reprogramarReservacion(r.id, inicio)
      await queryClient.invalidateQueries({ queryKey: ['mis-reservaciones'] })
      queryClient.invalidateQueries({ queryKey: ['disponibilidad'] })
      avisar('Fecha cambiada. Te enviamos la confirmación por correo.')
      onCerrar()
    } catch (err) {
      setError(mensajeError(err))
      queryClient.invalidateQueries({ queryKey: ['horarios'] })
    } finally {
      setEnviando('')
    }
  }

  return (
    <div className="space-y-5 p-5">
      <p className="text-[15px] text-tinta-soft">Actualmente: {fechaLarga(r.inicio)}, {hora(r.inicio)}. El precio no cambia. Solo puedes cambiar la fecha una vez.</p>
      <Calendario showId={r.show_id} paqueteId={r.paquete_id} extras={extras} cp={r.codigo_postal} valor={fecha} onCambio={setFecha} />
      {error && <p role="alert" className="rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
      {fecha && (
        <div>
          <p className="font-semibold">Elige la hora nueva</p>
          {horarios.isLoading && <p className="mt-2 flex items-center gap-2 text-sm text-tinta-soft"><Loader2 className="size-4 animate-spin" /> Buscando…</p>}
          {horarios.isError && <ErrorCarga onReintentar={horarios.refetch} texto="No pudimos cargar los horarios." />}
          {horarios.data?.length === 0 && <p className="mt-2 text-sm text-tinta-soft">Ya no quedan horarios ese día.</p>}
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(horarios.data ?? []).map((h) => (
              <button key={h.inicio} disabled={!!enviando} onClick={() => cambiar(h.inicio)} className="num h-11 rounded-xl border-2 border-linea text-sm font-semibold hover:border-tinta-soft/50 disabled:opacity-60">
                {enviando === h.inicio ? '…' : hora(h.inicio)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function MisReservaciones() {
  const { usuario, cliente, esAdmin, cargando } = useAuth()
  const { data: cfg } = useConfiguracion()
  const navigate = useNavigate()
  const sinPermisoPanel = useLocation().state?.sinPermisoPanel
  const [pestana, setPestana] = useState('proximas')
  const [accion, setAccion] = useState(null) // { tipo: 'cancelar' | 'fecha' | 'comprobante', r }

  const consulta = useQuery({ queryKey: ['mis-reservaciones', usuario?.id], queryFn: misReservaciones, enabled: !!usuario })

  if (cargando) return <Cargando />
  if (!usuario) return <Navigate to="/entrar?siguiente=/mi-cuenta" replace />

  // El admin ve todas por RLS; aquí solo interesan las de su propia ficha
  const mias = (consulta.data ?? []).filter((r) => !esAdmin || r.cliente_id === cliente?.id)
  const proximas = mias.filter(esProxima).sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
  const historial = mias.filter((r) => !esProxima(r))
  const lista = pestana === 'proximas' ? proximas : historial
  const cerrar = () => setAccion(null)
  const maxCambios = cfg?.reprogramaciones_max ?? 1

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      {sinPermisoPanel && (
        <p role="status" className="mb-6 rounded-xl bg-maiz-soft px-4 py-3 text-[15px]">
          Esta es una cuenta de cliente. Para abrir el panel, cierra sesión y entra con la cuenta de administrador.
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {cliente?.nombre && <p className="text-tinta-soft">Hola, {cliente.nombre.split(' ')[0]}</p>}
          <h1 className="font-cartel text-5xl leading-none font-black uppercase sm:text-6xl">Mis reservaciones</h1>
        </div>
        <button onClick={async () => { await salir(); navigate('/') }} className="text-sm font-semibold text-tinta-soft underline">
          Cerrar sesión
        </button>
      </div>

      <div className="mt-8 flex gap-2" role="group" aria-label="Filtrar reservaciones">
        {[['proximas', `Próximas (${proximas.length})`], ['historial', `Historial (${historial.length})`]].map(([id, t]) => (
          <button key={id} aria-pressed={pestana === id} onClick={() => setPestana(id)} className={`h-10 rounded-full px-4 font-medium ${pestana === id ? 'bg-selva-600 text-white' : 'bg-butaca hover:bg-linea'}`}>
            {t}
          </button>
        ))}
      </div>

      {consulta.isLoading && <Cargando />}
      {consulta.isError && <ErrorCarga onReintentar={consulta.refetch} />}

      {consulta.data && lista.length === 0 && (
        <div className="mt-8 rounded-3xl bg-butaca p-10 text-center">
          <p className="text-lg font-semibold">{pestana === 'proximas' ? 'No tienes funciones próximas.' : 'Aún no hay funciones en tu historial.'}</p>
          <Link to="/shows" className="mt-4 inline-flex h-11 items-center rounded-full bg-selva-600 px-5 font-semibold text-white">Ver la cartelera</Link>
        </div>
      )}

      <ul className="mt-6 space-y-4">
        {lista.map((r) => {
          const saldo = saldoDe(r)
          const enRevision = (r.pagos ?? []).filter((p) => p.estado === 'pendiente')
          const puedeCambiar = (r.reprogramaciones ?? 0) < maxCambios
          return (
            <li key={r.id} className="overflow-hidden rounded-3xl border border-linea">
              <div className="flex gap-4 p-5">
                <Miniatura show={r.shows} className="hidden size-20 sm:flex" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Estado estado={r.estado} />
                    <span className="num text-sm text-tinta-soft">{r.folio}</span>
                  </div>
                  <p className="mt-1.5 text-lg font-bold">{r.shows?.nombre}{r.paquetes?.nombre ? `, ${r.paquetes.nombre.toLowerCase()}` : ''}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[15px] text-tinta-soft">
                    <CalendarClock className="size-4 shrink-0" /> <span className="first-letter:uppercase">{fechaLarga(r.inicio)}, {hora(r.inicio)}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[15px] text-tinta-soft">
                    <MapPin className="size-4 shrink-0" /> <span className="truncate">{r.calle}, {r.colonia}, {r.codigo_postal}</span>
                  </p>
                  {r.estado === 'pendiente' && r.expira_en && (
                    <p className="mt-2 flex items-start gap-1.5 text-sm font-medium text-alerta">
                      <Hourglass className="mt-0.5 size-4 shrink-0" /> Paga {pesos(Math.max(Number(r.anticipo_requerido) - Number(r.total_pagado), 0))} antes del {fechaLarga(r.expira_en)} a las {hora(r.expira_en)}
                    </p>
                  )}
                  {enRevision.length > 0 && <p className="mt-1 text-sm font-medium text-tinta-soft">Comprobante en revisión ({pesos(enRevision.reduce((a, p) => a + Number(p.monto), 0))})</p>}
                </div>
              </div>
              {esProxima(r) && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linea bg-butaca/60 px-5 py-3">
                  <p className="num text-[15px]">
                    {saldo > 0 ? <>Saldo <span className="font-bold">{pesos(saldo)}</span></> : <span className="font-semibold text-ok">Liquidado</span>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {saldo > 0 && <Boton tam="sm" onClick={() => setAccion({ tipo: 'comprobante', r })}>Pagar</Boton>}
                    {puedeCambiar && <Boton tam="sm" variante="secundario" onClick={() => setAccion({ tipo: 'fecha', r })}>Cambiar fecha</Boton>}
                    <Boton tam="sm" variante="peligro" onClick={() => setAccion({ tipo: 'cancelar', r })}>Cancelar</Boton>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <Panel abierto={accion?.tipo === 'cancelar'} onCerrar={cerrar} titulo="Cancelar reservación">
        {accion?.tipo === 'cancelar' && <PanelCancelar r={accion.r} cfg={cfg} onCerrar={cerrar} />}
      </Panel>
      <Panel abierto={accion?.tipo === 'fecha'} onCerrar={cerrar} titulo="Cambiar fecha">
        {accion?.tipo === 'fecha' && <PanelCambiarFecha r={accion.r} onCerrar={cerrar} />}
      </Panel>
      <Panel abierto={accion?.tipo === 'comprobante'} onCerrar={cerrar} titulo={`Pagar ${accion?.r?.folio ?? ''}`}>
        {accion?.tipo === 'comprobante' && (
          <div className="space-y-5 p-5">
            <DatosTransferencia cfg={cfg} folio={accion.r.folio} />
            <p className="text-[15px] text-tinta-soft">{cfg?.instrucciones_pago}</p>
            <SubirComprobante reservacion={accion.r} onListo={cerrar} />
          </div>
        )}
      </Panel>
    </div>
  )
}
