import { Plus } from 'lucide-react'
import FilaFranja from './FilaFranja'
import { MAX_FRANJAS, PLANTILLAS, aMinutos, nuevaClave, nuevaFranja } from './util'

/** Las franjas de un día (semana normal o día especial) */
export default function EditorFranjas({ franjas, nombreDia, onCambio, plantillas = true }) {
  const cambiar = (clave, cambios) => onCambio(franjas.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)))

  const agregar = () => {
    // La nueva franja empieza una hora después de la última, si cabe
    const ultima = [...franjas].sort((a, b) => b.cierra.localeCompare(a.cierra))[0]
    const inicio = ultima ? Math.min(aMinutos(ultima.cierra) + 60, 21 * 60) : 10 * 60
    const texto = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    onCambio([...franjas, nuevaFranja(texto(inicio), texto(Math.min(inicio + 240, 23 * 60 + 45)))])
  }

  return (
    <div>
      {franjas.length === 0 && <p className="text-sm text-tinta-soft">Sin franjas: este día no se ofrecen horas.</p>}
      <ul className="space-y-2">
        {franjas.map((f) => (
          <FilaFranja key={f.clave} franja={f} nombreDia={nombreDia} onCambio={(c) => cambiar(f.clave, c)} onQuitar={() => onCambio(franjas.filter((x) => x.clave !== f.clave))} />
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {franjas.length < MAX_FRANJAS && (
          <button type="button" onClick={agregar} className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-sm font-semibold text-selva-700 hover:bg-selva-50">
            <Plus className="size-4" /> Agregar franja
          </button>
        )}
        {plantillas && (
          <>
            <span className="ml-1 text-xs text-tinta-soft">Rápido:</span>
            {PLANTILLAS.map((p) => (
              <button
                key={p.nombre}
                type="button"
                onClick={() => onCambio(p.franjas.map(([abre, cierra]) => ({ ...nuevaFranja(abre, cierra), clave: nuevaClave() })))}
                className="h-7 rounded-full bg-butaca px-2.5 text-xs font-semibold hover:bg-linea"
              >
                {p.nombre}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
