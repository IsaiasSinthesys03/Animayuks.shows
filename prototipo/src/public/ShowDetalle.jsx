import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { CalendarDays, Check, ChevronLeft, Clock, Play, Users } from 'lucide-react'
import { resumenHorarioShow, urlImagen } from '../lib/api'
import { useConfiguracion, useShow } from '../lib/consultas'
import { pesos } from '../lib/format'
import { Cargando, Cartel, ErrorCarga } from '../components/ui'

const PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0]
const horaCorta = (h) => {
  const [hh, mm] = h.split(':').map(Number)
  return `${hh % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${hh < 12 ? 'a. m.' : 'p. m.'}`
}
const lista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0])

/** "sábados y domingos, de 10 a. m. a 2 p. m." · los días con el mismo horario se agrupan */
function textoHorario(filas) {
  const porDia = new Map()
  for (const f of filas) {
    const rango = `de ${horaCorta(f.abre)} a ${horaCorta(f.cierra)}`
    porDia.set(f.dia_semana, [...(porDia.get(f.dia_semana) ?? []), rango])
  }
  const grupos = new Map()
  for (const n of ORDEN_DIAS) {
    if (!porDia.has(n)) continue
    const clave = lista(porDia.get(n))
    grupos.set(clave, [...(grupos.get(clave) ?? []), PLURAL[n]])
  }
  return [...grupos].map(([rangos, dias]) => `${lista(dias)}, ${rangos}`).join('; ')
}

export default function ShowDetalle() {
  const { slug } = useParams()
  const consulta = useShow(slug)
  const { data: cfg } = useConfiguracion()
  const [paqueteId, setPaqueteId] = useState(null)
  const show = consulta.data
  const horario = useQuery({
    queryKey: ['resumen-horario', show?.id],
    queryFn: () => resumenHorarioShow(show.id),
    enabled: !!show?.horario_propio,
    staleTime: 5 * 60 * 1000,
  })

  if (consulta.isLoading) return <Cargando />
  if (consulta.isError) return <ErrorCarga onReintentar={consulta.refetch} />
  if (!show) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="text-xl font-semibold">Este show ya no está en cartelera.</p>
        <Link to="/shows" className="mt-4 inline-block font-semibold text-selva-700 underline">Ver la cartelera</Link>
      </div>
    )
  }

  const paquetes = show.paquetes.filter((p) => p.activo)
  const elegido = paquetes.find((p) => p.id === paqueteId) ?? paquetes[0] ?? null
  const precio = elegido ? elegido.precio : show.precio_base
  const duracion = elegido?.duracion_min ?? show.duracion_min

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <Link to="/shows" className="inline-flex items-center gap-1 text-[15px] font-medium text-tinta-soft hover:text-tinta">
        <ChevronLeft className="size-4" /> Cartelera
      </Link>

      <div className="mt-5 grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
        <div>
          <Cartel show={show} tam="lg" className="aspect-[4/5] rounded-3xl" />
          {(show.galeria.length > 0 || show.video_url) && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              {show.galeria.map((ruta) => (
                <img key={ruta} src={urlImagen(ruta)} alt={`Foto de ${show.nombre}`} loading="lazy" className="aspect-square w-full rounded-2xl object-cover" />
              ))}
              {show.video_url && (
                <a href={show.video_url} target="_blank" rel="noreferrer" className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl bg-tinta text-sm font-semibold text-white hover:bg-selva-700">
                  <Play className="size-6 fill-white" /> Ver video
                </a>
              )}
            </div>
          )}

          {show.descripcion && (
            <section className="mt-10">
              <h2 className="text-xl font-bold">De qué se trata</h2>
              <p className="mt-3 max-w-[68ch] text-[17px] leading-relaxed whitespace-pre-line text-tinta/85">{show.descripcion}</p>
            </section>
          )}

          {show.requisitos.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xl font-bold">Qué necesitamos en el lugar</h2>
              <ul className="mt-3 space-y-2">
                {show.requisitos.map((r) => (
                  <li key={r} className="flex gap-2.5 text-[17px]">
                    <Check className="mt-1 size-4 shrink-0 text-ok" /> {r}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h1 className="font-bungee text-4xl leading-[1.05] uppercase sm:text-4xl">{show.nombre}</h1>
          <div className="mt-3 flex flex-wrap gap-4 text-tinta-soft">
            <span className="inline-flex items-center gap-1.5"><Clock className="size-4" /> {duracion} min</span>
            <span className="inline-flex items-center gap-1.5"><Users className="size-4" /> {show.artistas} {show.artistas === 1 ? 'artista' : 'artistas'}</span>
          </div>

          {paquetes.length > 0 && (
            <fieldset className="mt-7">
              <legend className="font-semibold">Elige un paquete</legend>
              <div className="mt-3 space-y-2.5">
                {paquetes.map((p) => (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer gap-3 rounded-2xl border-2 p-4 transition-colors ${elegido?.id === p.id ? 'border-selva-600 bg-selva-50/50' : 'border-linea hover:border-tinta-soft/40'}`}
                  >
                    <input type="radio" name="paquete" checked={elegido?.id === p.id} onChange={() => setPaqueteId(p.id)} className="mt-1 accent-selva-600" />
                    <span className="flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold">{p.nombre}</span>
                        <span className="num font-bold">{pesos(p.precio)}</span>
                      </span>
                      {p.incluye.length > 0 && <span className="mt-1 block text-sm text-tinta-soft">{p.incluye.join(', ')}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {show.permite_horas_extra && Number(show.precio_hora_extra) > 0 && (
            <p className="mt-5 text-[15px]"><span className="font-semibold">¿Quieres más tiempo?</span> Puedes agregar tiempo extra al reservar: {pesos(show.precio_hora_extra)} por hora.</p>
          )}
          {show.horario_propio && horario.data?.length > 0 && (
            <p className="mt-5 flex gap-2 text-[15px]">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-selva-700" aria-hidden />
              <span><span className="font-semibold">Se presenta:</span> {textoHorario(horario.data.map((f) => ({ ...f, abre: f.abre.slice(0, 5), cierra: f.cierra.slice(0, 5) })))}.</span>
            </p>
          )}

          <Link
            to={`/reservar?show=${show.slug}${elegido ? `&paquete=${elegido.id}` : ''}`}
            className="mt-6 flex h-13 items-center justify-center rounded-full bg-selva-600 px-4 text-center text-base font-semibold text-white hover:bg-selva-700"
          >
            Reservar por {pesos(precio)}
          </Link>
          {cfg && (
            <p className="mt-3 text-center text-sm text-tinta-soft">
              Apartas con el {Number(cfg.anticipo_porcentaje)} %.{' '}
              <Link to="/paginas/politica-de-cancelacion" className="underline">Política de cancelación</Link>
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}
