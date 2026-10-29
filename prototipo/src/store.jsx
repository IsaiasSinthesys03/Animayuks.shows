import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { BLOQUEOS, CLIENTES, HORARIOS, RESERVACIONES } from './data/mock'

// Estado en memoria del prototipo: los datos se reinician al recargar la página.
// La sesión sí se guarda en localStorage para que recargar o abrir /admin directo no la pierda.
const Ctx = createContext(null)
const CLAVE_SESION = 'telon-sesion'

function leerSesion() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_SESION)) ?? null
  } catch {
    return null
  }
}

export function StoreProvider({ children }) {
  const [reservaciones, setReservaciones] = useState(RESERVACIONES)
  const [clientes, setClientes] = useState(CLIENTES)
  const [bloqueos, setBloqueos] = useState(BLOQUEOS)
  const [sesion, setSesionEstado] = useState(leerSesion) // null | { rol: 'cliente' | 'admin' }

  const setSesion = useCallback((s) => {
    setSesionEstado(s)
    try {
      if (s) localStorage.setItem(CLAVE_SESION, JSON.stringify(s))
      else localStorage.removeItem(CLAVE_SESION)
    } catch {
      // Sin almacenamiento disponible: la sesión vive solo en memoria.
    }
  }, [])
  const [aviso, setAviso] = useState(null)

  const avisar = useCallback((texto) => {
    setAviso({ texto, id: Date.now() })
    setTimeout(() => setAviso((a) => (a && a.texto === texto ? null : a)), 3200)
  }, [])

  const agregarReservacion = useCallback((r) => setReservaciones((rs) => [r, ...rs]), [])

  const actualizarReservacion = useCallback(
    (folio, cambios) => setReservaciones((rs) => rs.map((r) => (r.folio === folio ? { ...r, ...cambios } : r))),
    [],
  )

  const agregarCliente = useCallback((c) => setClientes((cs) => [c, ...cs]), [])

  /** Horarios ocupados o bloqueados para una fecha ISO. */
  const ocupacion = useCallback(
    (iso) => {
      const bloqueo = bloqueos.find((b) => b.fecha === iso)
      if (bloqueo) return { bloqueado: bloqueo.motivo, ocupados: HORARIOS }
      const ocupados = reservaciones.filter((r) => r.fecha === iso && r.estado !== 'cancelada').map((r) => r.hora)
      return { bloqueado: null, ocupados }
    },
    [reservaciones, bloqueos],
  )

  const valor = useMemo(
    () => ({
      reservaciones,
      clientes,
      bloqueos,
      setBloqueos,
      sesion,
      setSesion,
      aviso,
      avisar,
      agregarReservacion,
      actualizarReservacion,
      agregarCliente,
      ocupacion,
    }),
    [reservaciones, clientes, bloqueos, sesion, setSesion, aviso, avisar, agregarReservacion, actualizarReservacion, agregarCliente, ocupacion],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)
