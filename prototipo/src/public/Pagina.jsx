import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, ExternalLink, FileText } from 'lucide-react'
import { urlLegal } from '../lib/api'
import { fechaLarga } from '../lib/format'
import { usePagina } from '../lib/consultas'
import { Cargando, ErrorCarga } from '../components/ui'

// **negritas** dentro de una línea, sin insertar HTML
function enLinea(texto) {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith('**') && parte.endsWith('**') ? <strong key={i}>{parte.slice(2, -2)}</strong> : parte,
  )
}

/** Markdown básico de las páginas legales: títulos, citas, listas y párrafos. */
function Contenido({ texto }) {
  const bloques = texto.split(/\n{2,}/)
  return bloques.map((bloque, i) => {
    const lineas = bloque.split('\n')
    if (lineas.every((l) => /^[-*] /.test(l))) {
      return <ul key={i} className="my-4 list-disc space-y-1.5 pl-6">{lineas.map((l, j) => <li key={j}>{enLinea(l.slice(2))}</li>)}</ul>
    }
    if (lineas.every((l) => /^\d+\. /.test(l))) {
      return <ol key={i} className="my-4 list-decimal space-y-1.5 pl-6">{lineas.map((l, j) => <li key={j}>{enLinea(l.replace(/^\d+\. /, ''))}</li>)}</ol>
    }
    if (bloque.startsWith('> ')) {
      return <p key={i} className="my-4 rounded-xl bg-maiz-soft px-4 py-3 text-[15px]">{enLinea(bloque.slice(2))}</p>
    }
    if (lineas[0].startsWith('## ')) {
      return (
        <div key={i}>
          <h2 className="mt-8 text-xl font-bold">{lineas[0].slice(3)}</h2>
          {lineas.length > 1 && <p className="mt-2">{enLinea(lineas.slice(1).join(' '))}</p>}
        </div>
      )
    }
    return <p key={i} className="my-4">{enLinea(bloque)}</p>
  })
}

const peso = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

/** En teléfonos y tabletas el visor de PDF incrustado se ve mal (en iPhone, en blanco) */
function usarPantallaTactil() {
  const consulta = '(pointer: coarse), (max-width: 767px)'
  const [tactil, setTactil] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches)
  useEffect(() => {
    const m = window.matchMedia(consulta)
    const cambio = () => setTactil(m.matches)
    m.addEventListener('change', cambio)
    return () => m.removeEventListener('change', cambio)
  }, [])
  return tactil
}

export default function Pagina() {
  const { slug } = useParams()
  const pagina = usePagina(slug)
  const tactil = usarPantallaTactil()

  if (pagina.isLoading) return <Cargando />
  if (pagina.isError) return <ErrorCarga onReintentar={pagina.refetch} />
  if (!pagina.data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="text-xl font-semibold">No encontramos esta página.</p>
        <Link to="/" className="mt-4 inline-block font-semibold text-selva-700 underline">Ir al inicio</Link>
      </div>
    )
  }
  const p = pagina.data
  const pdf = urlLegal(p.pdf_ruta)
  const vigencia = `Versión ${p.version} · vigente desde el ${fechaLarga(p.vigente_desde ?? p.actualizado_en).replace(/^[^,]+, /, '')}`

  if (!pdf) {
    return (
      <article className="mx-auto max-w-[70ch] px-4 py-10 text-[17px] leading-relaxed sm:px-6 lg:py-14">
        <h1 className="font-bungee text-4xl leading-[1.05] uppercase sm:text-4xl">{p.titulo}</h1>
        <p className="num mt-2 text-sm text-tinta-soft">{vigencia}</p>
        <div className="mt-6"><Contenido texto={p.contenido} /></div>
      </article>
    )
  }

  return (
    <article className="mx-auto max-w-4xl px-4 py-10 text-[17px] leading-relaxed sm:px-6 lg:py-14">
      <h1 className="font-bungee text-4xl leading-[1.05] uppercase sm:text-4xl">{p.titulo}</h1>
      <p className="num mt-2 text-sm text-tinta-soft">{vigencia}</p>
      {p.contenido?.trim() && (
        <div className="mt-5 max-w-[70ch] rounded-2xl bg-butaca/60 px-5 py-1">
          <Contenido texto={p.contenido} />
        </div>
      )}

      {tactil ? (
        <a href={pdf} target="_blank" rel="noreferrer" className="mt-6 flex items-center gap-3 rounded-2xl bg-selva-600 px-5 py-4 font-semibold text-white hover:bg-selva-700">
          <FileText className="size-6 shrink-0" aria-hidden />
          <span className="flex-1">Abrir el documento completo (PDF{p.pdf_bytes ? `, ${peso(p.pdf_bytes)}` : ''})</span>
          <ExternalLink className="size-5" aria-hidden />
        </a>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl ring-1 ring-linea">
          <object data={`${pdf}#view=FitH`} type="application/pdf" aria-label={p.titulo} className="block h-[80vh] min-h-[480px] w-full">
            <p className="p-6 text-center">
              Tu navegador no muestra el PDF aquí. <a href={pdf} target="_blank" rel="noreferrer" className="font-semibold text-selva-700 underline">Ábrelo en otra pestaña</a>.
            </p>
          </object>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-4 text-[15px]">
        <a href={pdf} download={p.pdf_nombre ?? `${p.slug}.pdf`} className="inline-flex items-center gap-1.5 font-semibold text-selva-700 underline">
          <Download className="size-4" aria-hidden /> Descargar PDF{p.pdf_bytes ? ` (${peso(p.pdf_bytes)})` : ''}
        </a>
        {!tactil && (
          <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-selva-700 underline">
            <ExternalLink className="size-4" aria-hidden /> Abrir en otra pestaña
          </a>
        )}
      </div>
    </article>
  )
}
