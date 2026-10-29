# Animayuks.shows

Plataforma web para reservar shows a domicilio. Tiene dos partes: un sitio público responsive donde los clientes reservan a distancia (solo dentro de la zona de cobertura) y un panel administrativo donde el dueño gestiona su agenda, sus clientes, sus shows y las reservaciones presenciales.

## Contenido del repositorio

| Ruta | Qué es |
|---|---|
| [`MD/Requerimientos_de_Software.md`](MD/Requerimientos_de_Software.md) | Especificación de requerimientos funcionales y no funcionales (ISO/IEC/IEEE 29148) |
| [`MD/Skills_UI_UX.md`](MD/Skills_UI_UX.md) | Investigación de skills de UI/UX para Claude Code con React + Tailwind |
| [`prototipo/`](prototipo/) | Prototipo navegable en React + Vite + Tailwind CSS v4, con datos simulados |
| `.claude/skills/` | Skills de diseño instaladas para el proyecto (versiones en `skills-lock.json`) |

## Correr el prototipo

```bash
cd prototipo
npm install
npm run dev
```

Abre http://localhost:5173. Para el panel administrativo entra a **Entrar** y elige *Entrar como administrador*. Más detalles en [`prototipo/README.md`](prototipo/README.md).

> El prototipo es solo de interfaz: no tiene backend, pagos ni mapas reales, y los datos se reinician al recargar la página.
