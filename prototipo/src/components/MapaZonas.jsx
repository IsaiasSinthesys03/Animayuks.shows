import { useState } from 'react'

// Mapa esquemático de la zona metropolitana. En producción se sustituye por Google Maps / Mapbox con los polígonos reales.
const FORMAS = [
  { id: 'zap', nombre: 'Zapopan', d: 'M40 40 L250 30 L285 120 L240 190 L150 205 L60 170 Z', fill: '#f2b705', lx: 150, ly: 110 },
  { id: 'gdl', nombre: 'Guadalajara', d: 'M240 190 L285 120 L400 115 L430 200 L380 260 L260 255 Z', fill: '#a3122a', lx: 335, ly: 192 },
  { id: 'ton', nombre: 'Tonalá', d: 'M400 115 L540 110 L560 230 L470 270 L430 200 Z', fill: '#3b2a8f', lx: 490, ly: 185 },
  { id: 'tlq', nombre: 'Tlaquepaque', d: 'M260 255 L380 260 L430 200 L470 270 L420 330 L290 325 Z', fill: '#0f7b6c', lx: 370, ly: 290 },
  { id: 'tlj', nombre: 'Tlajomulco', d: 'M150 205 L240 190 L260 255 L290 325 L250 400 L110 390 L90 290 Z', fill: '#5e5873', lx: 185, ly: 300, inactiva: true },
]

export default function MapaZonas({ className = '' }) {
  const [activa, setActiva] = useState(null)
  return (
    <figure className={`overflow-hidden rounded-3xl border border-linea bg-[#eef0ec] ${className}`}>
      <svg viewBox="0 0 600 430" className="block h-auto w-full" role="img" aria-label="Mapa de zonas de cobertura">
        <defs>
          <pattern id="cuadricula" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M30 0H0V30" fill="none" stroke="#dfe2dc" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="600" height="430" fill="url(#cuadricula)" />
        {FORMAS.map((f) => (
          <g key={f.id} onMouseEnter={() => setActiva(f.id)} onMouseLeave={() => setActiva(null)} className="cursor-pointer">
            <path
              d={f.d}
              fill={f.fill}
              fillOpacity={f.inactiva ? 0.12 : activa === f.id ? 0.55 : 0.32}
              stroke={f.fill}
              strokeWidth={2}
              strokeDasharray={f.inactiva ? '6 6' : undefined}
              strokeLinejoin="round"
              style={{ transition: 'fill-opacity 200ms' }}
            />
            <text x={f.lx} y={f.ly} textAnchor="middle" className="fill-tinta text-[15px] font-semibold" style={{ fontFamily: 'Figtree' }}>
              {f.nombre}
            </text>
            {f.inactiva && (
              <text x={f.lx} y={f.ly + 18} textAnchor="middle" className="fill-tinta-soft text-[12px]" style={{ fontFamily: 'Figtree' }}>
                sin servicio
              </text>
            )}
          </g>
        ))}
        <circle cx="335" cy="160" r="7" fill="#1e1a2e" stroke="white" strokeWidth="3" />
        <text x="347" y="152" className="fill-tinta text-[12px]" style={{ fontFamily: 'Figtree' }}>Base</text>
      </svg>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 border-t border-linea bg-white px-4 py-3 text-sm text-tinta-soft">
        <span>Línea punteada: zona sin servicio por ahora</span>
        <span>Punto negro: base de operaciones</span>
      </figcaption>
    </figure>
  )
}
