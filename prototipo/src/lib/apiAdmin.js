import { supabase } from './supabase'

async function datos(consulta) {
  const { data, error } = await consulta
  if (error) throw error
  return data
}

// ── Reservaciones ───────────────────────────────────────────────────────────
const SELECT_RESERVACION =
  '*, clientes(id, nombre, telefono, correo), shows(nombre, slug, imagen_principal), paquetes(nombre), zonas(nombre), pagos(*), notas_reservacion(*), reservacion_extras(extra_id, precio_unitario, extras(nombre))'

export const obtenerReservaciones = ({ desde, hasta } = {}) => {
  let q = supabase.from('reservaciones').select(SELECT_RESERVACION).order('inicio', { ascending: false })
  if (desde) q = q.gte('inicio', desde)
  if (hasta) q = q.lt('inicio', hasta)
  return datos(q)
}

export const cambiarEstadoReservacion = (id, estado) => datos(supabase.from('reservaciones').update({ estado }).eq('id', id))
export const agregarNota = (reservacion_id, texto, autor_id) => datos(supabase.from('notas_reservacion').insert({ reservacion_id, texto, autor_id }))

// ── Pagos ───────────────────────────────────────────────────────────────────
export const registrarPago = (p) => datos(supabase.from('pagos').insert(p))
export const resolverPago = (id, estado, nota) => datos(supabase.from('pagos').update({ estado, ...(nota ? { nota } : {}) }).eq('id', id))
export const urlComprobante = async (ruta) => {
  const { data, error } = await supabase.storage.from('comprobantes').createSignedUrl(ruta, 300)
  if (error) throw error
  return data.signedUrl
}
export const pagosDesde = (desde) =>
  datos(supabase.from('pagos').select('monto, tipo, estado, creado_en').eq('estado', 'aprobado').gte('creado_en', desde))

// ── Clientes ────────────────────────────────────────────────────────────────
export const obtenerClientes = () =>
  datos(supabase.from('clientes').select('*, reservaciones(id, folio, inicio, estado, total, total_pagado, shows(nombre))').order('nombre'))
export const crearCliente = (c) => datos(supabase.from('clientes').insert(c).select().single())
export const actualizarCliente = (id, c) => datos(supabase.from('clientes').update(c).eq('id', id))

// ── Catálogo ────────────────────────────────────────────────────────────────
export const guardarShow = (id, s) =>
  id ? datos(supabase.from('shows').update(s).eq('id', id).select().single()) : datos(supabase.from('shows').insert(s).select().single())
export const guardarPaquete = (id, p) => (id ? datos(supabase.from('paquetes').update(p).eq('id', id)) : datos(supabase.from('paquetes').insert(p)))
export const borrarPaquete = (id) => datos(supabase.from('paquetes').delete().eq('id', id))
export const guardarExtra = (id, e) => (id ? datos(supabase.from('extras').update(e).eq('id', id)) : datos(supabase.from('extras').insert(e)))
export const guardarCategoria = (nombre) => datos(supabase.from('categorias').insert({ nombre }))

export async function subirImagen(archivo, carpeta) {
  const extension = archivo.name.split('.').pop()?.toLowerCase() || 'jpg'
  const ruta = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${extension}`
  const { error } = await supabase.storage.from('shows').upload(ruta, archivo, { cacheControl: '31536000' })
  if (error) throw error
  return ruta
}

// ── Zonas ───────────────────────────────────────────────────────────────────
export const guardarZona = (id, z) => (id ? datos(supabase.from('zonas').update(z).eq('id', id)) : datos(supabase.from('zonas').insert(z)))

// ── Horarios y bloqueos ─────────────────────────────────────────────────────
export const obtenerHorario = () => datos(supabase.from('horario_servicio').select('*').order('dia_semana'))
export const guardarHorario = (filas) => datos(supabase.from('horario_servicio').upsert(filas))
export const obtenerBloqueos = () => datos(supabase.from('bloqueos').select('*').order('inicio'))
export const crearBloqueo = (b) => datos(supabase.from('bloqueos').insert(b))
export const borrarBloqueo = (id) => datos(supabase.from('bloqueos').delete().eq('id', id))

// ── Configuración y contenido ───────────────────────────────────────────────
export const guardarConfiguracion = (c) => datos(supabase.from('configuracion').update(c).eq('id', 1))
export const obtenerPaginas = () => datos(supabase.from('paginas').select('*').order('titulo'))
export const guardarPagina = (slug, p) => datos(supabase.from('paginas').update(p).eq('slug', slug))
export const guardarPregunta = (id, p) =>
  id ? datos(supabase.from('preguntas_frecuentes').update(p).eq('id', id)) : datos(supabase.from('preguntas_frecuentes').insert(p))
export const borrarPregunta = (id) => datos(supabase.from('preguntas_frecuentes').delete().eq('id', id))

// ── Correos ─────────────────────────────────────────────────────────────────
export const correosConProblema = () =>
  datos(supabase.from('notificaciones').select('id, plantilla, destinatario, error, creado_en').eq('estado', 'fallida').order('id', { ascending: false }).limit(20))
export const reintentarCorreo = (id) => datos(supabase.rpc('reintentar_correo', { p_id: id }))

/** Descarga filas como CSV que Excel abre con acentos correctos. */
export function descargarCSV(nombre, encabezados, filas) {
  const celda = (v) => {
    const t = String(v ?? '')
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const texto = [encabezados, ...filas].map((f) => f.map(celda).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
