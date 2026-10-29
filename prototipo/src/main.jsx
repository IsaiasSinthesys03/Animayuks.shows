import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { StoreProvider } from './store'
import { Aviso } from './components/ui'
import PublicLayout from './public/PublicLayout'
import Inicio from './public/Inicio'
import Catalogo from './public/Catalogo'
import ShowDetalle from './public/ShowDetalle'
import Cobertura from './public/Cobertura'
import Reservar from './public/Reservar'
import MisReservaciones from './public/MisReservaciones'
import Entrar from './public/Entrar'
import AdminLayout from './admin/AdminLayout'
import Dashboard from './admin/Dashboard'
import Agenda from './admin/Agenda'
import Reservaciones from './admin/Reservaciones'
import NuevaReservacion from './admin/NuevaReservacion'
import Clientes from './admin/Clientes'
import ShowsAdmin from './admin/ShowsAdmin'
import Zonas from './admin/Zonas'
import Disponibilidad from './admin/Disponibilidad'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Inicio />} />
            <Route path="shows" element={<Catalogo />} />
            <Route path="shows/:id" element={<ShowDetalle />} />
            <Route path="cobertura" element={<Cobertura />} />
            <Route path="reservar" element={<Reservar />} />
            <Route path="mi-cuenta" element={<MisReservaciones />} />
            <Route path="entrar" element={<Entrar />} />
          </Route>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="reservaciones" element={<Reservaciones />} />
            <Route path="reservaciones/nueva" element={<NuevaReservacion />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="shows" element={<ShowsAdmin />} />
            <Route path="zonas" element={<Zonas />} />
            <Route path="disponibilidad" element={<Disponibilidad />} />
          </Route>
        </Routes>
        <Aviso />
      </BrowserRouter>
    </StoreProvider>
  </StrictMode>,
)
