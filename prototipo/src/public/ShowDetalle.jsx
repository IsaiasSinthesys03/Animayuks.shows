import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, ChevronLeft, Clock, Play, Users } from 'lucide-react'
import { urlImagen } from '../lib/api'
import { useConfiguracion, useShow } from '../lib/consultas'
import { pesos } from '../lib/format'
import { Cargando, Cartel, ErrorCarga } from '../components/ui'

export default function ShowDetalle() {
  const { slug } = useParams()
  const consulta = useShow(slug)
  const { data: cfg } = useConfiguracion()
  const [paqueteId, setPaqueteId] = useState(null)
  const show = consulta.data

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
