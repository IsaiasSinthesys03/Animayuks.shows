import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { entrar, mensajeAuth, registrar, useAuth } from '../auth'
import { Boton, Campo, Input } from '../components/ui'
import Turnstile from '../components/Turnstile'

export default function Entrar() {
  const { usuario, esAdmin, cargando } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const desdeAdmin = useLocation().state?.desdeAdmin
  const siguiente = params.get('siguiente')
  const [modo, setModo] = useState(params.get('modo') === 'registro' ? 'registro' : 'entrar')
  const [f, setF] = useState({ nombre: '', telefono: '', correo: '', contrasena: '', acepta: false })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [captcha, setCaptcha] = useState(null)
  const [reinicio, setReinicio] = useState(0)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    if (!cargando && usuario) navigate(siguiente ?? (esAdmin ? '/admin' : '/mi-cuenta'), { replace: true })
  }, [cargando, usuario, esAdmin, siguiente, navigate])

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    if (modo === 'registro') {
      if (!f.nombre.trim()) return setError('Escribe tu nombre.')
      if (f.contrasena.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
      if (!f.acepta) return setError('Acepta el aviso de privacidad y los términos para crear tu cuenta.')
    }
    setEnviando(true)
    try {
      if (modo === 'entrar') {
        await entrar({ correo: f.correo.trim(), contrasena: f.contrasena, captchaToken: captcha ?? undefined })
      } else {
        const r = await registrar({
          nombre: f.nombre.trim(), telefono: f.telefono.trim(), correo: f.correo.trim(),
          contrasena: f.contrasena, captchaToken: captcha ?? undefined, siguiente: siguiente ?? undefined,
        })
        if (!r.session) setConfirmar(true)
      }
    } catch (err) {
      setError(mensajeAuth(err))
      // Cada comprobante de Turnstile sirve una sola vez
      setCaptcha(null)
      setReinicio((n) => n + 1)
    } finally {
      setEnviando(false)
    }
  }

  if (confirmar) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-ok text-white">
          <MailCheck className="size-7" />
        </span>
        <h1 className="mt-5 font-cartel text-5xl leading-none font-black uppercase">Revisa tu correo</h1>
        <p className="mt-3 text-tinta-soft">
          Te enviamos un enlace a <span className="font-semibold text-tinta">{f.correo}</span> para confirmar tu cuenta. Si no lo ves, busca en spam.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6 lg:py-20">
      {desdeAdmin && (
        <p role="status" className="mb-6 rounded-xl bg-marquesina-soft px-4 py-3 text-sm font-semibold text-tinta">
          El panel es solo para el administrador. Entra con esa cuenta.
        </p>
      )}
      <h1 className="font-cartel text-6xl leading-[0.9] font-black uppercase">{modo === 'entrar' ? 'Entra a tu cuenta' : 'Crea tu cuenta'}</h1>
      <p className="mt-3 text-tinta-soft">Para reservar, pagar y seguir tus funciones.</p>

      <form className="mt-8 space-y-4" onSubmit={enviar} noValidate>
        {modo === 'registro' && (
          <>
            <Campo etiqueta="Nombre completo"><Input autoComplete="name" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} /></Campo>
            <Campo etiqueta="Celular"><Input type="tel" inputMode="tel" autoComplete="tel" value={f.telefono} onChange={(e) => set('telefono', e.target.value)} /></Campo>
          </>
        )}
        <Campo etiqueta="Correo"><Input type="email" autoComplete="email" value={f.correo} onChange={(e) => set('correo', e.target.value)} required /></Campo>
        <Campo etiqueta="Contraseña" ayuda={modo === 'registro' ? 'Mínimo 8 caracteres.' : undefined}>
          <Input type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} value={f.contrasena} onChange={(e) => set('contrasena', e.target.value)} required />
        </Campo>
        {modo === 'entrar' && (
          <p className="text-right text-sm"><Link to="/recuperar" className="font-semibold text-telon-700 underline">Olvidé mi contraseña</Link></p>
        )}
        {modo === 'registro' && (
          <label className="flex gap-3 text-sm">
            <input type="checkbox" checked={f.acepta} onChange={(e) => set('acepta', e.target.checked)} className="mt-0.5 size-4 accent-telon-600" />
            <span>
              Acepto el <Link to="/paginas/aviso-de-privacidad" target="_blank" className="font-semibold underline">aviso de privacidad</Link> y los{' '}
              <Link to="/paginas/terminos" target="_blank" className="font-semibold underline">términos</Link>.
            </span>
          </label>
        )}
        <Turnstile onToken={setCaptcha} reinicio={reinicio} />
        {error && <p role="alert" className="rounded-xl bg-telon-50 px-3 py-2 text-sm font-medium text-telon-700">{error}</p>}
        <Boton type="submit" tam="lg" className="w-full" disabled={enviando}>
          {enviando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </Boton>
      </form>
      <p className="mt-6 text-center text-[15px]">
        {modo === 'entrar' ? '¿Primera vez?' : '¿Ya tienes cuenta?'}{' '}
        <button className="font-semibold text-telon-700 underline" onClick={() => { setModo(modo === 'entrar' ? 'registro' : 'entrar'); setError('') }}>
          {modo === 'entrar' ? 'Crea tu cuenta' : 'Entra'}
        </button>
      </p>
    </div>
  )
}
