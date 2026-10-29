# Prototipo navegable: Telón (reservación de shows)

Prototipo de interfaz en **React + Vite + Tailwind CSS v4**. Todo funciona con datos simulados en memoria: no hay backend, pagos reales ni mapas reales, y el estado se reinicia al recargar la página.

## Cómo correrlo

```bash
npm install
npm run dev
```

Abre http://localhost:5173. Para entrar al panel ve a **Entrar** (ícono de usuario) y elige *Entrar como administrador*.

## Qué se puede probar

**Sitio público (responsive)**
- Inicio con verificador de cobertura por código postal: prueba `44160`, `45110` (con cobertura) o `45640` (fuera de cobertura).
- Cartelera con filtros por tipo de evento, búsqueda y orden.
- Detalle del show con paquetes, requisitos y reseñas.
- Página de cobertura con mapa esquemático de zonas.
- Asistente de reservación en 6 pasos: show, lugar (bloquea si no hay cobertura), calendario con disponibilidad y horario apartado 10 min, extras y detalles, datos, pago (cupón `FIESTA10`). Termina en un boleto con folio.
- Mis reservaciones: próximas e historial, cancelación con cálculo de reembolso según la política.

**Panel administrativo**
- Inicio con próximas funciones, pendientes e ingresos.
- Agenda mensual y en lista, con días bloqueados y detalle lateral (registrar pago, notas, confirmar, marcar como realizada, cancelar).
- Reservaciones con búsqueda y filtros (tabla en escritorio, tarjetas en móvil).
- Nueva reservación presencial: busca o crea cliente, valida cobertura y choque de horario, permite excepción con motivo y registra el pago.
- Clientes con ficha e historial; shows con interruptor de visibilidad y editor; zonas de cobertura con prueba de CP; horarios y bloqueos.

## Estructura

```
src/
  data/mock.js        datos simulados (shows, zonas, clientes, reservaciones)
  store.jsx           estado compartido en memoria
  components/         UI base, calendario, verificador de CP, mapa
  public/             sitio para clientes
  admin/              panel administrativo
```

## Identidad visual (propuesta)

- **Colores:** Telón `#A3122A` (marca), Tinta `#1E1A2E` (texto y superficies oscuras), Marquesina `#F2B705` (disponibilidad y foco), Butaca `#F3F1F6` (fondos suaves), Verde `#0F7B6C` (confirmado).
- **Tipografía:** Big Shoulders Display para los carteles y títulos, Figtree para el texto.
- Los carteles de color sustituyen a las fotos de los shows mientras el cliente envía su material.
