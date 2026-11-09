import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { obtenerMapaZonas } from '../lib/apiAdmin'
import { pesos, resumenHorario } from '../lib/format'
import { Cargando, ErrorCarga, Panel } from '../components/ui'
import MapaCobertura from '../components/MapaCobertura'

export default function MapaZonas({ onCerrar }) {
  const consulta = useQuery({ queryKey: ['admin-mapa-zonas'], queryFn: obtenerMapaZonas, staleTime: 0, refetchOnMount: 'always' })
  const [ocultas, setOcultas] = useState([])
  const [area, setArea] = useState(null)

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
          {consulta.data && <MapaCobertura datos={consulta.data} modo="admin" ocultas={ocultas} alSeleccionar={setArea} className="h-full min-h-[24rem]" />}
        </div>
        <aside className="space-y-5 overflow-y-auto">
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
            {area && (
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
