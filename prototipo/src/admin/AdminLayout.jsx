import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, CalendarOff, ClipboardList, Ellipsis, ExternalLink, LayoutDashboard, LogOut, MapPinned, Sparkles, Plus, Settings, Theater, Users, X } from 'lucide-react'
import { salir, useAuth } from '../auth'
import { fechaLarga } from '../lib/format'
import { useConfiguracion } from '../lib/consultas'
import { Cargando } from '../components/ui'

const NAV = [
  { to: '/admin', texto: 'Inicio', icono: LayoutDashboard, fin: true },
  { to: '/admin/agenda', texto: 'Agenda', icono: CalendarDays },
  { to: '/admin/reservaciones', texto: 'Reservaciones', icono: ClipboardList },
  { to: '/admin/clientes', texto: 'Clientes', icono: Users },
  { to: '/admin/shows', texto: 'Shows', icono: Theater },
  { to: '/admin/zonas', texto: 'Zonas de cobertura', icono: MapPinned },
  { to: '/admin/disponibilidad', texto: 'Horarios y bloqueos', icono: CalendarOff },
  { to: '/admin/inicio', texto: 'Página de inicio', icono: Sparkles },
  { to: '/admin/configuracion', texto: 'Configuración', icono: Settings },
]

export default function AdminLayout() {
  const { usuario, esAdmin, cargando } = useAuth()
  const { data: cfg } = useConfiguracion()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [mas, setMas] = useState(false)

  useEffect(() => setMas(false), [pathname])

  if (cargando) return <Cargando />
  if (!usuario) return <Navigate to="/entrar?siguiente=/admin" replace />
  // Una cuenta de cliente va a su área: mandarla a Entrar crearía un bucle, porque ya tiene sesión
  if (!esAdmin) return <Navigate to="/mi-cuenta" replace state={{ sinPermisoPanel: true }} />

  const cerrarSesion = async () => {
    await salir()
    navigate('/')
  }

  const enlace = ({ isActive }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${isActive ? 'bg-white/12 text-white' : 'text-white/90 hover:bg-white/10 hover:text-white'}`

  const nombre = cfg?.nombre_negocio ?? 'Animayuks'

  return (
    <div className="min-h-dvh bg-butaca lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col bg-selva-700 px-3 py-5 lg:flex">
        <div className="flex items-baseline gap-2 px-3">
          <span className="font-cartel text-3xl leading-none font-black text-white uppercase">{nombre}</span>
          <span className="text-sm text-white/85">Panel</span>
        </div>
        <Link to="/admin/reservaciones/nueva" className="mx-1 mt-6 flex h-11 items-center justify-center gap-2 rounded-full bg-maiz font-semibold text-tinta hover:bg-[#f0c453]">
          <Plus className="size-4" strokeWidth={2.5} /> Nueva reservación
        </Link>
        <nav className="mt-6 flex-1 space-y-0.5 overflow-y-auto" aria-label="Panel">
          {NAV.map(({ to, texto, icono: Icono, fin }) => (
            <NavLink key={to} to={to} end={fin} className={enlace}>
              <Icono className="size-[18px]" /> {texto}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-0.5 border-t border-white/10 pt-3">
          <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-white/90 hover:text-white">
            <ExternalLink className="size-[18px]" /> Ver sitio público
          </Link>
          <button onClick={cerrarSesion} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-white/90 hover:text-white">
            <LogOut className="size-[18px]" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-linea bg-white px-4 sm:px-6">
          <span className="font-cartel text-2xl leading-none font-black text-selva-600 uppercase lg:hidden">{nombre}</span>
          <p className="hidden text-[15px] text-tinta-soft first-letter:uppercase lg:block">{fechaLarga(new Date())}</p>
          <span className="truncate text-sm text-tinta-soft">{usuario.email}</span>
        </header>

        <main className="px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-12">
          <Outlet />
        </main>
      </div>

      {/* Navegación inferior en móvil */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-linea bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Panel móvil">
        {[NAV[0], NAV[1]].map(({ to, texto, icono: Icono, fin }) => (
          <NavLink key={to} to={to} end={fin} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-selva-600' : 'text-tinta-soft'}`}>
            <Icono className="size-5" /> {texto}
          </NavLink>
        ))}
        <Link to="/admin/reservaciones/nueva" className="flex flex-col items-center justify-center" aria-label="Nueva reservación">
          <span className="flex size-11 items-center justify-center rounded-full bg-selva-600 text-white">
            <Plus className="size-5" strokeWidth={2.5} />
          </span>
        </Link>
        <NavLink to="/admin/reservaciones" className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-selva-600' : 'text-tinta-soft'}`}>
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
              <button onClick={cerrarSesion} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left font-medium hover:bg-butaca"><LogOut className="size-5 text-tinta-soft" /> Cerrar sesión</button>
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

export function Interruptor({ activo, onCambio, etiqueta, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={onCambio}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${activo ? 'bg-ok' : 'bg-linea'}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ${activo ? 'translate-x-5' : ''}`} />
    </button>
  )
}
