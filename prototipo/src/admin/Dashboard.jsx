import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarOff, CircleDollarSign, MailWarning, Plus } from 'lucide-react'
import { correosConProblema, obtenerClientes, obtenerReservaciones, pagosDesde, reintentarCorreo } from '../lib/apiAdmin'
import { diaDe, fechaCorta, hora, hoy, pesos, saldoDe } from '../lib/format'
import { useConfiguracion } from '../lib/consultas'
import { Cargando, ErrorCarga, Estado } from '../components/ui'
import { Encabezado } from './AdminLayout'
import DetalleReservacion from './DetalleReservacion'

const NOMBRES_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export default function Dashboard() {
  const queryClient = useQueryClient()
  const reservaciones = useQuery({ queryKey: ['admin-reservaciones'], queryFn: () => obtenerReservaciones() })
  const clientes = useQuery({ queryKey: ['admin-clientes'], queryFn: obtenerClientes })
  const correos = useQuery({ queryKey: ['admin-correos'], queryFn: correosConProblema })
  const { data: cfg } = useConfiguracion()

  const ahora = new Date()
  const hace6 = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 5, 1))
  const pagos = useQuery({ queryKey: ['admin-pagos', hace6.toISOString()], queryFn: () => pagosDesde(hace6.toISOString()) })
  const [abiertaId, setAbiertaId] = useState(null)

  if (reservaciones.isLoading) return <Cargando />
  if (reservaciones.isError) return <ErrorCarga onReintentar={reservaciones.refetch} />

  const todas = reservaciones.data
  const abierta = todas.find((r) => r.id === abiertaId)
  const activas = todas.filter((r) => ['pendiente', 'confirmada'].includes(r.estado))
  const en7 = new Date(Date.now() + 7 * 86400000)
  const proximas = activas.filter((r) => new Date(r.fin) >= ahora && new Date(r.inicio) <= en7).sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
  const pendientes = activas.filter((r) => r.estado === 'pendiente')
  const comprobantes = activas.flatMap((r) => (r.pagos ?? []).filter((p) => p.estado === 'pendiente').map((p) => ({ ...p, r })))
  const porCobrar = activas.reduce((a, r) => a + saldoDe(r), 0)

  // Ingresos por mes (hora de Guadalajara)
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(hace6.getUTCFullYear(), hace6.getUTCMonth() + i, 1))
    return { clave: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, nombre: NOMBRES_MES[d.getUTCMonth()], total: 0 }
  })
  for (const p of pagos.data ?? []) {
    const m = meses.find((x) => x.clave === diaDe(p.creado_en).slice(0, 7))
    if (m) m.total += p.tipo === 'reembolso' ? -Number(p.monto) : Number(p.monto)
  }
  const maximo = Math.max(...meses.map((m) => m.total), 1)
  const esteMes = meses[meses.length - 1]

  const faltanDatosPago = cfg && !cfg.clabe
  const faltaWhatsapp = cfg && !cfg.whatsapp

  return (
    <>
      <Encabezado titulo="Inicio" descripcion={proximas.length ? `${proximas.length} ${proximas.length === 1 ? 'función' : 'funciones'} en los próximos 7 días.` : 'No hay funciones en los próximos 7 días.'}>
        <Link to="/admin/disponibilidad" className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-linea ring-inset hover:bg-butaca">
          <CalendarOff className="size-4" /> Bloquear fecha
        </Link>
        <Link to="/admin/reservaciones/nueva" className="inline-flex h-10 items-center gap-2 rounded-full bg-telon-600 px-4 text-sm font-semibold text-white hover:bg-telon-700">
          <Plus className="size-4" /> Nueva reservación
        </Link>
      </Encabezado>

      {(faltanDatosPago || faltaWhatsapp) && (
        <Link to="/admin/configuracion" className="mb-6 flex items-center gap-3 rounded-2xl bg-marquesina-soft px-4 py-3 text-[15px] font-medium hover:brightness-[0.98]">
          <AlertTriangle className="size-5 shrink-0" />
          Falta capturar {[faltanDatosPago && 'los datos bancarios', faltaWhatsapp && 'el WhatsApp del negocio'].filter(Boolean).join(' y ')}. Los clientes los necesitan para pagar.
        </Link>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Funciones activas', activas.filter((r) => new Date(r.fin) >= ahora).length, ''],
          ['Cobrado este mes', pesos(esteMes.total), 'text-ok'],
          ['Saldo por cobrar', pesos(porCobrar), porCobrar > 0 ? 'text-alerta' : ''],
          ['Clientes', clientes.data?.length ?? '', ''],
        ].map(([t, v, c]) => (
          <div key={t} className="rounded-2xl bg-white p-4 ring-1 ring-linea">
            <dt className="text-sm text-tinta-soft">{t}</dt>
            <dd className={`num mt-1 text-2xl font-bold ${c}`}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl bg-white ring-1 ring-linea">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="font-bold">Próximas funciones</h2>
            <Link to="/admin/agenda" className="text-sm font-semibold text-telon-700 underline">Abrir agenda</Link>
          </div>
          {proximas.length === 0 ? (
            <p className="px-5 pt-2 pb-5 text-tinta-soft">Cuando alguien reserve, aparecerá aquí.</p>
          ) : (
            <ul className="mt-2 divide-y divide-linea">
              {proximas.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setAbiertaId(r.id)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-butaca/60">
                    <span className="w-24 shrink-0">
                      <span className="block text-sm font-semibold first-letter:uppercase">{diaDe(r.inicio) === hoy() ? 'Hoy' : fechaCorta(r.inicio)}</span>
                      <span className="num block text-sm text-tinta-soft">{hora(r.inicio)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{r.shows?.nombre}</span>
                      <span className="block truncate text-sm text-tinta-soft">{r.clientes?.nombre}{r.zonas?.nombre ? `, ${r.zonas.nombre}` : ''}</span>
                    </span>
                    <span className="hidden text-right sm:block">
                      <Estado estado={r.estado} />
                      {saldoDe(r) > 0 && <span className="num mt-1 block text-xs text-tinta-soft">Saldo {pesos(saldoDe(r))}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
            <h2 className="font-bold">Requiere tu atención</h2>
            {comprobantes.length + pendientes.length + (correos.data?.length ?? 0) === 0 && <p className="mt-2 text-tinta-soft">Todo al día.</p>}
            <ul className="mt-3 space-y-2">
              {comprobantes.map((p) => (
                <li key={p.id}>
                  <button onClick={() => setAbiertaId(p.r.id)} className="flex w-full gap-3 rounded-xl bg-marquesina-soft px-3 py-2.5 text-left text-sm hover:brightness-[0.98]">
                    <CircleDollarSign className="mt-0.5 size-4 shrink-0" />
                    <span>Comprobante de <span className="num font-semibold">{pesos(p.monto)}</span> por revisar: {p.r.folio}</span>
                  </button>
                </li>
              ))}
              {pendientes.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setAbiertaId(r.id)} className="flex w-full gap-3 rounded-xl bg-alerta-soft px-3 py-2.5 text-left text-sm hover:brightness-[0.98]">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alerta" />
                    <span><span className="font-semibold">{r.folio}</span> sin anticipo: {r.shows?.nombre}, {fechaCorta(r.inicio)}</span>
                  </button>
                </li>
              ))}
              {(correos.data ?? []).map((n) => (
                <li key={n.id} className="flex items-start gap-3 rounded-xl bg-telon-50 px-3 py-2.5 text-sm">
                  <MailWarning className="mt-0.5 size-4 shrink-0 text-telon-700" />
                  <span className="min-w-0 flex-1">No salió un correo a {n.destinatario}.{' '}
                    <button className="font-semibold underline" onClick={async () => {
                      await reintentarCorreo(n.id)
                      queryClient.invalidateQueries({ queryKey: ['admin-correos'] })
                    }}>Reintentar</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
            <h2 className="font-bold">Cobrado por mes</h2>
            <div className="mt-4 flex h-40 items-end gap-3" role="img" aria-label={`Cobrado en los últimos seis meses: ${meses.map((m) => `${m.nombre} ${pesos(m.total)}`).join(', ')}`}>
              {meses.map((m, i) => (
                <div key={m.clave} className="flex h-full flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="num text-[11px] text-tinta-soft">{m.total >= 1000 ? `${Math.round(m.total / 1000)}k` : m.total || ''}</span>
                    <div className={`w-full rounded-t-md ${i === meses.length - 1 ? 'bg-telon-600' : 'bg-telon-200'}`} style={{ height: `${(Math.max(m.total, 0) / maximo) * 80}%` }} />
                  </div>
                  <span className="text-xs text-tinta-soft">{m.nombre}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {abierta && <DetalleReservacion key={abierta.id} r={abierta} onCerrar={() => setAbiertaId(null)} />}
    </>
  )
}
