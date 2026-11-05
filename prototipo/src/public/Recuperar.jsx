import { useState } from 'react'
import { Link } from 'react-router-dom'
import { mensajeAuth, recuperarContrasena } from '../auth'
import { Boton, Campo, Input } from '../components/ui'
import Turnstile from '../components/Turnstile'

export default function Recuperar() {
  const [correo, setCorreo] = useState('')
  const [estado, setEstado] = useState('inicial') // inicial | enviando | listo
  const [error, setError] = useState('')
  const [captcha, setCaptcha] = useState(null)
  const [reinicio, setReinicio] = useState(0)

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    setEstado('enviando')
    try {
      await recuperarContrasena({ correo: correo.trim(), captchaToken: captcha ?? undefined })
      setEstado('listo')
    } catch (err) {
      setError(mensajeAuth(err))
      setEstado('inicial')
      setCaptcha(null)
      setReinicio((n) => n + 1)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6 lg:py-20">
      <h1 className="font-cartel text-6xl leading-[0.9] font-black uppercase">Recupera tu contraseña</h1>
      {estado === 'listo' ? (
        <p role="status" className="mt-6 rounded-2xl bg-ok-soft p-4">
          Si <span className="font-semibold">{correo}</span> tiene cuenta, te llegará un correo con un enlace para elegir una contraseña nueva. Vence en 1 hora.
        </p>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={enviar}>
          <Campo etiqueta="Correo de tu cuenta"><Input type="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required /></Campo>
          <Turnstile onToken={setCaptcha} reinicio={reinicio} />
          {error && <p role="alert" className="rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
          <Boton type="submit" tam="lg" className="w-full" disabled={estado === 'enviando'}>Enviar enlace</Boton>
        </form>
      )}
      <p className="mt-6 text-center text-[15px]"><Link to="/entrar" className="font-semibold text-selva-700 underline">Volver a entrar</Link></p>
    </div>
  )
}
