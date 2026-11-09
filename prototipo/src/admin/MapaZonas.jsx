import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { mensajeError } from '../lib/api'
import { agregarCpAZona, obtenerCuadriculaCP, obtenerMapaZonas } from '../lib/apiAdmin'
import { useZonas } from '../lib/consultas'
import { pesos, resumenHorario } from '../lib/format'
import { useStore } from '../store'
import { Boton, Cargando, ErrorCarga, Panel } from '../components/ui'
import { Interruptor } from './AdminLayout'
import MapaCobertura from '../components/MapaCobertura'

/** Agrega el código a una zona sin salir del mapa */
function AgregarAZona({ cp, alAgregar }) {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const zonas = useZonas()
  const [zonaId, setZonaId] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const lista = [...(zonas.data ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const agregar = async () => {
    setError('')
    if (!zonaId) return setError('Elige una zona.')
    setGuardando(true)
    try {
      const zona = await agregarCpAZona(zonaId, cp)
      await Promise.all(['admin-mapa-zonas', 'admin-cuadricula-cp', 'zonas', 'mapa-cobertura'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
      avisar(`${cp} agregado a ${zona.nombre}`)
      alAgregar(zona.nombre)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-butaca p-3">
      <label className="block text-sm font-semibold" htmlFor="agregar-zona">Agregar a una zona</label>
      <div className="flex gap-2">
        <select id="agregar-zona" value={zonaId} onChange={(e) => setZonaId(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-linea bg-white px-2 text-sm">
          <option value="">{zonas.isLoading ? 'Cargando…' : 'Elige una zona'}</option>
          {lista.map((z) => <option key={z.id} value={z.id}>{z.nombre}{z.activa ? '' : ' (pausada)'}</option>)}
        </select>
        <Boton type="button" tam="sm" onClick={agregar} disabled={guardando}>{guardando ? 'Agregando…' : 'Agregar'}</Boton>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-error">{error}</p>}
    </div>
  )
}

export default function MapaZonas({ onCerrar }) {
  const consulta = useQuery({ queryKey: ['admin-mapa-zonas'], queryFn: obtenerMapaZonas, staleTime: 0, refetchOnMount: 'always' })
  const [ocultas, setOcultas] = useState([])
  const [area, setArea] = useState(null)
  const [verTodos, setVerTodos] = useState(false)
  const [pedida, setPedida] = useState(false)
  // Se descarga una sola vez, la primera vez que se enciende
  const cuadricula = useQuery({ queryKey: ['admin-cuadricula-cp'], queryFn: obtenerCuadriculaCP, enabled: pedida, staleTime: Infinity, gcTime: Infinity })
  const sinZona = useMemo(() => (cuadricula.data?.features ?? []).filter((f) => !f.properties.zona_id).length, [cuadricula.data])
  const alternarTodos = () => {
    setPedida(true)
    setVerTodos((v) => !v)
  }

  const zonas = useMemo(() => {
    const m = new Map()
    for (const { properties: p } of consulta.data?.features ?? []) {
      const z = m.get(p.zona_id) ?? { id: p.zona_id, nombre: p.zona, color: p.color, activa: p.activa, total: 0 }
      z.total += 1
      m.set(p.zona_id, z)
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [consulta.data])

  const sin = consulta.data?.sin_contorno ?? []
  const horario = area?.horario ? resumenHorario(typeof area.horario === 'string' ? JSON.parse(area.horario) : area.horario) : null

  return (
    <Panel abierto onCerrar={onCerrar} titulo="Mapa de zonas" ancho="max-w-none">
      <div className="grid h-full gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-h-[24rem]">
          {consulta.isLoading && <Cargando />}
          {consulta.isError && <ErrorCarga onReintentar={consulta.refetch} />}
          {consulta.data && <MapaCobertura datos={consulta.data} modo="admin" ocultas={ocultas} cuadricula={verTodos ? cuadricula.data ?? null : null} alSeleccionar={setArea} className="h-full min-h-[24rem]" />}
        </div>
        <aside className="space-y-5 overflow-y-auto">
          <section className="rounded-xl bg-butaca p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Mostrar todos los códigos</span>
              <Interruptor activo={verTodos} etiqueta="Mostrar todos los códigos postales" disabled={cuadricula.isFetching} onCambio={alternarTodos} />
            </div>
            {cuadricula.isFetching && <p className="mt-2 text-sm text-tinta-soft" role="status">Cargando códigos…</p>}
            {cuadricula.isError && (
              <p className="mt-2 text-sm text-error">No se pudieron cargar. <button type="button" onClick={() => cuadricula.refetch()} className="font-semibold underline">Reintentar</button></p>
            )}
            {verTodos && cuadricula.data && (
              <p className="mt-2 flex items-center gap-2 text-sm"><span className="w-5 border-t-2 border-dashed border-zinc-800" aria-hidden /> Borde punteado: código postal. Sin zona: <span className="num font-semibold">{sinZona}</span></p>
            )}
          </section>
          <section>
            <h3 className="font-bold">Zonas</h3>
            {consulta.data && zonas.length === 0 && <p className="mt-1 text-sm text-tinta-soft">Aún no hay lugares con forma en el mapa.</p>}
            <ul className="mt-2 space-y-1">
              {zonas.map((z) => (
                <li key={z.id}>
                  <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                    <input type="checkbox" checked={!ocultas.includes(z.id)} onChange={() => setOcultas((o) => (o.includes(z.id) ? o.filter((x) => x !== z.id) : [...o, z.id]))} className="size-4 accent-selva-600" />
                    <span className="size-3 shrink-0 rounded-full" style={{ background: z.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{z.nombre}{z.activa ? '' : ' (pausada)'}</span>
                    <span className="num text-tinta-soft">{z.total}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
          <section aria-live="polite">
            <h3 className="font-bold">Detalle</h3>
            {!area && <p className="mt-1 text-sm text-tinta-soft">Haz clic en un área del mapa.</p>}
            {area?.sinZona && (
              <dl className="mt-1 space-y-1 text-sm">
                <div><dt className="inline font-semibold">CP: </dt><dd className="num inline">{area.cp}{area.municipio ? ` · ${area.municipio}` : ''}</dd></div>
                <div><dd className={`font-semibold ${area.agregadoA ? 'text-ok' : 'text-alerta'}`}>{area.agregadoA ? `Agregado a ${area.agregadoA}` : 'Sin zona'}</dd></div>
                <div><dt className="font-semibold">Colonias</dt><dd>{area.colonias || 'Sin datos'}</dd></div>
              </dl>
            )}
            {area?.sinZona && !area.agregadoA && <AgregarAZona cp={area.cp} alAgregar={(nombre) => setArea({ ...area, agregadoA: nombre })} />}
            {area && !area.sinZona && area.zona && (
              <dl className="mt-1 space-y-1 text-sm">
                <div><dt className="inline font-semibold">CP: </dt><dd className="num inline">{area.cp}</dd></div>
                <div><dt className="inline font-semibold">Zona: </dt><dd className="inline">{area.zona}{area.activa ? '' : ' (pausada)'}</dd></div>
                <div><dt className="inline font-semibold">Costo extra: </dt><dd className="num inline">{pesos(area.costo)}</dd></div>
                <div><dt className="inline font-semibold">Horario: </dt><dd className="inline">{horario ?? 'Horario general'}</dd></div>
                <div><dt className="font-semibold">Colonias</dt><dd>{area.colonias || 'Sin datos'}</dd></div>
              </dl>
            )}
          </section>
          {sin.length > 0 && (
            <section>
              <h3 className="font-bold">Sin forma en el mapa</h3>
              <p className="mt-0.5 text-sm text-tinta-soft">Tienen servicio, pero no hay contorno oficial para dibujarlos.</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {sin.map((s) => <li key={s.cp}><span className="num font-semibold">{s.cp}</span> {s.colonias}</li>)}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </Panel>
  )
}
