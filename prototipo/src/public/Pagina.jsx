import { Link, useParams } from 'react-router-dom'
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

export default function Pagina() {
  const { slug } = useParams()
  const pagina = usePagina(slug)

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
  return (
    <article className="mx-auto max-w-[70ch] px-4 py-10 text-[17px] leading-relaxed sm:px-6 lg:py-14">
      <h1 className="font-bungee text-4xl leading-[1.05] uppercase sm:text-4xl">{pagina.data.titulo}</h1>
      <div className="mt-6"><Contenido texto={pagina.data.contenido} /></div>
    </article>
  )
}
