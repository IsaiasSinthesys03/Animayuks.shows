import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { cambiarContrasena, mensajeAuth, useAuth } from '../auth'
import { useStore } from '../store'
import { Boton, Campo, Cargando, Input } from '../components/ui'

/** Destino del enlace de "recuperar contraseña" del correo. */
export default function Restablecer() {
  const { usuario, cargando, terminarRecuperacion } = useAuth()
  const { avisar } = useStore()
  const navigate = useNavigate()
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (cargando) return <Cargando />

  if (!usuario) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Este enlace ya no sirve</h1>
        <p className="mt-2 text-tinta-soft">Los enlaces funcionan una sola vez y vencen en 1 hora.</p>
        <Boton as={Link} to="/recuperar" className="mt-5">Pedir otro enlace</Boton>
      </div>
    )
  }

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    if (contrasena.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    setEnviando(true)
    try {
      await cambiarContrasena(contrasena)
      terminarRecuperacion()
      avisar('Contraseña actualizada')
      navigate('/mi-cuenta', { replace: true })
    } catch (err) {
      setError(mensajeAuth(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6 lg:py-20">
      <h1 className="font-bungee text-4xl leading-[1.05] uppercase">Elige una contraseña nueva</h1>
      <form className="mt-8 space-y-4" onSubmit={enviar}>
        <Campo etiqueta="Contraseña nueva" ayuda="Mínimo 8 caracteres." error={error}>
          <Input type="password" autoComplete="new-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
        </Campo>
        <Boton type="submit" tam="lg" className="w-full" disabled={enviando}>Guardar contraseña</Boton>
      </form>
    </div>
  )
}
