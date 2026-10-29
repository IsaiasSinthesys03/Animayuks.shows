import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Menu, MessageCircle, UserRound, X } from 'lucide-react'
import { NEGOCIO } from '../data/mock'
import { useStore } from '../store'

const enlaces = [
  { to: '/shows', texto: 'Shows' },
  { to: '/cobertura', texto: '¿Llegamos a tu zona?' },
  { to: '/mi-cuenta', texto: 'Mis reservaciones' },
]

export function Logo({ claro = false }) {
  return (
    <Link to="/" className={`font-cartel text-[1.9rem] leading-none font-black tracking-tight uppercase ${claro ? 'text-white' : 'text-telon-600'}`}>
      Telón
    </Link>
  )
}

export default function PublicLayout() {
  const { sesion } = useStore()
  const [menu, setMenu] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setMenu(false)
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-linea/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            {enlaces.map((e) => (
              <NavLink
                key={e.to}
                to={e.to}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-[15px] font-medium transition-colors ${isActive ? 'bg-telon-50 text-telon-700' : 'text-tinta hover:bg-butaca'}`
                }
              >
                {e.texto}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {sesion?.rol === 'admin' && (
              <Link to="/admin" className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-tinta-soft hover:bg-butaca sm:inline-flex">
                <LayoutDashboard className="size-4" /> Panel
              </Link>
            )}
            <Link
              to={sesion ? '/mi-cuenta' : '/entrar'}
              className="inline-flex size-10 items-center justify-center rounded-full bg-butaca text-tinta hover:bg-linea"
              aria-label={sesion ? 'Mi cuenta' : 'Entrar'}
            >
              <UserRound className="size-5" />
            </Link>
            <Link to="/reservar" className="hidden h-10 items-center rounded-full bg-telon-600 px-5 text-[15px] font-semibold text-white hover:bg-telon-700 sm:inline-flex">
              Reservar
            </Link>
            <button className="inline-flex size-10 items-center justify-center rounded-full hover:bg-butaca md:hidden" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Menú">
              {menu ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {menu && (
          <nav className="entra border-t border-linea px-4 pt-2 pb-4 md:hidden" aria-label="Menú móvil">
            {enlaces.map((e) => (
              <NavLink key={e.to} to={e.to} className="block rounded-xl px-3 py-3 text-base font-medium hover:bg-butaca">
                {e.texto}
              </NavLink>
            ))}
            <Link to="/reservar" className="mt-2 flex h-12 items-center justify-center rounded-full bg-telon-600 font-semibold text-white">
              Reservar un show
            </Link>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-tinta text-white/80">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo claro />
            <p className="mt-3 max-w-xs text-sm leading-relaxed">
              Shows en vivo para fiestas y eventos en {NEGOCIO.ciudad}, Zapopan, Tlaquepaque y Tonalá.
            </p>
          </div>
          <div className="text-sm">
            <p className="font-semibold text-white">Contacto</p>
            <p className="mt-2">{NEGOCIO.correo}</p>
            <p className="mt-1">WhatsApp {NEGOCIO.whatsapp}</p>
          </div>
          <div className="flex flex-col gap-1.5 text-sm">
            <p className="font-semibold text-white">Información</p>
            <a href="#" className="hover:text-white">Preguntas frecuentes</a>
            <a href="#" className="hover:text-white">Política de cancelación</a>
            <a href="#" className="hover:text-white">Aviso de privacidad</a>
            <Link to="/entrar" className="hover:text-white">Acceso administrador</Link>
          </div>
        </div>
      </footer>

      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="fixed right-4 bottom-4 z-20 inline-flex size-14 items-center justify-center rounded-full bg-ok text-white shadow-[0_10px_24px_-6px_rgba(15,123,108,0.55)] hover:bg-[#0b6458] sm:right-6 sm:bottom-6"
        aria-label="Escríbenos por WhatsApp"
      >
        <MessageCircle className="size-6" />
      </a>
    </div>
  )
}
