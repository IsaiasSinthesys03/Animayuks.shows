import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { mensajeError, urlLanding } from '../lib/api'
import {
  borrarArchivoLanding, borrarBanner, borrarVideoBanner, borrarVideoLanding, guardarBanner, guardarContenidoLanding,
  guardarVideoLanding, obtenerBannersAdmin, obtenerVideosAdmin, reordenarBanners, reordenarVideos, subirImagenBanner, subirVideoBanner,
} from '../lib/apiAdmin'
import { useContenidoLanding } from '../lib/consultas'
import { useStore } from '../store'
import { Boton, Campo, Cargando, ErrorCarga, Input, Panel, claseInput } from '../components/ui'
import { Encabezado, Interruptor } from './AdminLayout'
import CarruselBanners from '../public/landing/CarruselBanners'

const MAX_VIDEO_MB = 50
const SUGERIDO_VIDEO_MB = 8
const COLORES = ['#e9b83f', '#75b9a0', '#ffffff', '#f472b6', '#38bdf8', '#fb923c']

function useRefrescar() {
  const queryClient = useQueryClient()
  return () => Promise.all(['landing-banners', 'landing-videos', 'landing-contenido', 'admin-banners', 'admin-videos'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
}

const AreaTexto = (props) => <textarea rows={3} className={`${claseInput} h-auto py-3`} {...props} />
const Alerta = ({ children }) => (children ? <p role="alert" className="rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{children}</p> : null)

const mover = (lista, indice, delta) => {
  const copia = [...lista]
  const [x] = copia.splice(indice, 1)
  copia.splice(indice + delta, 0, x)
  return copia.map((f) => f.id)
}

function Mover({ indice, total, onMover, nombre }) {
  const clase = 'rounded-full p-2 text-tinta-soft hover:bg-butaca disabled:opacity-30'
  return (
    <span className="flex">
      <button type="button" disabled={indice === 0} onClick={() => onMover(indice, -1)} aria-label={`Subir ${nombre}`} className={clase}><ArrowUp className="size-4" /></button>
      <button type="button" disabled={indice === total - 1} onClick={() => onMover(indice, 1)} aria-label={`Bajar ${nombre}`} className={clase}><ArrowDown className="size-4" /></button>
    </span>
  )
}

// ── Textos ──────────────────────────────────────────────────────────────────
const SECCIONES = [
  { titulo: 'Portada', ayuda: 'Se muestra solo si no hay banners activos.', campos: [['portada_titulo', 'Título', true], ['portada_resaltado', 'Texto resaltado'], ['portada_descripcion', 'Descripción', false, true]] },
  { titulo: 'Verificador de cobertura', campos: [['cobertura_titulo', 'Título', true], ['cobertura_descripcion', 'Descripción', false, true]] },
  { titulo: 'Shows destacados', campos: [['shows_titulo', 'Título', true], ['shows_resaltado', 'Texto resaltado'], ['shows_subtitulo', 'Subtítulo'], ['shows_boton', 'Botón']] },
  { titulo: 'Personajes', campos: [['personajes_titulo', 'Título', true], ['personajes_resaltado', 'Texto resaltado'], ['personajes_subtitulo', 'Subtítulo']] },
  { titulo: 'Videos', campos: [['videos_titulo', 'Título', true], ['videos_resaltado', 'Texto resaltado'], ['videos_descripcion', 'Descripción', false, true], ['videos_boton', 'Botón']] },
]

function Textos() {
  const contenido = useContenidoLanding()
  const refrescar = useRefrescar()
  const { avisar } = useStore()
  const [f, setF] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (contenido.data && !f) setF(contenido.data)
  }, [contenido.data, f])

  if (contenido.isLoading || (contenido.data && !f)) return <Cargando />
  if (contenido.isError) return <ErrorCarga onReintentar={contenido.refetch} />

  const obligatorios = SECCIONES.flatMap((s) => s.campos.filter((c) => c[2]).map((c) => c[0])).concat('pasos_titulo')
  const cambiarPaso = (i, campo, valor) => setF({ ...f, pasos: f.pasos.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)) })

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (obligatorios.some((k) => !f[k]?.trim()) || f.pasos.some((p) => !p.titulo.trim() || !p.texto.trim())) return setError('Los títulos y los cuatro pasos son obligatorios.')
    setGuardando(true)
    try {
      await guardarContenidoLanding(f)
      await refrescar()
      avisar('Textos guardados')
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="max-w-3xl space-y-5" noValidate>
      {SECCIONES.map((s) => (
        <fieldset key={s.titulo} className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-linea">
          <legend className="float-left mb-1 w-full font-bold">{s.titulo}</legend>
          {s.ayuda && <p className="clear-both text-sm text-tinta-soft">{s.ayuda}</p>}
          <div className="clear-both space-y-3">
            {s.campos.map(([k, etiqueta, , area]) => (
              <Campo key={k} etiqueta={etiqueta}>
                {area ? <AreaTexto value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /> : <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
              </Campo>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-linea">
        <legend className="float-left mb-1 w-full font-bold">Así se reserva</legend>
        <p className="clear-both text-sm text-tinta-soft">Escribe {'{anticipo}'} donde deba aparecer el porcentaje de anticipo configurado.</p>
        <Campo etiqueta="Título" className="clear-both"><Input value={f.pasos_titulo} onChange={(e) => setF({ ...f, pasos_titulo: e.target.value })} /></Campo>
        {f.pasos.map((p, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <Campo etiqueta={`Paso ${i + 1}`}><Input value={p.titulo} onChange={(e) => cambiarPaso(i, 'titulo', e.target.value)} /></Campo>
            <Campo etiqueta="Detalle"><Input value={p.texto} onChange={(e) => cambiarPaso(i, 'texto', e.target.value)} /></Campo>
          </div>
        ))}
      </fieldset>
      <Alerta>{error}</Alerta>
      <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar textos'}</Boton>
    </form>
  )
}

// ── Banners ─────────────────────────────────────────────────────────────────
const aFechaLocal = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

/** Revisa los primeros bytes: un archivo renombrado no pasa como video */
async function esVideoReal(archivo) {
  const b = new Uint8Array(await archivo.slice(0, 12).arrayBuffer())
  const webm = b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3
  const mp4 = String.fromCharCode(b[4], b[5], b[6], b[7]) === 'ftyp'
  return archivo.type === 'video/webm' ? webm : archivo.type === 'video/mp4' && mp4
}

const LIENZOS = { escritorio: { ancho: 1100, alto: 520 }, telefono: { ancho: 359, alto: 365 } }

/** Dibuja el banner a su tamaño real y lo reduce para que quepa, así se ve igual que en el sitio */
function VistaPrevia({ banner }) {
  const [modo, setModo] = useState('escritorio')
  const [disponible, setDisponible] = useState(0)
  const caja = useRef(null)

  useEffect(() => {
    const observador = new ResizeObserver(([e]) => setDisponible(e.contentRect.width))
    observador.observe(caja.current)
    return () => observador.disconnect()
  }, [])

  const { ancho, alto } = LIENZOS[modo]
  const escala = disponible ? Math.min(1, disponible / ancho) : 0

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Vista previa</span>
        <div role="group" aria-label="Tamaño de la vista previa" className="inline-flex rounded-lg bg-butaca p-0.5">
          {[['escritorio', 'Computadora'], ['telefono', 'Teléfono']].map(([id, texto]) => (
            <button key={id} type="button" aria-pressed={modo === id} onClick={() => setModo(id)} className={`h-8 rounded-md px-3 text-sm font-semibold ${modo === id ? 'bg-white shadow-sm' : 'text-tinta-soft'}`}>{texto}</button>
          ))}
        </div>
      </div>
      <div ref={caja} className="flex justify-center rounded-2xl bg-selva-900 p-2">
        <div className="relative overflow-hidden" style={{ width: ancho * escala, height: alto * escala }}>
          <div className="absolute top-0 left-0 origin-top-left font-quicksand" style={{ width: ancho, height: alto, transform: `scale(${escala})` }}>
            <CarruselBanners banners={[banner]} vistaPrevia={modo} />
          </div>
        </div>
      </div>
    </div>
  )
}

function EditorBanner({ banner, siguienteOrden, onCerrar }) {
  const refrescar = useRefrescar()
  const { avisar } = useStore()
  const [f, setF] = useState({
    titulo: banner?.titulo ?? '', titulo_resaltado: banner?.titulo_resaltado ?? '', etiqueta: banner?.etiqueta ?? '', descripcion: banner?.descripcion ?? '',
    color: banner?.color ?? COLORES[0], texto_boton: banner?.texto_boton ?? 'Ver shows', enlace: banner?.enlace ?? '/shows',
    inicia_en: aFechaLocal(banner?.inicia_en), termina_en: aFechaLocal(banner?.termina_en),
  })
  const [video, setVideo] = useState({ url: banner?.video_url ?? null, archivo: null, local: null })
  const [imagen, setImagen] = useState({ ruta: banner?.imagen_ruta ?? null, archivo: null, local: null })
  const [progreso, setProgreso] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const locales = useRef([])
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  useEffect(() => () => locales.current.forEach((u) => URL.revokeObjectURL(u)), [])
  const urlLocal = (archivo) => {
    const u = URL.createObjectURL(archivo)
    locales.current.push(u)
    return u
  }

  const elegirVideo = async (archivo) => {
    setError('')
    if (archivo.size > MAX_VIDEO_MB * 1024 * 1024) return setError(`El video debe pesar menos de ${MAX_VIDEO_MB} MB.`)
    if (!(await esVideoReal(archivo))) return setError('Solo se aceptan videos MP4 o WebM.')
    setVideo({ url: null, archivo, local: urlLocal(archivo) })
  }
  const elegirImagen = (archivo) => {
    setError('')
    if (!['image/png', 'image/webp', 'image/jpeg'].includes(archivo.type)) return setError('La imagen debe ser PNG, WebP o JPG.')
    if (archivo.size > 10 * 1024 * 1024) return setError('La imagen debe pesar menos de 10 MB.')
    setImagen({ ruta: null, archivo, local: urlLocal(archivo) })
  }

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    const enlace = f.enlace.trim()
    if (!f.titulo.trim()) return setError('Escribe el título del banner.')
    if (enlace && !/^\/([^/\\]|$)/.test(enlace) && !/^https:\/\/\S+$/.test(enlace)) return setError('El enlace debe ser una ruta como /shows o empezar con https://.')
    if (f.inicia_en && f.termina_en && f.termina_en <= f.inicia_en) return setError('La fecha final debe ser posterior a la inicial.')
    setGuardando(true)
    let videoNuevo = null
    let imagenNueva = null
    try {
      if (video.archivo) {
        setProgreso(0)
        videoNuevo = await subirVideoBanner(video.archivo, setProgreso)
      }
      if (imagen.archivo) imagenNueva = await subirImagenBanner(imagen.archivo)
      await guardarBanner(banner?.id, {
        titulo: f.titulo.trim(), titulo_resaltado: f.titulo_resaltado.trim() || null, etiqueta: f.etiqueta.trim() || null, descripcion: f.descripcion.trim() || null,
        color: f.color, texto_boton: f.texto_boton.trim() || null, enlace: enlace || null,
        video_url: videoNuevo ?? video.url, imagen_ruta: imagenNueva ?? imagen.ruta,
        inicia_en: f.inicia_en ? new Date(f.inicia_en).toISOString() : null, termina_en: f.termina_en ? new Date(f.termina_en).toISOString() : null,
        ...(banner ? {} : { orden: siguienteOrden }),
      })
      // El banner ya apunta a lo nuevo: lo anterior se limpia sin detener el guardado
      if (banner?.video_url && banner.video_url !== (videoNuevo ?? video.url)) borrarVideoBanner(banner.video_url).catch(() => {})
      if (banner?.imagen_ruta && banner.imagen_ruta !== (imagenNueva ?? imagen.ruta)) borrarArchivoLanding(banner.imagen_ruta).catch(() => {})
      await refrescar()
      avisar(banner ? 'Banner actualizado' : 'Banner agregado')
      onCerrar()
    } catch (err) {
      if (videoNuevo) borrarVideoBanner(videoNuevo).catch(() => {})
      if (imagenNueva) borrarArchivoLanding(imagenNueva).catch(() => {})
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
      setProgreso(null)
    }
  }

  const vista = { ...f, id: 'vista', video_url: video.url, video_local: video.local, imagen_ruta: imagen.ruta, imagen_local: imagen.local, titulo: f.titulo || 'Título del banner' }
  const pesoVideo = video.archivo ? video.archivo.size / 1024 / 1024 : 0

  return (
    <Panel abierto onCerrar={onCerrar} titulo={banner ? 'Editar banner' : 'Agregar banner'} ancho="max-w-3xl">
      <form onSubmit={guardar} noValidate>
        <div className="space-y-4 p-5">
          <VistaPrevia banner={vista} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Título"><Input value={f.titulo} onChange={(e) => set('titulo', e.target.value)} /></Campo>
            <Campo etiqueta="Texto resaltado"><Input value={f.titulo_resaltado} onChange={(e) => set('titulo_resaltado', e.target.value)} /></Campo>
            <Campo etiqueta="Etiqueta" ayuda="Texto corto sobre el título."><Input value={f.etiqueta} onChange={(e) => set('etiqueta', e.target.value)} /></Campo>
            <div>
              <span className="mb-1.5 block text-sm font-semibold">Color de acento</span>
              <div className="flex flex-wrap items-center gap-2">
                {COLORES.map((c) => <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={f.color === c} onClick={() => set('color', c)} className={`size-9 rounded-full ring-1 ring-linea ${f.color === c ? 'outline-2 outline-offset-2 outline-tinta' : ''}`} style={{ background: c }} />)}
                <input type="color" value={f.color} onChange={(e) => set('color', e.target.value)} aria-label="Otro color" className="size-9 cursor-pointer rounded-full" />
              </div>
            </div>
          </div>
          <Campo etiqueta="Descripción"><AreaTexto value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Texto del botón"><Input value={f.texto_boton} onChange={(e) => set('texto_boton', e.target.value)} /></Campo>
            <Campo etiqueta="Enlace del botón" ayuda="Una ruta como /shows o una dirección https://."><Input value={f.enlace} onChange={(e) => set('enlace', e.target.value)} /></Campo>
            <Campo etiqueta="Mostrar desde (opcional)"><Input type="datetime-local" value={f.inicia_en} onChange={(e) => set('inicia_en', e.target.value)} /></Campo>
            <Campo etiqueta="Mostrar hasta (opcional)"><Input type="datetime-local" value={f.termina_en} onChange={(e) => set('termina_en', e.target.value)} /></Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-butaca p-3">
              <p className="text-sm font-semibold">Video de fondo</p>
              <p className="mt-0.5 text-sm text-tinta-soft">MP4 o WebM, hasta {MAX_VIDEO_MB} MB. Procura menos de {SUGERIDO_VIDEO_MB} MB para que cargue rápido.</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="inline-flex h-9 cursor-pointer items-center rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-linea hover:bg-linea">
                  {video.url || video.archivo ? 'Cambiar video' : 'Elegir video'}
                  <input type="file" accept="video/mp4,video/webm" className="sr-only" onChange={(e) => { if (e.target.files[0]) elegirVideo(e.target.files[0]); e.target.value = '' }} />
                </label>
                {(video.url || video.archivo) && <button type="button" onClick={() => setVideo({ url: null, archivo: null, local: null })} className="text-sm font-medium text-error underline">Quitar</button>}
              </div>
              {pesoVideo > SUGERIDO_VIDEO_MB && <p className="mt-2 text-sm font-medium text-alerta">Pesa {pesoVideo.toFixed(1)} MB: puede tardar en cargar en teléfonos.</p>}
            </div>
            <div className="rounded-xl bg-butaca p-3">
              <p className="text-sm font-semibold">Personaje que sobresale</p>
              <p className="mt-0.5 text-sm text-tinta-soft">PNG o WebP con fondo transparente. Opcional.</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="inline-flex h-9 cursor-pointer items-center rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-linea hover:bg-linea">
                  {imagen.ruta || imagen.archivo ? 'Cambiar imagen' : 'Elegir imagen'}
                  <input type="file" accept="image/png,image/webp,image/jpeg" className="sr-only" onChange={(e) => { if (e.target.files[0]) elegirImagen(e.target.files[0]); e.target.value = '' }} />
                </label>
                {(imagen.ruta || imagen.archivo) && <button type="button" onClick={() => setImagen({ ruta: null, archivo: null, local: null })} className="text-sm font-medium text-error underline">Quitar</button>}
              </div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 space-y-2 border-t border-linea bg-white p-4">
          <Alerta>{error}</Alerta>
          {progreso !== null && (
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progreso} aria-label="Subiendo video" className="h-2 overflow-hidden rounded-full bg-linea">
              <div className="h-full bg-selva-600 transition-all" style={{ width: `${progreso}%` }} />
            </div>
          )}
          <Boton type="submit" className="w-full" disabled={guardando}>{guardando ? (progreso !== null && progreso < 100 ? `Subiendo video… ${progreso} %` : 'Guardando…') : banner ? 'Guardar cambios' : 'Agregar banner'}</Boton>
        </div>
      </form>
    </Panel>
  )
}

function Banners() {
  const consulta = useQuery({ queryKey: ['admin-banners'], queryFn: obtenerBannersAdmin })
  const refrescar = useRefrescar()
  const { avisar } = useStore()
  const [editando, setEditando] = useState(undefined)
  const [error, setError] = useState('')
  const lista = consulta.data ?? []
  const actual = editando ? lista.find((b) => b.id === editando) : null

  const accion = async (fn, mensaje) => {
    setError('')
    try {
      await fn()
      await refrescar()
      if (mensaje) avisar(mensaje)
    } catch (err) {
      setError(mensajeError(err))
    }
  }
  const eliminar = (b) => {
    if (!window.confirm(`¿Eliminar el banner "${b.titulo}"? Su video e imagen también se borrarán.`)) return
    accion(async () => {
      await borrarBanner(b.id)
      if (b.video_url) borrarVideoBanner(b.video_url).catch(() => {})
      if (b.imagen_ruta) borrarArchivoLanding(b.imagen_ruta).catch(() => {})
    }, 'Banner eliminado')
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tinta-soft">Los banners encendidos rotan en la portada, en este orden.</p>
        <Boton tam="sm" onClick={() => setEditando(null)}><Plus className="size-4" /> Agregar banner</Boton>
      </div>
      {consulta.isLoading && <Cargando />}
      {consulta.isError && <ErrorCarga onReintentar={consulta.refetch} />}
      <div className="mb-3"><Alerta>{error}</Alerta></div>
      {consulta.data?.length === 0 && <div className="rounded-2xl bg-white p-10 text-center font-semibold ring-1 ring-linea">Sin banners. Mientras no haya, la portada muestra los textos de la pestaña Textos.</div>}
      <ul className="space-y-3">
        {lista.map((b, i) => (
          <li key={b.id} className={`flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-linea ${b.activo ? '' : 'opacity-60'}`}>
            <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ background: b.color }}>
              {b.imagen_ruta ? <img src={urlLanding(b.imagen_ruta)} alt="" className="size-full object-contain" /> : b.video_url ? <video src={b.video_url} muted preload="metadata" className="size-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1 basis-40">
              <p className="truncate font-semibold">{b.titulo} {b.titulo_resaltado}</p>
              <p className="truncate text-sm text-tinta-soft">{b.enlace ? `${b.texto_boton ?? 'Sin texto'} → ${b.enlace}` : 'Sin botón'}{b.video_url ? ' · con video' : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <Mover indice={i} total={lista.length} nombre={b.titulo} onMover={(x, d) => accion(() => reordenarBanners(mover(lista, x, d)))} />
              <button onClick={() => setEditando(b.id)} className="text-sm font-semibold text-selva-700 underline">Editar</button>
              <Interruptor activo={b.activo} etiqueta={`Mostrar ${b.titulo}`} onCambio={() => accion(() => guardarBanner(b.id, { activo: !b.activo }), b.activo ? 'Banner apagado' : 'Banner encendido')} />
              <button onClick={() => eliminar(b)} aria-label={`Eliminar ${b.titulo}`} className="rounded-full p-2 text-tinta-soft hover:bg-error-soft hover:text-error"><Trash2 className="size-4" /></button>
            </div>
          </li>
        ))}
      </ul>
      {editando !== undefined && <EditorBanner key={editando ?? 'nuevo'} banner={actual} siguienteOrden={lista.length + 1} onCerrar={() => setEditando(undefined)} />}
    </>
  )
}

// ── Videos de YouTube ───────────────────────────────────────────────────────
export const idDeYoutube = (texto) => {
  const t = texto.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t
  const m = t.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/)
  return m ? m[1] : null
}

function Videos() {
  const consulta = useQuery({ queryKey: ['admin-videos'], queryFn: obtenerVideosAdmin })
  const refrescar = useRefrescar()
  const { avisar } = useStore()
  const [enlace, setEnlace] = useState('')
  const [titulo, setTitulo] = useState('')
  const [error, setError] = useState('')
  const lista = consulta.data ?? []
  const id = idDeYoutube(enlace)

  const accion = async (fn, mensaje) => {
    setError('')
    try {
      await fn()
      await refrescar()
      if (mensaje) avisar(mensaje)
      return true
    } catch (err) {
      setError(err.code === '23505' ? 'Ese video ya está en la lista.' : mensajeError(err))
      return false
    }
  }
  const agregar = async (e) => {
    e.preventDefault()
    setError('')
    if (!id) return setError('Pega un enlace válido de YouTube.')
    if (!titulo.trim()) return setError('Escribe el título del video.')
    if (await accion(() => guardarVideoLanding(null, { titulo: titulo.trim(), youtube_id: id, orden: lista.length + 1 }), 'Video agregado')) {
      setEnlace('')
      setTitulo('')
    }
  }

  return (
    <div className="max-w-3xl">
      <form onSubmit={agregar} className="mb-4 space-y-3 rounded-2xl bg-white p-5 ring-1 ring-linea" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Enlace de YouTube"><Input value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="https://youtu.be/…" /></Campo>
          <Campo etiqueta="Título"><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></Campo>
        </div>
        {id && <img src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`} alt="Miniatura del video" className="h-24 rounded-lg" />}
        <Alerta>{error}</Alerta>
        <Boton type="submit" tam="sm"><Plus className="size-4" /> Agregar video</Boton>
      </form>
      {consulta.isLoading && <Cargando />}
      {consulta.isError && <ErrorCarga onReintentar={consulta.refetch} />}
      {consulta.data?.length === 0 && <div className="rounded-2xl bg-white p-10 text-center font-semibold ring-1 ring-linea">Sin videos. La cinta no aparece hasta que agregues uno.</div>}
      <ul className="space-y-3">
        {lista.map((v, i) => (
          <li key={v.id} className={`flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-linea ${v.activo ? '' : 'opacity-60'}`}>
            <img src={`https://img.youtube.com/vi/${v.youtube_id}/hqdefault.jpg`} alt="" className="h-14 w-24 rounded-lg object-cover" />
            <p className="min-w-0 flex-1 basis-40 truncate font-semibold">{v.titulo}</p>
            <div className="flex items-center gap-2">
              <Mover indice={i} total={lista.length} nombre={v.titulo} onMover={(x, d) => accion(() => reordenarVideos(mover(lista, x, d)))} />
              <Interruptor activo={v.activo} etiqueta={`Mostrar ${v.titulo}`} onCambio={() => accion(() => guardarVideoLanding(v.id, { activo: !v.activo }))} />
              <button onClick={() => window.confirm(`¿Eliminar "${v.titulo}"?`) && accion(() => borrarVideoLanding(v.id), 'Video eliminado')} aria-label={`Eliminar ${v.titulo}`} className="rounded-full p-2 text-tinta-soft hover:bg-error-soft hover:text-error"><Trash2 className="size-4" /></button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const PESTANAS = [['textos', 'Textos', Textos], ['banners', 'Banners', Banners], ['videos', 'Videos', Videos]]

export default function PaginaInicio() {
  const [pestana, setPestana] = useState('banners')
  const Actual = PESTANAS.find(([id]) => id === pestana)[2]
  return (
    <>
      <Encabezado titulo="Página de inicio" descripcion="Lo primero que ven tus clientes al entrar a animayuks.com" />
      <div role="tablist" aria-label="Secciones" className="mb-5 inline-flex rounded-xl bg-butaca p-1">
        {PESTANAS.map(([id, texto]) => (
          <button key={id} role="tab" aria-selected={pestana === id} onClick={() => setPestana(id)} className={`h-10 rounded-lg px-5 text-[15px] font-semibold transition-colors ${pestana === id ? 'bg-white shadow-sm' : 'text-tinta-soft hover:text-tinta'}`}>{texto}</button>
        ))}
      </div>
      <Actual />
    </>
  )
}
