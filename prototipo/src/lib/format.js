const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

export const pesos = (n) => moneda.format(n)

export const isoFecha = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const deISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const fechaLarga = (iso) =>
  deISO(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export const fechaCorta = (iso) => deISO(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })

export const hora12 = (h) => {
  const [hh, mm] = h.split(':').map(Number)
  const sufijo = hh >= 12 ? 'p. m.' : 'a. m.'
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${sufijo}`
}

export const nuevoFolio = () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)]
  return `SHW-26-${s}`
}
