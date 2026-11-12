import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { mensajeError, urlImagen } from '../lib/api'
import { borrarCategoria, borrarModalidad, borrarPaquete, guardarCategoria, guardarModalidad, renombrarCategoria, guardarPaquete, guardarShow, subirImagen } from '../lib/apiAdmin'
import { useCategorias, useModalidades, useShows } from '../lib/consultas'
import { pesos } from '../lib/format'
import { useStore } from '../store'
import { Boton, Campo, Cargando, ErrorCarga, Input, Miniatura, Panel, Select, claseInput } from '../components/ui'
import { Encabezado, Interruptor } from './AdminLayout'
import HorarioShow from './horarios/HorarioShow'

const aSlug = (t) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const MAX_IMAGEN_MB = 10

function usarInvalidar() {
  const queryClient = useQueryClient()
  return () => Promise.all(['shows', 'show', 'modalidades', 'categorias'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
}

function EditorPaquete({ showId, paquete, onListo }) {
  const invalidar = usarInvalidar()
  const [f, setF] = useState({
    nombre: paquete?.nombre ?? '', precio: paquete?.precio ?? '', duracion_min: paquete?.duracion_min ?? '', incluye: (paquete?.incluye ?? []).join('\n'),
  })
  const [error, setError] = useState('')
  const guardar = async (e) => {
    e.preventDefault()
    if (!f.nombre.trim() || !(Number(f.precio) >= 0) || f.precio === '') return setError('Escribe el nombre y el precio.')
    try {
      await guardarPaquete(paquete?.id, {
        show_id: showId, nombre: f.nombre.trim(), precio: Number(f.precio), duracion_min: f.duracion_min === '' ? null : Number(f.duracion_min),
        incluye: f.incluye.split('\n').map((x) => x.trim()).filter(Boolean),
      })
      await invalidar()
      onListo()
    } catch (err) {
      setError(err.code === '23505' ? 'Este show ya tiene un paquete con ese nombre.' : mensajeError(err))
    }
  }
  return (
    <div className="space-y-3 rounded-xl bg-butaca p-3">
      <div className="grid grid-cols-[1fr_100px_100px] gap-2">
        <Campo etiqueta="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
        <Campo etiqueta="Precio"><Input inputMode="decimal" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value.replace(/[^\d.]/g, '') })} /></Campo>
        <Campo etiqueta="Minutos"><Input inputMode="numeric" value={f.duracion_min} onChange={(e) => setF({ ...f, duracion_min: e.target.value.replace(/\D/g, '') })} placeholder="igual" /></Campo>
      </div>
      <Campo etiqueta="Qué incluye (uno por línea)"><textarea rows={2} value={f.incluye} onChange={(e) => setF({ ...f, incluye: e.target.value })} className={`${claseInput} h-auto py-2`} /></Campo>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <div className="flex gap-2">
        <Boton type="button" tam="sm" onClick={guardar}>Guardar paquete</Boton>
        <Boton type="button" tam="sm" variante="fantasma" onClick={onListo}>Cerrar</Boton>
      </div>
    </div>
  )
}

const CREAR_CATEGORIA = '__crear'

/** Va dentro del formulario del show: Enter crea la categoría sin guardar el show */
function NuevaCategoria({ categorias, onCreada, onCancelar }) {
  const invalidar = usarInvalidar()
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const crear = async () => {
    const limpio = nombre.trim()
    setError('')
    if (!limpio) return setError('Escribe el nombre de la categoría.')
    const existente = categorias.find((c) => c.nombre.toLowerCase() === limpio.toLowerCase())
    if (existente) return onCreada(existente.id)
    setGuardando(true)
    try {
      const nueva = await guardarCategoria(limpio)
      await invalidar()
      onCreada(nueva.id)
    } catch (err) {
      setError(err.code === '23505' ? 'Esa categoría ya existe.' : mensajeError(err))
      setGuardando(false)
    }
  }

  return (
    <div className="col-span-2 rounded-xl bg-butaca p-3">
      <label className="mb-1.5 block text-sm font-semibold" htmlFor="nueva-categoria">Nueva categoría</label>
      <div className="flex flex-wrap gap-2">
        <input
          id="nueva-categoria"
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              crear()
            }
            if (e.key === 'Escape') onCancelar()
          }}
          placeholder="Infantil, bodas, XV años…"
          className={`${claseInput} min-w-40 flex-1`}
        />
        <Boton type="button" onClick={crear} disabled={guardando}>{guardando ? 'Creando…' : 'Crear'}</Boton>
        <Boton type="button" variante="fantasma" onClick={onCancelar}>Cancelar</Boton>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-error">{error}</p>}
    </div>
  )
}

function EditorShow({ show, onCerrar }) {
  const invalidar = usarInvalidar()
  const { avisar } = useStore()
  const { data: categorias } = useCategorias()
  const [actual, setActual] = useState(show) // tras crear el show ya se pueden agregar paquetes
  const [f, setF] = useState({
    nombre: show?.nombre ?? '', categoria_id: show?.categoria_id ?? '', resumen: show?.resumen ?? '', descripcion: show?.descripcion ?? '',
    duracion_min: show?.duracion_min ?? 60, montaje_min: show?.montaje_min ?? 30, desmontaje_min: show?.desmontaje_min ?? 20, artistas: show?.artistas ?? 1,
    precio_base: show?.precio_base ?? '', requisitos: (show?.requisitos ?? []).join('\n'), video_url: show?.video_url ?? '',
    destacado: show?.destacado ?? false, pide_modalidad: show?.pide_modalidad ?? false, orden: show?.orden ?? 0,
  })
  const [imagen, setImagen] = useState(show?.imagen_principal ?? null)
  const [galeria, setGaleria] = useState(show?.galeria ?? [])
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [editandoPaquete, setEditandoPaquete] = useState(null) // id, 'nuevo' o null
  const [creandoCategoria, setCreandoCategoria] = useState(false)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const { data: shows } = useShows()
  const paquetes = (shows ?? []).find((s) => s.id === actual?.id)?.paquetes ?? []

  const subir = async (archivos, alTerminar) => {
    setError('')
    const validos = [...archivos]
    if (validos.some((a) => !a.type.startsWith('image/'))) return setError('Solo se aceptan imágenes.')
    if (validos.some((a) => a.size > MAX_IMAGEN_MB * 1024 * 1024)) return setError(`Cada imagen debe pesar menos de ${MAX_IMAGEN_MB} MB.`)
    setSubiendo(true)
    try {
      const carpeta = aSlug(f.nombre) || 'show'
      alTerminar(await Promise.all(validos.map((a) => subirImagen(a, carpeta))))
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setSubiendo(false)
    }
  }

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.nombre.trim()) return setError('Escribe el nombre del show.')
    if (f.precio_base === '' || !(Number(f.precio_base) >= 0)) return setError('Escribe el precio base.')
    if (!(Number(f.duracion_min) > 0)) return setError('La duración debe ser mayor a 0.')
    setGuardando(true)
    try {
      const datos = {
        nombre: f.nombre.trim(), categoria_id: f.categoria_id || null, resumen: f.resumen.trim(), descripcion: f.descripcion.trim(),
        duracion_min: Number(f.duracion_min), montaje_min: Number(f.montaje_min) || 0, desmontaje_min: Number(f.desmontaje_min) || 0,
        artistas: Number(f.artistas) || 1, precio_base: Number(f.precio_base),
        requisitos: f.requisitos.split('\n').map((x) => x.trim()).filter(Boolean),
        video_url: f.video_url.trim() || null, destacado: f.destacado, pide_modalidad: f.pide_modalidad, orden: Number(f.orden) || 0,
        imagen_principal: imagen, galeria,
      }
      if (!actual) datos.slug = aSlug(f.nombre)
      const guardado = await guardarShow(actual?.id, datos)
      await invalidar()
      avisar(actual ? 'Cambios guardados' : 'Show agregado. Ya aparece en la cartelera.')
      if (actual) onCerrar()
      else setActual(guardado)
    } catch (err) {
      setError(err.code === '23505' ? 'Ya existe un show con ese nombre.' : mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Panel abierto onCerrar={onCerrar} titulo={actual ? `Editar ${actual.nombre}` : 'Agregar show'} ancho="max-w-xl">
      <form className="space-y-4 p-5" onSubmit={guardar} noValidate>
        <Campo etiqueta="Nombre"><Input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Categoría">
            <Select value={f.categoria_id} onChange={(e) => (e.target.value === CREAR_CATEGORIA ? setCreandoCategoria(true) : set('categoria_id', e.target.value))}>
              <option value="">Sin categoría</option>
              {(categorias ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              <option value={CREAR_CATEGORIA}>+ Crear categoría</option>
            </Select>
          </Campo>
          <Campo etiqueta="Precio base"><Input inputMode="decimal" value={f.precio_base} onChange={(e) => set('precio_base', e.target.value.replace(/[^\d.]/g, ''))} /></Campo>
          {creandoCategoria && (
            <NuevaCategoria
              categorias={categorias ?? []}
              onCreada={(id) => {
                set('categoria_id', id)
                setCreandoCategoria(false)
              }}
              onCancelar={() => setCreandoCategoria(false)}
            />
          )}
          <Campo etiqueta="Duración (min)"><Input inputMode="numeric" value={f.duracion_min} onChange={(e) => set('duracion_min', e.target.value.replace(/\D/g, ''))} /></Campo>
          <Campo etiqueta="Artistas"><Input inputMode="numeric" value={f.artistas} onChange={(e) => set('artistas', e.target.value.replace(/\D/g, ''))} /></Campo>
          <Campo etiqueta="Montaje (min)" ayuda="Se bloquea en la agenda."><Input inputMode="numeric" value={f.montaje_min} onChange={(e) => set('montaje_min', e.target.value.replace(/\D/g, ''))} /></Campo>
          <Campo etiqueta="Desmontaje (min)" ayuda="Se bloquea en la agenda."><Input inputMode="numeric" value={f.desmontaje_min} onChange={(e) => set('desmontaje_min', e.target.value.replace(/\D/g, ''))} /></Campo>
        </div>
        <Campo etiqueta="Resumen" ayuda="Una línea para la cartelera."><Input value={f.resumen} onChange={(e) => set('resumen', e.target.value)} /></Campo>
        <Campo etiqueta="Descripción"><textarea rows={4} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} className={`${claseInput} h-auto py-3`} /></Campo>
        <Campo etiqueta="Qué necesitan en el lugar (uno por línea)"><textarea rows={3} value={f.requisitos} onChange={(e) => set('requisitos', e.target.value)} className={`${claseInput} h-auto py-3`} /></Campo>

        <div>
          <p className="mb-1.5 text-sm font-semibold">Foto del cartel</p>
          <p className="mb-2 text-sm text-tinta-soft">Vertical 4:5, ideal 1600 × 2000 px, máximo {MAX_IMAGEN_MB} MB. Deja la parte de abajo sin caras: ahí va el nombre del show.</p>
          <div className="flex items-center gap-3">
            {imagen ? <img src={urlImagen(imagen)} alt="" className="aspect-[4/5] w-24 rounded-xl object-cover" /> : <div className="flex aspect-[4/5] w-24 items-center justify-center rounded-xl bg-butaca text-xs text-tinta-soft">Sin foto</div>}
            <div className="flex flex-col items-start gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-linea ring-inset hover:bg-butaca">
                <ImagePlus className="size-4" /> {subiendo ? 'Subiendo…' : imagen ? 'Cambiar foto' : 'Subir foto'}
                <input type="file" accept="image/*" className="sr-only" disabled={subiendo} onChange={(e) => { if (e.target.files.length) subir(e.target.files, ([r]) => setImagen(r)); e.target.value = '' }} />
              </label>
              {imagen && <button type="button" onClick={() => setImagen(null)} className="text-sm font-medium text-selva-700 underline">Quitar foto</button>}
            </div>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold">Galería</p>
          <div className="grid grid-cols-4 gap-2">
            {galeria.map((ruta) => (
              <div key={ruta} className="relative">
                <img src={urlImagen(ruta)} alt="" className="aspect-square w-full rounded-xl object-cover" />
                <button type="button" onClick={() => setGaleria(galeria.filter((x) => x !== ruta))} className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-selva-700" aria-label="Quitar foto"><Trash2 className="size-3.5" /></button>
              </div>
            ))}
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-linea text-xs text-tinta-soft hover:bg-butaca">
              <ImagePlus className="size-5" /> Agregar
              <input type="file" accept="image/*" multiple className="sr-only" disabled={subiendo} onChange={(e) => { if (e.target.files.length) subir(e.target.files, (r) => setGaleria((g) => [...g, ...r])); e.target.value = '' }} />
            </label>
          </div>
        </div>

        <Campo etiqueta="Video (enlace de YouTube o Vimeo, opcional)"><Input type="url" value={f.video_url} onChange={(e) => set('video_url', e.target.value)} /></Campo>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={f.destacado} onChange={(e) => set('destacado', e.target.checked)} className="size-4 accent-selva-600" /> Destacar en la página de inicio
        </label>
        <label className="flex items-start gap-2 text-sm font-medium">
          <input type="checkbox" checked={f.pide_modalidad} onChange={(e) => set('pide_modalidad', e.target.checked)} className="mt-0.5 size-4 accent-selva-600" />
          <span>Preguntar tipo de evento al reservar<span className="block font-normal text-tinta-soft">El cliente elige un tipo de evento (Escolar, Privado, Municipal…) con su costo extra, o ninguno. Apágalo si este show no encaja con esos eventos.</span></span>
        </label>

        {error && <p role="alert" className="rounded-xl bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
        <div className="flex gap-2">
          <Boton type="submit" disabled={guardando || subiendo}>{guardando ? 'Guardando…' : actual ? 'Guardar cambios' : 'Agregar show'}</Boton>
          <Boton type="button" variante="fantasma" onClick={onCerrar}>Cerrar</Boton>
        </div>
      </form>

      <section className="border-t border-linea p-5">
        <h3 className="font-semibold">Paquetes</h3>
        {!actual && <p className="mt-1 text-sm text-tinta-soft">Guarda el show primero para agregarle paquetes. Sin paquetes, se reserva al precio base.</p>}
        {actual && (
          <>
            <ul className="mt-2 space-y-2">
              {paquetes.map((p) => (
                <li key={p.id}>
                  {editandoPaquete === p.id ? (
                    <EditorPaquete showId={actual.id} paquete={p} onListo={() => setEditandoPaquete(null)} />
                  ) : (
                    <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-linea ${p.activo ? '' : 'opacity-60'}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{p.nombre}</span>
                        <span className="num block text-sm text-tinta-soft">{pesos(p.precio)}{p.duracion_min ? `, ${p.duracion_min} min` : ''}</span>
                      </span>
                      <button type="button" onClick={() => setEditandoPaquete(p.id)} className="text-sm font-semibold text-selva-700 underline">Editar</button>
                      <Interruptor activo={p.activo} etiqueta={`Ofrecer ${p.nombre}`} onCambio={async () => { await guardarPaquete(p.id, { activo: !p.activo }); await invalidar() }} />
                      <button type="button" aria-label={`Borrar ${p.nombre}`} className="rounded-full p-1.5 text-tinta-soft hover:bg-error-soft hover:text-error" onClick={async () => {
                        try {
                          await borrarPaquete(p.id)
                          await invalidar()
                        } catch {
                          setError('Este paquete ya tiene reservaciones: desactívalo en lugar de borrarlo.')
                        }
                      }}><Trash2 className="size-4" /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {editandoPaquete === 'nuevo' ? (
              <div className="mt-2"><EditorPaquete showId={actual.id} onListo={() => setEditandoPaquete(null)} /></div>
            ) : (
              <Boton type="button" tam="sm" variante="secundario" className="mt-3" onClick={() => setEditandoPaquete('nuevo')}><Plus className="size-4" /> Agregar paquete</Boton>
            )}
          </>
        )}
      </section>
      {actual ? (
        <HorarioShow show={{ ...actual, paquetes: (shows ?? []).find((s) => s.id === actual.id)?.paquetes ?? [], horario_propio: (shows ?? []).find((s) => s.id === actual.id)?.horario_propio ?? actual.horario_propio }} />
      ) : (
        <section className="border-t border-linea p-5">
          <h3 className="font-semibold">Horario de este show</h3>
          <p className="mt-1 text-sm text-tinta-soft">Guarda el show primero para darle un horario propio. Mientras tanto usa el horario general.</p>
        </section>
      )}
    </Panel>
  )
}

function FilaModalidad({ m, onCambio }) {
  const [editando, setEditando] = useState(false)
  const inicial = { nombre: m.nombre, descripcion: m.descripcion, cargo: String(m.cargo) }
  const [f, setF] = useState(inicial)
  const [error, setError] = useState('')
  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.nombre.trim() || f.cargo === '') return setError('Escribe el nombre y el costo extra.')
    try {
      await guardarModalidad(m.id, { nombre: f.nombre.trim(), descripcion: f.descripcion.trim(), cargo: Number(f.cargo) })
      await onCambio()
      setEditando(false)
    } catch (err) {
      setError(err.code === '23505' ? 'Ya existe un tipo de evento con ese nombre.' : mensajeError(err))
    }
  }
  const borrar = async () => {
    if (!window.confirm(`¿Eliminar "${m.nombre}"? Las reservaciones que ya lo tienen lo conservan. Si solo quieres dejar de ofrecerlo, apágalo.`)) return
    try {
      await borrarModalidad(m.id)
      await onCambio()
    } catch (err) {
      setError(mensajeError(err))
    }
  }
  if (editando) {
    return (
      <li className="py-3">
        <form onSubmit={guardar} className="space-y-2" noValidate>
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <Campo etiqueta="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Costo extra"><Input inputMode="decimal" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value.replace(/[^\d.]/g, '') })} /></Campo>
          </div>
          <Campo etiqueta="Qué significa (lo ve el cliente)">
            <textarea rows={2} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className={`${claseInput} h-auto py-2`} />
          </Campo>
          <div className="flex gap-2">
            <Boton type="submit">Guardar</Boton>
            <Boton type="button" variante="secundario" onClick={() => { setF(inicial); setEditando(false) }}>Cancelar</Boton>
          </div>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
        </form>
      </li>
    )
  }
  return (
    <li className={`py-3 ${m.activo ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-medium">{m.nombre} <span className="num font-semibold text-selva-700">+{pesos(m.cargo)}</span></span>
          <span className="block text-sm text-tinta-soft">{m.descripcion || 'Sin explicación para el cliente.'}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setEditando(true)} className="inline-flex size-8 items-center justify-center rounded-full text-tinta-soft hover:bg-butaca hover:text-tinta" aria-label={`Editar ${m.nombre}`}><Pencil className="size-4" /></button>
          <button type="button" onClick={borrar} className="inline-flex size-8 items-center justify-center rounded-full text-tinta-soft hover:bg-butaca hover:text-tinta" aria-label={`Eliminar ${m.nombre}`}><Trash2 className="size-4" /></button>
          <Interruptor activo={m.activo} etiqueta={`Ofrecer ${m.nombre}`} onCambio={async () => { await guardarModalidad(m.id, { activo: !m.activo }); await onCambio() }} />
        </span>
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-error">{error}</p>}
    </li>
  )
}

function SeccionModalidades() {
  const invalidar = usarInvalidar()
  const { data: modalidades } = useModalidades()
  const [f, setF] = useState({ nombre: '', cargo: '', descripcion: '' })
  const [error, setError] = useState('')
  const agregar = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.nombre.trim() || f.cargo === '') return setError('Escribe el nombre y el costo extra.')
    try {
      await guardarModalidad(null, { nombre: f.nombre.trim(), cargo: Number(f.cargo), descripcion: f.descripcion.trim(), orden: (modalidades?.length ?? 0) + 1 })
      setF({ nombre: '', cargo: '', descripcion: '' })
      await invalidar()
    } catch (err) {
      setError(err.code === '23505' ? 'Ya existe un tipo de evento con ese nombre.' : mensajeError(err))
    }
  }
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
      <h2 className="font-bold">Tipos de evento</h2>
      <p className="mt-1 text-sm text-tinta-soft">Costo extra fijo, igual en todos los shows. Solo se pregunta en los shows que tienen activado "Preguntar tipo de evento"; el cliente también puede elegir "ninguno de estos", sin costo.</p>
      <ul className="mt-2 divide-y divide-linea">
        {(modalidades ?? []).map((m) => <FilaModalidad key={m.id} m={m} onCambio={invalidar} />)}
      </ul>
      <form onSubmit={agregar} className="mt-3 space-y-2 border-t border-linea pt-3" noValidate>
        <div className="grid grid-cols-[1fr_110px] gap-2">
          <Campo etiqueta="Nuevo tipo de evento"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
          <Campo etiqueta="Costo extra"><Input inputMode="decimal" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value.replace(/[^\d.]/g, '') })} /></Campo>
        </div>
        <Campo etiqueta="Qué significa (lo ve el cliente)"><Input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Campo>
        <Boton type="submit" variante="secundario">Agregar</Boton>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
    </section>
  )
}

function ChipCategoria({ categoria, usos, onCambio, onError }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(categoria.nombre)
  const [ocupado, setOcupado] = useState(false)
  const accion = async (fn) => {
    onError('')
    setOcupado(true)
    try {
      await fn()
      await onCambio()
      setEditando(false)
    } catch (err) {
      onError(err.code === '23505' ? 'Esa categoría ya existe.' : mensajeError(err))
    } finally {
      setOcupado(false)
    }
  }
  const borrar = () => {
    const aviso = usos
      ? `"${categoria.nombre}" la usan ${usos} ${usos === 1 ? 'show' : 'shows'}. Se quedarán sin categoría. ¿Eliminarla?`
      : `¿Eliminar la categoría "${categoria.nombre}"?`
    if (window.confirm(aviso)) accion(() => borrarCategoria(categoria.id))
  }
  const boton = 'inline-flex size-7 items-center justify-center rounded-full text-tinta-soft hover:bg-white hover:text-tinta disabled:opacity-50'
  if (editando) {
    return (
      <form className="inline-flex items-center gap-1 rounded-full bg-butaca py-0.5 pr-1 pl-2" onSubmit={(e) => {
        e.preventDefault()
        const limpio = texto.trim()
        if (!limpio || limpio === categoria.nombre) return setEditando(false)
        accion(() => renombrarCategoria(categoria.id, limpio))
      }}>
        <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Nombre de la categoría" className="w-36 rounded-full bg-white px-2 py-1 text-sm focus:outline-none" />
        <button type="submit" disabled={ocupado} className={boton} aria-label="Guardar nombre"><Check className="size-4" /></button>
        <button type="button" onClick={() => { setTexto(categoria.nombre); setEditando(false) }} className={boton} aria-label="Cancelar"><X className="size-4" /></button>
      </form>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-butaca py-0.5 pr-1 pl-3 text-sm font-medium">
      {categoria.nombre}
      <button type="button" onClick={() => setEditando(true)} className={boton} aria-label={`Renombrar ${categoria.nombre}`}><Pencil className="size-3.5" /></button>
      <button type="button" onClick={borrar} disabled={ocupado} className={boton} aria-label={`Eliminar ${categoria.nombre}`}><Trash2 className="size-3.5" /></button>
    </span>
  )
}

function SeccionCategorias() {
  const invalidar = usarInvalidar()
  const { data: categorias } = useCategorias()
  const { data: shows } = useShows()
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
      <h2 className="font-bold">Categorías</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {(categorias ?? []).map((c) => <ChipCategoria key={c.id} categoria={c} usos={(shows ?? []).filter((s) => s.categoria_id === c.id).length} onCambio={invalidar} onError={setError} />)}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={async (e) => {
        e.preventDefault()
        setError('')
        if (!nombre.trim()) return
        try {
          await guardarCategoria(nombre.trim())
          setNombre('')
          await invalidar()
        } catch (err) {
          setError(err.code === '23505' ? 'Esa categoría ya existe.' : mensajeError(err))
        }
      }}>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nueva categoría" aria-label="Nueva categoría" />
        <Boton type="submit" variante="secundario">Agregar</Boton>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
    </section>
  )
}

export default function ShowsAdmin() {
  const invalidar = usarInvalidar()
  const { avisar } = useStore()
  const shows = useShows()
  const [editando, setEditando] = useState(undefined) // undefined: cerrado, null: nuevo, id: editar
  const actual = editando ? shows.data?.find((s) => s.id === editando) : null

  return (
    <>
      <Encabezado titulo="Shows" descripcion="Lo que aparece en la cartelera del sitio">
        <Boton tam="sm" onClick={() => setEditando(null)}><Plus className="size-4" /> Agregar show</Boton>
      </Encabezado>

      {shows.isLoading && <Cargando />}
      {shows.isError && <ErrorCarga onReintentar={shows.refetch} />}

      {shows.data && (
        <ul className="grid gap-3 md:grid-cols-2">
          {shows.data.map((s) => (
            <li key={s.id} className={`flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-linea ${s.activo ? '' : 'opacity-60'}`}>
              <Miniatura show={s} className="size-20" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{s.nombre}</p>
                  <Interruptor activo={s.activo} etiqueta={`Mostrar ${s.nombre} en el sitio`} onCambio={async () => {
                    await guardarShow(s.id, { activo: !s.activo })
                    await invalidar()
                    avisar(s.activo ? `${s.nombre} oculto del sitio` : `${s.nombre} visible en el sitio`)
                  }} />
                </div>
                <p className="text-sm text-tinta-soft">{s.categorias?.nombre ?? 'Sin categoría'}, {s.duracion_min} min, {s.paquetes.length} {s.paquetes.length === 1 ? 'paquete' : 'paquetes'}</p>
                {s.horario_propio && <span className="mt-1 inline-block rounded-full bg-agua-soft px-2 py-0.5 text-xs font-semibold text-selva-900">Horario propio</span>}
                <p className="num mt-1 text-sm">Desde <span className="font-semibold">{pesos(s.precio_base)}</span></p>
                <button onClick={() => setEditando(s.id)} className="mt-2 text-sm font-semibold text-selva-700 underline">Editar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <SeccionModalidades />
        <SeccionCategorias />
      </div>

      {editando !== undefined && <EditorShow key={editando ?? 'nuevo'} show={actual} onCerrar={() => setEditando(undefined)} />}
    </>
  )
}
