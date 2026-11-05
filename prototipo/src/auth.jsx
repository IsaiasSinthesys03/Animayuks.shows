import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './lib/supabase'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [sesion, setSesion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [recuperando, setRecuperando] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setCargando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((evento, nueva) => {
      setSesion(nueva)
      setCargando(false)
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
      if (evento === 'SIGNED_OUT') queryClient.clear()
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const usuarioId = sesion?.user?.id ?? null

  const perfil = useQuery({
    queryKey: ['perfil', usuarioId],
    enabled: !!usuarioId,
    queryFn: async () => {
      const [{ data: p, error: e1 }, { data: c, error: e2 }] = await Promise.all([
        supabase.from('perfiles').select('rol').eq('id', usuarioId).maybeSingle(),
        supabase.from('clientes').select('*').eq('usuario_id', usuarioId).maybeSingle(),
      ])
      if (e1) throw e1
      if (e2) throw e2
      return { rol: p?.rol ?? 'cliente', cliente: c }
    },
  })

  const valor = useMemo(
    () => ({
      sesion,
      usuario: sesion?.user ?? null,
      rol: perfil.data?.rol ?? null,
      cliente: perfil.data?.cliente ?? null,
      esAdmin: perfil.data?.rol === 'admin',
      // Hay sesión pero aún no sabemos su rol: no decidir permisos todavía
      cargando: cargando || (!!usuarioId && perfil.isLoading),
      recuperando,
      terminarRecuperacion: () => setRecuperando(false),
    }),
    [sesion, perfil.data, perfil.isLoading, cargando, usuarioId, recuperando],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

const origen = () => window.location.origin

export const entrar = async ({ correo, contrasena, captchaToken }) => {
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena, options: { captchaToken } })
  if (error) throw error
}

export const registrar = async ({ nombre, telefono, correo, contrasena, captchaToken, siguiente }) => {
  const { data, error } = await supabase.auth.signUp({
    email: correo,
    password: contrasena,
    options: { captchaToken, emailRedirectTo: `${origen()}${siguiente ?? '/mi-cuenta'}`, data: { nombre, telefono } },
  })
  if (error) throw error
  // Supabase no revela si el correo ya existe: devuelve un usuario sin identidades
  if (data.user && data.user.identities?.length === 0) {
    const e = new Error('Ese correo ya tiene cuenta. Entra o recupera tu contraseña.')
    e.code = 'correo_existente'
    throw e
  }
  return data
}

export const recuperarContrasena = async ({ correo, captchaToken }) => {
  const { error } = await supabase.auth.resetPasswordForEmail(correo, { redirectTo: `${origen()}/restablecer`, captchaToken })
  if (error) throw error
}

export const cambiarContrasena = async (contrasena) => {
  const { error } = await supabase.auth.updateUser({ password: contrasena })
  if (error) throw error
}

export const salir = () => supabase.auth.signOut()

/** Traduce los errores de Supabase Auth a un mensaje claro. */
export function mensajeAuth(error) {
  const t = error?.message ?? ''
  if (error?.code === 'correo_existente') return t
  if (/invalid login credentials/i.test(t)) return 'Correo o contraseña incorrectos.'
  if (/email not confirmed/i.test(t)) return 'Confirma tu correo primero: revisa tu bandeja de entrada.'
  if (/already registered/i.test(t)) return 'Ese correo ya tiene cuenta. Entra o recupera tu contraseña.'
  if (/password should be at least/i.test(t)) return 'La contraseña debe tener al menos 8 caracteres.'
  if (/rate limit|too many/i.test(t)) return 'Demasiados intentos. Espera unos minutos.'
  if (/captcha/i.test(t)) return 'No pudimos verificar que no eres un robot. Intenta de nuevo.'
  if (/failed to fetch|network/i.test(t)) return 'No pudimos conectarnos. Revisa tu internet.'
  return 'No pudimos completar la operación. Intenta de nuevo.'
}
