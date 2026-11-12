import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, CalendarPlus, Receipt } from 'lucide-react'
import { obtenerPagosPorRevisar, obtenerReservacionesDesde } from '../lib/apiAdmin'
import { fechaCorta, hora, pesos } from '../lib/format'

const REVISAR_CADA = 30 * 1000
const CLAVE_VISTO = 'ay-admin-notificaciones-visto'

const leerVisto = () => {
  try {
    return localStorage.getItem(CLAVE_VISTO) ?? new Date(Date.now() - 86400000).toISOString()
  } catch {
    return new Date(Date.now() - 86400000).toISOString()
  }
}

/** "hace 5 min", "hace 2 h", "ayer" */
export function hace(ts) {
  const min = Math.max(0, Math.round((Date.now() - new Date(ts)) / 60000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

/** Comprobantes por revisar: se consulta sola cada 30 s y al volver a la pestaña */
export function usarPagosPorRevisar(activo = true) {
  return useQuery({
    queryKey: ['admin-pagos', 'por-revisar'],
    enabled: activo,
    queryFn: obtenerPagosPorRevisar,
    refetchInterval: REVISAR_CADA,
    refetchOnWindowFocus: true,
  })
}

/** Bolita roja con el número, para el menú */
export function Bolita({ n, className = '' }) {
  if (!n) return null
  return (
    <span className={`num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[11px] leading-none font-bold text-white ${className}`} aria-label={`${n} por revisar`}>
      {n > 99 ? '99+' : n}
    </span>
  )
}

/** Campana del encabezado: comprobantes por revisar y reservaciones nuevas */
export default function Notificaciones() {
  const [abierto, setAbierto] = useState(false)
  const [visto, setVisto] = useState(leerVisto)
  const caja = useRef(null)
  const pagos = usarPagosPorRevisar()
  const nuevas = useQuery({
    queryKey: ['admin-reservaciones', 'nuevas', visto],
    queryFn: () => obtenerReservacionesDesde(visto),
    refetchInterval: REVISAR_CADA,
    refetchOnWindowFocus: true,
  })

  const nPagos = pagos.data?.length ?? 0
  const listaNuevas = (nuevas.data ?? []).filter((r) => r.canal === 'En línea' && ['pendiente', 'confirmada'].includes(r.estado))
  const total = nPagos + listaNuevas.length

  // El número también aparece en la pestaña del navegador
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, '')
    document.title = total ? `(${total}) ${base}` : base
  }, [total])

  // Cerrar al hacer clic fuera o con Escape
  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false) }
    const esc = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])

  const marcarNuevasVistas = () => {
    const ahora = new Date().toISOString()
    try { localStorage.setItem(CLAVE_VISTO, ahora) } catch { /* sin almacenamiento: se vuelven a mostrar */ }
    setVisto(ahora)
  }

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        aria-label={total ? `Notificaciones: ${total} pendientes` : 'Notificaciones'}
        className="relative inline-flex size-10 items-center justify-center rounded-full hover:bg-butaca"
      >
        <Bell className="size-5" />
        {total > 0 && <Bolita n={total} className="absolute -top-0.5 -right-0.5 ring-2 ring-white" />}
      </button>

      {abierto && (
        <div className="entra absolute right-0 z-40 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-linea">
          <div className="flex items-center justify-between border-b border-linea px-4 py-3">
            <p className="font-semibold">Notificaciones</p>
            {listaNuevas.length > 0 && (
              <button type="button" onClick={marcarNuevasVistas} className="text-sm font-semibold text-selva-700 underline">Marcar nuevas como vistas</button>
            )}
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            <p className="flex items-center gap-2 bg-butaca/60 px-4 py-2 text-xs font-semibold tracking-wide text-tinta-soft uppercase">
              <Receipt className="size-3.5" /> Comprobantes por revisar {nPagos > 0 && <Bolita n={nPagos} />}
            </p>
            {nPagos === 0 && <p className="px-4 py-3 text-sm text-tinta-soft">No hay comprobantes pendientes.</p>}
            <ul className="divide-y divide-linea">
              {(pagos.data ?? []).map((p) => (
                <li key={p.id}>
                  <Link to={`/admin/reservaciones?r=${p.reservacion_id}`} onClick={() => setAbierto(false)} className="flex gap-3 px-4 py-3 hover:bg-butaca/60">
                    <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-error" aria-hidden />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block"><span className="num font-semibold">{pesos(p.monto)}</span> · {p.metodo} · <span className="num">{p.reservaciones?.folio}</span></span>
                      <span className="block truncate text-tinta-soft">{p.reservaciones?.clientes?.nombre} · {p.reservaciones?.shows?.nombre}</span>
                      <span className="num block text-xs text-tinta-soft">{hace(p.creado_en)}{p.reservaciones?.inicio ? ` · evento ${fechaCorta(p.reservaciones.inicio)}, ${hora(p.reservaciones.inicio)}` : ''}</span>
                    </span>
                    <span className="self-center text-sm font-semibold text-selva-700">Revisar</span>
                  </Link>
                </li>
              ))}
            </ul>

            <p className="flex items-center gap-2 bg-butaca/60 px-4 py-2 text-xs font-semibold tracking-wide text-tinta-soft uppercase">
              <CalendarPlus className="size-3.5" /> Reservaciones nuevas en línea
            </p>
            {listaNuevas.length === 0 && <p className="px-4 py-3 text-sm text-tinta-soft">Nada nuevo desde tu última revisión.</p>}
            <ul className="divide-y divide-linea">
              {listaNuevas.map((r) => (
                <li key={r.id}>
                  <Link to={`/admin/reservaciones?r=${r.id}`} onClick={() => setAbierto(false)} className="flex gap-3 px-4 py-3 hover:bg-butaca/60">
                    <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-agua" aria-hidden />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block"><span className="num font-semibold">{r.folio}</span> · {r.shows?.nombre}</span>
                      <span className="block truncate text-tinta-soft">{r.clientes?.nombre} · evento {fechaCorta(r.inicio)}, {hora(r.inicio)}</span>
                      <span className="block text-xs text-tinta-soft">{hace(r.creado_en)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
