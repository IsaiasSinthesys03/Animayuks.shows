import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Map as IconoMapa, MapPin, Plus, Trash2, Wallet } from 'lucide-react'
import { catalogoCpsPorCodigo, mensajeError, zonaPorCP } from '../lib/api'
import { borrarZona, guardarZona } from '../lib/apiAdmin'
import { useZonas } from '../lib/consultas'
import { pesos, resumenCobertura } from '../lib/format'
import { useStore } from '../store'
import { Boton, Campo, Cargando, ErrorCarga, Input, Panel } from '../components/ui'
import { Encabezado, Interruptor } from './AdminLayout'
import SelectorCobertura from './SelectorCobertura'
import MapaZonas from './MapaZonas'

const COLORES = [
  '#287a45', '#e9b83f', '#75b9a0', '#dc2626', '#ea580c', '#a3122a',
  '#a16207', '#65a30d', '#16a34a', '#f2b705', '#0d9488', '#0891b2',
  '#0369a1', '#2563eb', '#4f46e5', '#3b2a8f', '#7c3aed', '#a21caf',
  '#db2777', '#be185d', '#78350f', '#57534e', '#5e5873', '#0f172a',
]
function Seccion({ titulo, ayuda, children }) {
  return (
    <section>
      <h3 className="font-bold">{titulo}</h3>
      {ayuda && <p className="mt-0.5 mb-3 text-sm text-tinta-soft">{ayuda}</p>}
      <div className={ayuda ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

function Editor({ zona, otras, onCerrar }) {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const usados = otras.map((z) => z.color)
  const [f, setF] = useState({
    nombre: zona?.nombre ?? '',
    cargo: zona?.cargo_traslado ?? '',
    traslado: zona?.traslado_min ?? 30,
    color: zona?.color ?? COLORES.find((c) => !usados.includes(c)) ?? COLORES[0],
  })
  const [cobertura, setCobertura] = useState({
    estados: zona?.estados ?? [], municipios: zona?.municipios ?? [], codigos: zona?.codigos_postales ?? [],
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.nombre.trim()) return setError('Escribe el nombre de la zona.')
    if (cobertura.estados.length + cobertura.municipios.length + cobertura.codigos.length === 0) return setError('Elige al menos un estado, ciudad o colonia.')
    setGuardando(true)
    try {
      await guardarZona(zona?.id, {
        nombre: f.nombre.trim(),
        estados: cobertura.estados,
        municipios: cobertura.municipios,
        codigos_postales: cobertura.codigos,
        cargo_traslado: Number(f.cargo) || 0,
        traslado_min: Number(f.traslado) || 0,
        color: f.color,
      })
      await queryClient.invalidateQueries({ queryKey: ['zonas'] })
      queryClient.invalidateQueries({ queryKey: ['disponibilidad'] })
      queryClient.invalidateQueries({ queryKey: ['horarios'] })
      avisar(zona ? 'Zona actualizada' : 'Zona agregada')
      onCerrar()
    } catch (err) {
      const nombreRepetido = err.code === '23505' && !err.message?.startsWith('COBERTURA_DUPLICADA')
      setError(nombreRepetido ? 'Ya existe una zona con ese nombre.' : mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  const colorPropio = !COLORES.includes(f.color)

  return (
    <Panel abierto onCerrar={onCerrar} titulo={zona ? `Editar ${zona.nombre}` : 'Agregar zona'} ancho="max-w-2xl">
      <form onSubmit={guardar} noValidate>
        <div className="space-y-7 p-5">
          <Campo etiqueta="Nombre de la zona">
            <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Norte, Zapopan, Todo Jalisco…" />
          </Campo>

          <Seccion titulo="¿Qué lugares cubre?" ayuda="Un estado, una ciudad o solo una parte de ella.">
            <SelectorCobertura valor={cobertura} onCambio={setCobertura} otras={otras} />
          </Seccion>

          <Seccion titulo="¿Cuánto cuesta llegar?" ayuda="El costo se suma al precio del show de quienes reservan en esta zona.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Costo extra"><Input inputMode="decimal" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0" /></Campo>
              <Campo etiqueta="Tiempo de traslado (min)" ayuda="Se aparta en la agenda, antes y después del show."><Input inputMode="numeric" value={f.traslado} onChange={(e) => setF({ ...f, traslado: e.target.value.replace(/\D/g, '') })} /></Campo>
            </div>
          </Seccion>

          <Seccion titulo="Color" ayuda="Para distinguir la zona de un vistazo.">
            <div className="flex flex-wrap gap-2">
              {COLORES.map((c) => {
                const ocupado = usados.includes(c) && f.color !== c
                return (
                  <button key={c} type="button" aria-label={`Color ${c}${ocupado ? ', ya lo usa otra zona' : ''}`} aria-pressed={f.color === c} title={ocupado ? 'Ya lo usa otra zona' : undefined} onClick={() => setF({ ...f, color: c })} className={`flex size-9 items-center justify-center rounded-full ${f.color === c ? 'ring-2 ring-tinta ring-offset-2' : ''} ${ocupado ? 'opacity-35' : ''}`} style={{ background: c }}>
                    {f.color === c && <Check className="size-4 text-white" aria-hidden />}
                  </button>
                )
              })}
              <label className={`relative flex h-9 cursor-pointer items-center gap-2 rounded-full bg-butaca pr-3 pl-1.5 text-sm font-semibold hover:bg-linea ${colorPropio ? 'ring-2 ring-tinta ring-offset-2' : ''}`}>
                <span className="size-6 rounded-full" style={{ background: colorPropio ? f.color : 'conic-gradient(#dc2626, #f2b705, #16a34a, #0891b2, #4f46e5, #db2777, #dc2626)' }} aria-hidden />
                Otro color
                <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
            </div>
          </Seccion>
        </div>

        <div className="sticky bottom-0 border-t border-linea bg-white p-4">
          {error && <p role="alert" className="mb-2 rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
          <Boton type="submit" className="w-full" disabled={guardando}>{guardando ? 'Guardando…' : zona ? 'Guardar cambios' : 'Agregar zona'}</Boton>
        </div>
      </form>
    </Panel>
  )
}

function ProbarCP() {
  const [cp, setCp] = useState('')
  const [resultado, setResultado] = useState(null)

  const probar = async (valor) => {
    setCp(valor)
    setResultado(null)
    if (valor.length !== 5) return
    try {
      const [zona, lugares] = await Promise.all([zonaPorCP(valor), catalogoCpsPorCodigo([valor])])
      setResultado({ zona, lugar: lugares[0] })
    } catch (err) {
      setResultado({ error: mensajeError(err) })
    }
  }

  const { zona, lugar, error } = resultado ?? {}
  return (
    <section className="mb-5 max-w-xl rounded-2xl bg-white p-5 ring-1 ring-linea">
      <h2 className="mb-2 font-bold">Probar un código postal</h2>
      <Input inputMode="numeric" maxLength={5} value={cp} onChange={(e) => probar(e.target.value.replace(/\D/g, ''))} aria-label="Código postal de prueba" placeholder="45110" />
      <div aria-live="polite">
        {error && <p className="mt-2 text-sm font-semibold text-error">{error}</p>}
        {lugar && <p className="mt-2 text-sm text-tinta-soft">{lugar.municipio}, {lugar.estado}: {lugar.colonias.slice(0, 3).join(', ')}{lugar.colonias.length > 3 ? '…' : ''}</p>}
        {zona && <p className="mt-1 text-sm font-semibold text-ok">Cae en {zona.nombre}. Costo extra {pesos(zona.cargo_traslado)}.</p>}
        {resultado && !zona && !error && <p className="mt-1 text-sm font-semibold text-error">Sin cobertura: el sitio rechazará la reservación.</p>}
      </div>
    </section>
  )
}

export default function Zonas() {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const zonas = useZonas()
  const [editando, setEditando] = useState(undefined) // undefined: cerrado, null: nueva, id: editar
  const actual = editando ? zonas.data?.find((z) => z.id === editando) : null
  const [errorBorrar, setErrorBorrar] = useState('')
  const [verMapa, setVerMapa] = useState(false)

  const eliminar = async (z) => {
    setErrorBorrar('')
    if (!window.confirm(`¿Eliminar la zona ${z.nombre}? Sus lugares dejarán de tener cobertura.`)) return
    try {
      await borrarZona(z.id)
      await queryClient.invalidateQueries({ queryKey: ['zonas'] })
      avisar(`${z.nombre} eliminada`)
    } catch (err) {
      setErrorBorrar(err.code === '23503'
        ? `${z.nombre} tiene reservaciones y no se puede eliminar. Puedes pausarla con su interruptor.`
        : mensajeError(err))
    }
  }

  return (
    <>
      <Encabezado titulo="Zonas de cobertura" descripcion="Dónde das servicio y cuánto cuesta llegar">
        <Boton tam="sm" variante="secundario" onClick={() => setVerMapa(true)}><IconoMapa className="size-4" /> Ver mapa</Boton>
        <Boton tam="sm" onClick={() => setEditando(null)} disabled={!zonas.data}><Plus className="size-4" /> Agregar zona</Boton>
      </Encabezado>

      <ProbarCP />

      {zonas.isLoading && <Cargando />}
      {zonas.isError && <ErrorCarga onReintentar={zonas.refetch} />}

      {errorBorrar && <p role="alert" className="mb-3 rounded-xl bg-error-soft px-4 py-3 text-sm font-medium text-error">{errorBorrar}</p>}

      {zonas.data?.length === 0 && <div className="rounded-2xl bg-white p-10 text-center font-semibold ring-1 ring-linea">Sin zonas, nadie puede reservar en línea. Agrega la primera.</div>}

      {zonas.data?.length > 0 && (
        <ul className="space-y-3">
          {zonas.data.map((z) => (
            <li key={z.id} className={`relative overflow-hidden rounded-2xl bg-white py-4 pr-4 pl-6 ring-1 ring-linea ${z.activa ? '' : 'opacity-60'}`}>
              <span className="absolute inset-y-0 left-0 w-2" style={{ background: z.color }} aria-hidden />
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-lg font-bold">{z.nombre}</p>
                  <dl className="mt-1 space-y-1 text-sm text-tinta-soft">
                    <div className="flex gap-2"><dt><MapPin className="mt-0.5 size-4" aria-label="Lugares" /></dt><dd>{resumenCobertura(z)}</dd></div>
                    <div className="flex gap-2"><dt><Wallet className="mt-0.5 size-4" aria-label="Costo" /></dt><dd className="num">{Number(z.cargo_traslado) ? `${pesos(z.cargo_traslado)} extra` : 'Sin costo extra'}, {z.traslado_min} min de traslado</dd></div>
                  </dl>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditando(z.id)} className="text-sm font-semibold text-selva-700 underline">Editar</button>
                  <Interruptor activo={z.activa} etiqueta={`Aceptar reservaciones en ${z.nombre}`} onCambio={async () => {
                    await guardarZona(z.id, { activa: !z.activa })
                    await queryClient.invalidateQueries({ queryKey: ['zonas'] })
                    avisar(z.activa ? `${z.nombre} pausada` : `${z.nombre} activada`)
                  }} />
                  <button onClick={() => eliminar(z)} aria-label={`Eliminar ${z.nombre}`} className="rounded-full p-2 text-tinta-soft hover:bg-error-soft hover:text-error">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {verMapa && <MapaZonas onCerrar={() => setVerMapa(false)} />}

      {editando !== undefined && <Editor key={editando ?? 'nueva'} zona={actual} otras={(zonas.data ?? []).filter((z) => z.id !== editando)} onCerrar={() => setEditando(undefined)} />}
    </>
  )
}
