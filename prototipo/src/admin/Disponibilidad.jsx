import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useAuth } from '../auth'
import { mensajeError } from '../lib/api'
import { borrarBloqueo, crearBloqueo, guardarHorario, obtenerBloqueos, obtenerHorario } from '../lib/apiAdmin'
import { fechaLarga, hoy, instanteLocal } from '../lib/format'
import { useStore } from '../store'
import { Boton, Campo, Cargando, ErrorCarga, Input } from '../components/ui'
import { Encabezado, Interruptor } from './AdminLayout'

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const ORDEN = [1, 2, 3, 4, 5, 6, 0] // la semana empieza en lunes

/** Un día después, para que el bloqueo cubra la fecha "hasta" completa */
const diaSiguiente = (dia) => new Date(Date.parse(`${dia}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)

export default function Disponibilidad() {
  const { usuario } = useAuth()
  const { avisar } = useStore()
  const queryClient = useQueryClient()
  const horario = useQuery({ queryKey: ['admin-horario'], queryFn: obtenerHorario })
  const bloqueos = useQuery({ queryKey: ['admin-bloqueos'], queryFn: obtenerBloqueos })
  const [semana, setSemana] = useState(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [errorBloqueo, setErrorBloqueo] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (horario.data && !semana) setSemana(horario.data)
  }, [horario.data, semana])

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['disponibilidad'] })
    queryClient.invalidateQueries({ queryKey: ['horarios'] })
  }

  if (horario.isLoading) return <Cargando />
  if (horario.isError) return <ErrorCarga onReintentar={horario.refetch} />

  const cambiar = (dia, cambios) => setSemana((s) => s.map((d) => (d.dia_semana === dia ? { ...d, ...cambios } : d)))

  const guardar = async () => {
    setError('')
    if ((semana ?? []).some((d) => d.activo && d.cierra.slice(0, 5) <= d.abre.slice(0, 5))) return setError('La hora de cierre debe ser después de la de apertura.')
    setGuardando(true)
    try {
      await guardarHorario(semana)
      await queryClient.invalidateQueries({ queryKey: ['admin-horario'] })
      refrescar()
      avisar('Horario guardado')
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  const bloquear = async (e) => {
    e.preventDefault()
    setErrorBloqueo('')
    if (!desde) return setErrorBloqueo('Elige la fecha.')
    const fin = hasta || desde
    if (fin < desde) return setErrorBloqueo('La fecha final debe ser igual o posterior a la inicial.')
    try {
      await crearBloqueo({ inicio: instanteLocal(desde, '00:00'), fin: instanteLocal(diaSiguiente(fin), '00:00'), motivo: motivo.trim() || 'Bloqueado', creado_por: usuario.id })
      await queryClient.invalidateQueries({ queryKey: ['admin-bloqueos'] })
      refrescar()
      avisar('Fechas bloqueadas')
      setDesde('')
      setHasta('')
      setMotivo('')
    } catch (err) {
      setErrorBloqueo(mensajeError(err))
    }
  }

  const futuros = (bloqueos.data ?? []).filter((b) => new Date(b.fin) > new Date())

  return (
    <>
      <Encabezado titulo="Horarios y bloqueos" descripcion="Define cuándo se puede reservar en línea" />
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
          <h2 className="font-bold">Horario de servicio</h2>
          <p className="mt-1 text-sm text-tinta-soft">El show debe empezar y terminar dentro de este horario. Las reservaciones existentes no cambian.</p>
          <ul className="mt-3 divide-y divide-linea">
            {ORDEN.map((n) => {
              const d = semana?.find((x) => x.dia_semana === n)
              if (!d) return null
              return (
                <li key={n} className="flex flex-wrap items-center gap-3 py-3">
                  <Interruptor activo={d.activo} etiqueta={`Dar servicio los ${DIAS[n].toLowerCase()}`} onCambio={() => cambiar(n, { activo: !d.activo })} />
                  <span className="w-24 font-medium">{DIAS[n]}</span>
                  {d.activo ? (
                    <span className="flex items-center gap-2 text-sm">
                      <input type="time" value={d.abre.slice(0, 5)} onChange={(e) => cambiar(n, { abre: e.target.value })} className="num h-9 rounded-lg border border-linea px-2" aria-label={`${DIAS[n]} abre`} />
                      a
                      <input type="time" value={d.cierra.slice(0, 5)} onChange={(e) => cambiar(n, { cierra: e.target.value })} className="num h-9 rounded-lg border border-linea px-2" aria-label={`${DIAS[n]} cierra`} />
                    </span>
                  ) : (
                    <span className="text-sm text-tinta-soft">Sin servicio</span>
                  )}
                </li>
              )
            })}
          </ul>
          {error && <p role="alert" className="mt-2 rounded-xl bg-telon-50 px-3 py-2 text-sm font-medium text-telon-700">{error}</p>}
          <Boton className="mt-4" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar horario'}</Boton>
        </section>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
          <h2 className="font-bold">Fechas bloqueadas</h2>
          <p className="mt-1 text-sm text-tinta-soft">Vacaciones, mantenimiento o compromisos personales. No se ofrecen en el calendario del sitio.</p>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={bloquear} noValidate>
            <Campo etiqueta="Desde"><Input type="date" min={hoy()} value={desde} onChange={(e) => setDesde(e.target.value)} /></Campo>
            <Campo etiqueta="Hasta (opcional)"><Input type="date" min={desde || hoy()} value={hasta} onChange={(e) => setHasta(e.target.value)} /></Campo>
            <Campo etiqueta="Motivo" className="sm:col-span-2"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Vacaciones" /></Campo>
            <div className="sm:col-span-2">
              {errorBloqueo && <p role="alert" className="mb-2 rounded-xl bg-telon-50 px-3 py-2 text-sm font-medium text-telon-700">{errorBloqueo}</p>}
              <Boton type="submit">Bloquear fechas</Boton>
            </div>
          </form>
          {bloqueos.isError && <ErrorCarga onReintentar={bloqueos.refetch} />}
          {bloqueos.data && futuros.length === 0 && <p className="mt-5 text-sm text-tinta-soft">No hay fechas bloqueadas.</p>}
          <ul className="mt-5 divide-y divide-linea">
            {futuros.map((b) => {
              // El fin es la medianoche siguiente: se resta un instante para mostrar el último día
              const ultimo = new Date(new Date(b.fin).getTime() - 1000)
              const mismoDia = fechaLarga(b.inicio) === fechaLarga(ultimo)
              return (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <span>
                    <span className="block font-medium first-letter:uppercase">{fechaLarga(b.inicio)}{mismoDia ? '' : ` al ${fechaLarga(ultimo)}`}</span>
                    <span className="block text-sm text-tinta-soft">{b.motivo}</span>
                  </span>
                  <button
                    onClick={async () => {
                      await borrarBloqueo(b.id)
                      await queryClient.invalidateQueries({ queryKey: ['admin-bloqueos'] })
                      refrescar()
                      avisar('Bloqueo eliminado')
                    }}
                    className="rounded-full p-2 text-tinta-soft hover:bg-telon-50 hover:text-telon-700"
                    aria-label={`Quitar bloqueo: ${b.motivo}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </>
  )
}
