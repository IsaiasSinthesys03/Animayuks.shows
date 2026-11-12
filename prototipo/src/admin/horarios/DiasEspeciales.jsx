import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, TriangleAlert } from 'lucide-react'
import { mensajeError } from '../../lib/api'
import { borrarDiaEspecial, guardarDiaEspecial, obtenerDiasEspeciales, reservacionesFueraDeFranjas } from '../../lib/apiAdmin'
import { fechaDeDia, hora, hoy } from '../../lib/format'
import { useStore } from '../../store'
import { Boton, Campo, ErrorCarga, Input, Panel } from '../../components/ui'
import EditorFranjas from './EditorFranjas'
import VistaPrevia from './VistaPrevia'
import { aBase, desdeBase, nuevaFranja, problemaFranjas, resumenFranjas } from './util'

function EditorDia({ dia, onCerrar, onGuardado }) {
  const { avisar } = useStore()
  const [fecha, setFecha] = useState(dia?.fecha ?? '')
  const [motivo, setMotivo] = useState(dia?.motivo ?? '')
  const [maxShows, setMaxShows] = useState(dia?.max_shows ?? '')
  const [franjas, setFranjas] = useState(() => (dia ? desdeBase(dia.horario_franjas) : [nuevaFranja('10:00', '18:00')]))
  const [fuera, setFuera] = useState([])
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Avisa si en esa fecha hay reservaciones que quedarían fuera del horario nuevo
  const firma = JSON.stringify(aBase(franjas))
  useEffect(() => {
    if (!fecha || problemaFranjas(franjas, 'x')) return setFuera([])
    let vigente = true
    const t = setTimeout(() => {
      reservacionesFueraDeFranjas(fecha, aBase(franjas)).then((r) => vigente && setFuera(r ?? [])).catch(() => vigente && setFuera([]))
    }, 400)
    return () => { vigente = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, firma])

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!fecha) return setError('Elige la fecha.')
    const problema = problemaFranjas(franjas, 'Este día')
    if (problema) return setError(problema)
    setGuardando(true)
    try {
      await guardarDiaEspecial({ fecha, maxShows: maxShows === '' ? null : Number(maxShows), motivo, franjas: aBase(franjas), fechaAnterior: dia?.fecha })
      avisar(dia ? 'Día especial actualizado' : 'Día especial agregado')
      await onGuardado()
      onCerrar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Panel abierto onCerrar={onCerrar} titulo={dia ? 'Editar día especial' : 'Agregar día especial'} ancho="max-w-2xl">
      <form onSubmit={guardar} noValidate className="space-y-5 p-5">
        <p className="text-sm text-tinta-soft">Ese día se usa este horario en lugar del de la semana normal. Sirve para abrir un día que normalmente está cerrado o cambiarle las horas.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Campo etiqueta="Fecha"><Input type="date" min={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
          <Campo etiqueta="Máx. shows">
            <Input type="number" min={1} max={20} inputMode="numeric" placeholder="Sin límite" value={maxShows} onChange={(e) => setMaxShows(e.target.value === '' ? '' : Math.max(1, Math.min(20, Number(e.target.value))))} />
          </Campo>
        </div>
        <Campo etiqueta="Motivo (opcional)"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Temporada navideña" /></Campo>
        <div>
          <p className="mb-2 text-sm font-semibold">Horario de ese día</p>
          <EditorFranjas franjas={franjas} nombreDia="Este día" onCambio={setFranjas} />
        </div>
        {fuera.length > 0 && (
          <p className="flex gap-2 rounded-xl bg-alerta-soft px-3 py-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {fuera.length === 1 ? 'Hay 1 reservación' : `Hay ${fuera.length} reservaciones`} ese día fuera de este horario ({fuera.map((r) => `${r.folio} a las ${hora(r.inicio)}`).join(', ')}).
              No se cancelan; solo te avisamos.
            </span>
          </p>
        )}
        <VistaPrevia titulo="Vista previa" dias={[{ clave: 'especial', etiqueta: fecha ? fechaDeDia(fecha) : 'Este día', franjas, maxShows }]} />
        {error && <p role="alert" className="rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
        <div className="flex gap-2">
          <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar día especial'}</Boton>
          <Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        </div>
      </form>
    </Panel>
  )
}

/** Fechas con horario propio, que reemplazan la semana normal */
export default function DiasEspeciales({ onCambio }) {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const dias = useQuery({ queryKey: ['admin-dias-especiales'], queryFn: () => obtenerDiasEspeciales(hoy()) })
  const [editando, setEditando] = useState(undefined) // undefined: cerrado, null: nuevo, fecha: editar

  const refrescar = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-dias-especiales'] })
    onCambio?.()
  }

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">Días especiales</h2>
          <p className="mt-1 text-sm text-tinta-soft">Una fecha con su propio horario y máximo. Reemplaza la semana normal solo ese día.</p>
        </div>
        <Boton tam="sm" variante="secundario" onClick={() => setEditando(null)}><CalendarPlus className="size-4" /> Agregar</Boton>
      </div>
      {dias.isError && <ErrorCarga onReintentar={dias.refetch} />}
      {dias.data?.length === 0 && <p className="mt-4 text-sm text-tinta-soft">No hay días especiales.</p>}
      <ul className="mt-3 divide-y divide-linea">
        {(dias.data ?? []).map((d) => (
          <li key={d.fecha} className="flex items-start justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block font-medium first-letter:uppercase">{fechaDeDia(d.fecha)}</span>
              <span className="block text-sm text-tinta-soft">
                {resumenFranjas(desdeBase(d.horario_franjas))}{d.max_shows ? ` · máx. ${d.max_shows}` : ''}{d.motivo ? ` · ${d.motivo}` : ''}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => setEditando(d.fecha)} className="text-sm font-semibold text-selva-700 underline">Editar</button>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`¿Quitar el día especial del ${fechaDeDia(d.fecha)}? Ese día volverá al horario de la semana normal.`)) return
                  try {
                    await borrarDiaEspecial(d.fecha)
                    await refrescar()
                    avisar('Día especial quitado')
                  } catch (err) {
                    avisar(mensajeError(err))
                  }
                }}
                className="text-sm font-semibold text-error underline"
              >
                Quitar
              </button>
            </span>
          </li>
        ))}
      </ul>
      {editando !== undefined && (
        <EditorDia key={editando ?? 'nuevo'} dia={(dias.data ?? []).find((d) => d.fecha === editando)} onCerrar={() => setEditando(undefined)} onGuardado={refrescar} />
      )}
    </section>
  )
}
