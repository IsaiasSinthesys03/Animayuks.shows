const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2, minimumFractionDigits: 0 })

export const pesos = (n) => moneda.format(Number(n) || 0)

// El negocio opera en hora de Guadalajara, sin importar dónde esté quien mira la página
export const ZONA_HORARIA = 'America/Mexico_City'

const conZona = (opciones) => new Intl.DateTimeFormat('es-MX', { timeZone: ZONA_HORARIA, ...opciones })
const fLarga = conZona({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const fCorta = conZona({ weekday: 'short', day: 'numeric', month: 'short' })
const fHora = conZona({ hour: 'numeric', minute: '2-digit', hour12: true })
const fDia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' })

/** "sábado, 14 de noviembre de 2026" a partir de un timestamp */
export const fechaLarga = (ts) => fLarga.format(new Date(ts))
export const fechaCorta = (ts) => fCorta.format(new Date(ts))
/** "4:00 p.m." */
export const hora = (ts) => fHora.format(new Date(ts))
/** "2026-11-14": el día en Guadalajara */
export const diaDe = (ts) => fDia.format(new Date(ts))
export const hoy = () => diaDe(new Date())

/** Convierte "YYYY-MM-DD" a texto largo sin que la zona horaria lo mueva de día */
export const fechaDeDia = (dia) => fLarga.format(new Date(`${dia}T18:00:00Z`))

/** Convierte día y hora de Guadalajara ("2026-11-14", "16:00") a instante. México usa UTC−6 todo el año. */
export const instanteLocal = (dia, horaTexto) => new Date(`${dia}T${horaTexto}:00-06:00`).toISOString()

export const saldoDe = (r) => Math.max(Number(r.total) - Number(r.total_pagado), 0)
