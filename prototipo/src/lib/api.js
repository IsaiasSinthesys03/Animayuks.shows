import { supabase } from './supabase'

// Mensajes para el usuario según el código con el que empiezan los errores de la base de datos.
const MENSAJES = {
  SESION_REQUERIDA: 'Inicia sesión para continuar.',
  RESERVACIONES_PAUSADAS: 'Por ahora no estamos aceptando reservaciones en línea.',
  CLIENTE_BLOQUEADO: 'Comunícate con nosotros para reservar.',
  HORARIO_OCUPADO: 'Alguien acaba de tomar ese horario. Elige otro.',
  FUERA_DE_COBERTURA: 'Por ahora no damos servicio en ese código postal.',
}

export function mensajeError(error) {
  if (!error) return ''
  const texto = error.message ?? String(error)
  const separador = texto.indexOf(':')
  const codigo = separador > 0 ? texto.slice(0, separador) : ''
  if (MENSAJES[codigo]) return MENSAJES[codigo]
  if (/^[A-Z_]+$/.test(codigo)) return texto.slice(separador + 1).trim()
  if (/failed to fetch|network/i.test(texto)) return 'No pudimos conectarnos. Revisa tu internet e intenta de nuevo.'
  return 'Algo salió mal. Intenta de nuevo en un momento.'
}

async function datos(consulta) {
  const { data, error } = await consulta
  if (error) throw error
  return data
}

export const urlImagen = (ruta) => (ruta ? supabase.storage.from('shows').getPublicUrl(ruta).data.publicUrl : null)

// ── Catálogo ────────────────────────────────────────────────────────────────
const SELECT_SHOW = '*, categorias(nombre), paquetes(*)'
const ordenarPaquetes = (s) => ({ ...s, paquetes: [...(s.paquetes ?? [])].sort((a, b) => a.orden - b.orden) })

export const obtenerShows = async () =>
  (await datos(supabase.from('shows').select(SELECT_SHOW).order('orden'))).map(ordenarPaquetes)

export const obtenerShow = async (slug) => {
  const s = await datos(supabase.from('shows').select(SELECT_SHOW).eq('slug', slug).maybeSingle())
  return s ? ordenarPaquetes(s) : null
}

export const obtenerCategorias = () => datos(supabase.from('categorias').select('*').order('orden'))
export const obtenerExtras = () => datos(supabase.from('extras').select('*').order('orden'))
export const obtenerZonas = () => datos(supabase.from('zonas').select('*').order('nombre'))
export const obtenerConfiguracion = () => datos(supabase.from('configuracion').select('*').eq('id', 1).single())
export const obtenerPagina = (slug) => datos(supabase.from('paginas').select('*').eq('slug', slug).maybeSingle())
export const obtenerPreguntas = () => datos(supabase.from('preguntas_frecuentes').select('*').order('orden'))

// ── Cobertura ───────────────────────────────────────────────────────────────
export const zonaPorCP = async (cp) => {
  const zona = await datos(supabase.rpc('zona_por_cp', { p_cp: cp }))
  return zona?.id ? zona : null
}

export const anotarInteres = (codigo_postal, contacto) =>
  datos(supabase.from('lista_interes').insert({ codigo_postal, contacto: contacto || null }))

// ── Disponibilidad y reservación ────────────────────────────────────────────
export const disponibilidadMes = ({ showId, paqueteId, extras, cp, anio, mes }) =>
  datos(supabase.rpc('disponibilidad_mes', {
    p_show_id: showId, p_paquete_id: paqueteId ?? null, p_extras: extras ?? [], p_codigo_postal: cp, p_anio: anio, p_mes: mes,
  }))

export const horariosDisponibles = ({ showId, paqueteId, extras, cp, fecha }) =>
  datos(supabase.rpc('horarios_disponibles', {
    p_show_id: showId, p_paquete_id: paqueteId ?? null, p_extras: extras ?? [], p_codigo_postal: cp, p_fecha: fecha,
  }))

export const apartarHorario = ({ showId, paqueteId, extras, cp, inicio }) =>
  datos(supabase.rpc('apartar_horario', {
    p_show_id: showId, p_paquete_id: paqueteId ?? null, p_extras: extras ?? [], p_codigo_postal: cp, p_inicio: inicio,
  }))

export const liberarHorario = () => datos(supabase.rpc('liberar_horario'))

export const crearReservacion = (p) => datos(supabase.rpc('crear_reservacion', p))
export const aceptarPaginas = (slugs) => datos(supabase.rpc('aceptar_paginas', { p_slugs: slugs }))

// ── Cuenta del cliente ──────────────────────────────────────────────────────
const SELECT_RESERVACION = '*, shows(nombre, slug, imagen_principal), paquetes(nombre), pagos(*), reservacion_extras(extra_id)'

export const misReservaciones = () =>
  datos(supabase.from('reservaciones').select(SELECT_RESERVACION).order('inicio', { ascending: false }))

export const cancelarReservacion = async (id, motivo) => {
  const filas = await datos(supabase.rpc('cancelar_reservacion', { p_reservacion_id: id, p_motivo: motivo || null }))
  return filas?.[0]
}

export const reprogramarReservacion = (id, inicio, motivo) =>
  datos(supabase.rpc('reprogramar_reservacion', { p_reservacion_id: id, p_nuevo_inicio: inicio, p_motivo: motivo ?? null }))

/** Sube el comprobante a la carpeta del usuario y avisa la transferencia (queda pendiente de aprobar). */
export async function subirComprobante({ usuarioId, reservacionId, archivo, monto, tipo }) {
  const extension = archivo.name.split('.').pop()?.toLowerCase() || 'jpg'
  const ruta = `${usuarioId}/${reservacionId}/${Date.now()}.${extension}`
  const { error } = await supabase.storage.from('comprobantes').upload(ruta, archivo)
  if (error) throw error
  return datos(supabase.from('pagos').insert({
    reservacion_id: reservacionId, monto, metodo: 'Transferencia', estado: 'pendiente', tipo, comprobante_path: ruta,
  }))
}
