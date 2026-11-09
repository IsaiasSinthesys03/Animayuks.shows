import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { urlLanding } from '../../lib/api'

const AVANCE_MS = 8000
const reducirMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function BotonBanner({ banner }) {
  if (!banner.enlace || !banner.texto_boton) return null
  const clase = 'inline-flex w-fit items-center gap-1.5 rounded-xl bg-maiz px-3 py-2 font-quicksand text-[11px] font-bold text-tinta shadow-lg transition-transform hover:scale-[1.03] active:scale-95 sm:gap-2 sm:rounded-2xl sm:px-8 sm:py-4 sm:text-sm'
  const contenido = <>{banner.texto_boton} <ChevronRight className="size-4 sm:size-5" aria-hidden /></>
  if (banner.enlace.startsWith('/')) return <Link to={banner.enlace} className={clase}>{contenido}</Link>
  return <a href={banner.enlace} target="_blank" rel="noopener noreferrer" className={clase}>{contenido}</a>
}

function VideoFondo({ src, activo }) {
  return (
    <video
      ref={(el) => {
        if (!el) return
        if (activo && !reducirMovimiento()) el.play().catch(() => {})
        else el.pause()
      }}
      src={src}
      loop
      muted
      playsInline
      preload="metadata"
      aria-hidden
      className="absolute inset-0 size-full object-cover opacity-85"
    />
  )
}

/** Carrusel principal. Solo descarga el video del banner visible. */
export default function CarruselBanners({ banners, vistaPrevia = false }) {
  const [activo, setActivo] = useState(0)
  const [pausado, setPausado] = useState(false)
  const [encima, setEncima] = useState(false)
  const total = banners.length

  useEffect(() => {
    if (activo >= total) setActivo(0)
  }, [activo, total])

  useEffect(() => {
    if (vistaPrevia || total <= 1 || pausado || encima || reducirMovimiento()) return undefined
    const intervalo = setInterval(() => setActivo((a) => (a + 1) % total), AVANCE_MS)
    return () => clearInterval(intervalo)
  }, [vistaPrevia, total, pausado, encima])

  if (total === 0) return null

  const anterior = () => setActivo((a) => (a - 1 + total) % total)
  const siguiente = () => setActivo((a) => (a + 1) % total)

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Promociones"
      onMouseEnter={() => setEncima(true)}
      onMouseLeave={() => setEncima(false)}
      onFocus={() => setEncima(true)}
      onBlur={() => setEncima(false)}
      className={`relative flex w-full items-center justify-center overflow-hidden ${vistaPrevia ? 'h-72' : 'h-[45vh] max-h-[720px] min-h-[300px] sm:min-h-[350px] md:h-[65vh] md:min-h-[520px]'}`}
    >
      {banners.map((b, i) => {
        let posicion = 2 // 0: actual, -1: anterior, 1: siguiente, 2: oculto
        if (i === activo) posicion = 0
        else if (total > 1 && i === (activo - 1 + total) % total) posicion = -1
        else if (total > 2 && i === (activo + 1) % total) posicion = 1
        const visible = posicion !== 2
        const imagen = b.imagen_local ?? urlLanding(b.imagen_ruta)
        const video = b.video_local ?? b.video_url
        const transformacion = posicion === 0 ? 'translateX(0) scale(1)' : posicion === -1 ? 'translateX(-28%) scale(0.85)' : 'translateX(28%) scale(0.85)'

        return (
          <div
            key={b.id ?? i}
            aria-hidden={posicion !== 0}
            onClick={() => {
              if (posicion === -1) anterior()
              if (posicion === 1) siguiente()
            }}
            className={`absolute flex h-full w-[calc(100%-1rem)] max-w-[1100px] origin-center items-center overflow-hidden rounded-2xl bg-slate-950 shadow-[0_15px_40px_rgba(0,0,0,0.6)] transition-all duration-700 ease-out sm:w-[90%] sm:rounded-[2.5rem] md:w-[75%] ${
              posicion === 0 ? 'z-30 opacity-100' : 'z-20 cursor-pointer opacity-40 hover:opacity-60'
            } ${visible ? '' : 'pointer-events-none opacity-0'}`}
            style={{ transform: transformacion }}
          >
            <div className="absolute inset-0 z-0 overflow-hidden">
              {video && posicion === 0 && <VideoFondo src={video} activo={!vistaPrevia || posicion === 0} />}
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
            </div>

            {imagen && (
              <div className="pointer-events-none absolute right-[-5%] bottom-0 z-30 flex h-[80%] w-[150px] translate-y-[2%] items-end justify-end min-[390px]:w-[170px] sm:w-[250px] md:right-[-2%] md:h-[105%] md:w-[380px] md:translate-y-[12%] 2xl:w-[440px]">
                <div className="absolute right-10 bottom-16 z-0 size-[150px] rounded-full opacity-50 blur-[40px] md:right-20 md:bottom-32 md:size-[400px] md:blur-[100px]" style={{ backgroundColor: b.color }} />
                <img src={imagen} alt="" className="relative z-10 size-full object-contain object-bottom drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)]" />
              </div>
            )}

            <div className="relative z-20 mx-auto flex h-full w-full items-center px-4 pt-4 sm:px-8 sm:pt-10 lg:px-16">
              <div className="max-w-[70%] p-2 sm:max-w-2xl sm:p-6 md:p-8 xl:max-w-[58%]">
                {b.etiqueta && (
                  <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 font-quicksand text-[10px] font-bold text-white backdrop-blur-md sm:mb-4 sm:gap-2 sm:px-4 sm:py-1.5 sm:text-xs">
                    <span className="size-1.5 rounded-full sm:size-2" style={{ backgroundColor: b.color }} aria-hidden /> {b.etiqueta}
                  </span>
                )}
                <h2 className={`mb-2 font-bungee leading-[1.1] tracking-tight break-words text-white drop-shadow-xl sm:mb-5 ${vistaPrevia ? 'text-2xl' : 'text-lg min-[390px]:text-xl sm:text-4xl lg:text-5xl 2xl:text-6xl'}`}>
                  {b.titulo}
                  {b.titulo_resaltado && <span className="block drop-shadow-lg" style={{ color: b.color }}>{b.titulo_resaltado}</span>}
                </h2>
                {b.descripcion && <p className="mb-3 pr-4 font-quicksand text-[11px] leading-snug font-medium text-slate-100 drop-shadow-md sm:mb-8 sm:pr-0 sm:text-base sm:leading-relaxed">{b.descripcion}</p>}
                <BotonBanner banner={b} />
              </div>
            </div>
          </div>
        )
      })}

      {!vistaPrevia && total > 1 && (
        <>
          <button type="button" onClick={anterior} aria-label="Banner anterior" className="absolute top-1/2 left-4 z-40 hidden -translate-y-1/2 rounded-full border border-white/20 bg-black/40 p-3.5 text-white backdrop-blur-md transition-transform hover:scale-110 hover:bg-black/60 md:flex lg:left-8">
            <ChevronLeft className="size-6" />
          </button>
          <button type="button" onClick={siguiente} aria-label="Banner siguiente" className="absolute top-1/2 right-4 z-40 hidden -translate-y-1/2 rounded-full border border-white/20 bg-black/40 p-3.5 text-white backdrop-blur-md transition-transform hover:scale-110 hover:bg-black/60 md:flex lg:right-8">
            <ChevronRight className="size-6" />
          </button>
          <div className="absolute right-3 bottom-1 z-[60] flex items-center rounded-full bg-black/40 px-1 backdrop-blur-md sm:bottom-3 md:right-[14%]">
            <button type="button" onClick={() => setPausado(!pausado)} aria-label={pausado ? 'Reanudar carrusel' : 'Pausar carrusel'} className="flex size-11 items-center justify-center text-white">
              {pausado ? <Play className="size-4" /> : <Pause className="size-4" />}
            </button>
            {banners.map((b, i) => (
              <button key={b.id ?? i} type="button" onClick={() => setActivo(i)} aria-label={`Ir al banner ${i + 1}`} aria-current={i === activo} className="flex size-8 items-center justify-center sm:size-11">
                <span className={`block h-2.5 rounded-full transition-all duration-300 ${i === activo ? 'w-8 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'w-2.5 bg-white/50 hover:bg-white/80'}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
