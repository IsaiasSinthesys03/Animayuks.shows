import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { mensajeError } from '../../lib/api'
import { guardarHorarioShow, obtenerHorario, obtenerHorarioShow, reservacionesFueraHorarioShow } from '../../lib/apiAdmin'
import { fechaLarga, hora } from '../../lib/format'
import { useStore } from '../../store'
import { Boton, Cargando, ErrorCarga } from '../../components/ui'
import SemanaNormal from './SemanaNormal'
import VistaPrevia from './VistaPrevia'
import { DIAS, ORDEN, aBase, desdeBase, nuevaClave, problemaFranjas } from './util'

const semanaDesde = (filas) =>
  ORDEN.map((n) => ({ dia_semana: n, franjas: desdeBase((filas ?? []).filter((f) => f.dia_semana === n)) }))
const aDias = (semana) => semana.filter((d) => d.franjas.length > 0).map((d) => ({ dia_semana: d.dia_semana, franjas: aBase(d.franjas) }))
const firma = (propio, semana) => JSON.stringify([propio, aDias(semana ?? [])])

const claseSegmento = (activo) =>
  `h-10 rounded-lg px-3 text-[15px] font-semibold transition-colors ${activo ? 'bg-white shadow-sm' : 'text-tinta-soft hover:text-tinta'}`

/** "Horario de este show": usa el general o tiene su propia semana de franjas */
export default function HorarioShow({ show }) {
  const { avisar } = useStore()
  const queryClient = useQueryClient()
  const propias = useQuery({ queryKey: ['admin-horario-show', show.id], queryFn: () => obtenerHorarioShow(show.id) })
  const general = useQuery({ queryKey: ['admin-horario'], queryFn: obtenerHorario })
  const [propio, setPropio] = useState(show.horario_propio)
  const [semana, setSemana] = useState(null)
  const [fuera, setFuera] = useState([])
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (propias.data && !semana) setSemana(semanaDesde(propias.data))
  }, [propias.data, semana])

  const original = useMemo(() => (propias.data ? firma(show.horario_propio, semanaDesde(propias.data)) : null), [propias.data, show.horario_propio])
  const sinGuardar = semana && original !== firma(propio, semana)

  // Reservaciones futuras de este show que quedarían fuera del horario propuesto
  const dias = semana ? aDias(semana) : []
  const firmaDias = JSON.stringify(dias)
  useEffect(() => {
    if (!semana || !propio || dias.length === 0 || semana.some((d) => problemaFranjas(d.franjas, 'x'))) return setFuera([])
    let vigente = true
    const t = setTimeout(() => {
      reservacionesFueraHorarioShow(show.id, dias).then((r) => vigente && setFuera(r ?? [])).catch(() => vigente && setFuera([]))
    }, 400)
    return () => { vigente = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaDias, propio, show.id])

  if (propias.isLoading || (propias.data && !semana)) return <Cargando />
  if (propias.isError) return <ErrorCarga onReintentar={propias.refetch} />

  const copiarGeneral = () => {
    setSemana(ORDEN.map((n) => {
      const g = general.data?.find((d) => d.dia_semana === n)
      return { dia_semana: n, franjas: g?.activo ? desdeBase(g.horario_franjas).map((f) => ({ ...f, clave: nuevaClave() })) : [] }
    }))
  }

  const guardar = async () => {
    setError('')
    if (propio) {
      if (dias.length === 0) return setError('Agrega al menos un día con horario, o elige "Usa el horario general".')
      for (const d of semana) {
        const problema = problemaFranjas(d.franjas, DIAS[d.dia_semana])
        if (problema) return setError(problema)
      }
    }
    setGuardando(true)
    try {
      await guardarHorarioShow(show.id, propio, dias)
      await Promise.all(['admin-horario-show', 'shows', 'show'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
      queryClient.invalidateQueries({ queryKey: ['disponibilidad'] })
      queryClient.invalidateQueries({ queryKey: ['horarios'] })
      setSemana(null)
      avisar(propio ? 'Horario del show guardado' : 'El show usa el horario general')
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="border-t border-linea p-5">
      <h3 className="font-semibold">Horario de este show</h3>
      <p className="mt-1 text-sm text-tinta-soft">
        Con horario propio, este show solo se ofrece en sus días y horas. El máximo por día, las fechas bloqueadas y los días especiales aplican igual a todos los shows.
      </p>
      <div role="radiogroup" aria-label="Horario de este show" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-butaca p-1">
        <button type="button" role="radio" aria-checked={!propio} onClick={() => setPropio(false)} className={claseSegmento(!propio)}>Usa el horario general</button>
        <button type="button" role="radio" aria-checked={propio} onClick={() => setPropio(true)} className={claseSegmento(propio)}>Horario propio</button>
      </div>

      {!propio && (
        <p className="mt-2 text-sm text-tinta-soft">
          Se ofrece con el horario de <a href="/admin/disponibilidad" className="font-semibold text-selva-700 underline">Horarios y bloqueos</a>.
          {dias.length > 0 && ' Su horario propio se conserva por si lo vuelves a activar.'}
        </p>
      )}

      {propio && (
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copiarGeneral} disabled={!general.data} className="h-8 rounded-full bg-butaca px-3 text-sm font-semibold hover:bg-linea disabled:opacity-50">
              Copiar del horario general
            </button>
          </div>
          <SemanaNormal modo="show" semana={semana} onCambio={setSemana} />
          {fuera.length > 0 && (
            <p className="flex gap-2 rounded-xl bg-alerta-soft px-3 py-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {fuera.length === 1 ? '1 reservación' : `${fuera.length} reservaciones`} de este show {fuera.length === 1 ? 'quedaría' : 'quedarían'} fuera del horario nuevo
                ({fuera.slice(0, 4).map((r) => `${r.folio}, ${fechaLarga(r.inicio)} ${hora(r.inicio)}`).join('; ')}{fuera.length > 4 ? '…' : ''}). No se cancelan.
              </span>
            </p>
          )}
          <VistaPrevia
            titulo="Vista previa de este show"
            showFijo={show}
            dias={semana.filter((d) => d.franjas.length > 0).map((d) => ({ clave: String(d.dia_semana), etiqueta: DIAS[d.dia_semana], franjas: d.franjas }))}
          />
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Boton type="button" variante="secundario" onClick={guardar} disabled={guardando || !sinGuardar}>
          {guardando ? 'Guardando…' : 'Guardar horario del show'}
        </Boton>
        {sinGuardar && (
          <>
            <span className="text-sm font-medium text-alerta">Cambios sin guardar</span>
            <button type="button" onClick={() => { setError(''); setPropio(show.horario_propio); setSemana(semanaDesde(propias.data)) }} className="text-sm font-semibold text-tinta-soft underline">Descartar</button>
          </>
        )}
      </div>
    </section>
  )
}
