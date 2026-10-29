import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { Boton, Campo, Input } from '../components/ui'

export default function Entrar() {
  const { setSesion, avisar } = useStore()
  const navigate = useNavigate()
  const desdeAdmin = useLocation().state?.desdeAdmin
  const [modo, setModo] = useState('entrar')

  const entrar = (rol) => {
    setSesion({ rol })
    avisar(rol === 'admin' ? 'Entraste al panel de administración' : 'Bienvenida de vuelta, Mariana')
    navigate(rol === 'admin' ? '/admin' : '/mi-cuenta')
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
      <div className="max-w-md">
        <h1 className="font-cartel text-6xl leading-[0.9] font-black uppercase">{modo === 'entrar' ? 'Entra a tu cuenta' : 'Crea tu cuenta'}</h1>
        <p className="mt-3 text-tinta-soft">Para reservar, pagar y seguir tus funciones.</p>

        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            entrar('cliente')
          }}
        >
          {modo === 'registro' && (
            <Campo etiqueta="Nombre completo"><Input autoComplete="name" defaultValue="Mariana López Ríos" /></Campo>
          )}
          <Campo etiqueta="Correo"><Input type="email" autoComplete="email" defaultValue="mariana.lr@gmail.com" /></Campo>
          <Campo etiqueta="Contraseña" ayuda={modo === 'registro' ? 'Mínimo 8 caracteres.' : undefined}>
            <Input type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} defaultValue="prototipo" />
          </Campo>
          {modo === 'registro' && (
            <label className="flex gap-3 text-sm">
              <input type="checkbox" defaultChecked className="mt-0.5 size-4 accent-telon-600" />
              <span>Acepto el <a href="#" className="font-semibold underline">aviso de privacidad</a> y los términos.</span>
            </label>
          )}
          <Boton type="submit" tam="lg" className="w-full">{modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</Boton>
          <Boton type="button" variante="secundario" tam="lg" className="w-full" onClick={() => entrar('cliente')}>Continuar con Google</Boton>
        </form>
        <p className="mt-6 text-center text-[15px]">
          {modo === 'entrar' ? '¿Primera vez?' : '¿Ya tienes cuenta?'}{' '}
          <button className="font-semibold text-telon-700 underline" onClick={() => setModo(modo === 'entrar' ? 'registro' : 'entrar')}>
            {modo === 'entrar' ? 'Crea tu cuenta' : 'Entra'}
          </button>
        </p>
      </div>

      <div className={`self-start rounded-3xl bg-tinta p-7 text-white ${desdeAdmin ? 'ring-4 ring-marquesina' : ''}`}>
        {desdeAdmin && (
          <p role="status" className="mb-4 rounded-xl bg-marquesina px-4 py-3 text-sm font-semibold text-tinta">
            El panel es solo para el administrador. Entra con el botón amarillo de abajo.
          </p>
        )}
        <p className="text-sm font-semibold text-marquesina">Accesos del prototipo</p>
        <p className="mt-2 text-white/75">No hay usuarios reales. Elige con qué rol quieres recorrer la interfaz.</p>
        <div className="mt-6 space-y-3">
          <button onClick={() => entrar('cliente')} className="block w-full rounded-2xl bg-white/10 p-4 text-left hover:bg-white/15">
            <span className="block font-semibold">Entrar como cliente</span>
            <span className="block text-sm text-white/70">Mariana, con reservaciones próximas y en historial.</span>
          </button>
          <button onClick={() => entrar('admin')} className="block w-full rounded-2xl bg-marquesina p-4 text-left text-tinta hover:bg-[#ffc81f]">
            <span className="block font-semibold">Entrar como administrador</span>
            <span className="block text-sm text-tinta/75">Panel con agenda, reservaciones, clientes y zonas.</span>
          </button>
        </div>
      </div>
    </div>
  )
}
