import { Link } from 'react-router-dom'
import { useConfiguracion, useShows, useZonas } from '../lib/consultas'
import { pesos } from '../lib/format'
import { Cargando, Cartel, ErrorCarga } from '../components/ui'
import VerificadorCP from '../components/VerificadorCP'

function Marquesina({ children }) {
  // Letrero con foquitos alrededor: el momento de identidad de la página.
  const focos = Array.from({ length: 14 })
  const fila = (pos) => (
    <div className={`absolute inset-x-5 ${pos} flex justify-between`} aria-hidden>
      {focos.map((_, i) => (
        <span key={i} className="foco size-2 rounded-full bg-marquesina shadow-[0_0_10px_2px_rgba(242,183,5,0.55)]" style={{ animationDelay: `${(i % 4) * 0.3}s` }} />
      ))}
    </div>
  )
  return (
    <div className="relative rounded-[28px] border-2 border-marquesina/70 bg-telon-700 px-6 pt-11 pb-10 sm:px-9">
      {fila('top-4')}
      {fila('bottom-4')}
      {children}
    </div>
  )
}

export default function Inicio() {
  const shows = useShows()
  const { data: zonas } = useZonas()
  const { data: cfg } = useConfiguracion()
  const activas = (zonas ?? []).filter((z) => z.activa)
  const cartelera = [...(shows.data ?? [])].sort((a, b) => Number(b.destacado) - Number(a.destacado) || a.orden - b.orden).slice(0, 6)
  const anticipo = cfg ? Number(cfg.anticipo_porcentaje) : 30

  const pasos = [
    { titulo: 'Escribe tu código postal', texto: 'Confirmamos al momento si llegamos a tu colonia y cuánto cuesta el traslado.' },
    { titulo: 'Elige show y fecha', texto: 'Ves los horarios libres al momento y apartamos el tuyo mientras terminas.' },
    { titulo: `Aparta con el ${anticipo} %`, texto: 'Transfiere el anticipo y sube tu comprobante. El resto se paga el día del evento.' },
    { titulo: 'Disfruta la función', texto: 'Te recordamos dos días antes y llegamos con tiempo para montar.' },
  ]

  return (
    <>
      <section className="bg-tinta text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:pt-20 lg:pb-24">
          <div>
            <h1 className="font-cartel text-[3.6rem] leading-[0.86] font-black tracking-[-0.01em] text-balance uppercase sm:text-[5.2rem] lg:text-[6rem]">
              Llevamos el show a tu fiesta
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-white/75">
              Shows en vivo para tu fiesta o evento. Elige el tuyo, revisa la fecha y apártalo desde tu celular.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/shows" className="inline-flex h-12 items-center rounded-full bg-white px-6 font-semibold text-tinta hover:bg-butaca">
                Ver la cartelera
              </Link>
              <Link to="/reservar" className="inline-flex h-12 items-center rounded-full px-6 font-semibold text-white ring-1 ring-white/30 ring-inset hover:bg-white/10">
                Reservar ahora
              </Link>
            </div>
          </div>

          <Marquesina>
            <p className="font-cartel text-[2.4rem] leading-[0.95] font-extrabold uppercase sm:text-5xl">¿Llegamos a tu colonia?</p>
            <p className="mt-2 mb-5 text-white/75">Solo hacemos eventos en nuestras zonas de cobertura. Revísalo antes de elegir.</p>
            <VerificadorCP oscuro />
          </Marquesina>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-cartel text-5xl leading-none font-black uppercase sm:text-6xl">En cartelera</h2>
          <Link to="/shows" className="text-[15px] font-semibold text-telon-700 underline">
            Ver todos los shows
          </Link>
        </div>
        {shows.isLoading && <Cargando />}
        {shows.isError && <ErrorCarga onReintentar={shows.refetch} />}
        {shows.data && (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
            {cartelera.map((s) => (
              <Link key={s.id} to={`/shows/${s.slug}`} className="group block">
                <Cartel show={s} className="aspect-[4/5] rounded-2xl transition-transform duration-300 ease-[var(--ease-salida)] group-hover:-translate-y-1" />
                <p className="mt-3 leading-snug font-semibold">{s.resumen}</p>
                <p className="mt-1 text-sm text-tinta-soft">
                  Desde <span className="num font-semibold text-tinta">{pesos(s.precio_base)}</span>
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="bg-butaca">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="font-cartel text-5xl leading-none font-black uppercase sm:text-6xl">Así de fácil se reserva</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {pasos.map((p, i) => (
              <li key={p.titulo}>
                <span className="num font-cartel text-6xl leading-none font-black text-telon-600">{i + 1}</span>
                <h3 className="mt-3 text-lg font-bold">{p.titulo}</h3>
                <p className="mt-1.5 leading-relaxed text-tinta-soft">{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {activas.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="text-2xl font-bold">Dónde damos servicio</h2>
          <ul className="mt-4 divide-y divide-linea">
            {activas.map((z) => (
              <li key={z.id} className="flex items-center justify-between py-3">
                <span className="flex items-center gap-3 font-medium">
                  <span className="size-3 rounded-full" style={{ background: z.color }} aria-hidden /> {z.nombre}
                </span>
                <span className="num text-sm text-tinta-soft">{Number(z.cargo_traslado) ? `Traslado ${pesos(z.cargo_traslado)}` : 'Sin cargo'}</span>
              </li>
            ))}
          </ul>
          <Link to="/cobertura" className="mt-4 inline-block font-semibold text-telon-700 underline">
            Revisar mi código postal
          </Link>
        </section>
      )}
    </>
  )
}
