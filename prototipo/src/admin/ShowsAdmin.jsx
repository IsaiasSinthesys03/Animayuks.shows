import { useState } from 'react'
import { ImagePlus, Plus } from 'lucide-react'
import { CATEGORIAS, SHOWS } from '../data/mock'
import { pesos } from '../lib/format'
import { useStore } from '../store'
import { Boton, Campo, Input, Panel, Select, claseInput } from '../components/ui'
import { Encabezado } from './AdminLayout'

function Interruptor({ activo, onCambio, etiqueta }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={onCambio}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${activo ? 'bg-ok' : 'bg-linea'}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ${activo ? 'translate-x-5' : ''}`} />
    </button>
  )
}

export { Interruptor }

export default function ShowsAdmin() {
  const { avisar } = useStore()
  const [activos, setActivos] = useState(() => Object.fromEntries(SHOWS.map((s) => [s.id, true])))
  const [editando, setEditando] = useState(null)
  const s = editando === 'nuevo' ? { nombre: '', categoria: CATEGORIAS[0], duracion: 60, artistas: 1, precio: 0, descripcion: '', paquetes: [] } : SHOWS.find((x) => x.id === editando)

  return (
    <>
      <Encabezado titulo="Shows" descripcion="Lo que aparece en la cartelera del sitio">
        <Boton tam="sm" onClick={() => setEditando('nuevo')}><Plus className="size-4" /> Agregar show</Boton>
      </Encabezado>

      <ul className="grid gap-3 md:grid-cols-2">
        {SHOWS.map((sh) => (
          <li key={sh.id} className={`flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-linea ${activos[sh.id] ? '' : 'opacity-60'}`}>
            <span className={`flex size-20 shrink-0 items-end rounded-xl p-2 ${sh.cartel.fondo} ${sh.cartel.texto}`}>
              <span className="font-cartel text-base leading-none font-black uppercase">{sh.nombre}</span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{sh.nombre}</p>
                <Interruptor
                  activo={activos[sh.id]}
                  etiqueta={`Mostrar ${sh.nombre} en el sitio`}
                  onCambio={() => {
                    setActivos({ ...activos, [sh.id]: !activos[sh.id] })
                    avisar(activos[sh.id] ? `${sh.nombre} oculto del sitio` : `${sh.nombre} visible en el sitio`)
                  }}
                />
              </div>
              <p className="text-sm text-tinta-soft">{sh.categoria}, {sh.duracion} min, {sh.paquetes.length} {sh.paquetes.length === 1 ? 'paquete' : 'paquetes'}</p>
              <p className="num mt-1 text-sm">Desde <span className="font-semibold">{pesos(sh.precio)}</span></p>
              <button onClick={() => setEditando(sh.id)} className="mt-2 text-sm font-semibold text-telon-700 underline">Editar</button>
            </div>
          </li>
        ))}
      </ul>

      <Panel abierto={!!editando} onCerrar={() => setEditando(null)} titulo={editando === 'nuevo' ? 'Agregar show' : `Editar ${s?.nombre}`} ancho="max-w-xl">
        {s && (
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault()
              avisar(editando === 'nuevo' ? 'Show agregado (simulado)' : 'Cambios guardados')
              setEditando(null)
            }}
          >
            <Campo etiqueta="Nombre"><Input defaultValue={s.nombre} placeholder="Ej. Show de Robots" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Categoría"><Select defaultValue={s.categoria}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</Select></Campo>
              <Campo etiqueta="Precio base"><Input inputMode="numeric" defaultValue={s.precio || ''} /></Campo>
              <Campo etiqueta="Duración (min)"><Input inputMode="numeric" defaultValue={s.duracion} /></Campo>
              <Campo etiqueta="Montaje + desmontaje (min)" ayuda="Se suma al bloquear la agenda."><Input inputMode="numeric" defaultValue={45} /></Campo>
            </div>
            <Campo etiqueta="Descripción"><textarea rows={4} defaultValue={s.descripcion} className={`${claseInput} h-auto py-3`} /></Campo>
            <div>
              <p className="mb-1.5 text-sm font-semibold">Fotos y video</p>
              <button type="button" className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-linea py-8 text-sm text-tinta-soft hover:bg-butaca">
                <ImagePlus className="size-6" /> Arrastra imágenes o haz clic para subir
              </button>
            </div>
            {s.paquetes.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-semibold">Paquetes</p>
                <ul className="divide-y divide-linea rounded-xl ring-1 ring-linea">
                  {s.paquetes.map((p) => (
                    <li key={p.id} className="flex justify-between px-4 py-2.5 text-[15px]"><span>{p.nombre}</span><span className="num font-semibold">{pesos(p.precio)}</span></li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Boton type="submit">{editando === 'nuevo' ? 'Agregar show' : 'Guardar cambios'}</Boton>
              <Boton type="button" variante="fantasma" onClick={() => setEditando(null)}>Descartar</Boton>
            </div>
          </form>
        )}
      </Panel>
    </>
  )
}
