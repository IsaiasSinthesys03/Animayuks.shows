import { fechaDeDia, hora, pesos, saldoDe } from '../../lib/format'

const MIN = 60000
export const VIVAS = ['pendiente', 'confirmada']

/** Los cinco tramos de una reservación, como instantes (Date) */
export function desglose(r) {
  const inicio = new Date(r.inicio)
  const fin = new Date(r.fin)
  const traslado = Number(r.traslado_min) || 0
  const montaje = Number(r.montaje_min) || 0
  const desmontaje = Number(r.desmontaje_min) || 0
  const montajeIni = new Date(inicio - montaje * MIN)
  const salida = new Date(montajeIni - traslado * MIN)
  const desmontajeFin = new Date(+fin + desmontaje * MIN)
  const libre = new Date(+desmontajeFin + traslado * MIN)
  return {
    salida, montajeIni, inicio, fin, desmontajeFin, libre,
    tramos: [
      { tipo: 'ida', desde: salida, hasta: montajeIni, min: traslado },
      { tipo: 'montaje', desde: montajeIni, hasta: inicio, min: montaje },
      { tipo: 'show', desde: inicio, hasta: fin, min: Math.round((fin - inicio) / MIN) },
      { tipo: 'desmontaje', desde: fin, hasta: desmontajeFin, min: desmontaje },
      { tipo: 'regreso', desde: desmontajeFin, hasta: libre, min: traslado },
    ],
  }
}

/** "2 h 40 min", "45 min", "3 h" */
export function duracion(min) {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h && r) return `${h} h ${r} min`
  return h ? `${h} h` : `${r} min`
}

/** "Sale 10:00 · monta 10:30 · show 11:00–12:00 · recoge hasta 12:20 · libre 12:50" */
export function lineaDesglose(r) {
  const d = desglose(r)
  const partes = []
  if (Number(r.traslado_min)) partes.push(`Sale ${hora(d.salida)}`)
  if (Number(r.montaje_min)) partes.push(`monta ${hora(d.montajeIni)}`)
  partes.push(`show ${hora(d.inicio)}–${hora(d.fin)}`)
  if (Number(r.desmontaje_min)) partes.push(`recoge hasta ${hora(d.desmontajeFin)}`)
  partes.push(`libre ${hora(d.libre)}`)
  const texto = partes.join(' · ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Totales del día para las tarjetas de resumen */
export function resumenDia(reservaciones, franjas = []) {
  const vivas = reservaciones.filter((r) => VIVAS.includes(r.estado))
  if (vivas.length === 0) return null
  const ds = vivas.map(desglose).sort((a, b) => a.salida - b.salida)
  const ocupado = ds.reduce((a, d) => a + (d.libre - d.salida) / MIN, 0)
  const traslados = vivas.reduce((a, r) => a + 2 * (Number(r.traslado_min) || 0), 0)
  const montajes = vivas.reduce((a, r) => a + (Number(r.montaje_min) || 0) + (Number(r.desmontaje_min) || 0), 0)
  // Tiempo de servicio (franjas) que no ocupa ningún bloque
  const servicio = franjas.reduce((a, f) => a + (f.finMs - f.inicioMs) / MIN, 0)
  const ocupadoEnServicio = franjas.reduce((a, f) => a + ds.reduce((b, d) => b + Math.max(0, Math.min(+d.libre, f.finMs) - Math.max(+d.salida, f.inicioMs)) / MIN, 0), 0)
  return {
    shows: vivas.length,
    sale: ds[0].salida,
    termina: ds.reduce((a, d) => (d.libre > a ? d.libre : a), ds[0].libre),
    ocupado,
    traslados,
    montajes,
    libre: franjas.length ? Math.max(0, servicio - ocupadoEnServicio) : null,
  }
}

/** Texto para pegar en WhatsApp (los * son negritas) */
export function textoItinerario(dia, reservaciones) {
  const vivas = reservaciones.filter((r) => VIVAS.includes(r.estado)).sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
  const titulo = `*Itinerario · ${fechaDeDia(dia).replace(/ de \d{4}$/, '')}*`
  if (vivas.length === 0) return `${titulo}\nSin funciones.`
  const res = resumenDia(vivas)
  const lineas = [titulo, `${vivas.length} ${vivas.length === 1 ? 'show' : 'shows'} · sale ${hora(res.sale)} · termina ${hora(res.termina)}`]
  vivas.forEach((r, i) => {
    const d = desglose(r)
    const saldo = saldoDe(r)
    const recibe = r.contacto_dia || [r.clientes?.nombre, r.clientes?.telefono].filter(Boolean).join(', ')
    lineas.push(
      '',
      `*${i + 1}) ${hora(r.inicio)} · ${r.shows?.nombre ?? 'Show'}*${r.paquetes?.nombre ? ` (${r.paquetes.nombre})` : ''}`,
      ...[
        Number(r.traslado_min) ? `Salir: ${hora(d.salida)}${r.zonas?.nombre ? ` (${r.zonas.nombre})` : ''}` : null,
        Number(r.montaje_min) ? `Montaje: ${hora(d.montajeIni)}` : null,
        `Show: ${hora(d.inicio)} a ${hora(d.fin)}`,
        `Libre: ${hora(d.libre)}`,
        `Dirección: ${[r.calle, r.colonia, r.codigo_postal].filter(Boolean).join(', ')}`,
        r.referencias ? `Referencias: ${r.referencias}` : null,
        recibe ? `Recibe: ${recibe}` : null,
        saldo > 0 ? `Cobrar: ${pesos(saldo)}` : null,
        r.estado === 'pendiente' ? 'Ojo: todavía sin anticipo' : null,
      ].filter(Boolean),
    )
  })
  return lineas.join('\n')
}

/** Copia al portapapeles; si el navegador no deja, usa un campo temporal */
export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    const campo = document.createElement('textarea')
    campo.value = texto
    campo.setAttribute('readonly', '')
    campo.style.position = 'fixed'
    campo.style.opacity = '0'
    document.body.appendChild(campo)
    campo.select()
    const ok = document.execCommand('copy')
    campo.remove()
    return ok
  }
}
