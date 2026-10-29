import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { CalendarClock, MapPin } from 'lucide-react'
import { HOY, showPorId } from '../data/mock'
import { deISO, fechaLarga, hora12, pesos } from '../lib/format'
import { useStore } from '../store'
import { Boton, Estado, Panel } from '../components/ui'

export default function MisReservaciones() {
  const { sesion, setSesion, reservaciones, actualizarReservacion, avisar } = useStore()
  const navigate = useNavigate()
  const [pestana, setPestana] = useState('proximas')
  const [cancelando, setCancelando] = useState(null)
  const [motivo, setMotivo] = useState('')

  if (!sesion) return <Navigate to="/entrar" replace />

  const mias = reservaciones.filter((r) => r.clienteId === 'c1')
  const proximas = mias.filter((r) => deISO(r.fecha) >= HOY && r.estado !== 'cancelada')
  const historial = mias.filter((r) => !proximas.includes(r))
  const lista = pestana === 'proximas' ? proximas : historial

  const diasPara = (iso) => Math.round((deISO(iso) - HOY) / 86400000)

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-tinta-soft">Hola, Mariana</p>
          <h1 className="font-cartel text-5xl leading-none font-black uppercase sm:text-6xl">Mis reservaciones</h1>
        </div>
        <button
          onClick={() => {
            setSesion(null)
            navigate('/')
          }}
          className="text-sm font-semibold text-tinta-soft underline"
        >
          Cerrar sesión
        </button>
      </div>

      <div className="mt-8 flex gap-2" role="tablist">
        {[
          ['proximas', `Próximas (${proximas.length})`],
          ['historial', `Historial (${historial.length})`],
        ].map(([id, t]) => (
          <button key={id} role="tab" aria-selected={pestana === id} onClick={() => setPestana(id)} className={`h-10 rounded-full px-4 font-medium ${pestana === id ? 'bg-tinta text-white' : 'bg-butaca hover:bg-linea'}`}>
            {t}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="mt-8 rounded-3xl bg-butaca p-10 text-center">
          <p className="text-lg font-semibold">{pestana === 'proximas' ? 'No tienes funciones próximas.' : 'Aún no hay funciones en tu historial.'}</p>
          <Link to="/shows" className="mt-4 inline-flex h-11 items-center rounded-full bg-telon-600 px-5 font-semibold text-white">Ver la cartelera</Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {lista.map((r) => {
            const s = showPorId(r.showId)
            const saldo = r.total - r.pagado
            const dias = diasPara(r.fecha)
            return (
              <li key={r.folio} className="overflow-hidden rounded-3xl border border-linea">
                <div className="flex gap-4 p-5">
                  <span className={`hidden size-20 shrink-0 items-end rounded-2xl p-2 sm:flex ${s.cartel.fondo} ${s.cartel.texto}`}>
                    <span className="font-cartel text-base leading-none font-black uppercase">{s.nombre}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Estado estado={r.estado} />
                      <span className="num text-sm text-tinta-soft">{r.folio}</span>
                    </div>
                    <p className="mt-1.5 text-lg font-bold">{s.nombre}, {r.paquete.toLowerCase()}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[15px] text-tinta-soft first-letter:uppercase">
                      <CalendarClock className="size-4 shrink-0" /> <span className="first-letter:uppercase">{fechaLarga(r.fecha)}, {hora12(r.hora)}</span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[15px] text-tinta-soft">
                      <MapPin className="size-4 shrink-0" /> <span className="truncate">{r.direccion}</span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linea bg-butaca/60 px-5 py-3">
                  <p className="num text-[15px]">
                    {saldo > 0 ? (
                      <>Saldo pendiente <span className="font-bold">{pesos(saldo)}</span></>
                    ) : (
                      <span className="font-semibold text-ok">Liquidado</span>
                    )}
                  </p>
                  {pestana === 'proximas' && (
                    <div className="flex gap-2">
                      {saldo > 0 && <Boton tam="sm" onClick={() => avisar('Abriendo pago del saldo (simulado)')}>Pagar saldo</Boton>}
                      <Boton tam="sm" variante="secundario" onClick={() => avisar('Elige una nueva fecha (simulado)')}>Cambiar fecha</Boton>
                      <Boton tam="sm" variante="peligro" onClick={() => setCancelando({ ...r, dias })}>Cancelar</Boton>
                    </div>
                  )}
                  {r.estado === 'realizada' && (
                    <Boton tam="sm" variante="secundario" onClick={() => avisar('Gracias por tu reseña')}>Calificar show</Boton>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Panel abierto={!!cancelando} onCerrar={() => setCancelando(null)} titulo="Cancelar reservación">
        {cancelando && (
          <div className="space-y-5 p-5">
            <p>
              Vas a cancelar <span className="font-semibold">{showPorId(cancelando.showId).nombre}</span> del {fechaLarga(cancelando.fecha)}.
            </p>
            <div className={`rounded-2xl p-4 ${cancelando.dias >= 7 ? 'bg-ok-soft' : 'bg-alerta-soft'}`}>
              <p className="font-semibold">{cancelando.dias >= 7 ? `Te devolvemos ${pesos(cancelando.pagado * 0.95)}` : 'Tu anticipo no es reembolsable'}</p>
              <p className="mt-1 text-sm text-tinta-soft">
                {cancelando.dias >= 7
                  ? 'Faltan más de 7 días: reembolsamos el anticipo menos 5 % de comisión bancaria.'
                  : `Faltan ${cancelando.dias} días. Con menos de 7 días el anticipo cubre la fecha que liberamos.`}
              </p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">¿Por qué cancelas? (opcional)</span>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-11 w-full rounded-xl border border-linea px-3">
                <option value="">Elige un motivo</option>
                <option>Cambió la fecha del evento</option>
                <option>Se canceló el evento</option>
                <option>Contraté otro servicio</option>
                <option>Otro</option>
              </select>
            </label>
            <div className="flex flex-col gap-2">
              <Boton
                onClick={() => {
                  actualizarReservacion(cancelando.folio, { estado: 'cancelada' })
                  avisar(`Reservación ${cancelando.folio} cancelada`)
                  setCancelando(null)
                }}
              >
                Cancelar reservación
              </Boton>
              <Boton variante="fantasma" onClick={() => setCancelando(null)}>Conservar mi reservación</Boton>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}
