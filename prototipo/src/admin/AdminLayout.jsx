import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, CalendarOff, ClipboardList, Ellipsis, ExternalLink, LayoutDashboard, LogOut, MapPinned, Plus, Theater, Users, X } from 'lucide-react'
import { useStore } from '../store'

const NAV = [
  { to: '/admin', texto: 'Inicio', icono: LayoutDashboard, fin: true },
  { to: '/admin/agenda', texto: 'Agenda', icono: CalendarDays },
  { to: '/admin/reservaciones', texto: 'Reservaciones', icono: ClipboardList },
  { to: '/admin/clientes', texto: 'Clientes', icono: Users },
  { to: '/admin/shows', texto: 'Shows', icono: Theater },
  { to: '/admin/zonas', texto: 'Zonas de cobertura', icono: MapPinned },
  { to: '/admin/disponibilidad', texto: 'Horarios y bloqueos', icono: CalendarOff },
]

const NOTIFICACIONES = [
  { texto: 'Ana Sofía Cárdenas reservó Burbujas Gigantes para el 1 de noviembre', hace: 'hace 25 min' },
  { texto: 'Comprobante de transferencia recibido para SHW-26-5JYH8', hace: 'hace 2 h' },
  { texto: 'Mañana: Magia en la Sala a las 6:00 p. m. en Tlaquepaque', hace: 'hace 5 h' },
]

export default function AdminLayout() {
  const { sesion, setSesion } = useStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [mas, setMas] = useState(false)
  const [notis, setNotis] = useState(false)

  useEffect(() => {
    setMas(false)
    setNotis(false)
  }, [pathname])

  if (sesion?.rol !== 'admin') return <Navigate to="/entrar" replace state={{ desdeAdmin: true }} />

  const salir = () => {
    setSesion(null)
    navigate('/')
  }

  const enlace = ({ isActive }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${isActive ? 'bg-white/12 text-white' : 'text-white/65 hover:bg-white/6 hover:text-white'}`

  return (
    <div className="min-h-dvh bg-butaca lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col bg-tinta px-3 py-5 lg:flex">
        <div className="flex items-baseline gap-2 px-3">
          <span className="font-cartel text-3xl leading-none font-black text-white uppercase">Telón</span>
          <span className="text-sm text-white/50">Panel</span>
        </div>
        <Link to="/admin/reservaciones/nueva" className="mx-1 mt-6 flex h-11 items-center justify-center gap-2 rounded-full bg-marquesina font-semibold text-tinta hover:bg-[#ffc81f]">
          <Plus className="size-4" strokeWidth={2.5} /> Nueva reservación
        </Link>
        <nav className="mt-6 flex-1 space-y-0.5" aria-label="Panel">
          {NAV.map(({ to, texto, icono: Icono, fin }) => (
            <NavLink key={to} to={to} end={fin} className={enlace}>
              <Icono className="size-[18px]" /> {texto}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-0.5 border-t border-white/10 pt-3">
          <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-white/65 hover:text-white">
            <ExternalLink className="size-[18px]" /> Ver sitio público
          </Link>
          <button onClick={salir} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-white/65 hover:text-white">
            <LogOut className="size-[18px]" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-linea bg-white px-4 sm:px-6">
          <span className="font-cartel text-2xl leading-none font-black text-telon-600 uppercase lg:hidden">Telón</span>
          <p className="hidden text-[15px] text-tinta-soft lg:block">Miércoles 28 de octubre de 2026</p>
          <div className="relative flex items-center gap-2">
            <button onClick={() => setNotis(!notis)} className="relative inline-flex size-10 items-center justify-center rounded-full hover:bg-butaca" aria-label="Notificaciones, 3 sin leer" aria-expanded={notis}>
              <Bell className="size-5" />
              <span className="num absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-telon-600 text-[10px] font-bold text-white">3</span>
            </button>
            <span className="flex size-9 items-center justify-center rounded-full bg-telon-600 text-sm font-bold text-white" aria-label="Administrador">RA</span>
            {notis && (
              <div className="entra absolute top-12 right-0 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-linea bg-white p-2 shadow-[0_16px_40px_-12px_rgba(30,26,46,0.3)]">
                <p className="px-3 pt-2 pb-1 font-semibold">Notificaciones</p>
                <ul>
                  {NOTIFICACIONES.map((n) => (
                    <li key={n.texto} className="rounded-xl px-3 py-2.5 hover:bg-butaca">
                      <p className="text-sm leading-snug">{n.texto}</p>
                      <p className="mt-0.5 text-xs text-tinta-soft">{n.hace}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </header>

        <main className="px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-12">
          <Outlet />
        </main>
      </div>

      {/* Navegación inferior en móvil */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-linea bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Panel móvil">
        {[NAV[0], NAV[1]].map(({ to, texto, icono: Icono, fin }) => (
          <NavLink key={to} to={to} end={fin} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-telon-600' : 'text-tinta-soft'}`}>
            <Icono className="size-5" /> {texto}
          </NavLink>
        ))}
        <Link to="/admin/reservaciones/nueva" className="flex flex-col items-center justify-center" aria-label="Nueva reservación">
          <span className="flex size-11 items-center justify-center rounded-full bg-telon-600 text-white">
            <Plus className="size-5" strokeWidth={2.5} />
          </span>
        </Link>
        <NavLink to="/admin/reservaciones" className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-telon-600' : 'text-tinta-soft'}`}>
          <ClipboardList className="size-5" /> Reservas
        </NavLink>
        <button onClick={() => setMas(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-tinta-soft">
          <Ellipsis className="size-5" /> Más
        </button>
      </nav>

      {mas && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Más opciones">
          <button className="absolute inset-0 bg-tinta/40" onClick={() => setMas(false)} aria-label="Cerrar" />
          <div className="entra absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 pb-8">
            <div className="flex items-center justify-between px-2">
              <p className="font-semibold">Más opciones</p>
              <button onClick={() => setMas(false)} className="rounded-full p-2 hover:bg-butaca" aria-label="Cerrar"><X className="size-5" /></button>
            </div>
            <div className="mt-2 grid gap-1">
              {NAV.slice(3).map(({ to, texto, icono: Icono }) => (
                <Link key={to} to={to} className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium hover:bg-butaca">
                  <Icono className="size-5 text-tinta-soft" /> {texto}
                </Link>
              ))}
              <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium hover:bg-butaca"><ExternalLink className="size-5 text-tinta-soft" /> Ver sitio público</Link>
              <button onClick={salir} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left font-medium hover:bg-butaca"><LogOut className="size-5 text-tinta-soft" /> Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function Encabezado({ titulo, children, descripcion }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.01em] sm:text-[1.75rem]">{titulo}</h1>
        {descripcion && <p className="mt-1 text-tinta-soft">{descripcion}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}
