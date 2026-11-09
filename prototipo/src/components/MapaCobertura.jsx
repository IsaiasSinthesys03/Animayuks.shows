import { useEffect, useRef, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { Cargando } from './ui'

const ESTILO = 'https://tiles.openfreemap.org/styles/liberty'
const YUCATAN = [[-90.45, 19.5], [-87.5, 21.7]]
const CREDITO = 'Códigos postales: <a href="https://www.datos.gob.mx/dataset/codigos_postales_entidad_federativa" target="_blank" rel="noreferrer">SEPOMEX</a> (CC BY 4.0)'

function limitesDe(datos) {
  let [w, s, e, n] = [180, 90, -180, -90]
  const visitar = (c) => {
    if (typeof c[0] === 'number') {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1])
    } else c.forEach(visitar)
  }
  datos.features.forEach((f) => visitar(f.geometry.coordinates))
  return datos.features.length ? [[w, s], [e, n]] : YUCATAN
}

/**
 * Mapa de cobertura. MapLibre se descarga solo cuando este componente se monta.
 * modo 'publico': un solo color y sin clic. modo 'admin': color por zona, y al
 * hacer clic llama a `alSeleccionar` con las propiedades del área.
 */
export default function MapaCobertura({ datos, modo = 'publico', ocultas = [], alSeleccionar, className = 'h-[28rem]' }) {
  const caja = useRef(null)
  const mapa = useRef(null)
  const [listo, setListo] = useState(false)
  const [fallo, setFallo] = useState(false)
  const seleccionar = useRef(alSeleccionar)
  seleccionar.current = alSeleccionar

  useEffect(() => {
    let cancelado = false
    let instancia = null
    ;(async () => {
      try {
        const [{ default: maplibregl }] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')])
        if (cancelado) return
        instancia = new maplibregl.Map({
          container: caja.current,
          style: ESTILO,
          bounds: YUCATAN,
          fitBoundsOptions: { padding: 24 },
          cooperativeGestures: true,
          attributionControl: { customAttribution: CREDITO },
        })
        mapa.current = instancia
        instancia.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
        instancia.on('load', () => {
          if (cancelado) return
          const admin = modo === 'admin'
          instancia.addSource('cobertura', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
          instancia.addLayer({ id: 'area', type: 'fill', source: 'cobertura', paint: { 'fill-color': admin ? ['get', 'color'] : '#287a45', 'fill-opacity': admin ? 0.5 : 0.45 } })
          instancia.addLayer({ id: 'borde', type: 'line', source: 'cobertura', filter: admin ? ['==', ['get', 'activa'], true] : ['literal', true], paint: { 'line-color': admin ? ['get', 'color'] : '#1f6237', 'line-width': 1.2 } })
          if (admin) {
            instancia.addLayer({ id: 'borde-pausada', type: 'line', source: 'cobertura', filter: ['==', ['get', 'activa'], false], paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 2] } })
            instancia.on('click', 'area', (e) => seleccionar.current?.(e.features[0].properties))
            instancia.on('mouseenter', 'area', () => { instancia.getCanvas().style.cursor = 'pointer' })
            instancia.on('mouseleave', 'area', () => { instancia.getCanvas().style.cursor = '' })
          }
          setListo(true)
        })
      } catch {
        if (!cancelado) setFallo(true)
      }
    })()
    return () => {
      cancelado = true
      instancia?.remove()
      mapa.current = null
      setListo(false)
    }
  }, [modo])

  useEffect(() => {
    if (!listo || !datos) return
    const m = mapa.current
    if (!m?.getSource('cobertura')) return
    m.getSource('cobertura').setData(datos)
    m.fitBounds(limitesDe(datos), { padding: 32, maxZoom: 12, animate: false })
  }, [listo, datos])

  useEffect(() => {
    if (!listo || modo !== 'admin') return
    const m = mapa.current
    if (!m?.getSource('cobertura')) return
    const visible = ['!', ['in', ['get', 'zona_id'], ['literal', ocultas]]]
    m.setFilter('area', visible)
    m.setFilter('borde', ['all', visible, ['==', ['get', 'activa'], true]])
    m.setFilter('borde-pausada', ['all', visible, ['==', ['get', 'activa'], false]])
  }, [listo, modo, ocultas])

  if (fallo) {
    return <p className="flex items-center gap-2 rounded-2xl bg-butaca p-6 text-sm font-medium"><CircleAlert className="size-5 shrink-0" /> No pudimos cargar el mapa en este dispositivo. El verificador de código postal sigue funcionando.</p>
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl ring-1 ring-linea ${className}`}>
      <div ref={caja} role="region" aria-label="Mapa de las áreas con servicio" className="size-full" />
      {!listo && <div className="absolute inset-0 bg-butaca"><Cargando texto="Cargando mapa…" /></div>}
    </div>
  )
}
