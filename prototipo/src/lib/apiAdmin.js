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
export const guardarCategoria = (nombre) => datos(supabase.from('categorias').insert({ nombre }).select().single())
export const renombrarCategoria = (id, nombre) => datos(supabase.from('categorias').update({ nombre }).eq('id', id))
export const borrarCategoria = (id) => datos(supabase.from('categorias').delete().eq('id', id))

export async function subirImagen(archivo, carpeta) {
  const extension = archivo.name.split('.').pop()?.toLowerCase() || 'jpg'
  const ruta = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${extension}`
  const { error } = await supabase.storage.from('shows').upload(ruta, archivo, { cacheControl: '31536000' })
  if (error) throw error
  return ruta
}

// ── Zonas ───────────────────────────────────────────────────────────────────
export const guardarZona = (id, z) => (id ? datos(supabase.from('zonas').update(z).eq('id', id)) : datos(supabase.from('zonas').insert(z)))
export const borrarZona = (id) => datos(supabase.from('zonas').delete().eq('id', id))

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

// ── Página de inicio ────────────────────────────────────────────────────────
export const guardarContenidoLanding = ({ id: _id, actualizado_en: _a, ...campos }) => datos(supabase.from('landing_contenido').update(campos).eq('id', 1))
export const obtenerBannersAdmin = () => datos(supabase.from('landing_banners').select('*').order('orden'))
export const guardarBanner = (id, b) => (id ? datos(supabase.from('landing_banners').update(b).eq('id', id)) : datos(supabase.from('landing_banners').insert(b)))
export const borrarBanner = (id) => datos(supabase.from('landing_banners').delete().eq('id', id))
export const reordenarBanners = (ids) => datos(supabase.rpc('reordenar_banners', { p_ids: ids }))
export const obtenerVideosAdmin = () => datos(supabase.from('landing_videos').select('*').order('orden'))
export const guardarVideoLanding = (id, v) => (id ? datos(supabase.from('landing_videos').update(v).eq('id', id)) : datos(supabase.from('landing_videos').insert(v)))
export const borrarVideoLanding = (id) => datos(supabase.from('landing_videos').delete().eq('id', id))
export const reordenarVideos = (ids) => datos(supabase.rpc('reordenar_videos', { p_ids: ids }))

/** Reduce la imagen en el navegador y la convierte a WebP, conservando la transparencia */
async function optimizarImagen(archivo) {
  try {
    const bitmap = await createImageBitmap(archivo)
    const escala = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height))
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(bitmap.width * escala)
    lienzo.height = Math.round(bitmap.height * escala)
    lienzo.getContext('2d').drawImage(bitmap, 0, 0, lienzo.width, lienzo.height)
    bitmap.close()
    const blob = await new Promise((listo) => lienzo.toBlob(listo, 'image/webp', 0.85))
    return blob?.type === 'image/webp' ? blob : archivo
  } catch {
    return archivo
  }
}

export async function subirImagenBanner(archivo) {
  const final = await optimizarImagen(archivo)
  const extension = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[final.type] ?? 'webp'
  const ruta = `banners/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from('landing').upload(ruta, final, { cacheControl: '31536000', contentType: final.type })
  if (error) throw error
  return ruta
}

export async function borrarArchivoLanding(ruta) {
  const { error } = await supabase.storage.from('landing').remove([ruta])
  if (error) throw error
}

async function llamarFirma(cuerpo) {
  const { data, error } = await supabase.functions.invoke('firmar-subida', { body: cuerpo })
  if (error) {
    const detalle = await error.context?.json?.().catch(() => null)
    throw new Error(`ALMACENAMIENTO: ${detalle?.error ?? 'No se pudo conectar con el almacenamiento de videos.'}`)
  }
  return data
}

/** Pide permiso a la función y sube el video directo a Cloudflare R2, informando el avance */
export async function subirVideoBanner(archivo, onProgreso) {
  const { url_subida: url, url_publica: publica } = await llamarFirma({ accion: 'subir', tipo: archivo.type, tamano: archivo.size })
  await new Promise((listo, fallo) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', archivo.type)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgreso?.(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? listo() : fallo(new Error('ALMACENAMIENTO: Cloudflare rechazó el video.')))
    xhr.onerror = () => fallo(new Error('ALMACENAMIENTO: Se interrumpió la subida. Revisa tu internet e intenta de nuevo.'))
    xhr.send(archivo)
  })
  return publica
}

export const borrarVideoBanner = (url) => llamarFirma({ accion: 'borrar', url })

export const obtenerMapaZonas = () => datos(supabase.rpc('mapa_zonas_admin'))
export const obtenerCuadriculaCP = () => datos(supabase.rpc('cuadricula_cp_admin'))
export const agregarCpAZona = (zonaId, cp) => datos(supabase.rpc('agregar_cp_a_zona', { p_zona_id: zonaId, p_cp: cp }))
