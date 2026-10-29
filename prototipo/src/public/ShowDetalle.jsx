import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, ChevronLeft, Clock, Play, Star, Users } from 'lucide-react'
import { EXTRAS, showPorId } from '../data/mock'
import { pesos } from '../lib/format'
import { Cartel } from '../components/ui'

const resenas = [
  { autor: 'Daniela M.', zona: 'Guadalajara', texto: 'Puntuales, montaron en 20 minutos y los niños quedaron felices. Repetiremos.', estrellas: 5 },
  { autor: 'Jorge E.', zona: 'Guadalajara', texto: 'Muy buen show. Solo faltó que avisaran que necesitaban una mesa extra.', estrellas: 4 },
]

export default function ShowDetalle() {
  const { id } = useParams()
  const show = showPorId(id)
  const [paquete, setPaquete] = useState(show?.paquetes[0].id)

  if (!show) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="text-xl font-semibold">Este show ya no está en cartelera.</p>
        <Link to="/shows" className="mt-4 inline-block font-semibold text-telon-700 underline">Ver la cartelera</Link>
      </div>
    )
  }

  const elegido = show.paquetes.find((p) => p.id === paquete)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <Link to="/shows" className="inline-flex items-center gap-1 text-[15px] font-medium text-tinta-soft hover:text-tinta">
        <ChevronLeft className="size-4" /> Cartelera
      </Link>

      <div className="mt-5 grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
        <div>
          <Cartel show={show} tam="lg" className="aspect-[16/11] rounded-3xl" />
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="flex aspect-square items-center justify-center rounded-2xl bg-butaca text-sm text-tinta-soft">Foto {i + 2}</div>
            ))}
            <button className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl bg-tinta text-sm font-semibold text-white hover:bg-black">
              <Play className="size-6 fill-white" /> Ver video
            </button>
          </div>

          <section className="mt-10">
            <h2 className="text-xl font-bold">De qué se trata</h2>
            <p className="mt-3 max-w-[68ch] text-[17px] leading-relaxed text-tinta/85">{show.descripcion}</p>
          </section>

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

          <section className="mt-10">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Star className="size-5 fill-marquesina text-marquesina" /> <span className="num">{show.calificacion.toFixed(1)}</span>
              <span className="font-normal text-tinta-soft">de {show.resenas} reseñas</span>
            </h2>
            <ul className="mt-4 divide-y divide-linea">
              {resenas.map((r) => (
                <li key={r.autor} className="py-4">
                  <p className="font-semibold">
                    {r.autor} <span className="font-normal text-tinta-soft">de {r.zona}</span>
                  </p>
                  <p className="mt-1 text-tinta/85">{r.texto}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h1 className="font-cartel text-5xl leading-[0.9] font-black uppercase sm:text-6xl">{show.nombre}</h1>
          <div className="mt-3 flex flex-wrap gap-4 text-tinta-soft">
            <span className="inline-flex items-center gap-1.5"><Clock className="size-4" /> {show.duracion} min</span>
            <span className="inline-flex items-center gap-1.5"><Users className="size-4" /> {show.artistas} {show.artistas === 1 ? 'artista' : 'artistas'}</span>
          </div>

          <fieldset className="mt-7">
            <legend className="font-semibold">Elige un paquete</legend>
            <div className="mt-3 space-y-2.5">
              {show.paquetes.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer gap-3 rounded-2xl border-2 p-4 transition-colors ${paquete === p.id ? 'border-telon-600 bg-telon-50/50' : 'border-linea hover:border-tinta-soft/40'}`}
                >
                  <input type="radio" name="paquete" value={p.id} checked={paquete === p.id} onChange={() => setPaquete(p.id)} className="mt-1 accent-telon-600" />
                  <span className="flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{p.nombre}</span>
                      <span className="num font-bold">{pesos(p.precio)}</span>
                    </span>
                    <span className="mt-1 block text-sm text-tinta-soft">{p.incluye.join(', ')}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <p className="mt-5 text-sm text-tinta-soft">
            Extras disponibles al reservar: {EXTRAS.map((e) => e.nombre.toLowerCase()).join(', ')}.
          </p>

          <Link
            to={`/reservar?show=${show.id}&paquete=${paquete}`}
            className="mt-6 flex h-13 items-center justify-center rounded-full bg-telon-600 text-base font-semibold text-white hover:bg-telon-700"
          >
            Reservar {elegido.nombre.toLowerCase()} por {pesos(elegido.precio)}
          </Link>
          <p className="mt-3 text-center text-sm text-tinta-soft">Apartas con el 30 %. Cancelación con reembolso hasta 7 días antes.</p>
        </aside>
      </div>
    </div>
  )
}
