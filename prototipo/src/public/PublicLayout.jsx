import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Menu, MessageCircle, UserRound, X } from 'lucide-react'
import { useAuth } from '../auth'
import { enlaceWhatsapp, useConfiguracion } from '../lib/consultas'

const enlaces = [
  { to: '/shows', texto: 'Shows' },
  { to: '/cobertura', texto: '¿Llegamos a tu zona?' },
  { to: '/mi-cuenta', texto: 'Mis reservaciones' },
]

export function Logo({ claro = false }) {
  const { data: cfg } = useConfiguracion()
  return (
    <Link to="/" className={`font-cartel text-[1.9rem] leading-none font-black tracking-tight uppercase ${claro ? 'text-white' : 'text-selva-600'}`}>
      {cfg?.nombre_negocio ?? 'Animayuks'}
    </Link>
  )
}

export default function PublicLayout() {
  const { usuario, esAdmin, recuperando, terminarRecuperacion } = useAuth()
  const { data: cfg } = useConfiguracion()
  const [menu, setMenu] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()

  // Un enlace de recuperar contraseña siempre termina donde se elige la nueva,
  // aunque Supabase lo haya mandado a otra página
  useEffect(() => {
    if (!recuperando) return
    terminarRecuperacion()
    if (pathname !== '/restablecer') navigate('/restablecer', { replace: true })
  }, [recuperando, pathname, navigate, terminarRecuperacion])

  const whatsapp = enlaceWhatsapp(cfg)

  useEffect(() => {
    setMenu(false)
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-linea/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            {enlaces.map((e) => (
              <NavLink
                key={e.to}
                to={e.to}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-[15px] font-medium transition-colors ${isActive ? 'bg-agua-soft text-selva-900' : 'text-tinta hover:bg-butaca'}`
                }
              >
                {e.texto}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            {esAdmin && (
              <Link to="/admin" aria-label="Panel de administración" className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full bg-agua-soft px-2.5 text-sm font-semibold text-selva-900 hover:bg-agua">
                <LayoutDashboard className="size-5" /> <span className="hidden min-[420px]:inline">Panel</span>
              </Link>
            )}
            <Link
              to={usuario ? '/mi-cuenta' : '/entrar'}
              className="inline-flex size-10 items-center justify-center rounded-full bg-butaca text-tinta hover:bg-linea"
              aria-label={usuario ? 'Mi cuenta' : 'Entrar'}
            >
              <UserRound className="size-5" />
            </Link>
            <Link to="/reservar" className="hidden h-10 items-center rounded-full bg-selva-600 px-5 text-[15px] font-semibold text-white hover:bg-selva-700 sm:inline-flex">
              Reservar
            </Link>
            <button className="inline-flex size-10 items-center justify-center rounded-full hover:bg-butaca md:hidden" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Menú">
              {menu ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {menu && (
          <nav className="entra border-t border-linea px-4 pt-2 pb-4 md:hidden" aria-label="Menú móvil">
            {esAdmin && (
              <Link to="/admin" className="flex items-center gap-2 rounded-xl bg-agua-soft px-3 py-3 text-base font-semibold text-selva-900">
                <LayoutDashboard className="size-5" /> Panel de administración
              </Link>
            )}
            {enlaces.map((e) => (
              <NavLink key={e.to} to={e.to} className="block rounded-xl px-3 py-3 text-base font-medium hover:bg-butaca">
                {e.texto}
              </NavLink>
            ))}
            <Link to="/reservar" className="mt-2 flex h-12 items-center justify-center rounded-full bg-selva-600 font-semibold text-white">
              Reservar un show
            </Link>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-selva-700 text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo claro />
            <p className="mt-3 max-w-xs text-sm leading-relaxed">
              Shows en vivo para fiestas y eventos.
            </p>
          </div>
          <div className="text-sm">
            <p className="font-semibold text-white">Contacto</p>
            {cfg?.correo_contacto && <p className="mt-2">{cfg.correo_contacto}</p>}
            {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="mt-1 block hover:text-white">WhatsApp</a>}
          </div>
          <div className="flex flex-col gap-1.5 text-sm">
            <p className="font-semibold text-white">Información</p>
            <Link to="/preguntas-frecuentes" className="hover:text-white">Preguntas frecuentes</Link>
            <Link to="/paginas/politica-de-cancelacion" className="hover:text-white">Política de cancelación</Link>
            <Link to="/paginas/aviso-de-privacidad" className="hover:text-white">Aviso de privacidad</Link>
            <Link to="/paginas/terminos" className="hover:text-white">Términos y condiciones</Link>
          </div>
        </div>
      </footer>

      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="fixed right-4 bottom-4 z-20 inline-flex size-14 items-center justify-center rounded-full bg-agua text-tinta ring-2 ring-white shadow-[0_10px_24px_-6px_rgba(15,123,108,0.55)] hover:bg-[#0b6458] sm:right-6 sm:bottom-6"
          aria-label="Escríbenos por WhatsApp"
        >
          <MessageCircle className="size-6" />
        </a>
      )}
    </div>
  )
}
