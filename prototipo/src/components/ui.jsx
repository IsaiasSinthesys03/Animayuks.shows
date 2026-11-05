import { useState } from 'react'
import { CheckCircle2, CircleAlert, Loader2, X } from 'lucide-react'
import { urlImagen } from '../lib/api'
import { useStore } from '../store'

export const ESTADOS = {
  pendiente: { etiqueta: 'Pendiente', clase: 'bg-alerta-soft text-alerta' },
  confirmada: { etiqueta: 'Confirmada', clase: 'bg-ok-soft text-ok' },
  realizada: { etiqueta: 'Realizada', clase: 'bg-butaca text-tinta-soft' },
  no_realizada: { etiqueta: 'No realizada', clase: 'bg-butaca text-tinta-soft' },
  cancelada: { etiqueta: 'Cancelada', clase: 'bg-telon-50 text-telon-700' },
  rechazada: { etiqueta: 'Rechazada', clase: 'bg-telon-50 text-telon-700' },
  expirada: { etiqueta: 'Expirada', clase: 'bg-butaca text-tinta-soft' },
}

const variantes = {
  primario: 'bg-telon-600 text-white hover:bg-telon-700 active:bg-telon-900',
  oscuro: 'bg-tinta text-white hover:bg-black',
  secundario: 'bg-white text-tinta ring-1 ring-inset ring-linea hover:bg-butaca',
  fantasma: 'text-tinta hover:bg-butaca',
  peligro: 'bg-white text-telon-700 ring-1 ring-inset ring-telon-200 hover:bg-telon-50',
}

export function Boton({ variante = 'primario', tam = 'md', className = '', as: Tag = 'button', ...props }) {
  const tamanos = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-5 text-[15px]', lg: 'h-13 px-7 text-base' }
  return (
    <Tag
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${tamanos[tam]} ${variantes[variante]} ${className}`}
      {...props}
    />
  )
}

export function Campo({ etiqueta, ayuda, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-semibold text-tinta">{etiqueta}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1.5 block text-sm text-telon-700">
          {error}
        </span>
      ) : ayuda ? (
        <span className="mt-1.5 block text-sm text-tinta-soft">{ayuda}</span>
      ) : null}
    </label>
  )
}

export const claseInput =
  'h-11 w-full rounded-xl border border-linea bg-white px-3.5 text-[15px] text-tinta placeholder:text-tinta-soft/70 transition-colors focus:border-telon-500 focus:outline-none focus:ring-3 focus:ring-telon-100 aria-invalid:border-telon-500'

export function Input(props) {
  return <input className={claseInput} {...props} />
}

export function Select({ children, ...props }) {
  return (
    <select className={`${claseInput} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%235e5873%22 stroke-width=%222%22><path d=%22m4 6 4 4 4-4%22/></svg>')] bg-[right_12px_center] bg-no-repeat pr-9`} {...props}>
      {children}
    </select>
  )
}

export function Estado({ estado }) {
  const e = ESTADOS[estado] ?? { etiqueta: estado, clase: 'bg-butaca text-tinta-soft' }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${e.clase}`}>{e.etiqueta}</span>
}

export function Aviso() {
  const { aviso } = useStore()
  if (!aviso) return null
  return (
    <div
      key={aviso.id}
      role="status"
      className="entra fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-tinta px-4 py-3 text-sm font-medium text-white shadow-[0_12px_32px_-8px_rgba(30,26,46,0.45)] sm:bottom-6"
    >
      <CheckCircle2 className="size-5 shrink-0 text-marquesina" aria-hidden />
      {aviso.texto}
    </div>
  )
}

export function Panel({ abierto, onCerrar, titulo, children, ancho = 'max-w-lg' }) {
  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={titulo}>
      <button className="absolute inset-0 bg-tinta/40" onClick={onCerrar} aria-label="Cerrar" />
      <div className={`entra relative flex h-full w-full ${ancho} flex-col bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-linea px-5 py-4">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <button onClick={onCerrar} className="rounded-full p-2 hover:bg-butaca" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

export function Cargando({ texto = 'Cargando…', className = '' }) {
  return (
    <p className={`flex items-center justify-center gap-2 py-16 text-tinta-soft ${className}`} role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden /> {texto}
    </p>
  )
}

export function ErrorCarga({ onReintentar, texto = 'No pudimos cargar la información.' }) {
  return (
    <div className="my-8 rounded-2xl bg-telon-50 p-6 text-center">
      <p className="flex items-center justify-center gap-2 font-semibold text-telon-700">
        <CircleAlert className="size-5" aria-hidden /> {texto}
      </p>
      {onReintentar && (
        <button onClick={onReintentar} className="mt-2 text-sm font-semibold text-telon-700 underline">
          Intentar de nuevo
        </button>
      )}
    </div>
  )
}

const PALETA = [
  { fondo: 'bg-telon-600', texto: 'text-white', acento: 'text-marquesina' },
  { fondo: 'bg-tinta', texto: 'text-white', acento: 'text-marquesina' },
  { fondo: 'bg-marquesina', texto: 'text-tinta', acento: 'text-telon-700' },
  { fondo: 'bg-ok', texto: 'text-white', acento: 'text-marquesina' },
  { fondo: 'bg-telon-900', texto: 'text-white', acento: 'text-telon-200' },
  { fondo: 'bg-[#3b2a8f]', texto: 'text-white', acento: 'text-marquesina' },
]

/** Color estable por show mientras no tenga foto */
export const colorDeShow = (show) => {
  const texto = show?.slug ?? show?.nombre ?? ''
  let suma = 0
  for (const c of texto) suma += c.charCodeAt(0)
  return PALETA[suma % PALETA.length]
}

/** Cartel vertical de un show: su foto con el nombre encima o, sin foto, un cartel tipográfico de color. */
export function Cartel({ show, tam = 'md', className = '' }) {
  const [fallo, setFallo] = useState(false)
  const imagen = fallo ? null : urlImagen(show.imagen_principal)
  const { fondo, texto, acento } = colorDeShow(show)
  const tamTitulo = { sm: 'text-2xl', md: 'text-[2.2rem] sm:text-[2.6rem]', lg: 'text-6xl sm:text-7xl' }[tam]
  return (
    <div className={`relative flex flex-col justify-between overflow-hidden ${imagen ? 'bg-tinta text-white' : `${fondo} ${texto}`} ${className}`}>
      {imagen && (
        <>
          <img src={imagen} alt="" loading="lazy" onError={() => setFallo(true)} className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/35" aria-hidden />
        </>
      )}
      <div className={`relative flex items-center justify-between gap-2 px-4 pt-3 text-xs font-semibold ${imagen ? 'text-white' : acento}`}>
        <span className="truncate">{show.categorias?.nombre}</span>
        <span className="num shrink-0">{show.duracion_min} min</span>
      </div>
      <p className={`relative font-cartel ${tamTitulo} px-4 pb-4 leading-[0.88] font-black tracking-[-0.01em] text-balance uppercase`}>{show.nombre}</p>
    </div>
  )
}

/** Miniatura cuadrada para listas */
export function Miniatura({ show, className = 'size-16' }) {
  const imagen = urlImagen(show?.imagen_principal)
  const { fondo, texto } = colorDeShow(show)
  if (imagen) return <img src={imagen} alt="" loading="lazy" className={`shrink-0 rounded-xl object-cover ${className}`} />
  return (
    <span className={`flex shrink-0 items-end rounded-xl p-1.5 ${fondo} ${texto} ${className}`}>
      <span className="font-cartel text-sm leading-none font-black uppercase">{show?.nombre}</span>
    </span>
  )
}
