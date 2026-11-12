import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { mensajeError } from '../lib/api'
import { guardarHorarioSemana, obtenerHorario } from '../lib/apiAdmin'
import { useStore } from '../store'
import { useShows } from '../lib/consultas'
import { Boton, Cargando, ErrorCarga } from '../components/ui'
import { Encabezado } from './AdminLayout'
import SemanaNormal from './horarios/SemanaNormal'
import VistaPrevia from './horarios/VistaPrevia'
import DiasEspeciales from './horarios/DiasEspeciales'
import Bloqueos from './horarios/Bloqueos'
import { DIAS, ORDEN, aBase, desdeBase, problemaFranjas } from './horarios/util'

const aEditor = (filas) => filas.map((d) => ({ dia_semana: d.dia_semana, activo: d.activo, max_shows: d.max_shows, franjas: desdeBase(d.horario_franjas) }))
const firmaSemana = (semana) => JSON.stringify((semana ?? []).map((d) => [d.dia_semana, d.activo, d.max_shows ?? null, aBase(d.franjas)]))

export default function Disponibilidad() {
  const { avisar } = useStore()
  const queryClient = useQueryClient()
  const horario = useQuery({ queryKey: ['admin-horario'], queryFn: obtenerHorario })
  const { data: shows } = useShows()
  const propios = (shows ?? []).filter((x) => x.horario_propio)
  const [semana, setSemana] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (horario.data && !semana) setSemana(aEditor(horario.data))
  }, [horario.data, semana])

  const original = useMemo(() => (horario.data ? firmaSemana(aEditor(horario.data)) : null), [horario.data])
  const sinGuardar = semana && original !== firmaSemana(semana)

  // Avisa antes de salir con cambios sin guardar
  useEffect(() => {
    if (!sinGuardar) return undefined
    const aviso = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [sinGuardar])

  const refrescarSitio = () => {
    queryClient.invalidateQueries({ queryKey: ['disponibilidad'] })
    queryClient.invalidateQueries({ queryKey: ['horarios'] })
  }

  if (horario.isLoading || (horario.data && !semana)) return <Cargando />
  if (horario.isError) return <ErrorCarga onReintentar={horario.refetch} />

  const activos = ORDEN.map((n) => semana.find((d) => d.dia_semana === n)).filter((d) => d?.activo)

  const guardar = async () => {
    setError('')
    for (const d of activos) {
      const problema = problemaFranjas(d.franjas, DIAS[d.dia_semana])
      if (problema) return setError(problema)
    }
    setGuardando(true)
    try {
      await guardarHorarioSemana(semana.map((d) => ({ dia_semana: d.dia_semana, activo: d.activo, max_shows: d.max_shows ?? null, franjas: aBase(d.franjas) })))
      await queryClient.invalidateQueries({ queryKey: ['admin-horario'] })
      setSemana(null) // se vuelve a cargar tal como quedó guardado
      refrescarSitio()
      avisar('Horario guardado')
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <Encabezado titulo="Horarios y bloqueos" descripcion="Cuándo y a qué horas se puede reservar en línea" />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
          <h2 className="font-bold">Semana normal</h2>
          <p className="mt-1 text-sm text-tinta-soft">
            Cada día puede tener varias franjas. En cada franja eliges si las horas se ofrecen cada cierto tiempo o solo a horas exactas.
            El show debe terminar antes del cierre de su franja. Las reservaciones existentes no cambian.
          </p>
          {propios.length > 0 && (
            <p className="mt-2 rounded-xl bg-agua-soft px-3 py-2 text-sm">
              Estos shows usan su propio horario (se cambia en Shows): <span className="font-semibold">{propios.map((x) => x.nombre).join(', ')}</span>.
            </p>
          )}
          <div className="mt-2">
            <SemanaNormal semana={semana} onCambio={setSemana} />
          </div>
          {error && <p role="alert" className="mt-2 rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
          <div className="sticky bottom-0 -mx-5 mt-3 flex flex-wrap items-center gap-3 rounded-b-2xl border-t border-linea bg-white/95 px-5 pt-3 pb-1 backdrop-blur">
            <Boton onClick={guardar} disabled={guardando || !sinGuardar}>{guardando ? 'Guardando…' : 'Guardar horario'}</Boton>
            {sinGuardar && (
              <>
                <span className="text-sm font-medium text-alerta">Cambios sin guardar</span>
                <button type="button" onClick={() => { setError(''); setSemana(aEditor(horario.data)) }} className="text-sm font-semibold text-tinta-soft underline">Descartar</button>
              </>
            )}
          </div>
        </section>

        <div className="xl:sticky xl:top-4">
          <VistaPrevia excluirPropios dias={activos.map((d) => ({ clave: String(d.dia_semana), etiqueta: DIAS[d.dia_semana], franjas: d.franjas, maxShows: d.max_shows }))} />
        </div>
      </div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
        <DiasEspeciales onCambio={refrescarSitio} />
        <Bloqueos onCambio={refrescarSitio} />
      </div>
    </>
  )
}
