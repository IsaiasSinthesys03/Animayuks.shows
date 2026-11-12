import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import { mensajeError } from '../../lib/api'
import { cambiarHorasExtra } from '../../lib/apiAdmin'
import { useConfiguracion } from '../../lib/consultas'
import { hora, opcionesExtra, pesos, textoMinutos } from '../../lib/format'
import { useStore } from '../../store'
import { Boton, Campo, Input, Select } from '../../components/ui'

const MIN = 60000

/** "Cambiar tiempo extra": solo el admin, a petición del cliente */
export default function TiempoExtra({ r, onCerrar }) {
  const { avisar } = useStore()
  const queryClient = useQueryClient()
  const { data: cfg } = useConfiguracion()
  const [minutos, setMinutos] = useState(Number(r.minutos_extra) || 0)
  const [motivo, setMotivo] = useState('')
  const [pideMotivo, setPideMotivo] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const precio = Number(r.shows?.precio_hora_extra ?? r.precio_hora_extra ?? 0)
  const maximo = Math.max(Number(cfg?.max_minutos_extra ?? 180), Number(r.minutos_extra) || 0)
  const delta = minutos - (Number(r.minutos_extra) || 0)
  const finNuevo = new Date(new Date(r.fin).getTime() + delta * MIN)
  const libreNuevo = new Date(finNuevo.getTime() + ((Number(r.desmontaje_min) || 0) + (Number(r.traslado_min) || 0)) * MIN)
  const cargoNuevo = Math.round(precio * minutos / 60 * 100) / 100
  const totalNuevo = Math.max(0, Number(r.total) - Number(r.cargo_horas_extra || 0) + cargoNuevo)
  const saldoNuevo = totalNuevo - Number(r.total_pagado)

  const guardar = async () => {
    setError('')
    setGuardando(true)
    try {
      await cambiarHorasExtra(r.id, minutos, pideMotivo, pideMotivo ? motivo.trim() : null)
      await Promise.all(['admin-reservaciones', 'admin-historial', 'disponibilidad', 'horarios'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
      avisar('Tiempo extra actualizado. Le avisamos al cliente por correo.')
      onCerrar()
    } catch (err) {
      const t = err.message ?? ''
      if (/^MOTIVO_REQUERIDO/.test(t)) {
        setPideMotivo(true)
        setError('Con ese tiempo el show termina fuera del horario de servicio. Si aun así lo aceptas, escribe el motivo y guarda de nuevo.')
      } else {
        setError(mensajeError(err))
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="rounded-2xl border border-linea p-4">
      <h3 className="flex items-center gap-2 font-semibold"><Clock className="size-4" aria-hidden /> Cambiar tiempo extra</h3>
      <p className="mt-1 text-sm text-tinta-soft">Solo a petición del cliente. Precio vigente: {pesos(precio)} por hora.</p>
      <Campo etiqueta="Tiempo extra" className="mt-3">
        <Select value={minutos} onChange={(e) => { setMinutos(Number(e.target.value)); setPideMotivo(false); setError('') }}>
          <option value={0}>Sin tiempo extra</option>
          {opcionesExtra(maximo).map((m) => <option key={m} value={m}>+{textoMinutos(m)} · {pesos(precio * m / 60)}</option>)}
        </Select>
      </Campo>
      {delta !== 0 && (
        <dl className="num mt-3 space-y-1 rounded-xl bg-butaca/70 p-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-tinta-soft">El show termina</dt><dd>{hora(finNuevo)} <span className="text-tinta-soft">(antes {hora(r.fin)})</span></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-tinta-soft">El equipo queda libre</dt><dd>{hora(libreNuevo)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-tinta-soft">Total</dt><dd className="font-semibold">{pesos(totalNuevo)} <span className="font-normal text-tinta-soft">(antes {pesos(r.total)})</span></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-tinta-soft">Saldo</dt><dd>{saldoNuevo >= 0 ? pesos(saldoNuevo) : `A favor del cliente ${pesos(-saldoNuevo)}`}</dd></div>
        </dl>
      )}
      {pideMotivo && <Campo etiqueta="Motivo de la excepción" className="mt-3"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Boton tam="sm" disabled={guardando || delta === 0 || (pideMotivo && !motivo.trim())} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
        <Boton tam="sm" variante="fantasma" onClick={onCerrar}>Cerrar</Boton>
      </div>
    </section>
  )
}
