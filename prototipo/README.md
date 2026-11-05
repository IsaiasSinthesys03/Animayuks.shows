# Animayuks: aplicación web

Sitio público y panel administrativo en **React + Vite + Tailwind CSS v4**, conectados a **Supabase** (base de datos, cuentas y almacenamiento de archivos). Las reglas de negocio viven en la base de datos; ver [`../supabase/README.md`](../supabase/README.md).

## Cómo correrlo

```bash
npm install
npm run dev
```

Abre http://localhost:5173. Necesita `prototipo/.env.local` con las variables de [`.env.example`](.env.example). **Trabaja contra la base de datos real**: lo que hagas aquí se guarda y envía correos reales.

## Estructura

```
src/
  auth.jsx            sesión, rol y funciones de cuenta (Supabase Auth)
  store.jsx           avisos en pantalla
  lib/api.js          catálogo, cobertura, disponibilidad, reservaciones, comprobantes
  lib/apiAdmin.js     operaciones del panel
  lib/consultas.js    consultas compartidas con caché (React Query)
  lib/format.js       pesos y fechas en hora de Guadalajara
  components/         UI base, calendario, verificador de CP, datos de pago, Turnstile
  public/             sitio para clientes
  admin/              panel administrativo (se descarga solo al entrar)
```

## Desplegar en Render

Static Site con Root Directory `prototipo`, Build `npm ci && npm run build`, Publish `dist`, la regla Rewrite `/*` → `/index.html`, y estas variables en **Environment** (se leen al compilar):

| Variable | Valor |
|---|---|
| `NODE_VERSION` | `24` |
| `VITE_SUPABASE_URL` | URL del proyecto de Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Llave publicable de Supabase |
| `VITE_TURNSTILE_SITE_KEY` | Site key de Turnstile |

Solo van variables públicas. Las llaves secretas viven en Supabase.

## Identidad visual

- **Colores:** Telón `#A3122A` (marca), Tinta `#1E1A2E` (texto y superficies oscuras), Marquesina `#F2B705` (disponibilidad y foco), Butaca `#F3F1F6` (fondos suaves), Verde `#0F7B6C` (confirmado).
- **Tipografía:** Big Shoulders Display para carteles y títulos, Figtree para el texto.
- **Fotos de los shows:** verticales 4:5, ideal 1600 × 2000 px. Sin foto, el show se muestra como cartel de color.
