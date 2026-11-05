import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock, MapPin, Plus, Trash2, Wallet } from 'lucide-react'
import { catalogoCpsPorCodigo, mensajeError, zonaPorCP } from '../lib/api'
import { borrarZona, guardarZona, obtenerHorario } from '../lib/apiAdmin'
import { useZonas } from '../lib/consultas'
import { pesos, resumenCobertura, resumenHorario } from '../lib/format'
import { useStore } from '../store'
import { Boton, Campo, Cargando, ErrorCarga, Input, Panel } from '../components/ui'
import { Encabezado, Interruptor } from './AdminLayout'
import SelectorCobertura from './SelectorCobertura'

const COLORES = [
  '#a3122a', '#dc2626', '#ea580c', '#c2410c', '#d97706', '#f2b705',
  '#a16207', '#65a30d', '#16a34a', '#0f7b6c', '#0d9488', '#0891b2',
  '#0369a1', '#2563eb', '#4f46e5', '#3b2a8f', '#7c3aed', '#a21caf',
  '#db2777', '#be185d', '#78350f', '#57534e', '#5e5873', '#0f172a',
]
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const ORDEN = [1, 2, 3, 4, 5, 6, 0]
const FRANJAS = [
  { nombre: 'Mañanas', abre: '09:00', cierra: '14:00' },
  { nombre: 'Tardes', abre: '14:00', cierra: '19:00' },
  { nombre: 'Noches', abre: '18:00', cierra: '23:00' },
  { nombre: 'Todo el día', abre: '09:00', cierra: '23:00' },
]

/** La semana editable sale del horario de la zona o, si no tiene, del horario general */
const semanaInicial = (zona, general) => {
  const generalEncendido = general?.some((d) => d.activo)
  return ORDEN.map((dia) => {
    const propio = zona?.horario?.[dia]
    if (zona?.horario) return { dia, activo: !!propio, abre: propio?.abre ?? '09:00', cierra: propio?.cierra ?? '14:00' }
    const g = general?.find((d) => d.dia_semana === dia)
    // Si el horario general está apagado no hay qué copiar: se empieza con toda la semana
    return { dia, activo: generalEncendido ? g.activo : true, abre: g?.abre?.slice(0, 5) ?? '09:00', cierra: g?.cierra?.slice(0, 5) ?? '23:00' }
  })
}

function Seccion({ titulo, ayuda, children }) {
  return (
    <section>
      <h3 className="font-bold">{titulo}</h3>
      {ayuda && <p className="mt-0.5 mb-3 text-sm text-tinta-soft">{ayuda}</p>}
      <div className={ayuda ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

function Editor({ zona, otras, general, onCerrar }) {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const usados = otras.map((z) => z.color)
  const [f, setF] = useState({
    nombre: zona?.nombre ?? '',
    cargo: zona?.cargo_traslado ?? '',
    traslado: zona?.traslado_min ?? 30,
    color: zona?.color ?? COLORES.find((c) => !usados.includes(c)) ?? COLORES[0],
    propio: !!zona?.horario,
  })
  const [cobertura, setCobertura] = useState({
    estados: zona?.estados ?? [], municipios: zona?.municipios ?? [], codigos: zona?.codigos_postales ?? [],
  })
  const [semana, setSemana] = useState(() => semanaInicial(zona, general))
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cambiarDia = (dia, cambios) => setSemana((s) => s.map((d) => (d.dia === dia ? { ...d, ...cambios } : d)))
  const aplicarFranja = (franja) => setSemana((s) => {
    const hayDias = s.some((d) => d.activo)
    return s.map((d) => (d.activo || !hayDias ? { ...d, activo: true, abre: franja.abre, cierra: franja.cierra } : d))
  })
  const diasActivos = semana.filter((d) => d.activo)
  const franjaActual = diasActivos.length > 0 && FRANJAS.find((x) => diasActivos.every((d) => d.abre === x.abre && d.cierra === x.cierra))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.nombre.trim()) return setError('Escribe el nombre de la zona.')
    if (cobertura.estados.length + cobertura.municipios.length + cobertura.codigos.length === 0) return setError('Elige al menos un estado, ciudad o colonia.')
    const activos = semana.filter((d) => d.activo)
    if (f.propio && activos.length === 0) return setError('Elige al menos un día para el horario de esta zona.')
    const malo = f.propio && activos.find((d) => d.cierra <= d.abre)
    if (malo) return setError(`El ${DIAS[malo.dia].toLowerCase()} la hora de cierre debe ser después de la de apertura.`)
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
        horario: f.propio ? Object.fromEntries(activos.map((d) => [d.dia, { abre: d.abre, cierra: d.cierra }])) : null,
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

          <Seccion titulo="¿Cuándo das servicio aquí?">
            <div role="radiogroup" aria-label="Horario de la zona" className="grid grid-cols-2 gap-1 rounded-xl bg-butaca p-1">
              {[[false, 'Horario general'], [true, 'Horario propio']].map(([valor, texto]) => (
                <button key={texto} type="button" role="radio" aria-checked={f.propio === valor} onClick={() => setF({ ...f, propio: valor })} className={`h-10 rounded-lg text-[15px] font-semibold transition-colors ${f.propio === valor ? 'bg-white shadow-sm' : 'text-tinta-soft hover:text-tinta'}`}>
                  {texto}
                </button>
              ))}
            </div>
            {!f.propio && (
              <p className="mt-2 text-sm text-tinta-soft">Usa lo que tengas en <Link to="/admin/disponibilidad" className="font-semibold text-telon-700 underline">Horarios y bloqueos</Link>.</p>
            )}
            {f.propio && (
              <div className="mt-3">
                <p className="mb-2 text-sm text-tinta-soft">Este horario reemplaza al general en esta zona. Aplica una franja a los días encendidos o ajusta cada día:</p>
                <div className="flex flex-wrap gap-2">
                  {FRANJAS.map((x) => (
                    <button key={x.nombre} type="button" aria-pressed={franjaActual === x} onClick={() => aplicarFranja(x)} className={`h-9 rounded-full px-3 text-sm font-semibold transition-colors ${franjaActual === x ? 'bg-tinta text-white' : 'bg-butaca hover:bg-linea'}`}>
                      {x.nombre}
                    </button>
                  ))}
                </div>
                <ul className="mt-2 divide-y divide-linea">
                  {semana.map((d) => (
                    <li key={d.dia} className="flex flex-wrap items-center gap-3 py-2.5">
                      <Interruptor activo={d.activo} etiqueta={`Dar servicio los ${DIAS[d.dia].toLowerCase()} en esta zona`} onCambio={() => cambiarDia(d.dia, { activo: !d.activo })} />
                      <span className="w-24 font-medium">{DIAS[d.dia]}</span>
                      {d.activo ? (
                        <span className="flex items-center gap-2 text-sm">
                          <input type="time" value={d.abre} onChange={(e) => cambiarDia(d.dia, { abre: e.target.value })} className="num h-9 rounded-lg border border-linea px-2" aria-label={`${DIAS[d.dia]} desde`} />
                          a
                          <input type="time" value={d.cierra} onChange={(e) => cambiarDia(d.dia, { cierra: e.target.value })} className="num h-9 rounded-lg border border-linea px-2" aria-label={`${DIAS[d.dia]} hasta`} />
                        </span>
                      ) : (
                        <span className="text-sm text-tinta-soft">Sin servicio</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
          {error && <p role="alert" className="mb-2 rounded-xl bg-telon-50 px-3 py-2 text-sm font-medium text-telon-700">{error}</p>}
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
        {error && <p className="mt-2 text-sm font-semibold text-telon-700">{error}</p>}
        {lugar && <p className="mt-2 text-sm text-tinta-soft">{lugar.municipio}, {lugar.estado}: {lugar.colonias.slice(0, 3).join(', ')}{lugar.colonias.length > 3 ? '…' : ''}</p>}
        {zona && <p className="mt-1 text-sm font-semibold text-ok">Cae en {zona.nombre}. Costo extra {pesos(zona.cargo_traslado)}. {resumenHorario(zona.horario) ?? 'Horario general'}.</p>}
        {resultado && !zona && !error && <p className="mt-1 text-sm font-semibold text-telon-700">Sin cobertura: el sitio rechazará la reservación.</p>}
      </div>
    </section>
  )
}

export default function Zonas() {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const zonas = useZonas()
  const horario = useQuery({ queryKey: ['admin-horario'], queryFn: obtenerHorario })
  const [editando, setEditando] = useState(undefined) // undefined: cerrado, null: nueva, id: editar
  const actual = editando ? zonas.data?.find((z) => z.id === editando) : null
  const [errorBorrar, setErrorBorrar] = useState('')
  const generalApagado = horario.data && !horario.data.some((d) => d.activo)

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
      <Encabezado titulo="Zonas de cobertura" descripcion="Dónde das servicio, cuánto cuesta llegar y a qué horas">
        <Boton tam="sm" onClick={() => setEditando(null)} disabled={!zonas.data || !horario.data}><Plus className="size-4" /> Agregar zona</Boton>
      </Encabezado>

      <ProbarCP />

      {zonas.isLoading && <Cargando />}
      {zonas.isError && <ErrorCarga onReintentar={zonas.refetch} />}

      {errorBorrar && <p role="alert" className="mb-3 rounded-xl bg-telon-50 px-4 py-3 text-sm font-medium text-telon-700">{errorBorrar}</p>}

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
                    <div className="flex gap-2"><dt><Clock className="mt-0.5 size-4" aria-label="Horario" /></dt><dd className="num">{resumenHorario(z.horario) ?? 'Horario general'}</dd></div>
                  </dl>
                  {!z.horario && generalApagado && (
                    <p className="mt-2 rounded-xl bg-telon-50 px-3 py-2 text-sm font-medium text-telon-700">
                      Sin fechas disponibles: el horario general no tiene días encendidos. <Link to="/admin/disponibilidad" className="underline">Enciéndelos</Link> o dale a esta zona un horario propio.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditando(z.id)} className="text-sm font-semibold text-telon-700 underline">Editar</button>
                  <Interruptor activo={z.activa} etiqueta={`Aceptar reservaciones en ${z.nombre}`} onCambio={async () => {
                    await guardarZona(z.id, { activa: !z.activa })
                    await queryClient.invalidateQueries({ queryKey: ['zonas'] })
                    avisar(z.activa ? `${z.nombre} pausada` : `${z.nombre} activada`)
                  }} />
                  <button onClick={() => eliminar(z)} aria-label={`Eliminar ${z.nombre}`} className="rounded-full p-2 text-tinta-soft hover:bg-telon-50 hover:text-telon-700">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editando !== undefined && <Editor key={editando ?? 'nueva'} zona={actual} otras={(zonas.data ?? []).filter((z) => z.id !== editando)} general={horario.data} onCerrar={() => setEditando(undefined)} />}
    </>
  )
}
