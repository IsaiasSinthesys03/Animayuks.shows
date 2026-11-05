import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { mensajeError, zonaPorCP } from '../lib/api'
import { guardarZona } from '../lib/apiAdmin'
import { useZonas } from '../lib/consultas'
import { pesos } from '../lib/format'
import { useStore } from '../store'
import { Boton, Campo, Cargando, ErrorCarga, Input, Panel, claseInput } from '../components/ui'
import { Encabezado, Interruptor } from './AdminLayout'

const COLORES = ['#a3122a', '#f2b705', '#0f7b6c', '#3b2a8f', '#c2410c', '#0369a1', '#5e5873']

function Editor({ zona, onCerrar }) {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const [f, setF] = useState({
    nombre: zona?.nombre ?? '', codigos: (zona?.codigos_postales ?? []).join(', '),
    cargo: zona?.cargo_traslado ?? '', traslado: zona?.traslado_min ?? 30, color: zona?.color ?? COLORES[0],
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    const codigos = [...new Set(f.codigos.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))]
    if (!f.nombre.trim()) return setError('Escribe el nombre de la zona.')
    if (codigos.length === 0) return setError('Escribe al menos un código postal o prefijo.')
    const invalido = codigos.find((c) => !/^\d{1,5}$/.test(c))
    if (invalido) return setError(`"${invalido}" no es un código postal ni un prefijo válido.`)
    setGuardando(true)
    try {
      await guardarZona(zona?.id, {
        nombre: f.nombre.trim(), codigos_postales: codigos, cargo_traslado: Number(f.cargo) || 0, traslado_min: Number(f.traslado) || 0, color: f.color,
      })
      await queryClient.invalidateQueries({ queryKey: ['zonas'] })
      avisar(zona ? 'Zona actualizada' : 'Zona agregada')
      onCerrar()
    } catch (err) {
      setError(err.code === '23505' ? 'Ya existe una zona con ese nombre.' : mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Panel abierto onCerrar={onCerrar} titulo={zona ? `Editar ${zona.nombre}` : 'Agregar zona'}>
      <form className="space-y-4 p-5" onSubmit={guardar} noValidate>
        <Campo etiqueta="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
        <Campo etiqueta="Códigos postales" ayuda="Separados por coma. Acepta prefijos: 451 cubre del 45100 al 45199.">
          <textarea rows={3} value={f.codigos} onChange={(e) => setF({ ...f, codigos: e.target.value })} className={`${claseInput} num h-auto py-3`} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Cargo por traslado"><Input inputMode="decimal" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0" /></Campo>
          <Campo etiqueta="Tiempo de traslado (min)" ayuda="Se bloquea en la agenda, antes y después."><Input inputMode="numeric" value={f.traslado} onChange={(e) => setF({ ...f, traslado: e.target.value.replace(/\D/g, '') })} /></Campo>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Color</legend>
          <div className="flex gap-2">
            {COLORES.map((c) => (
              <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={f.color === c} onClick={() => setF({ ...f, color: c })} className={`size-8 rounded-full ${f.color === c ? 'ring-2 ring-tinta ring-offset-2' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="rounded-xl bg-telon-50 px-3 py-2 text-sm font-medium text-telon-700">{error}</p>}
        <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : zona ? 'Guardar cambios' : 'Agregar zona'}</Boton>
      </form>
    </Panel>
  )
}

export default function Zonas() {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const zonas = useZonas()
  const [prueba, setPrueba] = useState('')
  const [resultado, setResultado] = useState(undefined)
  const [editando, setEditando] = useState(undefined) // undefined: cerrado, null: nueva, id: editar
  const actual = editando ? zonas.data?.find((z) => z.id === editando) : null

  const probar = async (cp) => {
    setPrueba(cp)
    setResultado(undefined)
    if (cp.length === 5) {
      try {
        setResultado(await zonaPorCP(cp))
      } catch {
        setResultado(undefined)
      }
    }
  }

  return (
    <>
      <Encabezado titulo="Zonas de cobertura" descripcion="Fuera de estas zonas el sitio no acepta reservaciones">
        <Boton tam="sm" onClick={() => setEditando(null)}><Plus className="size-4" /> Agregar zona</Boton>
      </Encabezado>

      <section className="mb-5 max-w-md rounded-2xl bg-white p-5 ring-1 ring-linea">
        <h2 className="mb-2 font-bold">Probar un código postal</h2>
        <Input inputMode="numeric" maxLength={5} value={prueba} onChange={(e) => probar(e.target.value.replace(/\D/g, ''))} aria-label="Código postal de prueba" />
        {resultado && <p className="mt-2 text-sm font-semibold text-ok">Cae en {resultado.nombre}, traslado {pesos(resultado.cargo_traslado)}</p>}
        {resultado === null && <p className="mt-2 text-sm font-semibold text-telon-700">Sin cobertura: el sitio rechazará la reservación.</p>}
      </section>

      {zonas.isLoading && <Cargando />}
      {zonas.isError && <ErrorCarga onReintentar={zonas.refetch} />}

      {zonas.data?.length === 0 && <div className="rounded-2xl bg-white p-10 text-center font-semibold ring-1 ring-linea">Sin zonas, nadie puede reservar en línea. Agrega la primera.</div>}

      {zonas.data?.length > 0 && (
        <ul className="divide-y divide-linea overflow-hidden rounded-2xl bg-white ring-1 ring-linea">
          {zonas.data.map((z) => (
            <li key={z.id} className={`flex items-center gap-4 px-5 py-4 ${z.activa ? '' : 'opacity-60'}`}>
              <span className="size-3.5 shrink-0 rounded-full" style={{ background: z.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{z.nombre}</p>
                <p className="num truncate text-sm text-tinta-soft">CP {z.codigos_postales.join(', ')}</p>
                <p className="num text-sm text-tinta-soft">{Number(z.cargo_traslado) ? `Traslado ${pesos(z.cargo_traslado)}` : 'Sin cargo'}, {z.traslado_min} min</p>
              </div>
              <button onClick={() => setEditando(z.id)} className="text-sm font-semibold text-telon-700 underline">Editar</button>
              <Interruptor activo={z.activa} etiqueta={`Aceptar reservaciones en ${z.nombre}`} onCambio={async () => {
                await guardarZona(z.id, { activa: !z.activa })
                await queryClient.invalidateQueries({ queryKey: ['zonas'] })
                avisar(z.activa ? `${z.nombre} desactivada` : `${z.nombre} activada`)
              }} />
            </li>
          ))}
        </ul>
      )}

      {editando !== undefined && <Editor key={editando ?? 'nueva'} zona={actual} onCerrar={() => setEditando(undefined)} />}
    </>
  )
}
