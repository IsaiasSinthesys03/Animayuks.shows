import { useEffect, useMemo, useState } from 'react'
import { Eye, Loader2 } from 'lucide-react'
import { mensajeError } from '../../lib/api'
import { vistaPreviaHorario } from '../../lib/apiAdmin'
import { useShows } from '../../lib/consultas'
import { aBase, problemaFranjas, textoHoraCorta } from './util'

/**
 * Las horas que verá el cliente, calculadas por el servidor con las franjas
 * todavía sin guardar. dias: [{ clave, etiqueta, franjas, maxShows }]
 */
export default function VistaPrevia({ dias, titulo = 'Así lo verá el cliente', showFijo = null, excluirPropios = false }) {
  const { data: shows } = useShows()
  const opciones = useMemo(
    () =>
      (showFijo ? [showFijo] : (shows ?? []).filter((s) => s.activo && !(excluirPropios && s.horario_propio))).flatMap((s) => {
        const paquetes = s.paquetes.filter((p) => p.activo && p.duracion_min && p.duracion_min !== s.duracion_min)
        return [
          { clave: s.id, texto: `${s.nombre} (${s.duracion_min} min)`, duracion: s.duracion_min },
          ...paquetes.map((p) => ({ clave: `${s.id}:${p.id}`, texto: `${s.nombre}, ${p.nombre.toLowerCase()} (${p.duracion_min} min)`, duracion: p.duracion_min })),
        ]
      }),
    [shows, showFijo, excluirPropios],
  )
  const [elegido, setElegido] = useState('')
  const opcion = opciones.find((o) => o.clave === elegido) ?? opciones[0]
  const duracion = opcion?.duracion ?? 60

  const [resultado, setResultado] = useState({})
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  // Solo cambia cuando cambian las franjas (no las claves internas del editor)
  const firma = JSON.stringify(dias.map((d) => [d.clave, aBase(d.franjas)]))
  useEffect(() => {
    let vigente = true
    const t = setTimeout(async () => {
      setCargando(true)
      setError('')
      try {
        const pares = await Promise.all(
          dias.map(async (d) => [d.clave, problemaFranjas(d.franjas, d.etiqueta) ? null : (await vistaPreviaHorario(aBase(d.franjas), duracion)).map((x) => x.inicio.slice(0, 5))]),
        )
        if (vigente) setResultado(Object.fromEntries(pares))
      } catch (err) {
        if (vigente) setError(mensajeError(err))
      } finally {
        if (vigente) setCargando(false)
      }
    }, 300)
    return () => { vigente = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, duracion])

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
      <h2 className="flex items-center gap-2 font-bold"><Eye className="size-4" aria-hidden /> {titulo} {cargando && <Loader2 className="size-4 animate-spin text-tinta-soft" aria-label="Calculando" />}</h2>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block font-semibold">Show de ejemplo</span>
        <select value={opcion?.clave ?? ''} onChange={(e) => setElegido(e.target.value)} className="h-10 w-full cursor-pointer rounded-lg border border-linea bg-white px-2 text-sm focus:border-selva-500 focus:outline-none">
          {opciones.map((o) => <option key={o.clave} value={o.clave}>{o.texto}</option>)}
        </select>
        <span className="mt-1 block text-xs text-tinta-soft">Las horas de inicio no dependen de la duración: el show puede terminar después del cierre de la franja.</span>
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
      {opciones.length === 0 && <p className="mt-3 text-sm text-tinta-soft">Todos los shows activos usan su propio horario.</p>}
      {dias.length === 0 && <p className="mt-4 rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{showFijo ? 'Ningún día con horario: este show no se podrá reservar.' : 'Ningún día activo: nadie puede reservar en línea.'}</p>}
      <ul className="mt-4 space-y-2.5">
        {dias.map((d) => {
          const horas = resultado[d.clave]
          const problema = problemaFranjas(d.franjas, d.etiqueta)
          return (
            <li key={d.clave} className="text-sm">
              <span className="font-semibold">{d.etiqueta}</span>
              {d.maxShows ? <span className="text-tinta-soft"> · máx. {d.maxShows} {Number(d.maxShows) === 1 ? 'show' : 'shows'}</span> : null}
              <div className="mt-1 flex flex-wrap gap-1">
                {problema && <span className="text-error">{problema.replace(`${d.etiqueta}: `, '')}</span>}
                {!problema && horas?.length === 0 && (
                  <span className="text-alerta">Ninguna hora de inicio en estas franjas.</span>
                )}
                {!problema && horas?.map((h) => <span key={h} className="num rounded-full bg-selva-50 px-2 py-0.5 font-semibold text-selva-900">{textoHoraCorta(h)}</span>)}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
