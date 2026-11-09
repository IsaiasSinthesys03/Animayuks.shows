import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Users } from 'lucide-react'
import { useCategorias, useShows } from '../lib/consultas'
import { pesos } from '../lib/format'
import { Cargando, Cartel, ErrorCarga } from '../components/ui'

export default function Catalogo() {
  const shows = useShows()
  const { data: categorias } = useCategorias()
  const [categoria, setCategoria] = useState('Todos')
  const [texto, setTexto] = useState('')
  const [orden, setOrden] = useState('destacados')

  const lista = useMemo(() => {
    const t = texto.trim().toLowerCase()
    const filtrados = (shows.data ?? []).filter(
      (s) => (categoria === 'Todos' || s.categorias?.nombre === categoria) && `${s.nombre} ${s.resumen}`.toLowerCase().includes(t),
    )
    return orden === 'precio'
      ? [...filtrados].sort((a, b) => Number(a.precio_base) - Number(b.precio_base))
      : [...filtrados].sort((a, b) => Number(b.destacado) - Number(a.destacado) || a.orden - b.orden)
  }, [shows.data, categoria, texto, orden])

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <h1 className="font-bungee text-4xl leading-[1.05] uppercase sm:text-5xl">Cartelera</h1>
      <p className="mt-3 max-w-[60ch] text-lg text-tinta-soft">Todos los shows se presentan en tu casa, salón o jardín.</p>

      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0" role="group" aria-label="Tipo de evento">
          {['Todos', ...(categorias ?? []).map((c) => c.nombre)].map((c) => (
            <button
              key={c}
              aria-pressed={categoria === c}
              onClick={() => setCategoria(c)}
              className={`h-10 shrink-0 rounded-full px-4 text-[15px] font-medium transition-colors ${categoria === c ? 'bg-selva-600 text-white' : 'bg-butaca text-tinta hover:bg-linea'}`}
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
              placeholder="Buscar un show"
              className="h-10 w-full rounded-full border border-linea pr-4 pl-10 text-[15px] focus:border-selva-500 focus:ring-3 focus:ring-selva-100 focus:outline-none"
            />
          </label>
          <label>
            <span className="sr-only">Ordenar</span>
            <select value={orden} onChange={(e) => setOrden(e.target.value)} className="h-10 rounded-full border border-linea bg-white px-4 text-[15px] focus:outline-none">
              <option value="destacados">Destacados</option>
              <option value="precio">Menor precio</option>
            </select>
          </label>
        </div>
      </div>

      {shows.isLoading && <Cargando />}
      {shows.isError && <ErrorCarga onReintentar={shows.refetch} />}

      {shows.data?.length === 0 && (
        <div className="mt-12 rounded-2xl bg-butaca p-10 text-center">
          <p className="text-lg font-semibold">Pronto publicaremos nuestros shows.</p>
        </div>
      )}

      {shows.data?.length > 0 && lista.length === 0 && (
        <div className="mt-12 rounded-2xl bg-butaca p-10 text-center">
          <p className="text-lg font-semibold">Ningún show coincide con tu búsqueda.</p>
          <button onClick={() => { setTexto(''); setCategoria('Todos') }} className="mt-3 font-semibold text-selva-700 underline">
            Ver toda la cartelera
          </button>
        </div>
      )}

      {lista.length > 0 && (
        <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-3">
          {lista.map((s) => (
            <li key={s.id} className="flex flex-col">
              <Link to={`/shows/${s.slug}`} className="group block">
                <Cartel show={s} className="aspect-[4/5] rounded-2xl transition-transform duration-300 ease-[var(--ease-salida)] group-hover:-translate-y-1" />
              </Link>
              <div className="mt-3 flex flex-1 flex-col">
                <p className="inline-flex items-center gap-1 text-sm text-tinta-soft">
                  <Users className="size-4" aria-hidden /> {s.artistas} {s.artistas === 1 ? 'artista' : 'artistas'}
                </p>
                <h2 className="mt-1.5 font-bungee text-base leading-tight">{s.nombre}</h2>
                <p className="mt-1 flex-1 leading-snug">{s.resumen}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-tinta-soft">
                    Desde <span className="num text-base font-bold text-tinta">{pesos(s.precio_base)}</span>
                  </p>
                  <Link to={`/reservar?show=${s.slug}`} className="inline-flex h-9 items-center rounded-full bg-selva-600 px-4 text-sm font-semibold text-white hover:bg-selva-700">
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
