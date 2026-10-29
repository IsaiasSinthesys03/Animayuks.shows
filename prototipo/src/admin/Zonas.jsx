import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ZONAS } from '../data/mock'
import { pesos } from '../lib/format'
import { useStore } from '../store'
import { Boton, Campo, Input, Panel, Select } from '../components/ui'
import MapaZonas from '../components/MapaZonas'
import { Interruptor } from './ShowsAdmin'
import { Encabezado } from './AdminLayout'

export default function Zonas() {
  const { avisar } = useStore()
  const [zonas, setZonas] = useState(ZONAS)
  const [prueba, setPrueba] = useState('')
  const [nueva, setNueva] = useState(false)
  const [metodo, setMetodo] = useState('cp')

  const resultado = prueba.length === 5 ? zonas.find((z) => z.activa && z.prefijos.includes(prueba.slice(0, 3))) ?? null : undefined

  return (
    <>
      <Encabezado titulo="Zonas de cobertura" descripcion="Fuera de estas zonas el sitio no acepta reservaciones">
        <Boton tam="sm" onClick={() => setNueva(true)}><Plus className="size-4" /> Agregar zona</Boton>
      </Encabezado>

      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <MapaZonas className="self-start bg-white" />
        <div className="space-y-5">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
            <h2 className="font-bold">Probar un código postal</h2>
            <Input inputMode="numeric" maxLength={5} value={prueba} onChange={(e) => setPrueba(e.target.value.replace(/\D/g, ''))} placeholder="45110" aria-label="Código postal de prueba" />
            {resultado && <p className="mt-2 text-sm font-semibold text-ok">Cae en {resultado.nombre}, traslado {pesos(resultado.cargo)}</p>}
            {resultado === null && <p className="mt-2 text-sm font-semibold text-telon-700">Sin cobertura: el sitio rechazará la reservación.</p>}
          </section>

          <ul className="divide-y divide-linea overflow-hidden rounded-2xl bg-white ring-1 ring-linea">
            {zonas.map((z) => (
              <li key={z.id} className="flex items-center gap-4 px-5 py-4">
                <span className={`size-3.5 shrink-0 rounded-full ${z.color}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{z.nombre}</p>
                  <p className="num text-sm text-tinta-soft">CP {z.prefijos.length > 3 ? `${z.prefijos[0]}xx–${z.prefijos.at(-1)}xx` : z.prefijos.map((p) => `${p}xx`).join(', ')}, {z.cargo ? `traslado ${pesos(z.cargo)}` : 'sin cargo'}, {z.traslado} min</p>
                </div>
                <Interruptor
                  activo={z.activa}
                  etiqueta={`Aceptar reservaciones en ${z.nombre}`}
                  onCambio={() => {
                    setZonas(zonas.map((x) => (x.id === z.id ? { ...x, activa: !x.activa } : x)))
                    avisar(z.activa ? `${z.nombre} desactivada` : `${z.nombre} activada`)
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Panel abierto={nueva} onCerrar={() => setNueva(false)} titulo="Agregar zona">
        <form className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); avisar('Zona agregada (simulado)'); setNueva(false) }}>
          <Campo etiqueta="Nombre"><Input placeholder="Ej. El Salto" /></Campo>
          <Campo etiqueta="Cómo se define">
            <Select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              <option value="cp">Lista de códigos postales</option>
              <option value="municipio">Municipios o colonias</option>
              <option value="radio">Radio desde la base</option>
              <option value="poligono">Dibujar en el mapa</option>
            </Select>
          </Campo>
          {metodo === 'cp' && <Campo etiqueta="Códigos postales" ayuda="Separados por coma. Acepta prefijos: 456 cubre del 45600 al 45699."><Input placeholder="45680, 45690, 456" /></Campo>}
          {metodo === 'municipio' && <Campo etiqueta="Municipios o colonias"><Input placeholder="El Salto, Juanacatlán" /></Campo>}
          {metodo === 'radio' && <Campo etiqueta="Radio (km)"><Input inputMode="numeric" placeholder="15" /></Campo>}
          {metodo === 'poligono' && <p className="rounded-xl bg-butaca p-4 text-sm text-tinta-soft">En la versión final aquí aparece el mapa para trazar el polígono.</p>}
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Cargo por traslado"><Input inputMode="numeric" placeholder="600" /></Campo>
            <Campo etiqueta="Tiempo de traslado (min)"><Input inputMode="numeric" placeholder="45" /></Campo>
          </div>
          <Boton type="submit">Agregar zona</Boton>
        </form>
      </Panel>
    </>
  )
}
