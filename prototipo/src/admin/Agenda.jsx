import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { obtenerBloqueos, obtenerReservaciones } from '../lib/apiAdmin'
import { useZonas } from '../lib/consultas'
import { diaDe, fechaLarga, hora, hoy, instanteLocal } from '../lib/format'
import { Boton, Cargando, ErrorCarga, Estado } from '../components/ui'
import { Encabezado } from './AdminLayout'
import DetalleReservacion from './DetalleReservacion'
import VistaDia from './agenda/VistaDia'
import { lineaDesglose } from './agenda/util'

const COLOR_ESTADO = {
  pendiente: 'bg-alerta-soft text-alerta ring-alerta/30',
  confirmada: 'bg-selva-50 text-selva-700 ring-selva-200',
  realizada: 'bg-butaca text-tinta-soft ring-linea',
}
const OTRO = 'bg-white text-tinta-soft/60 line-through ring-linea'
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const dos = (n) => String(n).padStart(2, '0')

export default function Agenda() {
  const [anioHoy, mesHoy] = hoy().split('-').map(Number)
  // La vista y el día van en la URL: al recargar o compartir el enlace se ve lo mismo
  const [params, setParams] = useSearchParams()
  const vista = ['mes', 'dia', 'lista'].includes(params.get('vista')) ? params.get('vista') : 'mes'
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(params.get('fecha') ?? '') ? params.get('fecha') : hoy()
  const irA = (cambios) => setParams((p) => {
    const n = new URLSearchParams(p)
    Object.entries(cambios).forEach(([k, v]) => n.set(k, v))
    return n
  }, { replace: true })
  const setVista = (v) => irA({ vista: v })
  const [{ anio, mes }, setMes] = useState({ anio: anioHoy, mes: mesHoy })
  const [abiertaId, setAbiertaId] = useState(null)
  const [zona, setZona] = useState('todas')
  const [verCanceladas, setVerCanceladas] = useState(false)
  const { data: zonas } = useZonas()

  const reservaciones = useQuery({ queryKey: ['admin-reservaciones'], queryFn: () => obtenerReservaciones() })
  const bloqueos = useQuery({ queryKey: ['admin-bloqueos'], queryFn: obtenerBloqueos })

  const cambiar = (d) => {
    const total = anio * 12 + (mes - 1) + d
    setMes({ anio: Math.floor(total / 12), mes: (total % 12) + 1 })
  }

  if (reservaciones.isLoading) return <Cargando />
  if (reservaciones.isError) return <ErrorCarga onReintentar={reservaciones.refetch} />

  const prefijo = `${anio}-${dos(mes)}`
  const filtradas = reservaciones.data.filter((r) => (zona === 'todas' || r.zona_id === zona) && (verCanceladas || !['cancelada', 'expirada', 'rechazada'].includes(r.estado)))
  const visibles = filtradas
    .filter((r) => diaDe(r.inicio).startsWith(prefijo))
    .sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
  const abierta = reservaciones.data.find((r) => r.id === abiertaId)

  const offset = (new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() + 6) % 7
  const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: diasMes }, (_, i) => `${prefijo}-${dos(i + 1)}`)]

  const bloqueoDe = (dia) => {
    const ini = new Date(instanteLocal(dia, '00:00'))
    const fin = new Date(instanteLocal(dia, '23:59'))
    return (bloqueos.data ?? []).find((b) => new Date(b.inicio) <= fin && new Date(b.fin) > ini)
  }

  return (
    <>
      <Encabezado titulo="Agenda">
        <Boton tam="sm" variante="secundario" onClick={() => { setVista('lista'); setTimeout(() => window.print(), 100) }} className="print:hidden">
          <Printer className="size-4" /> Imprimir hoja de ruta
        </Boton>
      </Encabezado>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className={`flex items-center gap-1 ${vista === 'dia' ? 'invisible' : ''}`}>
          <button onClick={() => cambiar(-1)} className="inline-flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-linea hover:bg-butaca" aria-label="Mes anterior"><ChevronLeft className="size-4" /></button>
          <button onClick={() => cambiar(1)} className="inline-flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-linea hover:bg-butaca" aria-label="Mes siguiente"><ChevronRight className="size-4" /></button>
          <p className="ml-2 text-lg font-bold first-letter:uppercase">{MESES[mes - 1]} de {anio}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={zona} onChange={(e) => setZona(e.target.value)} className="h-9 rounded-full border border-linea bg-white px-3 text-sm" aria-label="Filtrar por zona">
            <option value="todas">Todas las zonas</option>
            {(zonas ?? []).map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={verCanceladas} onChange={(e) => setVerCanceladas(e.target.checked)} className="accent-selva-600" /> Canceladas
          </label>
          <div className="flex rounded-full bg-white p-1 ring-1 ring-linea" role="group" aria-label="Vista">
            {[['mes', 'Mes'], ['dia', 'Día'], ['lista', 'Lista']].map(([id, t]) => (
              <button key={id} aria-pressed={vista === id} onClick={() => setVista(id)} className={`h-7 rounded-full px-3 text-sm font-medium ${vista === id ? 'bg-selva-600 text-white' : 'text-tinta-soft'}`}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {vista === 'dia' ? (
        <VistaDia dia={dia} onCambiarDia={(d) => irA({ fecha: d })} reservaciones={filtradas} bloqueos={bloqueos.data} onAbrir={setAbiertaId} />
      ) : vista === 'mes' ? (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-linea">
          <div className="grid grid-cols-7 border-b border-linea text-center text-xs font-semibold text-tinta-soft">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => <span key={d} className="py-2">{d}</span>)}
          </div>
          <div className="grid grid-cols-7">
            {celdas.map((celda, i) => {
              if (!celda) return <div key={`v${i}`} className="min-h-24 border-r border-b border-linea bg-butaca/40 sm:min-h-28" />
              const eventos = visibles.filter((r) => diaDe(r.inicio) === celda)
              const bloqueo = bloqueoDe(celda)
              return (
                <div key={celda} className={`min-h-24 border-r border-b border-linea p-1 sm:min-h-28 sm:p-1.5 ${bloqueo ? 'bg-butaca' : ''}`}>
                  <button type="button" onClick={() => irA({ vista: 'dia', fecha: celda })} aria-label={`Ver el día ${Number(celda.slice(8))}`} className={`num inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold hover:ring-2 hover:ring-selva-200 ${celda === hoy() ? 'bg-selva-600 text-white' : ''}`}>{Number(celda.slice(8))}</button>
                  {bloqueo && <p className="mt-0.5 hidden text-[11px] leading-tight text-tinta-soft sm:block">Bloqueado: {bloqueo.motivo}</p>}
                  <div className="mt-0.5 space-y-1">
                    {eventos.map((r) => (
                      <button key={r.id} onClick={() => setAbiertaId(r.id)} className={`block w-full truncate rounded-md px-1 py-0.5 text-left text-[11px] font-semibold ring-1 ring-inset sm:px-1.5 sm:text-xs ${COLOR_ESTADO[r.estado] ?? OTRO}`}>
                        <span className="num hidden sm:inline">{hora(r.inicio)} </span>{r.shows?.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-tinta-soft ring-1 ring-linea">No hay funciones este mes.</div>
      ) : (
        <div className="space-y-6">
          {[...new Set(visibles.map((r) => diaDe(r.inicio)))].map((dia) => {
            const delDia = visibles.filter((r) => diaDe(r.inicio) === dia)
            return (
              <section key={dia}>
                <h2 className="mb-2 text-sm font-semibold text-tinta-soft first-letter:uppercase">{fechaLarga(delDia[0].inicio)}</h2>
                <ul className="divide-y divide-linea overflow-hidden rounded-2xl bg-white ring-1 ring-linea">
                  {delDia.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => setAbiertaId(r.id)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-butaca/60">
                        <span className="num w-20 shrink-0 font-semibold">{hora(r.inicio)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{r.shows?.nombre}</span>
                          <span className="block text-sm text-tinta-soft">{r.clientes?.nombre}, {r.clientes?.telefono}</span>
                          <span className="block text-sm text-tinta-soft">{r.calle}, {r.colonia}, {r.codigo_postal}</span>
                          <span className="num block text-xs text-selva-700">{lineaDesglose(r)}</span>
                        </span>
                        <Estado estado={r.estado} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-tinta-soft print:hidden">
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-selva-50 ring-1 ring-selva-200" /> Confirmada</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-alerta-soft ring-1 ring-alerta/30" /> Pendiente de anticipo</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-butaca ring-1 ring-linea" /> Realizada o día bloqueado</span>
      </div>

      {abierta && <DetalleReservacion key={abierta.id} r={abierta} onCerrar={() => setAbiertaId(null)} />}
    </>
  )
}
