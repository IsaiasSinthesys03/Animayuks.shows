import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { StoreProvider } from './store'
import { AuthProvider } from './auth'
import { Aviso, Cargando } from './components/ui'
import PublicLayout from './public/PublicLayout'
import Landing from './public/landing/Landing'
import Catalogo from './public/Catalogo'
import ShowDetalle from './public/ShowDetalle'
import Cobertura from './public/Cobertura'
import Reservar from './public/Reservar'
import MisReservaciones from './public/MisReservaciones'
import Entrar from './public/Entrar'
import Recuperar from './public/Recuperar'
import Restablecer from './public/Restablecer'
import Pagina from './public/Pagina'
import Preguntas from './public/Preguntas'

// El panel se descarga solo al entrar a él: los clientes no cargan ese código
const AdminLayout = lazy(() => import('./admin/AdminLayout'))
const Dashboard = lazy(() => import('./admin/Dashboard'))
const Agenda = lazy(() => import('./admin/Agenda'))
const Reservaciones = lazy(() => import('./admin/Reservaciones'))
const NuevaReservacion = lazy(() => import('./admin/NuevaReservacion'))
const Clientes = lazy(() => import('./admin/Clientes'))
const ShowsAdmin = lazy(() => import('./admin/ShowsAdmin'))
const Zonas = lazy(() => import('./admin/Zonas'))
const PaginaInicio = lazy(() => import('./admin/PaginaInicio'))
const Disponibilidad = lazy(() => import('./admin/Disponibilidad'))
const Configuracion = lazy(() => import('./admin/Configuracion'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StoreProvider>
          <BrowserRouter>
            <Suspense fallback={<Cargando />}>
              <Routes>
                <Route element={<PublicLayout />}>
                  <Route index element={<Landing />} />
                  <Route path="shows" element={<Catalogo />} />
                  <Route path="shows/:slug" element={<ShowDetalle />} />
                  <Route path="cobertura" element={<Cobertura />} />
                  <Route path="reservar" element={<Reservar />} />
                  <Route path="mi-cuenta" element={<MisReservaciones />} />
                  <Route path="entrar" element={<Entrar />} />
                  <Route path="recuperar" element={<Recuperar />} />
                  <Route path="restablecer" element={<Restablecer />} />
                  <Route path="preguntas-frecuentes" element={<Preguntas />} />
                  <Route path="paginas/:slug" element={<Pagina />} />
                </Route>
                <Route path="admin" element={<AdminLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="agenda" element={<Agenda />} />
                  <Route path="reservaciones" element={<Reservaciones />} />
                  <Route path="reservaciones/nueva" element={<NuevaReservacion />} />
                  <Route path="clientes" element={<Clientes />} />
                  <Route path="shows" element={<ShowsAdmin />} />
                  <Route path="zonas" element={<Zonas />} />
                  <Route path="inicio" element={<PaginaInicio />} />
                  <Route path="disponibilidad" element={<Disponibilidad />} />
                  <Route path="configuracion" element={<Configuracion />} />
                </Route>
              </Routes>
            </Suspense>
            <Aviso />
          </BrowserRouter>
        </StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
