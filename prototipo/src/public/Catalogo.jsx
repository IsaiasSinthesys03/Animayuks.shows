import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Star, Users } from 'lucide-react'
import { CATEGORIAS, SHOWS } from '../data/mock'
import { pesos } from '../lib/format'
import { Cartel } from '../components/ui'

export default function Catalogo() {
  const [categoria, setCategoria] = useState('Todos')
  const [texto, setTexto] = useState('')
  const [orden, setOrden] = useState('populares')

  const lista = useMemo(() => {
    let l = SHOWS.filter((s) => (categoria === 'Todos' || s.categoria === categoria) && (s.nombre + s.resumen).toLowerCase().includes(texto.toLowerCase()))
    if (orden === 'precio') l = [...l].sort((a, b) => a.precio - b.precio)
    else l = [...l].sort((a, b) => b.resenas - a.resenas)
    return l
  }, [categoria, texto, orden])

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <h1 className="font-cartel text-6xl leading-none font-black uppercase sm:text-7xl">Cartelera</h1>
      <p className="mt-3 max-w-[60ch] text-lg text-tinta-soft">Todos los shows se presentan en tu casa, salón o jardín.</p>

      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0" role="tablist" aria-label="Tipo de evento">
          {['Todos', ...CATEGORIAS].map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={categoria === c}
              onClick={() => setCategoria(c)}
              className={`h-10 shrink-0 rounded-full px-4 text-[15px] font-medium transition-colors ${categoria === c ? 'bg-tinta text-white' : 'bg-butaca text-tinta hover:bg-linea'}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="relative flex-1 lg:w-64">
            <span className="sr-only">Buscar show</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tinta-soft" />
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar: magia, títeres…"
              className="h-10 w-full rounded-full border border-linea pr-4 pl-10 text-[15px] focus:border-telon-500 focus:ring-3 focus:ring-telon-100 focus:outline-none"
            />
          </label>
          <label>
            <span className="sr-only">Ordenar</span>
            <select value={orden} onChange={(e) => setOrden(e.target.value)} className="h-10 rounded-full border border-linea bg-white px-4 text-[15px] focus:outline-none">
              <option value="populares">Más pedidos</option>
              <option value="precio">Menor precio</option>
            </select>
          </label>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="mt-12 rounded-2xl bg-butaca p-10 text-center">
          <p className="text-lg font-semibold">Ningún show coincide con “{texto}”.</p>
          <button onClick={() => { setTexto(''); setCategoria('Todos') }} className="mt-3 font-semibold text-telon-700 underline">
            Ver toda la cartelera
          </button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((s) => (
            <li key={s.id}>
              <Link to={`/shows/${s.id}`} className="group block">
                <Cartel show={s} className="aspect-[4/3] rounded-2xl transition-transform duration-300 ease-[var(--ease-salida)] group-hover:-translate-y-1" />
              </Link>
              <div className="mt-3">
                <div className="flex items-center gap-3 text-sm text-tinta-soft">
                  <span className="num inline-flex items-center gap-1 font-semibold text-tinta">
                    <Star className="size-4 fill-marquesina text-marquesina" aria-hidden /> {s.calificacion.toFixed(1)}
                  </span>
                  <span className="num">{s.resenas} reseñas</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-4" aria-hidden /> {s.artistas} {s.artistas === 1 ? 'artista' : 'artistas'}
                  </span>
                </div>
                <p className="mt-1.5 leading-snug">{s.resumen}</p>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm text-tinta-soft">
                    Desde <span className="num text-base font-bold text-tinta">{pesos(s.precio)}</span>
                  </p>
                  <Link to={`/reservar?show=${s.id}`} className="inline-flex h-9 items-center rounded-full bg-telon-600 px-4 text-sm font-semibold text-white hover:bg-telon-700">
                    Reservar
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
