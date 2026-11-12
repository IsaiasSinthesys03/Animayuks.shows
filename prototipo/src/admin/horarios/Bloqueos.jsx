import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useAuth } from '../../auth'
import { mensajeError } from '../../lib/api'
import { borrarBloqueo, crearBloqueo, obtenerBloqueos } from '../../lib/apiAdmin'
import { fechaLarga, hora, hoy, instanteLocal } from '../../lib/format'
import { useStore } from '../../store'
import { Boton, Campo, ErrorCarga, Input } from '../../components/ui'
import SelectHora from './SelectHora'
import { HORAS, HORAS_CIERRE } from './util'

/** Un día después, para que el bloqueo cubra la fecha "hasta" completa */
const diaSiguiente = (dia) => new Date(Date.parse(`${dia}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
/** Medianoche en Mérida (UTC-6, sin horario de verano) */
const esMedianoche = (ts) => (((Date.parse(ts) - 6 * 3600000) % 86400000) + 86400000) % 86400000 === 0

const claseSegmento = (activo) =>
  `h-9 rounded-lg px-3 text-sm font-semibold transition-colors ${activo ? 'bg-white shadow-sm' : 'text-tinta-soft hover:text-tinta'}`

/** Fechas bloqueadas: días completos o solo unas horas de un día */
export default function Bloqueos({ onCambio }) {
  const { usuario } = useAuth()
  const { avisar } = useStore()
  const queryClient = useQueryClient()
  const bloqueos = useQuery({ queryKey: ['admin-bloqueos'], queryFn: obtenerBloqueos })
  const [parcial, setParcial] = useState(false)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [horaDesde, setHoraDesde] = useState('14:00')
  const [horaHasta, setHoraHasta] = useState('18:00')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')

  const refrescar = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-bloqueos'] })
    onCambio?.()
  }

  const bloquear = async (e) => {
    e.preventDefault()
    setError('')
    if (!desde) return setError('Elige la fecha.')
    let inicio
    let fin
    if (parcial) {
      if (horaHasta <= horaDesde) return setError('La hora final debe ser después de la inicial.')
      inicio = instanteLocal(desde, horaDesde)
      fin = instanteLocal(desde, horaHasta)
    } else {
      const ultimo = hasta || desde
      if (ultimo < desde) return setError('La fecha final debe ser igual o posterior a la inicial.')
      inicio = instanteLocal(desde, '00:00')
      fin = instanteLocal(diaSiguiente(ultimo), '00:00')
    }
    try {
      await crearBloqueo({ inicio, fin, motivo: motivo.trim() || 'Bloqueado', creado_por: usuario.id })
      await refrescar()
      avisar(parcial ? 'Horas bloqueadas' : 'Fechas bloqueadas')
      setDesde('')
      setHasta('')
      setMotivo('')
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  const futuros = (bloqueos.data ?? []).filter((b) => new Date(b.fin) > new Date())

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
      <h2 className="font-bold">Fechas bloqueadas</h2>
      <p className="mt-1 text-sm text-tinta-soft">Vacaciones, mantenimiento o compromisos personales. No se ofrecen en el calendario del sitio.</p>
      <form className="mt-4 space-y-3" onSubmit={bloquear} noValidate>
        <div role="radiogroup" aria-label="Qué bloquear" className="inline-flex rounded-xl bg-butaca p-1">
          <button type="button" role="radio" aria-checked={!parcial} onClick={() => setParcial(false)} className={claseSegmento(!parcial)}>Todo el día</button>
          <button type="button" role="radio" aria-checked={parcial} onClick={() => setParcial(true)} className={claseSegmento(parcial)}>Solo unas horas</button>
        </div>
        {parcial ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Campo etiqueta="Fecha"><Input type="date" min={hoy()} value={desde} onChange={(e) => setDesde(e.target.value)} /></Campo>
            <div>
              <span className="mb-1.5 block text-sm font-semibold">Horas</span>
              <span className="flex items-center gap-2 text-sm">
                <SelectHora valor={horaDesde} opciones={HORAS} onCambio={setHoraDesde} etiqueta="Bloquear desde" />
                a
                <SelectHora valor={horaHasta} opciones={HORAS_CIERRE.filter((h) => h > horaDesde)} onCambio={setHoraHasta} etiqueta="Bloquear hasta" />
              </span>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Desde"><Input type="date" min={hoy()} value={desde} onChange={(e) => setDesde(e.target.value)} /></Campo>
            <Campo etiqueta="Hasta (opcional)"><Input type="date" min={desde || hoy()} value={hasta} onChange={(e) => setHasta(e.target.value)} /></Campo>
          </div>
        )}
        <Campo etiqueta="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={parcial ? 'Cita médica' : 'Vacaciones'} /></Campo>
        {error && <p role="alert" className="rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
        <Boton type="submit">{parcial ? 'Bloquear horas' : 'Bloquear fechas'}</Boton>
      </form>
      {bloqueos.isError && <ErrorCarga onReintentar={bloqueos.refetch} />}
      {bloqueos.data && futuros.length === 0 && <p className="mt-5 text-sm text-tinta-soft">No hay fechas bloqueadas.</p>}
      <ul className="mt-5 divide-y divide-linea">
        {futuros.map((b) => {
          const diaCompleto = esMedianoche(b.inicio) && esMedianoche(b.fin)
          // El fin de un día completo es la medianoche siguiente: se resta un instante para mostrar el último día
          const ultimo = new Date(new Date(b.fin).getTime() - 1000)
          const mismoDia = fechaLarga(b.inicio) === fechaLarga(ultimo)
          return (
            <li key={b.id} className="flex items-center justify-between gap-3 py-3">
              <span>
                <span className="block font-medium first-letter:uppercase">
                  {fechaLarga(b.inicio)}
                  {diaCompleto ? (mismoDia ? '' : ` al ${fechaLarga(ultimo)}`) : `, de ${hora(b.inicio)} a ${hora(b.fin)}`}
                </span>
                <span className="block text-sm text-tinta-soft">{b.motivo}</span>
              </span>
              <button
                onClick={async () => {
                  await borrarBloqueo(b.id)
                  await refrescar()
                  avisar('Bloqueo eliminado')
                }}
                className="rounded-full p-2 text-tinta-soft hover:bg-error-soft hover:text-error"
                aria-label={`Quitar bloqueo: ${b.motivo}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
