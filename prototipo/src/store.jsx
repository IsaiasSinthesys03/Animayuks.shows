import { createContext, useCallback, useContext, useMemo, useState } from 'react'

// Solo avisos en pantalla. Los datos viven en Supabase (ver lib/api.js y lib/consultas.js).
const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [aviso, setAviso] = useState(null)

  const avisar = useCallback((texto) => {
    const id = Date.now()
    setAviso({ texto, id })
    setTimeout(() => setAviso((a) => (a?.id === id ? null : a)), 3500)
  }, [])

  const valor = useMemo(() => ({ aviso, avisar }), [aviso, avisar])
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)
