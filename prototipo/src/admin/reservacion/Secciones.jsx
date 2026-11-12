import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { aceptacionesDe, historialReservacion, obtenerPaginas } from '../../lib/apiAdmin'
import { fechaLarga, hora, pesos, textoMinutos } from '../../lib/format'
import { ESTADOS } from '../../components/ui'
import { lineaDesglose } from '../agenda/util'

const fechaHora = (ts) => `${fechaLarga(ts).replace(/^[^,]+, /, '')}, ${hora(ts)}`
const TIPO_PAGO = { anticipo: 'Anticipo', abono: 'Abono', liquidacion: 'Liquidación', reembolso: 'Reembolso' }
const NOMBRE_DOC = { 'aviso-de-privacidad': 'Aviso de privacidad', terminos: 'Términos y condiciones', 'politica-de-cancelacion': 'Política de cancelación' }

/** Sección plegable del detalle */
export function Plegable({ titulo, resumen, abierta = false, children }) {
  return (
    <details open={abierta} className="group rounded-2xl ring-1 ring-linea">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold">{titulo}</span>
        <span className="flex items-center gap-2 text-sm text-tinta-soft">
          {resumen && <span className="num truncate">{resumen}</span>}
          <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <div className="border-t border-linea px-4 py-3">{children}</div>
    </details>
  )
}

function Fila({ etiqueta, children, fuerte = false }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="flex justify-between gap-4 py-1 text-[15px]">
      <dt className="shrink-0 text-tinta-soft">{etiqueta}</dt>
      <dd className={`min-w-0 text-right ${fuerte ? 'font-bold' : ''}`}>{children}</dd>
    </div>
  )
}

/** Ocasión, festejado, tipo de evento, invitados, espacio y horarios del equipo */
export function SeccionEvento({ r }) {
  const duracion = Math.round((new Date(r.fin) - new Date(r.inicio)) / 60000)
  const tipo = r.modalidad_nombre
    ? `${r.modalidad_nombre} (+${pesos(r.cargo_modalidad)})`
    : r.shows?.pide_modalidad ? 'Ninguno de estos (sin cargo)' : 'No aplica para este show'
  return (
    <Plegable titulo="Evento" resumen={`${r.tipo_evento ?? 'Evento'}${r.asistentes ? ` · ${r.asistentes} invitados` : ''}`} abierta>
      <dl className="divide-y divide-linea/60">
        <Fila etiqueta="Ocasión">{r.tipo_evento}</Fila>
        <Fila etiqueta="Festejado">{r.festejado}</Fila>
        <Fila etiqueta="Tipo de evento">{tipo}</Fila>
        <Fila etiqueta="Invitados aprox.">{r.asistentes}</Fila>
        <Fila etiqueta="Espacio">{r.espacio}</Fila>
        <Fila etiqueta="Show">{`${hora(r.inicio)} a ${hora(r.fin)} (${r.minutos_extra > 0 ? `${textoMinutos(duracion - r.minutos_extra)} + ${textoMinutos(r.minutos_extra)} extra` : `${duracion} min`})`}</Fila>
        <Fila etiqueta="Equipo">{<span className="num text-sm">{lineaDesglose(r)}</span>}</Fila>
        <Fila etiqueta="Recibe">{r.contacto_dia}</Fila>
        <Fila etiqueta="Referencias">{r.referencias}</Fila>
        <Fila etiqueta="Comentarios">{r.comentarios}</Fila>
      </dl>
    </Plegable>
  )
}

/** Desglose de lo que se cobró */
export function SeccionCobro({ r, anticipoPct }) {
  const extras = (r.reservacion_extras ?? []).map((e) => e.extras?.nombre).filter(Boolean)
  const descuento = Number(r.descuento) || 0
  return (
    <Plegable titulo="Cobro" resumen={`Total ${pesos(r.total)}`} abierta>
      <dl className="num">
        <Fila etiqueta={r.paquetes?.nombre ? `Show, paquete ${r.paquetes.nombre.toLowerCase()}` : 'Show'}>{pesos(r.precio_show)}</Fila>
        {Number(r.minutos_extra) > 0 && <Fila etiqueta={`Tiempo extra (${textoMinutos(r.minutos_extra)} × ${pesos(r.precio_hora_extra)}/h)`}>{pesos(r.cargo_horas_extra)}</Fila>}
        {Number(r.precio_extras) > 0 && <Fila etiqueta={`Extras${extras.length ? ` (${extras.join(', ')})` : ''}`}>{pesos(r.precio_extras)}</Fila>}
        {r.modalidad_nombre && <Fila etiqueta={`Tipo de evento: ${r.modalidad_nombre}`}>{pesos(r.cargo_modalidad)}</Fila>}
        <Fila etiqueta={`Traslado${r.zonas?.nombre ? ` (${r.zonas.nombre})` : ''}`}>{Number(r.cargo_traslado) ? pesos(r.cargo_traslado) : 'Sin costo'}</Fila>
        {descuento > 0 && <Fila etiqueta="Descuento">{`−${pesos(descuento)}`}</Fila>}
        <div className="mt-1 border-t border-linea pt-1">
          <Fila etiqueta="Total" fuerte>{pesos(r.total)}</Fila>
        </div>
        <Fila etiqueta={`Anticipo requerido${anticipoPct ? ` (${Math.round((Number(r.anticipo_requerido) / Math.max(Number(r.total), 1)) * 100)} %)` : ''}`}>{pesos(r.anticipo_requerido)}</Fila>
      </dl>
    </Plegable>
  )
}

/** Detalle de un pago: fecha, tipo, referencia y motivo de rechazo */
export function DetallePago({ p }) {
  return (
    <p className="mt-0.5 text-xs text-tinta-soft">
      {fechaHora(p.creado_en)} · {TIPO_PAGO[p.tipo] ?? p.tipo}
      {p.referencia ? ` · Ref. ${p.referencia}` : ''}
      {p.nota ? ` · ${p.estado === 'rechazado' ? 'Motivo' : 'Nota'}: ${p.nota}` : ''}
    </p>
  )
}

/** Fechas de control, cambios de fecha, cancelación, reembolso y documentos aceptados */
export function SeccionPolitica({ r, cfg }) {
  const aceptaciones = useQuery({ queryKey: ['admin-aceptaciones-cliente', r.clientes?.usuario_id], queryFn: () => aceptacionesDe(r.clientes.usuario_id), enabled: !!r.clientes?.usuario_id })
  const paginas = useQuery({ queryKey: ['admin-paginas'], queryFn: obtenerPaginas })
  const dias = (new Date(r.inicio) - Date.now()) / 86400000
  const activa = ['pendiente', 'confirmada'].includes(r.estado)
  const conReembolso = dias >= Number(cfg?.cancelacion_dias_reembolso ?? 7)
  const reembolso = conReembolso ? Number(r.total_pagado) * (1 - Number(cfg?.cancelacion_comision_pct ?? 5) / 100) : 0
  // La versión más reciente aceptada de cada documento
  const ultimas = Object.values((aceptaciones.data ?? []).reduce((a, x) => (a[x.slug] && a[x.slug].version >= x.version ? a : { ...a, [x.slug]: x }), {}))

  return (
    <Plegable titulo="Control y políticas" resumen={`${r.reprogramaciones} de ${cfg?.reprogramaciones_max ?? 1} cambios de fecha`}>
      <dl className="divide-y divide-linea/60">
        <Fila etiqueta="Folio">{<span className="num">{r.folio}</span>}</Fila>
        <Fila etiqueta="Reservada">{`${fechaHora(r.creado_en)} · ${r.canal}`}</Fila>
        {r.estado === 'pendiente' && r.expira_en && <Fila etiqueta="Vence sin anticipo">{fechaHora(r.expira_en)}</Fila>}
        <Fila etiqueta="Cambios de fecha">{`${r.reprogramaciones} de ${cfg?.reprogramaciones_max ?? 1} permitidos`}</Fila>
        <Fila etiqueta="Última modificación">{fechaHora(r.actualizado_en)}</Fila>
        {r.cancelada_en && <Fila etiqueta="Cancelada">{fechaHora(r.cancelada_en)}</Fila>}
        {r.estado === 'cancelada' && <Fila etiqueta="Motivo">{r.motivo_cancelacion || 'Sin motivo'}</Fila>}
        {activa && (
          <Fila etiqueta="Si se cancela hoy">
            {Number(r.total_pagado) <= 0 ? 'No hay pagos que reembolsar'
              : conReembolso ? `Reembolso de ${pesos(reembolso)} (pagado ${pesos(r.total_pagado)} − ${cfg?.cancelacion_comision_pct ?? 5} %)`
              : `Sin reembolso (faltan menos de ${cfg?.cancelacion_dias_reembolso ?? 7} días)`}
          </Fila>
        )}
      </dl>

      <p className="mt-3 text-sm font-semibold">Documentos aceptados por el cliente</p>
      {aceptaciones.isLoading && <p className="text-sm text-tinta-soft">Cargando…</p>}
      {aceptaciones.data && ultimas.length === 0 && <p className="text-sm text-tinta-soft">No hay aceptaciones registradas (por ejemplo, reservaciones capturadas en el panel).</p>}
      <ul className="mt-1 space-y-1 text-sm">
        {ultimas.map((a) => {
          const vigente = paginas.data?.find((p) => p.slug === a.slug)?.version
          return (
            <li key={a.slug} className="flex flex-wrap justify-between gap-x-3">
              <span>{NOMBRE_DOC[a.slug] ?? a.slug} <span className="num text-tinta-soft">v{a.version}</span></span>
              <span className="num text-tinta-soft">
                {fechaHora(a.aceptado_en)}
                {vigente && vigente !== a.version ? <span className="ml-1 font-semibold text-alerta">(vigente: v{vigente})</span> : null}
              </span>
            </li>
          )
        })}
      </ul>
    </Plegable>
  )
}

const ESTADO_PAGO = { aprobado: 'aprobado', rechazado: 'rechazado', pendiente: 'por revisar' }

/** Una entrada de la bitácora, en palabras */
function describir(h) {
  const c = h.cambios ?? {}
  const nuevo = (k) => c[k]?.[1]
  if (h.entidad === 'pagos') {
    if (h.accion === 'insert') return `Pago registrado: ${pesos(nuevo('monto'))} ${nuevo('metodo') ?? ''} (${TIPO_PAGO[nuevo('tipo')] ?? nuevo('tipo')}), ${ESTADO_PAGO[nuevo('estado')] ?? nuevo('estado')}`
    if (h.accion === 'delete') return 'Pago eliminado'
    const partes = []
    if (c.estado) partes.push(`Pago ${ESTADO_PAGO[c.estado[1]] ?? c.estado[1]}`)
    if (c.monto) partes.push(`monto ${pesos(c.monto[0])} → ${pesos(c.monto[1])}`)
    if (c.nota && c.nota[1]) partes.push(`motivo: ${c.nota[1]}`)
    return partes.join(' · ') || 'Pago actualizado'
  }
  if (h.accion === 'insert') return `Reservación creada (${ESTADOS[nuevo('estado')]?.etiqueta.toLowerCase() ?? nuevo('estado')}), total ${pesos(nuevo('total'))}`
  if (h.accion === 'delete') return 'Reservación eliminada'
  const partes = []
  if (c.estado) partes.push(`Estado: ${ESTADOS[c.estado[0]]?.etiqueta ?? c.estado[0]} → ${ESTADOS[c.estado[1]]?.etiqueta ?? c.estado[1]}`)
  if (c.inicio) partes.push(`Fecha: ${fechaHora(c.inicio[0])} → ${fechaHora(c.inicio[1])}`)
  if (c.total) partes.push(`Total: ${pesos(c.total[0])} → ${pesos(c.total[1])}`)
  if (c.descuento) partes.push(`Descuento: ${pesos(c.descuento[1])}`)
  if (c.calle || c.colonia || c.codigo_postal) partes.push('Dirección actualizada')
  if (c.motivo_cancelacion && c.motivo_cancelacion[1]) partes.push(`Motivo de cancelación: ${c.motivo_cancelacion[1]}`)
  if (c.motivo_excepcion && c.motivo_excepcion[1]) partes.push(`Excepción: ${c.motivo_excepcion[1]}`)
  return partes.join(' · ') || 'Reservación actualizada'
}

/** Línea de tiempo de todo lo que le pasó a la reservación */
export function SeccionHistorial({ r }) {
  const historial = useQuery({ queryKey: ['admin-historial', r.id, r.actualizado_en, (r.pagos ?? []).length], queryFn: () => historialReservacion(r.id) })
  const lista = historial.data ?? []
  return (
    <Plegable titulo="Historial" resumen={historial.data ? `${lista.length} ${lista.length === 1 ? 'movimiento' : 'movimientos'}` : ''}>
      {historial.isLoading && <p className="text-sm text-tinta-soft">Cargando…</p>}
      {historial.isError && <p className="text-sm text-error">No se pudo cargar el historial.</p>}
      <ol className="relative space-y-3 border-l border-linea pl-4">
        {lista.map((h, i) => (
          <li key={i} className="text-sm">
            <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-selva-500" aria-hidden />
            <p>{describir(h)}</p>
            <p className="num text-xs text-tinta-soft">{fechaHora(h.creado_en)} · {h.quien}</p>
          </li>
        ))}
      </ol>
    </Plegable>
  )
}
