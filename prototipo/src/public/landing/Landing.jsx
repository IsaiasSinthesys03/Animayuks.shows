import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Play } from 'lucide-react'
import { useBannersLanding, useConfiguracion, useContenidoLanding, useShows, useVideosLanding } from '../../lib/consultas'
import { pesos } from '../../lib/format'
import { urlImagen } from '../../lib/api'
import { Cargando, Cartel, ErrorCarga } from '../../components/ui'
import VerificadorCP from '../../components/VerificadorCP'
import CarruselBanners from './CarruselBanners'

const claseBoton3D = 'inline-flex items-center justify-center gap-2 rounded-2xl border-[2.5px] border-[#3a2212] bg-selva-600 px-6 py-3.5 font-bungee text-xs tracking-wide text-white uppercase shadow-[0_4px_0_#3a2212,0_6px_10px_rgba(0,0,0,0.4)] transition-all hover:-translate-y-0.5 hover:bg-selva-700 active:translate-y-[3px] active:shadow-[0_1px_0_#3a2212]'

const FONDO_MADERA = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cg fill='none' stroke='black' stroke-width='1.5' stroke-opacity='0.16'%3E%3Cpath d='M10 0 C 15 30, 5 70, 10 110 C 15 130, 25 145, 20 160'/%3E%3Cpath d='M30 0 C 25 40, 35 80, 25 120 C 20 140, 30 150, 35 160'/%3E%3Cpath d='M70 0 C 65 30, 55 50, 55 70 C 55 90, 65 110, 70 160'/%3E%3Cpath d='M90 0 C 95 30, 105 50, 105 70 C 105 90, 95 110, 90 160'/%3E%3Cellipse cx='80' cy='70' rx='10' ry='18' stroke-width='1'/%3E%3Cellipse cx='80' cy='70' rx='18' ry='30' stroke-width='1.2'/%3E%3Cellipse cx='80' cy='70' rx='28' ry='45' stroke-width='1.5'/%3E%3Cpath d='M130 0 C 125 45, 140 85, 135 125 C 130 140, 135 150, 130 160'/%3E%3Cpath d='M150 0 C 155 35, 145 75, 150 115 C 155 135, 145 150, 150 160'/%3E%3C/g%3E%3C/svg%3E")`

const PERSONAJES = [
  { clave: 'fango', nombre: 'Fango', detalle: 'Fango, flamenco de 13 años. Elemento fuego, habilidad plumas de luz. Nació en Celestún, Yucatán; fue abandonado y rescatado por la mamá de Lolita. Creció con las tortugas y no sabe volar.' },
  { clave: 'lolita', nombre: 'Lolita', detalle: 'Lolita, tortuga marina de 13 años. Elemento agua, habilidad burbujas impenetrables. Nació en Quintana Roo; su madre migró con ella a Celestún para protegerla.' },
  { clave: 'mila', nombre: 'Mila', detalle: 'Mila, jaguar de 13 años. Elemento aire, habilidad velocidad extrema. Cachorra mayor de una familia de felinos; siempre busca ser la mejor.' },
]

const Cuerda = ({ lado }) => (
  <span aria-hidden className={`absolute -top-14 ${lado} z-0 h-[4.5rem] w-2 rounded-full border border-[#251206] bg-[repeating-linear-gradient(-35deg,#d4ad82_0_4px,#8c6239_4px_8px)]`} />
)

const Clavo = ({ pos }) => (
  <span aria-hidden className={`absolute ${pos} size-3.5 rounded-full border border-[#150800] bg-gradient-to-tr from-[#7a4a00] via-maiz to-[#fff4cc]`} />
)

/** El verificador es un letrero de madera que cuelga del carrusel */
function Letrero({ contenido }) {
  return (
    <div className="relative mx-auto mt-14 max-w-4xl px-4 sm:px-6">
      <Cuerda lado="left-[18%]" />
      <Cuerda lado="right-[18%]" />
      <div className="relative z-10 rounded-[22px_30px_24px_28px] border-4 border-[#251206] bg-[#3a2212] px-6 py-8 shadow-[0_7px_0_#251206,0_18px_30px_rgba(0,0,0,0.5)] sm:px-10 md:grid md:grid-cols-[1fr_1.15fr] md:items-center md:gap-8" style={{ backgroundImage: FONDO_MADERA }}>
        <span aria-hidden className="pointer-events-none absolute inset-2 rounded-[16px_24px_18px_22px] border border-[#d4ad82]/35" />
        <Clavo pos="top-3.5 left-3.5" />
        <Clavo pos="top-3.5 right-3.5" />
        <Clavo pos="bottom-3.5 left-3.5" />
        <Clavo pos="right-3.5 bottom-3.5" />
        <div className="relative">
          <p className="font-bungee text-2xl leading-tight text-maiz sm:text-3xl">{contenido.cobertura_titulo}</p>
          {contenido.cobertura_descripcion && <p className="mt-2 font-semibold text-[#f6e7cb]">{contenido.cobertura_descripcion}</p>}
        </div>
        <div className="relative mt-5 md:mt-0"><VerificadorCP oscuro /></div>
      </div>
    </div>
  )
}

const FORMAS_PIEDRA = ['rounded-[34px_22px_38px_20px]', 'rounded-[22px_38px_20px_34px]', 'rounded-[38px_20px_30px_26px]', 'rounded-[20px_32px_24px_40px]']

/** Los pasos son piedras sobre un sendero que atraviesa la selva */
function Sendero({ contenido, anticipo }) {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-4 pt-16 pb-10 sm:px-6 lg:pt-20">
      <h2 className="font-bungee text-3xl leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] md:text-4xl">{contenido.pasos_titulo}</h2>
      <div className="relative mt-14">
        <svg aria-hidden viewBox="0 0 1000 120" preserveAspectRatio="none" fill="none" className="pointer-events-none absolute inset-x-0 -top-3 hidden h-28 w-full lg:block">
          <path d="M70 10 C 190 10 210 100 365 100 S 520 10 640 10 S 800 100 910 100" stroke="#e9b83f" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 14" vectorEffect="non-scaling-stroke" />
        </svg>
        <span aria-hidden className="absolute top-4 bottom-10 left-[1.65rem] border-l-4 border-dotted border-maiz sm:hidden" />
        <ol className="relative grid gap-y-12 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-4">
          {contenido.pasos.map((p, i) => (
            <li key={i} className={`relative border-[3px] border-[#3a2212] bg-gradient-to-b from-[#ecd3ae] to-[#d4ad82] px-5 pt-10 pb-6 shadow-[0_5px_0_#3a2212,0_12px_22px_rgba(0,0,0,0.4)] ${FORMAS_PIEDRA[i % 4]} ${i % 2 ? 'lg:mt-20' : ''}`}>
              <span className="absolute -top-7 left-1 flex size-14 items-center justify-center rounded-full border-[3px] border-[#3a2212] bg-maiz font-bungee text-2xl text-[#3a2212] shadow-[0_3px_0_#3a2212] sm:left-4">{i + 1}</span>
              <h3 className="text-lg leading-snug font-bold text-[#251206]">{p.titulo.replaceAll('{anticipo}', anticipo)}</h3>
              <p className="mt-1.5 leading-relaxed font-semibold text-[#3a2212]">{p.texto.replaceAll('{anticipo}', anticipo)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Portada({ contenido }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 text-center text-white sm:px-6 sm:py-24">
      <h1 className="font-bungee text-4xl leading-[1.05] drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)] sm:text-6xl">
        {contenido.portada_titulo}
        {contenido.portada_resaltado && <span className="block text-maiz">{contenido.portada_resaltado}</span>}
      </h1>
      {contenido.portada_descripcion && <p className="mx-auto mt-5 max-w-2xl text-lg font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{contenido.portada_descripcion}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/shows" className="inline-flex h-12 items-center rounded-full bg-white px-6 font-bold text-tinta">Ver la cartelera</Link>
        <Link to="/reservar" className="inline-flex h-12 items-center rounded-full bg-maiz px-6 font-bold text-tinta">Reservar ahora</Link>
      </div>
    </section>
  )
}

function TarjetaShow({ show, indice }) {
  const par = indice % 2 === 0
  const ventana = par ? { top: '12%', right: '10%', bottom: '25.5%', left: '12%' } : { top: '13%', right: '8%', bottom: '25%', left: '10%' }
  const imagen = urlImagen(show.imagen_principal)
  const contorno = { textShadow: '1.5px 1.5px 0 #fff, -1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 0 2px 4px rgba(255,255,255,0.7)' }
  return (
    <Link to={`/shows/${show.slug}`} aria-label={show.nombre} className="group relative block w-full overflow-hidden drop-shadow-xl transition-all duration-300 hover:scale-[1.03] hover:drop-shadow-2xl" style={{ aspectRatio: '3 / 4.35' }}>
      <div className="absolute z-0 overflow-hidden bg-white" style={ventana}>
        {imagen ? <img src={imagen} alt="" loading="lazy" className="size-full object-cover" /> : <Cartel show={show} tam="sm" className="size-full" />}
      </div>
      <img src={`/landing/marco-${par ? 1 : 2}.webp`} alt="" className="pointer-events-none absolute inset-0 z-10 size-full" />
      <div className="absolute inset-x-[12%] bottom-[9%] z-20 flex items-center justify-between gap-1 font-quicksand">
        <div className="min-w-0 flex-1" style={contorno}>
          <h3 className="line-clamp-2 text-[11px] leading-tight font-extrabold text-tinta md:text-sm">{show.nombre}</h3>
          <p className="num mt-0.5 text-xs leading-none font-black text-tinta md:text-base">{pesos(show.precio_base)}</p>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#3a2212] bg-maiz shadow-[0_2px_0_#3a2212] md:size-11" aria-hidden>
          <ChevronRight className="size-4 text-[#3a2212] md:size-5" />
        </span>
      </div>
    </Link>
  )
}

function ShowsDestacados({ contenido }) {
  const shows = useShows()
  const lista = (shows.data ?? [])
    .filter((s) => s.activo)
    .sort((a, b) => Number(b.destacado) - Number(a.destacado) || a.orden - b.orden)
    .slice(0, 4)
  if (shows.data && lista.length === 0) return null
  return (
    <section className="relative overflow-hidden py-8 sm:py-12">
      <img src="/landing/hojas.webp" alt="" className="pointer-events-none absolute -top-2 left-0 z-10 hidden w-full max-w-[1020px] -scale-x-100 lg:block" />
      <div className="relative z-20 mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="mb-8 flex flex-col gap-5 min-[390px]:flex-row min-[390px]:items-end min-[390px]:justify-between sm:mb-12">
          <div>
            <h2 className="font-bungee text-3xl leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] md:text-4xl">
              {contenido.shows_titulo} <span className="text-maiz">{contenido.shows_resaltado}</span>
            </h2>
            {contenido.shows_subtitulo && <p className="mt-2 font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">{contenido.shows_subtitulo}</p>}
          </div>
          {contenido.shows_boton && <Link to="/shows" className={claseBoton3D}>{contenido.shows_boton} <ChevronRight className="size-4" aria-hidden /></Link>}
        </div>
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:gap-5 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-8 lg:overflow-visible lg:px-0 lg:pb-0">
          {lista.map((s, i) => (
            <div key={s.id} className="w-[150px] shrink-0 snap-start sm:w-[200px] lg:w-auto"><TarjetaShow show={s} indice={i} /></div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-[#3a2212] via-[#3a2212]/80 to-transparent" />
    </section>
  )
}

function TarjetaGiratoria({ personaje, oculta = false }) {
  const [girada, setGirada] = useState(false)
  const puedeHover = () => window.matchMedia('(hover: hover)').matches
  return (
    <button
      type="button"
      tabIndex={oculta ? -1 : 0}
      aria-hidden={oculta || undefined}
      aria-pressed={girada}
      aria-label={`${personaje.nombre}. ${personaje.detalle}`}
      onClick={() => setGirada(!girada)}
      onMouseEnter={() => puedeHover() && setGirada(true)}
      onMouseLeave={() => puedeHover() && setGirada(false)}
      className="relative block aspect-[621/801] w-full cursor-pointer [perspective:1000px]"
    >
      <span className={`absolute inset-0 block size-full rounded-3xl shadow-xl transition-transform duration-700 [transform-style:preserve-3d] ${girada ? '[transform:rotateY(180deg)]' : ''}`}>
        <img src={`/landing/${personaje.clave}-frente.webp`} alt="" loading="lazy" className="absolute inset-0 size-full rounded-3xl [backface-visibility:hidden]" />
        <img src={`/landing/${personaje.clave}-atras.webp`} alt="" loading="lazy" className="absolute inset-0 size-full rounded-3xl [backface-visibility:hidden] [transform:rotateY(180deg)]" />
      </span>
    </button>
  )
}

function TarjetaVideo({ video, oculta }) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${video.youtube_id}`}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={oculta ? -1 : 0}
      aria-hidden={oculta || undefined}
      aria-label={`Ver en YouTube: ${video.titulo}`}
      className="group relative flex aspect-video w-48 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#150800] sm:w-60 xl:w-72"
    >
      <img src={`https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`} alt="" className="absolute inset-0 size-full object-cover opacity-80 transition-all duration-500 group-hover:scale-105 group-hover:opacity-55" />
      <span className="relative z-10 flex size-11 items-center justify-center rounded-full border-2 border-[#251206] bg-maiz transition-transform group-hover:scale-110 xl:size-12"><Play className="ml-0.5 size-5 text-[#251206]" aria-hidden /></span>
      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-3 pt-6 pb-2 text-left text-sm font-bold text-white">{video.titulo}</span>
    </a>
  )
}

const Perforaciones = () => (
  <div aria-hidden className="h-3.5 rounded-sm bg-[repeating-linear-gradient(90deg,#251206_0_16px,transparent_16px_34px)]" />
)

/** Tira de película tallada en madera. La lista se repite hasta llenar el marco y que el giro no deje huecos. */
function CintaVideos({ videos }) {
  const tanda = []
  while (tanda.length < 6) tanda.push(...videos)
  return (
    <div className="relative rounded-[20px_26px_18px_24px] border-4 border-[#251206] bg-gradient-to-b from-[#c69a6b] to-[#a87a4d] px-4 py-3 shadow-[0_7px_0_#251206,0_18px_30px_rgba(0,0,0,0.5)] sm:px-6">
      <Perforaciones />
      <div className="cinta-marco my-2.5 overflow-hidden rounded-md border-[3px] border-[#251206] bg-[#150800] p-2 sm:p-2.5">
        <div className="cinta-mov flex gap-2 sm:gap-2.5" style={{ animationDuration: `${tanda.length * 7}s` }}>
          {tanda.map((v, i) => <TarjetaVideo key={`a-${i}`} video={v} oculta={i >= videos.length} />)}
          {tanda.map((v, i) => <TarjetaVideo key={`b-${i}`} video={v} oculta />)}
        </div>
      </div>
      <Perforaciones />
    </div>
  )
}

function Experiencia({ contenido, videos }) {
  return (
    <div className="relative z-30 mx-auto mt-8 w-full max-w-6xl px-4 pb-14 sm:px-6 lg:pb-20">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <div className="space-y-4 text-center lg:text-left">
          <h2 className="font-bungee text-2xl leading-[1.2] tracking-tight text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)] sm:text-3xl">
            {contenido.videos_titulo} <span className="block text-maiz">{contenido.videos_resaltado}</span>
          </h2>
          {contenido.videos_descripcion && <p className="mx-auto max-w-xl text-sm leading-relaxed font-semibold text-white sm:text-base lg:mx-0">{contenido.videos_descripcion}</p>}
          {contenido.videos_boton && <Link to="/reservar" className={claseBoton3D}>{contenido.videos_boton} <Play className="size-4" aria-hidden /></Link>}
        </div>
        {videos.length > 0 && <CintaVideos videos={videos} />}
      </div>
    </div>
  )
}

function Personajes({ contenido, videos }) {
  return (
    <section className="relative overflow-hidden bg-[#3a2212] pt-16 pb-4 sm:pt-24">
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: FONDO_MADERA }} />
      <div className="relative z-10 mx-auto max-w-6xl px-6 lg:px-12">
        <div className="mb-10 text-center sm:mb-16">
          <h2 className="font-bungee text-3xl leading-tight text-white md:text-4xl">
            {contenido.personajes_titulo} <span className="text-maiz">{contenido.personajes_resaltado}</span>
          </h2>
          {contenido.personajes_subtitulo && <p className="mt-2 font-bold text-white">{contenido.personajes_subtitulo}</p>}
        </div>
        <div className="-mx-6 overflow-hidden px-6 pb-8 md:mx-0 md:overflow-visible md:px-0">
          <div className="personajes-mov flex w-max gap-6 md:grid md:w-auto md:grid-cols-3 md:gap-8">
            {PERSONAJES.map((p) => <div key={p.clave} className="w-[260px] shrink-0 drop-shadow-2xl sm:w-[300px] md:w-auto"><TarjetaGiratoria personaje={p} /></div>)}
            {PERSONAJES.map((p) => <div key={`copia-${p.clave}`} className="w-[260px] shrink-0 drop-shadow-2xl sm:w-[300px] md:hidden"><TarjetaGiratoria personaje={p} oculta /></div>)}
          </div>
        </div>
      </div>
      <Experiencia contenido={contenido} videos={videos} />
    </section>
  )
}

export default function Landing() {
  const contenido = useContenidoLanding()
  const { data: banners = [] } = useBannersLanding()
  const { data: videos = [] } = useVideosLanding()
  const { data: cfg } = useConfiguracion()
  const anticipo = cfg ? Number(cfg.anticipo_porcentaje) : 30

  if (contenido.isLoading) return <Cargando className="min-h-[60vh]" />
  if (contenido.isError) return <ErrorCarga onReintentar={contenido.refetch} />
  const c = contenido.data

  return (
    <div className="font-quicksand">
      <h1 className="sr-only">Animayuks, shows en vivo para tu fiesta</h1>
      <div className="relative w-full bg-[#2b5a2e] bg-cover bg-top" style={{ backgroundImage: "url('/landing/fondo.webp')" }}>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0a2e0d]/50 via-[#0a2e0d]/45 to-[#3a2212]/85" />
        <div className="relative z-10 pt-6 sm:pt-10">
          <div className="relative z-20">{banners.length > 0 ? <CarruselBanners banners={banners} /> : <Portada contenido={c} />}</div>
          <Letrero contenido={c} />
          <Sendero contenido={c} anticipo={anticipo} />
          <ShowsDestacados contenido={c} />
        </div>
      </div>

      <Personajes contenido={c} videos={videos} />
    </div>
  )
}
