import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, CircleDollarSign, ExternalLink, FileText, MapPin, MessageCircle, Navigation, Phone, XCircle } from 'lucide-react'
import { useAuth } from '../auth'
import { cancelarReservacion, horariosDisponibles, mensajeError, reprogramarReservacion } from '../lib/api'
import { agregarNota, cambiarEstadoReservacion, registrarPago, resolverPago, urlComprobante } from '../lib/apiAdmin'
import { fechaLarga, hora, instanteLocal, pesos, saldoDe } from '../lib/format'
import { useStore } from '../store'
import { Boton, Campo, Estado, Input, Panel, Select } from '../components/ui'

const soloDigitos = (t) => (t ?? '').replace(/\D/g, '')
const whatsappDe = (t) => {
  const d = soloDigitos(t)
  return d ? `https://wa.me/${d.length === 10 ? `52${d}` : d}` : null
}

/** Panel lateral con el detalle y las acciones de una reservación (RF-AGE-03). */
export default function DetalleReservacion({ r, onCerrar }) {
  const { usuario } = useAuth()
  const { avisar } = useStore()
  const queryClient = useQueryClient()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [pagoAbierto, setPagoAbierto] = useState(false)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('Efectivo')
  const [nota, setNota] = useState('')
  const [fechaAbierta, setFechaAbierta] = useState(false)
  const [fecha, setFecha] = useState('')
  const [horaNueva, setHoraNueva] = useState('')
  const [motivo, setMotivo] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [motivoCancelar, setMotivoCancelar] = useState('')

  const extrasIds = (r?.reservacion_extras ?? []).map((e) => e.extra_id)
  const libres = useQuery({
    queryKey: ['horarios', r?.show_id, r?.paquete_id, extrasIds, r?.codigo_postal, fecha],
    queryFn: () => horariosDisponibles({ showId: r.show_id, paqueteId: r.paquete_id, extras: extrasIds, cp: r.codigo_postal, fecha }),
    enabled: !!r && fechaAbierta && !!fecha,
  })

  const ejecutar = async (accion, texto) => {
    setOcupado(true)
    setError('')
    try {
      await accion()
      await Promise.all(['admin-reservaciones', 'admin-clientes', 'admin-pagos'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
      queryClient.invalidateQueries({ queryKey: ['disponibilidad'] })
      if (texto) avisar(texto)
      return true
    } catch (err) {
      setError(err.code === '23514' ? 'Revisa los datos capturados.' : mensajeError(err))
      return false
    } finally {
      setOcupado(false)
    }
  }

  if (!r) return null

  const saldo = saldoDe(r)
  const c = r.clientes
  const activa = ['pendiente', 'confirmada'].includes(r.estado)
  const whatsapp = whatsappDe(c?.telefono)
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.calle}, ${r.colonia}, ${r.codigo_postal}`)}`
  const pagos = [...(r.pagos ?? [])].sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))
  const notas = [...(r.notas_reservacion ?? [])].sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en))

  const abrirComprobante = async (ruta) => {
    // La ventana se abre antes de pedir la URL: los navegadores bloquean las que se abren después
    const ventana = window.open('', '_blank')
    try {
      const url = await urlComprobante(ruta)
      if (ventana) ventana.location.href = url
    } catch (err) {
      ventana?.close()
      setError(mensajeError(err))
    }
  }

  return (
    <Panel abierto onCerrar={onCerrar} titulo={`Reservación ${r.folio}`}>
      <div className="space-y-6 p-5">
        <div>
          <Estado estado={r.estado} />
          <p className="mt-2 text-xl font-bold">{r.shows?.nombre}</p>
          <p className="text-tinta-soft">{r.paquetes?.nombre ?? 'Función'}{r.tipo_evento ? `, ${r.tipo_evento.toLowerCase()}` : ''}{r.festejado ? ` de ${r.festejado}` : ''}</p>
          {r.modalidad_nombre && <p className="mt-1 text-[15px]">Evento {r.modalidad_nombre.toLowerCase()} <span className="num text-tinta-soft">(+{pesos(r.cargo_modalidad)})</span></p>}
          <p className="mt-2 font-medium first-letter:uppercase">{fechaLarga(r.inicio)}, {hora(r.inicio)}</p>
          <p className="mt-1 flex gap-1.5 text-[15px] text-tinta-soft"><MapPin className="mt-0.5 size-4 shrink-0" /> {r.calle}, {r.colonia}, {r.codigo_postal}{r.zonas?.nombre ? ` (${r.zonas.nombre})` : ''}</p>
          {r.referencias && <p className="mt-1 text-[15px] text-tinta-soft">Referencias: {r.referencias}</p>}
          {r.comentarios && <p className="mt-1 text-[15px] text-tinta-soft">Comentarios: {r.comentarios}</p>}
          {r.contacto_dia && <p className="mt-1 text-[15px] text-tinta-soft">Recibe: {r.contacto_dia}</p>}
          {r.motivo_excepcion && <p className="mt-2 rounded-xl bg-alerta-soft px-3 py-2 text-sm">Excepción: {r.motivo_excepcion}</p>}
        </div>

        {error && <p role="alert" className="rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}

        <div className="grid grid-cols-3 gap-2">
          {c?.telefono && <a href={`tel:${soloDigitos(c.telefono)}`} className="flex flex-col items-center gap-1 rounded-2xl bg-butaca py-3 text-sm font-medium hover:bg-linea"><Phone className="size-5" /> Llamar</a>}
          {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-2xl bg-butaca py-3 text-sm font-medium hover:bg-linea"><MessageCircle className="size-5" /> WhatsApp</a>}
          <a href={mapa} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-2xl bg-butaca py-3 text-sm font-medium hover:bg-linea"><Navigation className="size-5" /> Cómo llegar</a>
        </div>

        <section>
          <h3 className="font-semibold">Cliente</h3>
          <dl className="mt-2 space-y-1 text-[15px]">
            <div className="flex justify-between gap-3"><dt className="text-tinta-soft">Nombre</dt><dd className="text-right font-medium">{c?.nombre}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-tinta-soft">Celular</dt><dd className="num">{c?.telefono || 'Sin teléfono'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-tinta-soft">Correo</dt><dd className="truncate">{c?.correo || 'Sin correo'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-tinta-soft">Canal</dt><dd>{r.canal}</dd></div>
          </dl>
        </section>

        <section>
          <h3 className="font-semibold">Pagos</h3>
          <dl className="num mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-butaca p-3"><dt className="text-xs text-tinta-soft">Total</dt><dd className="font-bold">{pesos(r.total)}</dd></div>
            <div className="rounded-2xl bg-butaca p-3"><dt className="text-xs text-tinta-soft">Pagado</dt><dd className="font-bold">{pesos(r.total_pagado)}</dd></div>
            <div className={`rounded-2xl p-3 ${saldo > 0 ? 'bg-alerta-soft' : 'bg-ok-soft'}`}><dt className="text-xs text-tinta-soft">Saldo</dt><dd className="font-bold">{pesos(saldo)}</dd></div>
          </dl>
          <p className="mt-1.5 text-sm text-tinta-soft">Anticipo requerido: <span className="num">{pesos(r.anticipo_requerido)}</span></p>

          {pagos.length > 0 && (
            <ul className="mt-3 divide-y divide-linea rounded-xl ring-1 ring-linea">
              {pagos.map((p) => (
                <li key={p.id} className="px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="num font-semibold">{pesos(p.monto)} <span className="font-normal text-tinta-soft">{p.metodo}</span></span>
                    <span className={p.estado === 'aprobado' ? 'text-ok' : p.estado === 'rechazado' ? 'text-error' : 'font-semibold text-alerta'}>
                      {p.estado === 'aprobado' ? 'Aprobado' : p.estado === 'rechazado' ? 'Rechazado' : 'Por revisar'}
                    </span>
                  </div>
                  {p.comprobante_path && (
                    <button onClick={() => abrirComprobante(p.comprobante_path)} className="mt-1 inline-flex items-center gap-1 font-medium text-selva-700 underline">
                      <FileText className="size-3.5" /> Ver comprobante <ExternalLink className="size-3" />
                    </button>
                  )}
                  {p.estado === 'pendiente' && (
                    <div className="mt-2 flex gap-2">
                      <Boton tam="sm" disabled={ocupado} onClick={() => ejecutar(() => resolverPago(p.id, 'aprobado'), `Pago de ${pesos(p.monto)} aprobado`)}>Aprobar</Boton>
                      <Boton tam="sm" variante="peligro" disabled={ocupado} onClick={() => {
                        const m = window.prompt('¿Por qué lo rechazas? El cliente lo verá en su correo.')
                        if (m !== null) ejecutar(() => resolverPago(p.id, 'rechazado', m.trim() || null), 'Comprobante rechazado')
                      }}>Rechazar</Boton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {pagoAbierto ? (
            <form
              className="entra mt-3 space-y-3 rounded-2xl border border-linea p-4"
              onSubmit={async (e) => {
                e.preventDefault()
                const m = Number(monto)
                if (!(m > 0)) return setError('Escribe el monto del pago.')
                const ok = await ejecutar(
                  () => registrarPago({
                    reservacion_id: r.id, monto: m, metodo,
                    tipo: Number(r.total_pagado) + m >= Number(r.total) ? 'liquidacion' : Number(r.total_pagado) < Number(r.anticipo_requerido) ? 'anticipo' : 'abono',
                    estado: 'aprobado', registrado_por: usuario.id,
                  }),
                  `Pago de ${pesos(m)} registrado`,
                )
                if (ok) {
                  setPagoAbierto(false)
                  setMonto('')
                }
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Monto"><Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d.]/g, ''))} placeholder={String(saldo)} autoFocus /></Campo>
                <Campo etiqueta="Método">
                  <Select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                    <option>Efectivo</option><option>Transferencia</option><option>Terminal</option>
                  </Select>
                </Campo>
              </div>
              <div className="flex gap-2">
                <Boton type="submit" tam="sm" disabled={ocupado}>Registrar pago</Boton>
                <Boton type="button" tam="sm" variante="fantasma" onClick={() => setPagoAbierto(false)}>Cerrar</Boton>
              </div>
            </form>
          ) : (
            saldo > 0 && r.estado !== 'cancelada' && <Boton tam="sm" variante="secundario" className="mt-3" onClick={() => setPagoAbierto(true)}><CircleDollarSign className="size-4" /> Registrar pago</Boton>
          )}
        </section>

        <section>
          <h3 className="font-semibold">Notas internas</h3>
          {notas.length > 0 && (
            <ul className="mt-2 space-y-2">
              {notas.map((n) => <li key={n.id} className="rounded-xl bg-maiz-soft px-3 py-2 text-[15px]">{n.texto}</li>)}
            </ul>
          )}
          <form
            className="mt-2 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!nota.trim()) return
              if (await ejecutar(() => agregarNota(r.id, nota.trim(), usuario.id))) setNota('')
            }}
          >
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Solo la ve el equipo" aria-label="Nueva nota" />
            <Boton type="submit" variante="secundario" disabled={ocupado}>Agregar</Boton>
          </form>
        </section>

        {activa && fechaAbierta && (
          <section className="rounded-2xl border border-linea p-4">
            <h3 className="font-semibold">Cambiar fecha</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Campo etiqueta="Fecha"><Input type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); setHoraNueva('') }} /></Campo>
              <Campo etiqueta="Hora"><Input type="time" value={horaNueva} onChange={(e) => setHoraNueva(e.target.value)} /></Campo>
            </div>
            {libres.data && <p className="mt-2 text-sm text-tinta-soft">Libres ese día: {libres.data.length ? libres.data.map((h) => hora(h.inicio)).join(', ') : 'ninguno'}</p>}
            <Campo etiqueta="Motivo (obligatorio si se sale de las reglas)" className="mt-3"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
            <div className="mt-3 flex gap-2">
              <Boton tam="sm" disabled={ocupado || !fecha || !horaNueva} onClick={async () => {
                if (await ejecutar(() => reprogramarReservacion(r.id, instanteLocal(fecha, horaNueva), motivo.trim() || null), 'Fecha cambiada')) setFechaAbierta(false)
              }}>Guardar fecha</Boton>
              <Boton tam="sm" variante="fantasma" onClick={() => setFechaAbierta(false)}>Cerrar</Boton>
            </div>
          </section>
        )}

        {cancelando && (
          <section className="rounded-2xl border border-error/30 p-4">
            <h3 className="font-semibold">Cancelar reservación</h3>
            <p className="mt-1 text-sm text-tinta-soft">El horario queda libre y se avisa al cliente por correo.</p>
            <Campo etiqueta="Motivo (opcional)" className="mt-3"><Input value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)} /></Campo>
            <div className="mt-3 flex gap-2">
              <Boton tam="sm" disabled={ocupado} onClick={async () => {
                if (await ejecutar(() => cancelarReservacion(r.id, motivoCancelar.trim()), 'Reservación cancelada')) setCancelando(false)
              }}>Cancelar reservación</Boton>
              <Boton tam="sm" variante="fantasma" onClick={() => setCancelando(false)}>Conservarla</Boton>
            </div>
          </section>
        )}

        <section className="border-t border-linea pt-5">
          <h3 className="sr-only">Acciones</h3>
          <div className="flex flex-wrap gap-2">
            {r.estado === 'pendiente' && <Boton tam="sm" disabled={ocupado} onClick={() => ejecutar(() => cambiarEstadoReservacion(r.id, 'confirmada'), 'Reservación confirmada')}><CheckCheck className="size-4" /> Confirmar sin anticipo</Boton>}
            {r.estado === 'confirmada' && <Boton tam="sm" variante="oscuro" disabled={ocupado} onClick={() => ejecutar(() => cambiarEstadoReservacion(r.id, 'realizada'), 'Show marcado como realizado')}><CheckCheck className="size-4" /> Marcar como realizado</Boton>}
            {activa && !fechaAbierta && <Boton tam="sm" variante="secundario" onClick={() => setFechaAbierta(true)}>Cambiar fecha</Boton>}
            {activa && !cancelando && <Boton tam="sm" variante="peligro" onClick={() => setCancelando(true)}><XCircle className="size-4" /> Cancelar</Boton>}
          </div>
        </section>
      </div>
    </Panel>
  )
}
