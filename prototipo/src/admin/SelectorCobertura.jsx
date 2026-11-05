import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Search, X } from 'lucide-react'
import { catalogoBuscar, catalogoCps, catalogoCpsPorCodigo, catalogoEstados, catalogoMunicipios } from '../lib/api'

const CATALOGO = { staleTime: 60 * 60 * 1000 }
const clave = (estado, municipio) => `${estado}|${municipio}`
const sinAcentos = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const enlaceMapa = (cp, colonia, municipio, estado) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${colonia}, ${cp}, ${municipio}, ${estado}, México`)}`

function Fila({ marcado, deshabilitado, onMarcar, titulo, detalle, nota, onAbrir, mapa }) {
  return (
    <li className="flex items-center gap-1 pr-1">
      <label className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 ${deshabilitado ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-butaca'}`}>
        <input type="checkbox" checked={marcado} disabled={deshabilitado} onChange={onMarcar} className="size-5 shrink-0 accent-selva-600" />
        <span className="min-w-0">
          <span className={`line-clamp-3 font-medium ${deshabilitado && !marcado ? 'text-tinta-soft' : ''}`}>{titulo}</span>
          {detalle && <span className="block truncate text-sm text-tinta-soft">{detalle}</span>}
          {nota && <span className="block text-sm font-medium text-alerta">{nota}</span>}
        </span>
      </label>
      {mapa && (
        <a href={mapa} target="_blank" rel="noreferrer" aria-label={`Ver ${titulo} en un mapa`} title="Ver en un mapa" className="shrink-0 rounded-full p-2 text-tinta-soft hover:bg-butaca hover:text-tinta">
          <ExternalLink className="size-4" />
        </a>
      )}
      {onAbrir && (
        <button type="button" onClick={onAbrir} aria-label={`Ver lo que hay dentro de ${titulo}`} className="shrink-0 rounded-full p-2 text-tinta-soft hover:bg-butaca hover:text-tinta">
          <ChevronRight className="size-5" />
        </button>
      )}
    </li>
  )
}

/**
 * Elige qué cubre una zona: estados completos, municipios completos o colonias.
 * valor: { estados, municipios, codigos }. `otras` son las demás zonas.
 */
export default function SelectorCobertura({ valor, onCambio, otras }) {
  const [ruta, setRuta] = useState({ estado: null, municipio: null })
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [detalles, setDetalles] = useState({})

  const enRaiz = !ruta.estado
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto.trim()), 250)
    return () => clearTimeout(t)
  }, [texto])

  const estados = useQuery({ queryKey: ['catalogo-estados'], queryFn: catalogoEstados, ...CATALOGO })
  const municipios = useQuery({ queryKey: ['catalogo-municipios', ruta.estado], queryFn: () => catalogoMunicipios(ruta.estado), enabled: !!ruta.estado && !ruta.municipio, ...CATALOGO })
  const cps = useQuery({ queryKey: ['catalogo-cps', ruta.estado, ruta.municipio], queryFn: () => catalogoCps(ruta.estado, ruta.municipio), enabled: !!ruta.municipio, ...CATALOGO })
  const resultados = useQuery({ queryKey: ['catalogo-buscar', busqueda], queryFn: () => catalogoBuscar(busqueda), enabled: enRaiz && busqueda.length >= 2, placeholderData: keepPreviousData, ...CATALOGO })

  // Al editar una zona se recupera de qué ciudad es cada código postal ya guardado
  const [codigosIniciales] = useState(valor.codigos)
  const guardados = useQuery({ queryKey: ['catalogo-codigos', codigosIniciales], queryFn: () => catalogoCpsPorCodigo(codigosIniciales), enabled: codigosIniciales.length > 0, ...CATALOGO })
  const detalle = useMemo(() => {
    const mapa = { ...detalles }
    for (const c of guardados.data ?? []) mapa[c.codigo_postal] = c
    return mapa
  }, [detalles, guardados.data])

  // Quién tiene ya cada lugar
  const duenos = useMemo(() => {
    const d = { estados: new Map(), municipios: new Map(), codigos: new Map() }
    for (const z of otras) {
      z.estados?.forEach((x) => d.estados.set(x, z.nombre))
      z.municipios?.forEach((x) => d.municipios.set(x, z.nombre))
      z.codigos_postales?.forEach((x) => d.codigos.set(x, z.nombre))
    }
    return d
  }, [otras])

  const filaEstado = (estado) => {
    const otra = duenos.estados.get(estado)
    return { marcado: valor.estados.includes(estado), deshabilitado: !!otra, nota: otra && `Ya está en ${otra}` }
  }
  const filaMunicipio = (estado, municipio) => {
    if (valor.estados.includes(estado)) return { marcado: true, deshabilitado: true, nota: 'Incluido en todo el estado' }
    const otra = duenos.municipios.get(clave(estado, municipio))
    if (otra) return { marcado: false, deshabilitado: true, nota: `Ya está en ${otra}` }
    const padre = duenos.estados.get(estado)
    return { marcado: valor.municipios.includes(clave(estado, municipio)), nota: padre && `Hoy cae en ${padre}. Aquí tendrá prioridad.` }
  }
  const filaCp = (estado, municipio, cp) => {
    if (valor.estados.includes(estado)) return { marcado: true, deshabilitado: true, nota: 'Incluido en todo el estado' }
    if (valor.municipios.includes(clave(estado, municipio))) return { marcado: true, deshabilitado: true, nota: 'Incluido en toda la ciudad' }
    const otra = duenos.codigos.get(cp)
    if (otra) return { marcado: false, deshabilitado: true, nota: `Ya está en ${otra}` }
    const padre = duenos.municipios.get(clave(estado, municipio)) ?? duenos.estados.get(estado)
    return { marcado: valor.codigos.includes(cp), nota: padre && `Hoy cae en ${padre}. Aquí tendrá prioridad.` }
  }

  const alternar = (lista, x) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x])

  const marcarEstado = (estado) => {
    const quitando = valor.estados.includes(estado)
    onCambio({
      estados: alternar(valor.estados, estado),
      // Al cubrir todo el estado, lo que ya estaba marcado dentro sobra
      municipios: quitando ? valor.municipios : valor.municipios.filter((m) => !m.startsWith(`${estado}|`)),
      codigos: quitando ? valor.codigos : valor.codigos.filter((c) => detalle[c]?.estado !== estado),
    })
  }
  const marcarMunicipio = (estado, municipio) => {
    const k = clave(estado, municipio)
    const quitando = valor.municipios.includes(k)
    onCambio({
      ...valor,
      municipios: alternar(valor.municipios, k),
      codigos: quitando ? valor.codigos : valor.codigos.filter((c) => !(detalle[c]?.estado === estado && detalle[c]?.municipio === municipio)),
    })
  }
  const recordar = (filas) => setDetalles((d) => ({ ...d, ...Object.fromEntries(filas.map((f) => [f.codigo_postal, f])) }))
  const marcarCp = (fila) => {
    recordar([fila])
    onCambio({ ...valor, codigos: alternar(valor.codigos, fila.codigo_postal) })
  }

  const filtro = sinAcentos(texto.trim())
  const municipiosVisibles = (municipios.data ?? []).filter((m) => sinAcentos(m.municipio).includes(filtro))
  const cpsVisibles = (cps.data ?? []).filter((c) => sinAcentos(`${c.codigo_postal} ${c.colonias.join(' ')}`).includes(filtro))
  const cpsLibres = cpsVisibles.filter((c) => !filaCp(ruta.estado, ruta.municipio, c.codigo_postal).deshabilitado)
  const todosMarcados = cpsLibres.length > 0 && cpsLibres.every((c) => valor.codigos.includes(c.codigo_postal))

  const marcarVisibles = () => {
    const codigos = cpsLibres.map((c) => c.codigo_postal)
    recordar(cpsLibres.map((c) => ({ ...c, estado: ruta.estado, municipio: ruta.municipio })))
    onCambio({ ...valor, codigos: todosMarcados ? valor.codigos.filter((c) => !codigos.includes(c)) : [...new Set([...valor.codigos, ...codigos])] })
  }

  const abrir = (estado, municipio = null) => {
    setRuta({ estado, municipio })
    setTexto('')
    setBusqueda('')
  }

  // Resumen de lo elegido: los códigos sueltos se agrupan por ciudad
  const grupos = useMemo(() => {
    const g = new Map()
    for (const c of valor.codigos) {
      const d = detalle[c]
      const k = d ? clave(d.estado, d.municipio) : ''
      g.set(k, [...(g.get(k) ?? []), c])
    }
    return [...g]
  }, [valor.codigos, detalle])
  const quitarCodigos = (lista) => onCambio({ ...valor, codigos: valor.codigos.filter((c) => !lista.includes(c)) })
  const vacia = valor.estados.length + valor.municipios.length + valor.codigos.length === 0

  const Chip = ({ children, onQuitar, etiqueta, titulo }) => (
    <li title={titulo} className="inline-flex max-w-full items-center gap-1 rounded-full bg-agua-soft py-1 pr-1 pl-3 text-sm font-medium text-selva-900">
      <span className="truncate">{children}</span>
      <button type="button" onClick={onQuitar} aria-label={`Quitar ${etiqueta}`} className="shrink-0 rounded-full p-1 hover:bg-white">
        <X className="size-3.5" />
      </button>
    </li>
  )

  const cpManual = /^\d{5}$/.test(busqueda) && enRaiz && resultados.data && !resultados.data.some((r) => r.codigo_postal === busqueda) ? busqueda : null

  return (
    <div>
      {vacia ? (
        <p className="mb-3 text-sm text-tinta-soft">Aún no eliges nada. Puede ser un estado completo, una ciudad o solo algunas colonias.</p>
      ) : (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Lo que cubre esta zona">
          {valor.estados.map((e) => <Chip key={e} etiqueta={e} onQuitar={() => marcarEstado(e)}>{e}, todo el estado</Chip>)}
          {valor.municipios.map((m) => {
            const [e, n] = m.split('|')
            return <Chip key={m} etiqueta={n} onQuitar={() => marcarMunicipio(e, n)}>{n}, {e}</Chip>
          })}
          {grupos.map(([k, lista]) => (
            <li key={k || 'sueltos'} className="mt-1 w-full">
              <p className="mb-1.5 flex flex-wrap items-baseline gap-x-3 text-sm font-semibold">
                {k ? k.split('|')[1] : 'Otros códigos postales'}: {lista.length === 1 ? '1 código postal' : `${lista.length} códigos postales`}
                {lista.length > 1 && (
                  <button type="button" onClick={() => quitarCodigos(lista)} className="font-medium text-selva-700 underline">Quitar todos</button>
                )}
              </p>
              <ul className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto" aria-label={`Códigos postales de ${k ? k.split('|')[1] : 'otros lugares'}`}>
                {[...lista].sort().map((c) => {
                  const colonias = detalle[c]?.colonias ?? []
                  return (
                    <Chip key={c} etiqueta={`el código postal ${c}`} titulo={colonias.join(', ')} onQuitar={() => quitarCodigos([c])}>
                      <span className="num font-bold">{c}</span>
                      {colonias.length > 0 && ` ${colonias[0]}${colonias.length > 1 ? ` y ${colonias.length - 1} más` : ''}`}
                    </Chip>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-hidden rounded-2xl ring-1 ring-linea">
        <div className="border-b border-linea p-2">
          {!enRaiz && (
            <div className="mb-2 flex flex-wrap items-center gap-1 text-sm">
              <button type="button" onClick={() => abrir(ruta.municipio ? ruta.estado : null)} className="inline-flex items-center gap-0.5 rounded-full py-1 pr-2 font-semibold text-selva-700 hover:bg-butaca">
                <ChevronLeft className="size-4" /> {ruta.municipio ? ruta.estado : 'Todos los estados'}
              </button>
              <span className="font-semibold">{ruta.municipio ? `/ ${ruta.municipio}` : `/ ${ruta.estado}`}</span>
            </div>
          )}
          <label className="relative block">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-soft" />
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              placeholder={enRaiz ? 'Busca un estado, ciudad, colonia o código postal' : `Filtrar en ${ruta.municipio ?? ruta.estado}`}
              className="h-10 w-full rounded-xl bg-butaca pr-3 pl-9 text-[15px] focus:ring-2 focus:ring-selva-100 focus:outline-none"
            />
          </label>
        </div>

        {ruta.estado && !ruta.municipio && (
          <div className="border-b border-linea bg-butaca/60">
            <Fila {...filaEstado(ruta.estado)} onMarcar={() => marcarEstado(ruta.estado)} titulo={`Todo ${ruta.estado}`} />
          </div>
        )}
        {ruta.municipio && (
          <div className="border-b border-linea bg-butaca/60">
            <Fila {...filaMunicipio(ruta.estado, ruta.municipio)} onMarcar={() => marcarMunicipio(ruta.estado, ruta.municipio)} titulo={`Toda ${ruta.municipio}`} />
            {cpsLibres.length > 0 && !valor.municipios.includes(clave(ruta.estado, ruta.municipio)) && filtro && (
              <button type="button" onClick={marcarVisibles} className="mb-2 ml-3 text-sm font-semibold text-selva-700 underline">
                {todosMarcados ? 'Desmarcar' : 'Marcar'} {cpsLibres.length === 1 ? 'el resultado' : `los ${cpsLibres.length} resultados`}
              </button>
            )}
          </div>
        )}

        <ul className="max-h-80 divide-y divide-linea overflow-y-auto">
          {enRaiz && !busqueda && (estados.data ?? []).map((e) => (
            <Fila key={e.estado} {...filaEstado(e.estado)} onMarcar={() => marcarEstado(e.estado)} titulo={e.estado} detalle={`${e.municipios} municipios`} onAbrir={() => abrir(e.estado)} />
          ))}

          {enRaiz && busqueda.length >= 2 && (resultados.data ?? []).map((r) => {
            if (r.tipo === 'estado') return <Fila key={r.estado} {...filaEstado(r.estado)} onMarcar={() => marcarEstado(r.estado)} titulo={r.estado} detalle="Estado" onAbrir={() => abrir(r.estado)} />
            if (r.tipo === 'municipio') return <Fila key={clave(r.estado, r.municipio)} {...filaMunicipio(r.estado, r.municipio)} onMarcar={() => marcarMunicipio(r.estado, r.municipio)} titulo={r.municipio} detalle={`Ciudad o municipio de ${r.estado}`} onAbrir={() => abrir(r.estado, r.municipio)} />
            return <Fila key={r.codigo_postal} {...filaCp(r.estado, r.municipio, r.codigo_postal)} onMarcar={() => marcarCp(r)} titulo={`${r.codigo_postal} · ${r.municipio}, ${r.estado}`} detalle={r.colonias.join(', ')} mapa={enlaceMapa(r.codigo_postal, r.colonias[0], r.municipio, r.estado)} />
          })}

          {ruta.estado && !ruta.municipio && municipiosVisibles.map((m) => (
            <Fila key={m.municipio} {...filaMunicipio(ruta.estado, m.municipio)} onMarcar={() => marcarMunicipio(ruta.estado, m.municipio)} titulo={m.municipio} detalle={m.cps === 1 ? '1 código postal' : `${m.cps} códigos postales`} onAbrir={() => abrir(ruta.estado, m.municipio)} />
          ))}

          {ruta.municipio && cpsVisibles.map((c) => (
            <Fila
              key={c.codigo_postal}
              {...filaCp(ruta.estado, ruta.municipio, c.codigo_postal)}
              onMarcar={() => marcarCp({ ...c, estado: ruta.estado, municipio: ruta.municipio })}
              titulo={c.colonias.join(', ')}
              detalle={`CP ${c.codigo_postal}`}
              mapa={enlaceMapa(c.codigo_postal, c.colonias[0], ruta.municipio, ruta.estado)}
            />
          ))}

          {(estados.isLoading || municipios.isLoading || cps.isLoading || resultados.isFetching) && (
            <li className="flex items-center gap-2 px-3 py-3 text-sm text-tinta-soft" role="status"><Loader2 className="size-4 animate-spin" /> Buscando…</li>
          )}
          {cpManual && !resultados.isFetching && (
            <li className="px-3 py-3 text-sm">
              <span className="text-tinta-soft">El {cpManual} no está en el catálogo. </span>
              <button type="button" onClick={() => onCambio({ ...valor, codigos: alternar(valor.codigos, cpManual) })} className="font-semibold text-selva-700 underline">
                {valor.codigos.includes(cpManual) ? 'Quitarlo' : 'Agregarlo de todos modos'}
              </button>
            </li>
          )}
          {enRaiz && busqueda.length >= 2 && !resultados.isFetching && resultados.data?.length === 0 && !cpManual && <li className="px-3 py-3 text-sm text-tinta-soft">No encontramos “{busqueda}”.</li>}
          {enRaiz && busqueda.length >= 2 && resultados.data?.filter((r) => r.tipo === 'cp').length >= 40 && <li className="px-3 py-3 text-sm text-tinta-soft">Hay más resultados. Escribe también la ciudad para acotar.</li>}
          {enRaiz && busqueda.length === 1 && <li className="px-3 py-3 text-sm text-tinta-soft">Escribe al menos 2 letras.</li>}
          {ruta.estado && filtro && !ruta.municipio && municipiosVisibles.length === 0 && municipios.data && <li className="px-3 py-3 text-sm text-tinta-soft">No encontramos “{texto}” en {ruta.estado}.</li>}
          {ruta.municipio && filtro && cpsVisibles.length === 0 && cps.data && <li className="px-3 py-3 text-sm text-tinta-soft">No encontramos “{texto}” en {ruta.municipio}.</li>}
        </ul>
      </div>
      <p className="mt-2 text-xs text-tinta-soft">
        Una colonia pertenece a un código postal: al marcarla también se marcan las que comparten ese código. Si un lugar está en dos zonas, gana la más específica. Catálogo: <a href="https://www.geonames.org" target="_blank" rel="noreferrer" className="underline">GeoNames</a> (CC BY 4.0).
      </p>
    </div>
  )
}
