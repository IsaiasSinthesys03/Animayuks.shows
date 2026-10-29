import { useState } from 'react'
import { CheckCheck, CircleDollarSign, MapPin, MessageCircle, Navigation, Phone, XCircle } from 'lucide-react'
import { showPorId } from '../data/mock'
import { fechaLarga, hora12, pesos } from '../lib/format'
import { useStore } from '../store'
import { Boton, Estado, Panel, Select, Input, Campo } from '../components/ui'

/** Panel lateral con el detalle y las acciones rápidas de una reservación (RF-AGE-03). */
export default function DetalleReservacion({ folio, onCerrar }) {
  const { reservaciones, clientes, actualizarReservacion, avisar } = useStore()
  const [pagoAbierto, setPagoAbierto] = useState(false)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('Efectivo')
  const [nota, setNota] = useState('')
  const [notas, setNotas] = useState(['Llevar extensión de 15 m, la toma está lejos del jardín.'])

  const r = reservaciones.find((x) => x.folio === folio)
  const c = r && clientes.find((x) => x.id === r.clienteId)
  const s = r && showPorId(r.showId)
  const saldo = r ? r.total - r.pagado : 0

  const cambiar = (estado, texto) => {
    actualizarReservacion(r.folio, { estado })
    avisar(texto)
  }

  return (
    <Panel abierto={!!r} onCerrar={onCerrar} titulo={r ? `Reservación ${r.folio}` : ''}>
      {r && (
        <div className="space-y-6 p-5">
          <div>
            <Estado estado={r.estado} />
            <p className="mt-2 text-xl font-bold">{s.nombre}</p>
            <p className="text-tinta-soft">{r.paquete} para {r.evento.toLowerCase()}</p>
            <p className="mt-2 font-medium first-letter:uppercase">{fechaLarga(r.fecha)}, {hora12(r.hora)}</p>
            <p className="mt-1 flex gap-1.5 text-[15px] text-tinta-soft"><MapPin className="mt-0.5 size-4 shrink-0" /> {r.direccion} ({r.zona})</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <a href="#" onClick={(e) => e.preventDefault()} className="flex flex-col items-center gap-1 rounded-2xl bg-butaca py-3 text-sm font-medium hover:bg-linea"><Phone className="size-5" /> Llamar</a>
            <a href="#" onClick={(e) => e.preventDefault()} className="flex flex-col items-center gap-1 rounded-2xl bg-butaca py-3 text-sm font-medium hover:bg-linea"><MessageCircle className="size-5" /> WhatsApp</a>
            <a href="#" onClick={(e) => e.preventDefault()} className="flex flex-col items-center gap-1 rounded-2xl bg-butaca py-3 text-sm font-medium hover:bg-linea"><Navigation className="size-5" /> Cómo llegar</a>
          </div>

          <section>
            <h3 className="font-semibold">Cliente</h3>
            <dl className="mt-2 space-y-1 text-[15px]">
              <div className="flex justify-between gap-3"><dt className="text-tinta-soft">Nombre</dt><dd className="text-right font-medium">{c.nombre}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-tinta-soft">Celular</dt><dd className="num">{c.telefono}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-tinta-soft">Correo</dt><dd className="truncate">{c.correo || 'Sin correo'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-tinta-soft">Canal</dt><dd>{r.canal}</dd></div>
            </dl>
          </section>

          <section>
            <h3 className="font-semibold">Pagos</h3>
            <dl className="num mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-butaca p-3"><dt className="text-xs text-tinta-soft">Total</dt><dd className="font-bold">{pesos(r.total)}</dd></div>
              <div className="rounded-2xl bg-butaca p-3"><dt className="text-xs text-tinta-soft">Pagado</dt><dd className="font-bold">{pesos(r.pagado)}</dd></div>
              <div className={`rounded-2xl p-3 ${saldo > 0 ? 'bg-alerta-soft' : 'bg-ok-soft'}`}><dt className="text-xs text-tinta-soft">Saldo</dt><dd className="font-bold">{pesos(saldo)}</dd></div>
            </dl>
            {pagoAbierto ? (
              <form
                className="entra mt-3 space-y-3 rounded-2xl border border-linea p-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  const m = Number(monto) || saldo
                  actualizarReservacion(r.folio, { pagado: Math.min(r.total, r.pagado + m), estado: r.estado === 'pendiente' ? 'confirmada' : r.estado })
                  avisar(`Pago de ${pesos(m)} registrado`)
                  setPagoAbierto(false)
                  setMonto('')
                }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Monto"><Input inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value.replace(/\D/g, ''))} placeholder={String(saldo)} /></Campo>
                  <Campo etiqueta="Método">
                    <Select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                      <option>Efectivo</option><option>Transferencia</option><option>Terminal</option>
                    </Select>
                  </Campo>
                </div>
                <div className="flex gap-2">
                  <Boton type="submit" tam="sm">Registrar pago</Boton>
                  <Boton type="button" tam="sm" variante="fantasma" onClick={() => setPagoAbierto(false)}>Cancelar</Boton>
                </div>
              </form>
            ) : (
              saldo > 0 && <Boton tam="sm" variante="secundario" className="mt-3" onClick={() => setPagoAbierto(true)}><CircleDollarSign className="size-4" /> Registrar pago</Boton>
            )}
          </section>

          <section>
            <h3 className="font-semibold">Notas internas</h3>
            <ul className="mt-2 space-y-2">
              {notas.map((n, i) => <li key={i} className="rounded-xl bg-marquesina-soft px-3 py-2 text-[15px]">{n}</li>)}
            </ul>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (nota.trim()) { setNotas([...notas, nota]); setNota('') } }}>
              <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Agregar nota para el equipo" />
              <Boton type="submit" tam="md" variante="secundario">Agregar</Boton>
            </form>
          </section>

          <section className="border-t border-linea pt-5">
            <h3 className="sr-only">Acciones</h3>
            <div className="flex flex-wrap gap-2">
              {r.estado === 'pendiente' && <Boton tam="sm" onClick={() => cambiar('confirmada', 'Reservación confirmada')}><CheckCheck className="size-4" /> Confirmar</Boton>}
              {r.estado === 'confirmada' && <Boton tam="sm" variante="oscuro" onClick={() => cambiar('realizada', 'Show marcado como realizado')}><CheckCheck className="size-4" /> Marcar como realizado</Boton>}
              <Boton tam="sm" variante="secundario" onClick={() => avisar('Confirmación reenviada al cliente')}>Reenviar confirmación</Boton>
              {r.estado !== 'cancelada' && r.estado !== 'realizada' && (
                <Boton tam="sm" variante="peligro" onClick={() => cambiar('cancelada', 'Reservación cancelada')}><XCircle className="size-4" /> Cancelar</Boton>
              )}
            </div>
          </section>
        </div>
      )}
    </Panel>
  )
}
