import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { urlLanding } from '../../lib/api'

const AVANCE_MS = 8000
const reducirMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Las clases de cada parte del banner. La vista previa del panel no depende del
// ancho de la ventana: fija la versión de computadora o la de teléfono.
const ESTILOS = {
  sitio: {
    seccion: 'h-[45vh] max-h-[720px] min-h-[320px] sm:min-h-[350px] md:h-[65vh] md:min-h-[520px]',
    tarjeta: 'w-[calc(100%-1rem)] max-w-[1100px] rounded-2xl sm:w-[90%] sm:rounded-[2.5rem] md:w-[75%]',
    personaje: 'right-[-5%] h-[80%] w-[140px] translate-y-[2%] min-[390px]:w-[155px] sm:w-[220px] md:right-[-2%] md:h-[100%] md:w-[250px] md:translate-y-[6%] lg:h-[105%] lg:w-[300px] lg:translate-y-[12%] xl:w-[420px] 2xl:w-[480px]',
    halo: 'right-10 bottom-16 size-[150px] blur-[40px] md:right-20 md:bottom-32 md:size-[400px] md:blur-[100px]',
    contenedor: 'px-3 pt-4 sm:px-8 sm:pt-10 lg:px-12',
    texto: 'max-w-[60%] p-2 sm:max-w-[56%] sm:p-4 md:max-w-[54%] lg:max-w-[56%] lg:p-6',
    etiqueta: 'mb-2 gap-1.5 px-2.5 py-1 text-[10px] sm:mb-4 sm:gap-2 sm:px-4 sm:py-1.5 sm:text-xs',
    punto: 'size-1.5 sm:size-2',
    titulo: 'mb-2 text-lg min-[390px]:text-xl sm:mb-4 sm:text-3xl lg:text-5xl 2xl:text-6xl',
    descripcion: 'mb-3 line-clamp-4 text-[11px] leading-snug sm:mb-6 sm:text-sm sm:leading-relaxed lg:text-base',
    boton: 'gap-1.5 rounded-xl px-3 py-2 text-[11px] sm:gap-2 sm:rounded-2xl sm:px-6 sm:py-3 sm:text-sm lg:px-8 lg:py-4',
    icono: 'size-4 sm:size-5',
  },
  escritorio: {
    seccion: 'size-full',
    tarjeta: 'size-full rounded-[2.5rem]',
    personaje: 'right-[-2%] h-[105%] w-[460px] translate-y-[12%]',
    halo: 'right-20 bottom-32 size-[400px] blur-[100px]',
    contenedor: 'px-12 pt-10',
    texto: 'max-w-[56%] p-6',
    etiqueta: 'mb-4 gap-2 px-4 py-1.5 text-xs',
    punto: 'size-2',
    titulo: 'mb-4 text-5xl',
    descripcion: 'mb-6 line-clamp-4 text-base leading-relaxed',
    boton: 'gap-2 rounded-2xl px-8 py-4 text-sm',
    icono: 'size-5',
  },
  telefono: {
    seccion: 'size-full',
    tarjeta: 'size-full rounded-2xl',
    personaje: 'right-[-5%] h-[80%] w-[140px] translate-y-[2%]',
    halo: 'right-10 bottom-16 size-[150px] blur-[40px]',
    contenedor: 'px-3 pt-4',
    texto: 'max-w-[60%] p-2',
    etiqueta: 'mb-2 gap-1.5 px-2.5 py-1 text-[10px]',
    punto: 'size-1.5',
    titulo: 'mb-2 text-lg',
    descripcion: 'mb-3 line-clamp-4 text-[11px] leading-snug',
    boton: 'gap-1.5 rounded-xl px-3 py-2 text-[11px]',
    icono: 'size-4',
  },
}

function BotonBanner({ banner, e }) {
  if (!banner.enlace || !banner.texto_boton) return null
  const clase = `inline-flex w-fit items-center bg-maiz font-quicksand font-bold text-tinta shadow-lg transition-transform hover:scale-[1.03] active:scale-95 ${e.boton}`
  const contenido = <>{banner.texto_boton} <ChevronRight className={e.icono} aria-hidden /></>
  if (banner.enlace.startsWith('/')) return <Link to={banner.enlace} className={clase}>{contenido}</Link>
  return <a href={banner.enlace} target="_blank" rel="noopener noreferrer" className={clase}>{contenido}</a>
}

function VideoFondo({ src }) {
  return (
    <video
      ref={(el) => {
        if (!el) return
        if (reducirMovimiento()) el.pause()
        else el.play().catch(() => {})
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

/**
 * Carrusel principal. Solo descarga el video del banner visible.
 * `vistaPrevia`: 'escritorio' o 'telefono' para mostrar un solo banner en el panel.
 */
export default function CarruselBanners({ banners, vistaPrevia = null }) {
  const [activo, setActivo] = useState(0)
  const [pausado, setPausado] = useState(false)
  const [encima, setEncima] = useState(false)
  const total = banners.length
  const e = ESTILOS[vistaPrevia ?? 'sitio']

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
      className={`relative flex w-full items-center justify-center overflow-hidden ${e.seccion}`}
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
            className={`absolute flex h-full origin-center items-center overflow-hidden bg-slate-950 shadow-[0_15px_40px_rgba(0,0,0,0.6)] transition-all duration-700 ease-out ${e.tarjeta} ${
              posicion === 0 ? 'z-30 opacity-100' : 'z-20 cursor-pointer opacity-40 hover:opacity-60'
            } ${visible ? '' : 'pointer-events-none opacity-0'}`}
            style={{ transform: transformacion }}
          >
            <div className="absolute inset-0 z-0 overflow-hidden">
              {video && posicion === 0 && <VideoFondo src={video} />}
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
            </div>

            {imagen && (
              <div className={`pointer-events-none absolute bottom-0 z-10 flex items-end justify-end ${e.personaje}`}>
                <div className={`absolute z-0 rounded-full opacity-50 ${e.halo}`} style={{ backgroundColor: b.color }} />
                <img src={imagen} alt="" className="relative z-10 size-full object-contain object-bottom drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)]" />
              </div>
            )}

            <div className={`relative z-20 flex h-full w-full items-center ${e.contenedor}`}>
              <div className={e.texto}>
                {b.etiqueta && (
                  <span className={`inline-flex items-center rounded-full border border-white/10 bg-black/40 font-quicksand font-bold text-white backdrop-blur-md ${e.etiqueta}`}>
                    <span className={`rounded-full ${e.punto}`} style={{ backgroundColor: b.color }} aria-hidden /> {b.etiqueta}
                  </span>
                )}
                <h2 className={`font-bungee leading-[1.1] tracking-tight break-words text-white drop-shadow-xl ${e.titulo}`}>
                  {b.titulo}
                  {b.titulo_resaltado && <span className="block drop-shadow-lg" style={{ color: b.color }}>{b.titulo_resaltado}</span>}
                </h2>
                {b.descripcion && <p className={`font-quicksand font-medium text-slate-100 drop-shadow-md ${e.descripcion}`}>{b.descripcion}</p>}
                <BotonBanner banner={b} e={e} />
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
