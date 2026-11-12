import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ClipboardCopy } from 'lucide-react'
import { franjasDeFecha } from '../../lib/apiAdmin'
import { diaDe, fechaDeDia, hora, hoy, instanteLocal, textoMinutos } from '../../lib/format'
import { useStore } from '../../store'
import { Boton } from '../../components/ui'
import { VIVAS, copiar, desglose, duracion, resumenDia, textoItinerario } from './util'

const PX_MIN = 1.2 // 72 px por hora
const MIN = 60000
const RAYAS = 'repeating-linear-gradient(135deg, rgba(94,88,115,.10) 0 6px, transparent 6px 12px)'

/** Un día más o menos, en "YYYY-MM-DD" sin que la zona horaria lo mueva */
export const moverDia = (dia, n) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

const ESTILO_TRAMO = {
  ida: { clase: 'text-tinta-soft', fondo: RAYAS, etiqueta: 'Traslado' },
  montaje: { clase: 'bg-selva-100 text-selva-900', etiqueta: 'Montaje' },
  show: { clase: 'bg-selva-600 text-white', etiqueta: 'Show' },
  desmontaje: { clase: 'bg-selva-100 text-selva-900', etiqueta: 'Desmontaje' },
  regreso: { clase: 'text-tinta-soft', fondo: RAYAS, etiqueta: 'Regreso' },
}

function Tarjeta({ r, top, alto, onAbrir }) {
  const d = desglose(r)
  const pendiente = r.estado === 'pendiente'
  return (
    <button
      type="button"
      onClick={onAbrir}
      style={{ top, height: alto }}
      className={`absolute right-0 left-14 flex flex-col overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 transition-shadow hover:shadow-md sm:left-16 ${pendiente ? 'outline-2 outline-alerta/70 outline-dashed' : 'ring-linea'}`}
      aria-label={`${r.shows?.nombre}, ${hora(d.inicio)}. Sale ${hora(d.salida)}, libre ${hora(d.libre)}`}
    >
      {d.tramos.filter((t) => t.min > 0).map((t) => {
        const e = ESTILO_TRAMO[t.tipo]
        const h = t.min * PX_MIN
        const titulo = `${e.etiqueta} ${hora(t.desde)} a ${hora(t.hasta)} (${duracion(t.min)})`
        return (
          <span key={t.tipo} title={titulo} style={{ height: h, background: e.fondo }} className={`flex shrink-0 items-center gap-2 overflow-hidden px-2.5 text-xs ${e.clase} ${t.tipo === 'show' ? 'font-semibold' : ''}`}>
            {t.tipo === 'show' ? (
              h >= 30 ? (
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm">{hora(t.desde)}–{hora(t.hasta)} · {r.shows?.nombre}{r.minutos_extra > 0 ? ` · +${textoMinutos(r.minutos_extra)} extra` : ''}</span>
                  {h >= 50 && <span className="block truncate font-normal opacity-90">{r.folio} · {r.clientes?.nombre} · {r.colonia}{pendiente ? ' · sin anticipo' : ''}</span>}
                </span>
              ) : (
                <span className="truncate">{hora(t.desde)} {r.shows?.nombre}</span>
              )
            ) : h >= 16 ? (
              <span className="truncate">
                <span className="font-semibold">{e.etiqueta}</span> {hora(t.desde)}
                {t.tipo === 'ida' && r.zonas?.nombre ? ` · ${r.zonas.nombre}` : ''}
                {t.tipo === 'regreso' ? ` · libre ${hora(t.hasta)}` : ''}
              </span>
            ) : null}
          </span>
        )
      })}
    </button>
  )
}

/** Vista Día: línea de tiempo con traslado, montaje, show, desmontaje y regreso */
export default function VistaDia({ dia, onCambiarDia, reservaciones, bloqueos, onAbrir }) {
  const { avisar } = useStore()
  const franjas = useQuery({ queryKey: ['admin-franjas-fecha', dia], queryFn: () => franjasDeFecha(dia), staleTime: 60 * 1000 })
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const cero = Date.parse(instanteLocal(dia, '00:00'))
  const aMin = (ts) => (new Date(ts).getTime() - cero) / MIN
  const delDia = reservaciones.filter((r) => diaDe(r.inicio) === dia).sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
  const vivas = delDia.filter((r) => VIVAS.includes(r.estado) || r.estado === 'realizada')
  const otras = delDia.filter((r) => !vivas.includes(r))

  const listaFranjas = (franjas.data ?? []).map((f) => {
    const [ah, am] = f.abre.split(':').map(Number)
    const [ch, cm] = f.cierra.split(':').map(Number)
    return { ini: ah * 60 + am, fin: ch * 60 + cm, especial: f.especial, inicioMs: cero + (ah * 60 + am) * MIN, finMs: cero + (ch * 60 + cm) * MIN }
  })
  const bloqueosDia = (bloqueos ?? [])
    .map((b) => ({ ...b, ini: Math.max(0, aMin(b.inicio)), fin: Math.min(24 * 60, aMin(b.fin)) }))
    .filter((b) => b.fin > 0 && b.ini < 24 * 60 && b.fin > b.ini)

  // Rango visible: desde lo más temprano hasta lo más tarde, con media hora de margen
  const ds = vivas.map((r) => ({ r, d: desglose(r) }))
  const puntos = [
    ...listaFranjas.flatMap((f) => [f.ini, f.fin]),
    ...ds.flatMap(({ d }) => [aMin(d.salida), aMin(d.libre)]),
    ...otras.flatMap((r) => [aMin(r.inicio), aMin(r.fin)]),
  ]
  const desde = Math.max(0, Math.floor(((puntos.length ? Math.min(...puntos) : 8 * 60) - 30) / 60) * 60)
  const hasta = Math.min(24 * 60, Math.ceil(((puntos.length ? Math.max(...puntos) : 21 * 60) + 30) / 60) * 60)
  const y = (min) => (min - desde) * PX_MIN
  const alto = (hasta - desde) * PX_MIN

  const resumen = resumenDia(vivas.filter((r) => VIVAS.includes(r.estado)), listaFranjas)
  const especial = listaFranjas.some((f) => f.especial)
  const minAhora = (ahora - cero) / MIN
  const esHoy = dia === hoy()

  // Huecos libres entre bloques consecutivos
  const vivosOrden = ds.filter(({ r }) => VIVAS.includes(r.estado)).sort((a, b) => a.d.salida - b.d.salida)
  const huecos = vivosOrden.slice(1).map(({ d }, i) => ({ ini: aMin(vivosOrden[i].d.libre), fin: aMin(d.salida) })).filter((h) => h.fin - h.ini >= 10)

  const copiarItinerario = async () => {
    const ok = await copiar(textoItinerario(dia, delDia))
    avisar(ok ? 'Itinerario copiado. Pégalo en WhatsApp.' : 'No se pudo copiar. Intenta de nuevo.')
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <button onClick={() => onCambiarDia(moverDia(dia, -1))} className="inline-flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-linea hover:bg-butaca" aria-label="Día anterior"><ChevronLeft className="size-4" /></button>
          <button onClick={() => onCambiarDia(moverDia(dia, 1))} className="inline-flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-linea hover:bg-butaca" aria-label="Día siguiente"><ChevronRight className="size-4" /></button>
          {!esHoy && <button onClick={() => onCambiarDia(hoy())} className="ml-1 h-9 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-linea hover:bg-butaca">Hoy</button>}
          <p className="ml-2 text-lg font-bold first-letter:uppercase">{fechaDeDia(dia)}</p>
          {especial && <span className="ml-1 rounded-full bg-maiz-soft px-2 py-0.5 text-xs font-semibold">Día especial</span>}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={dia} onChange={(e) => e.target.value && onCambiarDia(e.target.value)} aria-label="Ir a la fecha" className="h-9 rounded-full border border-linea bg-white px-3 text-sm" />
          <Boton tam="sm" onClick={copiarItinerario} disabled={!resumen}><ClipboardCopy className="size-4" /> Copiar itinerario</Boton>
        </div>
      </div>

      {resumen && (
        <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Shows', resumen.shows],
            ['Sale', hora(resumen.sale)],
            ['Termina', hora(resumen.termina)],
            ['Equipo ocupado', duracion(resumen.ocupado)],
            ['En traslados', duracion(resumen.traslados)],
            resumen.libre !== null ? ['Libre en horario', duracion(resumen.libre)] : ['Montaje y desmontaje', duracion(resumen.montajes)],
          ].map(([t, v]) => (
            <div key={t} className="rounded-xl bg-white px-3 py-2 ring-1 ring-linea">
              <dt className="text-xs text-tinta-soft">{t}</dt>
              <dd className="num text-base font-bold">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="rounded-2xl bg-white p-3 ring-1 ring-linea sm:p-4">
        {delDia.length === 0 && (
          <p className="mb-3 text-sm text-tinta-soft">No hay funciones este día.{listaFranjas.length ? ' En verde, el horario de servicio.' : ' Este día no hay horario de servicio.'}</p>
        )}
        <div className="relative" style={{ height: alto }}>
          {/* Horas */}
          {Array.from({ length: (hasta - desde) / 60 + 1 }, (_, i) => desde + i * 60).map((m) => (
            <div key={m} className="absolute right-0 left-0 border-t border-linea/70" style={{ top: y(m) }}>
              <span className="num absolute -top-2.5 left-0 w-12 bg-white pr-1 text-right text-[11px] text-tinta-soft sm:w-14">
                {hora(cero + m * MIN).replace(':00', '')}
              </span>
            </div>
          ))}
          {/* Horario de servicio */}
          {listaFranjas.map((f) => (
            <div key={`${f.ini}-${f.fin}`} className="absolute right-0 left-14 rounded-lg bg-selva-50 sm:left-16" style={{ top: y(f.ini), height: (f.fin - f.ini) * PX_MIN }} aria-hidden />
          ))}
          {/* Bloqueos */}
          {bloqueosDia.map((b) => (
            <div key={b.id} className="absolute right-0 left-14 flex items-start rounded-lg bg-butaca/80 px-2 py-1 text-xs text-tinta-soft sm:left-16" style={{ top: y(Math.max(b.ini, desde)), height: (Math.min(b.fin, hasta) - Math.max(b.ini, desde)) * PX_MIN, backgroundImage: RAYAS }}>
              Bloqueado: {b.motivo}
            </div>
          ))}
          {/* Huecos libres */}
          {huecos.map((h) => (
            <div key={h.ini} className="absolute right-0 left-14 flex items-center justify-center sm:left-16" style={{ top: y(h.ini), height: (h.fin - h.ini) * PX_MIN }}>
              <span className="rounded-full border border-dashed border-selva-500/60 bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-selva-700">Libre {duracion(h.fin - h.ini)}</span>
            </div>
          ))}
          {/* Reservaciones */}
          {ds.map(({ r, d }) => (
            <Tarjeta key={r.id} r={r} top={y(aMin(d.salida))} alto={Math.max((d.libre - d.salida) / MIN * PX_MIN, 24)} onAbrir={() => onAbrir(r.id)} />
          ))}
          {/* Canceladas (solo con el filtro): no ocupan tiempo */}
          {otras.map((r) => (
            <button key={r.id} type="button" onClick={() => onAbrir(r.id)} style={{ top: y(aMin(r.inicio)) }} className="absolute right-2 h-6 rounded-full bg-white px-2.5 text-xs text-tinta-soft/70 line-through ring-1 ring-linea">
              {hora(r.inicio)} {r.shows?.nombre}
            </button>
          ))}
          {/* Ahora */}
          {esHoy && minAhora >= desde && minAhora <= hasta && (
            <div className="pointer-events-none absolute right-0 left-12 border-t-2 border-error sm:left-14" style={{ top: y(minAhora) }} aria-label="Ahora">
              <span className="absolute -top-1.5 -left-1.5 size-3 rounded-full bg-error" />
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-tinta-soft">
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded ring-1 ring-linea" style={{ background: RAYAS }} /> Traslado</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-selva-100" /> Montaje y desmontaje</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-selva-600" /> Show</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-selva-50 ring-1 ring-linea" /> Horario de servicio</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded outline-2 outline-alerta/70 outline-dashed" /> Sin anticipo</span>
      </div>
    </div>
  )
}
