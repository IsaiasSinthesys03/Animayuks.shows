# Skills de UI/UX para Claude Code (React + Tailwind)

Investigación realizada el 28 de octubre de 2026. Objetivo: identificar *Agent Skills* (paquetes `SKILL.md`) que mejoren la calidad de diseño, UX, accesibilidad y código frontend al construir la **Plataforma de Reservación de Shows** con **React + Tailwind CSS**.

> **Nota de seguridad:** las skills son instrucciones (y a veces scripts) que el agente ejecuta. Antes de instalar cualquier skill de terceros se debe revisar su `SKILL.md` y sus scripts. Se priorizan fuentes oficiales o con alta adopción.

---

## 1. Recomendación final (stack sugerido)

| # | Skill | Autor | Para qué la usaríamos | Tipo |
|---|---|---|---|---|
| 1 | **frontend-design** | Anthropic (oficial) | Dirección visual distintiva, tipografía, evitar diseño "genérico de IA", calidad mínima (responsive, foco, motion reducido) | Generación |
| 2 | **impeccable** | Paul Bakaus (creador de jQuery UI) | Comandos de crítica y pulido: `audit`, `critique`, `polish`, `harden`, `animate`, `bolder`, `quieter`… + detector de 62 reglas | Generación + Auditoría |
| 3 | **web-design-guidelines** | Vercel (oficial) | Auditar el código de UI contra 100+ reglas de accesibilidad, formularios, imágenes, animación y UX | Auditoría |
| 4 | **react-best-practices** | Vercel (oficial) | 40+ reglas de rendimiento React (re-renders, tamaño del bundle, cascadas de carga) | Calidad de código |
| 5 | **composition-patterns** | Vercel (oficial) | Patrones de API de componentes (compound components, evitar props booleanas) para un design system limpio | Arquitectura |
| 6 | **shadcn** | shadcn/ui (oficial) | Si usamos shadcn/ui + Tailwind: el agente conoce la configuración del proyecto y los componentes instalados | Componentes |
| 7 | **ui-ux-pro-max** | nextlevelbuilder (comunidad) | Base de datos consultable: 192 paletas, 74 pares tipográficos, 119 reglas UX, reglas por industria para generar el design system | Referencia |
| 8 | **webapp-testing** | Anthropic (oficial) | Pruebas de la UI en navegador con Playwright (flujos de reservación, responsive) | Pruebas |
| 9 | **accessibility-compliance** | wshobson/agents (comunidad) | Auditoría WCAG y diseño inclusivo (requerimiento RNF-ACC: WCAG 2.2 AA) | Auditoría |

**Núcleo mínimo recomendado:** 1 + 2 + 3 + 4 + 6. Las demás se agregan según la fase.

---

## 2. Detalle de cada skill

### 2.1 frontend-design — Anthropic (oficial)

- **Repositorio:** [anthropics/skills › skills/frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)
- **Licencia:** incluida en el repositorio (`LICENSE.txt`).
- **Qué aporta (verificado en `SKILL.md`):**
  - Basa el diseño en el tema del producto, su público y su tarea principal (para nosotros: entretenimiento, fiestas, eventos).
  - Usa la tipografía para dar personalidad: 1–2 familias tipográficas, una escala de tamaños clara y líneas de máximo ~80 caracteres.
  - Evita los clichés del diseño hecho con IA: degradados genéricos, tarjetas idénticas, paletas trilladas.
  - Trabaja en dos pasadas: un plan compacto (4–6 colores hex, roles tipográficos, wireframes) y una revisión crítica antes de programar.
  - Pide una calidad mínima: diseño responsive, foco visible, `prefers-reduced-motion` y accesibilidad.
  - Pide textos claros: estados vacíos que inviten a actuar y errores que expliquen cómo resolverse.
- **Instalación:**
  ```bash
  npx skills add https://github.com/anthropics/skills --skill frontend-design
  ```
  o desde el marketplace de plugins de Claude Code: `/plugin install frontend-design@claude-plugins-official`.

### 2.2 Impeccable — Paul Bakaus

- **Repositorio:** [pbakaus/impeccable](https://github.com/pbakaus/impeccable) · Apache 2.0 · ~91k estrellas.
- **Qué aporta:**
  - Parte de `frontend-design` de Anthropic y la extiende con más vocabulario de diseño.
  - Tiene **24 comandos** (`/impeccable <comando> <objetivo>`): `init` (crea `PRODUCT.md` con el contexto del producto), `audit`, `critique`, `polish`, `harden`, `animate`, `distill`, `bolder`, `quieter`, `live`…
  - Incluye un **detector determinista** de 62 reglas que no usa LLM: `npx impeccable detect`.
  - Trae un *hook* opcional que revisa los archivos de UI al editarlos.
- **Instalación (Claude Code):**
  ```text
  /plugin marketplace add pbakaus/impeccable
  /plugin            → instalar "impeccable"
  /impeccable init
  ```
- **Uso en el proyecto:** `/impeccable critique` sobre el wizard de reservación y `/impeccable harden` sobre los formularios (estados de error, carga y vacío).

### 2.3 Vercel Agent Skills (oficiales)

- **Repositorio:** [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)
- **Skills relevantes:**

| Skill | Qué hace |
|---|---|
| `web-design-guidelines` | Revisa el código de UI contra más de 100 reglas de accesibilidad, rendimiento y UX. Descarga las *Web Interface Guidelines* actualizadas de Vercel e informa de las violaciones. Audita código existente; no genera código. |
| `react-best-practices` | Más de 40 reglas de rendimiento en React, priorizadas por impacto: cascadas de peticiones, tamaño del bundle y re-renders. |
| `composition-patterns` | Patrones de API de componentes: compound components y elevar el estado en lugar de acumular props booleanas. |
| `react-view-transitions` | Animaciones de página y de elemento con la View Transition API. Opcional, para transiciones entre pasos del wizard. |

- **Instalación:**
  ```bash
  npx skills add vercel-labs/agent-skills --skill web-design-guidelines
  npx skills add vercel-labs/agent-skills --skill react-best-practices
  npx skills add vercel-labs/agent-skills --skill composition-patterns
  ```

### 2.4 shadcn — shadcn/ui (oficial)

- **Documentación:** [ui.shadcn.com/docs/skills](https://ui.shadcn.com/docs/skills)
- **Qué aporta:** en cada interacción ejecuta `shadcn info --json` para leer la configuración del proyecto (framework, alias, librería de íconos y componentes instalados) y aplica los patrones de composición correctos. Se activa automáticamente cuando el proyecto tiene `components.json`.
- **Complemento:** shadcn también ofrece un **servidor MCP** para buscar e instalar componentes desde registries.
- **Instalación:**
  ```bash
  npx skills add shadcn/ui
  ```
- **Por qué nos sirve:** shadcn/ui (sobre Radix + Tailwind) ya resuelve buena parte de la accesibilidad de los componentes (diálogos, selects, calendario, tablas), lo que ayuda a cumplir RNF-ACC.

### 2.5 UI UX Pro Max — nextlevelbuilder (comunidad)

- **Repositorio:** [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) · MIT · ~142k estrellas.
- **Qué aporta:** una base de conocimiento consultable con 79 estilos, 192 paletas, 74 pares tipográficos, 25 tipos de gráfica (útil para el dashboard del admin), 119 reglas de UX, 192 reglas por industria y guías para 22 stacks (incluye React y Tailwind). Su skill `ui-styling` cubre shadcn/ui + Tailwind.
- **Requisito:** Python 3 (el script de búsqueda solo usa la librería estándar y no hace llamadas de red).
- **Instalación:**
  ```text
  /plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
  /plugin install ui-ux-pro-max@ui-ux-pro-max-skill
  ```
- **Precaución:** se traslapa con `frontend-design` e `impeccable`. Conviene usarla como **referencia** (paletas, tipografías, gráficas) y no como guía principal de estilo, para no mezclar criterios.

### 2.6 webapp-testing — Anthropic (oficial)

- **Repositorio:** [anthropics/skills › skills/webapp-testing](https://github.com/anthropics/skills/tree/main/skills/webapp-testing)
- **Qué aporta:** prueba aplicaciones web locales con Playwright: navegar, hacer clic, tomar capturas y leer logs. Sirve para validar el wizard de reservación y el diseño responsive en varios anchos de pantalla.

### 2.7 wshobson/agents — plugins de comunidad

- **Repositorio:** [wshobson/agents](https://github.com/wshobson/agents) ([catálogo](https://github.com/wshobson/agents/blob/main/docs/plugins.md))
- **Plugins relevantes:** `ui-design`, `accessibility-compliance` (auditoría WCAG), `frontend-mobile-development`, `javascript-typescript` (React + Vite).
- **Instalación:**
  ```text
  /plugin marketplace add wshobson/agents
  /plugin install accessibility-compliance@claude-code-workflows
  ```

### 2.8 Otras skills encontradas (comunidad, menor verificación)

| Skill | Enfoque | Fuente |
|---|---|---|
| `tailwind-design-system` | Design system con tokens en Tailwind v4 (configuración CSS-first) | [open-design.ai](https://open-design.ai/skills/tailwind-design-system/) |
| `tailwindcss-mobile-first` | Breakpoints, tipografía fluida, áreas táctiles, container queries | [josiahsiegel](https://claudeskills.info/skills/josiahsiegel/claude-plugin-marketplace/tailwindcss-mobile-first/) |
| `color-palette` (jezweb) | Paletas accesibles de 11 tonos + tokens semánticos + verificación de contraste WCAG para Tailwind v4 | [jezweb/claude-skills](https://www.vibeindex.ai/skills/jezweb/claude-skills/ux-audit) |
| `ux-audit` (jezweb) | Auditoría UX general | [vibeindex.ai](https://www.vibeindex.ai/skills/jezweb/claude-skills/ux-audit) |

> Estas skills no se verificaron en su repositorio original. Solo se recomiendan si alguna de las principales deja un hueco concreto.

---

## 3. Cómo encajan con los requerimientos del proyecto

| Requerimiento (ver `Requerimientos_de_Software.md`) | Skills que lo cubren |
|---|---|
| RNF-RSP (responsive, mobile-first, áreas táctiles de 44 px) | frontend-design, impeccable, web-design-guidelines, webapp-testing |
| RNF-ACC (WCAG 2.2 AA, teclado, contraste, `aria-live`) | web-design-guidelines, accessibility-compliance, shadcn (Radix) |
| RNF-USA (wizard claro, validación en línea, estados vacíos/carga/éxito) | impeccable (`harden`, `polish`), frontend-design (copy), web-design-guidelines (forms) |
| RNF-USA-08 (design system consistente) | composition-patterns, shadcn, ui-ux-pro-max (tokens/paletas) |
| RNF-REN (Core Web Vitals, Lighthouse ≥ 90) | react-best-practices, web-design-guidelines (imágenes) |
| RF-DSH (gráficas del dashboard) | ui-ux-pro-max (guías de gráficas) |
| RNF-MAN-03 (pruebas e2e de flujos críticos) | webapp-testing |

---

## 4. Flujo de trabajo propuesto

1. **Contexto:** `/impeccable init` para generar `PRODUCT.md` (negocio de shows, público objetivo, tono de marca) y un `CLAUDE.md` con los tokens de diseño y las convenciones de componentes.
2. **Design system:** definir paleta, tipografía y tokens de Tailwind con `frontend-design` (usando `ui-ux-pro-max` como catálogo de referencia) e instalar la base de componentes con shadcn/ui.
3. **Construcción de pantallas:** `frontend-design` + `shadcn` + `composition-patterns` + `react-best-practices`.
4. **Revisión de cada pantalla:** `web-design-guidelines` → `/impeccable audit` → `/impeccable polish`.
5. **Verificación:** `webapp-testing` en anchos de 360, 768, 1024 y 1440 px, más Lighthouse.

---

## 5. Estado de instalación (28/10/2026)

Instaladas **a nivel de proyecto** en `.claude/skills/` con `npx skills add … -a claude-code --copy`. El registro de versiones (hash por skill) queda en `skills-lock.json`, que sirve para restaurarlas o actualizarlas (`npx skills update -p`).

| Skill instalada | Origen |
|---|---|
| `frontend-design` | anthropics/skills |
| `webapp-testing` | anthropics/skills |
| `web-design-guidelines` | vercel-labs/agent-skills |
| `vercel-react-best-practices` | vercel-labs/agent-skills |
| `vercel-composition-patterns` | vercel-labs/agent-skills |
| `impeccable` | pbakaus/impeccable |
| `ui-ux-pro-max` | nextlevelbuilder/ui-ux-pro-max-skill |
| `shadcn` | shadcn/ui |
| `wcag-audit-patterns` | wshobson/agents (plugin accessibility-compliance) |
| `screen-reader-testing` | wshobson/agents (plugin accessibility-compliance) |

Revisión de seguridad: los scripts incluidos solo operan en local (`localhost`); `web-design-guidelines` descarga sus reglas desde `raw.githubusercontent.com/vercel-labs/web-interface-guidelines`. `ui-ux-pro-max` y `webapp-testing` requieren Python 3 (instalado: 3.14); `webapp-testing` requiere además Playwright cuando se use.

---

## 6. Fuentes

- [anthropics/skills](https://github.com/anthropics/skills) · [frontend-design SKILL.md](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)
- [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)
- [pbakaus/impeccable](https://github.com/pbakaus/impeccable)
- [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [shadcn/ui — Skills](https://ui.shadcn.com/docs/skills)
- [wshobson/agents — catálogo de plugins](https://github.com/wshobson/agents/blob/main/docs/plugins.md)
- [UX Planet — Must-have UX/UI design skills for Claude Code](https://uxplanet.org/must-have-ux-ui-design-skills-for-claude-code-364e93e3a614)
- [Composio — Top 10 design skills for Claude Code and Codex](https://composio.dev/blog/top-design-skills)
- [Tailkits — How Claude Skills improve your frontend workflow](https://tailkits.com/blog/claude-skills-ui-design-web-development/)
- [Claude Marketplaces — Design & UI/UX](https://claudemarketplaces.com/skills/category/design-ui)
