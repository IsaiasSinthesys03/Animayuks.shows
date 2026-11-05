import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { mensajeError } from '../lib/api'
import { borrarPregunta, guardarConfiguracion, guardarPagina, guardarPregunta, obtenerPaginas } from '../lib/apiAdmin'
import { useConfiguracion, usePreguntas } from '../lib/consultas'
import { useStore } from '../store'
import { Boton, Campo, Cargando, ErrorCarga, Input, claseInput } from '../components/ui'
import { Encabezado, Interruptor } from './AdminLayout'

/** "33 1234 5678" → "523312345678"; lo guardado (con lada) se muestra igual */
const normalizarWhatsapp = (t) => {
  const d = t.replace(/\D/g, '')
  if (!d) return null
  return d.length === 10 ? `52${d}` : d
}

function Seccion({ titulo, descripcion, children }) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-linea">
      <h2 className="font-bold">{titulo}</h2>
      {descripcion && <p className="mt-1 text-sm text-tinta-soft">{descripcion}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Parametros() {
  const { data: cfg, isLoading, isError, refetch } = useConfiguracion()
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const [f, setF] = useState(null)
  const [errores, setErrores] = useState({})
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    if (cfg && !f) {
      setF({
        ...cfg,
        whatsapp: cfg.whatsapp ?? '', banco: cfg.banco ?? '', titular_cuenta: cfg.titular_cuenta ?? '', clabe: cfg.clabe ?? '',
        correo_contacto: cfg.correo_contacto ?? '', correo_avisos: cfg.correo_avisos ?? '',
        hora_recordatorio: cfg.hora_recordatorio.slice(0, 5), hora_resumen_diario: cfg.hora_resumen_diario.slice(0, 5),
      })
    }
  }, [cfg, f])

  if (isLoading || !f) return isError ? <ErrorCarga onReintentar={refetch} /> : <Cargando />

  const num = (k) => ({ inputMode: 'numeric', value: f[k], onChange: (e) => set(k, e.target.value.replace(/[^\d.]/g, '')) })

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    const nuevos = {}
    const whatsapp = normalizarWhatsapp(f.whatsapp)
    const clabe = f.clabe.replace(/\D/g, '')
    if (whatsapp && !/^\d{10,15}$/.test(whatsapp)) nuevos.whatsapp = 'Escribe los 10 dígitos del número.'
    if (clabe && clabe.length !== 18) nuevos.clabe = `La CLABE tiene 18 dígitos (llevas ${clabe.length}).`
    if (clabe && (!f.banco.trim() || !f.titular_cuenta.trim())) nuevos.banco = 'Con la CLABE también escribe el banco y el titular.'
    if (f.correo_avisos && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.correo_avisos.trim())) nuevos.correo_avisos = 'Escribe un correo válido.'
    if (!f.nombre_negocio.trim()) nuevos.nombre_negocio = 'Escribe el nombre del negocio.'
    if (Number(f.anticipo_porcentaje) > 100) nuevos.anticipo_porcentaje = 'Máximo 100 %.'
    setErrores(nuevos)
    if (Object.keys(nuevos).length) return

    setGuardando(true)
    try {
      await guardarConfiguracion({
        nombre_negocio: f.nombre_negocio.trim(),
        whatsapp,
        correo_contacto: f.correo_contacto.trim() || null,
        correo_avisos: f.correo_avisos.trim() || null,
        banco: f.banco.trim() || null,
        titular_cuenta: f.titular_cuenta.trim() || null,
        clabe: clabe || null,
        instrucciones_pago: f.instrucciones_pago.trim(),
        anticipo_porcentaje: Number(f.anticipo_porcentaje) || 0,
        expiracion_pendiente_horas: Number(f.expiracion_pendiente_horas) || 24,
        anticipacion_min_horas: Number(f.anticipacion_min_horas) || 0,
        anticipacion_max_dias: Number(f.anticipacion_max_dias) || 365,
        retencion_minutos: Number(f.retencion_minutos) || 10,
        intervalo_horarios_min: Number(f.intervalo_horarios_min),
        cancelacion_dias_reembolso: Number(f.cancelacion_dias_reembolso) || 0,
        cancelacion_comision_pct: Number(f.cancelacion_comision_pct) || 0,
        reprogramacion_min_horas: Number(f.reprogramacion_min_horas) || 0,
        reprogramaciones_max: Number(f.reprogramaciones_max) || 0,
        reservaciones_en_linea: f.reservaciones_en_linea,
        hora_recordatorio: f.hora_recordatorio,
        hora_resumen_diario: f.hora_resumen_diario,
      })
      await queryClient.invalidateQueries({ queryKey: ['configuracion'] })
      queryClient.invalidateQueries({ queryKey: ['disponibilidad'] })
      queryClient.invalidateQueries({ queryKey: ['horarios'] })
      setF(null)
      avisar('Configuración guardada')
    } catch (err) {
      setError(err.code === '23514' ? 'Hay un dato fuera de rango. Revisa los campos.' : mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-5" noValidate>
      <Seccion titulo="Datos del negocio">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre del negocio" error={errores.nombre_negocio}><Input value={f.nombre_negocio} onChange={(e) => set('nombre_negocio', e.target.value)} /></Campo>
          <Campo etiqueta="WhatsApp del negocio" ayuda="10 dígitos. Se usa en el botón del sitio y en los correos." error={errores.whatsapp}>
            <Input type="tel" inputMode="tel" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="33 1234 5678" />
          </Campo>
          <Campo etiqueta="Correo de contacto" ayuda="El que se muestra en el sitio."><Input type="email" value={f.correo_contacto} onChange={(e) => set('correo_contacto', e.target.value)} /></Campo>
          <Campo etiqueta="Correo para mis avisos" ayuda="Aquí llegan las reservaciones nuevas y los comprobantes." error={errores.correo_avisos}>
            <Input type="email" value={f.correo_avisos} onChange={(e) => set('correo_avisos', e.target.value)} />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Datos para transferencias" descripcion="Los clientes los ven al reservar y en su correo. Revísalos bien: ahí te van a depositar.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Banco" error={errores.banco}><Input value={f.banco} onChange={(e) => set('banco', e.target.value)} /></Campo>
          <Campo etiqueta="Titular de la cuenta"><Input value={f.titular_cuenta} onChange={(e) => set('titular_cuenta', e.target.value)} /></Campo>
          <Campo etiqueta="CLABE" ayuda="18 dígitos." error={errores.clabe} className="sm:col-span-2"><Input inputMode="numeric" className={`${claseInput} num`} value={f.clabe} onChange={(e) => set('clabe', e.target.value)} /></Campo>
          <Campo etiqueta="Instrucciones de pago" className="sm:col-span-2">
            <textarea rows={2} value={f.instrucciones_pago} onChange={(e) => set('instrucciones_pago', e.target.value)} className={`${claseInput} h-auto py-3`} />
          </Campo>
          <Campo etiqueta="Anticipo (%)" error={errores.anticipo_porcentaje}><Input {...num('anticipo_porcentaje')} /></Campo>
          <Campo etiqueta="Horas para pagar el anticipo" ayuda="Después se libera el horario."><Input {...num('expiracion_pendiente_horas')} /></Campo>
        </div>
      </Seccion>

      <Seccion titulo="Reglas de reservación">
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-butaca px-4 py-3">
          <span>
            <span className="block font-semibold">Aceptar reservaciones en línea</span>
            <span className="block text-sm text-tinta-soft">Apágalo para pausarlas; el panel sigue funcionando.</span>
          </span>
          <Interruptor activo={f.reservaciones_en_linea} etiqueta="Aceptar reservaciones en línea" onCambio={() => set('reservaciones_en_linea', !f.reservaciones_en_linea)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Anticipación mínima (horas)"><Input {...num('anticipacion_min_horas')} /></Campo>
          <Campo etiqueta="Anticipación máxima (días)"><Input {...num('anticipacion_max_dias')} /></Campo>
          <Campo etiqueta="Minutos que se aparta un horario" ayuda="Entre 1 y 60."><Input {...num('retencion_minutos')} /></Campo>
          <Campo etiqueta="Ofrecer horarios cada">
            <select value={f.intervalo_horarios_min} onChange={(e) => set('intervalo_horarios_min', e.target.value)} className={claseInput}>
              <option value="15">15 minutos</option><option value="30">30 minutos</option><option value="60">1 hora</option>
            </select>
          </Campo>
          <Campo etiqueta="Días para cancelar con reembolso"><Input {...num('cancelacion_dias_reembolso')} /></Campo>
          <Campo etiqueta="Comisión al reembolsar (%)"><Input {...num('cancelacion_comision_pct')} /></Campo>
          <Campo etiqueta="Horas mínimas para cambiar de fecha"><Input {...num('reprogramacion_min_horas')} /></Campo>
          <Campo etiqueta="Cambios de fecha permitidos"><Input {...num('reprogramaciones_max')} /></Campo>
        </div>
      </Seccion>

      <Seccion titulo="Correos automáticos">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Hora del recordatorio al cliente" ayuda="Dos días antes del evento."><Input type="time" step="3600" value={f.hora_recordatorio} onChange={(e) => set('hora_recordatorio', e.target.value)} /></Campo>
          <Campo etiqueta="Hora de mi resumen diario" ayuda="Las funciones del día siguiente."><Input type="time" step="3600" value={f.hora_resumen_diario} onChange={(e) => set('hora_resumen_diario', e.target.value)} /></Campo>
        </div>
      </Seccion>

      <div className="flex items-center gap-3">
        <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar configuración'}</Boton>
        {error && <p role="alert" className="text-sm font-medium text-error">{error}</p>}
      </div>
    </form>
  )
}

function TextosLegales() {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const paginas = useQuery({ queryKey: ['admin-paginas'], queryFn: obtenerPaginas })
  const [abierta, setAbierta] = useState(null)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')

  return (
    <Seccion titulo="Textos legales" descripcion="Se publican tal cual en el sitio. Cada cambio crea una versión nueva, y queda registrado cuál aceptó cada cliente.">
      {paginas.isError && <ErrorCarga onReintentar={paginas.refetch} />}
      <ul className="space-y-2">
        {(paginas.data ?? []).map((p) => (
          <li key={p.slug} className="rounded-xl ring-1 ring-linea">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block font-medium">{p.titulo}</span>
                <span className="num block text-sm text-tinta-soft">Versión {p.version}{p.contenido.includes('BORRADOR') ? ', borrador sin revisar' : ''}</span>
              </span>
              <button className="text-sm font-semibold text-selva-700 underline" onClick={() => { setAbierta(abierta === p.slug ? null : p.slug); setTexto(p.contenido); setError('') }}>
                {abierta === p.slug ? 'Cerrar' : 'Editar'}
              </button>
            </div>
            {abierta === p.slug && (
              <div className="border-t border-linea p-4">
                <textarea rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label={`Contenido de ${p.titulo}`} className={`${claseInput} h-auto py-3 font-mono text-sm`} />
                <p className="mt-1 text-xs text-tinta-soft">Usa ## para títulos, ** para negritas y guiones para listas.</p>
                {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
                <Boton tam="sm" className="mt-2" onClick={async () => {
                  try {
                    await guardarPagina(p.slug, { contenido: texto })
                    await queryClient.invalidateQueries({ queryKey: ['admin-paginas'] })
                    queryClient.invalidateQueries({ queryKey: ['pagina', p.slug] })
                    avisar(`${p.titulo} actualizado`)
                    setAbierta(null)
                  } catch (err) {
                    setError(mensajeError(err))
                  }
                }}>Guardar</Boton>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Seccion>
  )
}

function PreguntasFrecuentes() {
  const queryClient = useQueryClient()
  const preguntas = usePreguntas()
  const [f, setF] = useState({ pregunta: '', respuesta: '' })
  const [error, setError] = useState('')
  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['preguntas'] })

  return (
    <Seccion titulo="Preguntas frecuentes">
      <ul className="divide-y divide-linea">
        {(preguntas.data ?? []).map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block font-medium">{p.pregunta}</span>
              <span className="block text-sm text-tinta-soft">{p.respuesta}</span>
            </span>
            <button aria-label={`Borrar: ${p.pregunta}`} className="rounded-full p-2 text-tinta-soft hover:bg-error-soft hover:text-error" onClick={async () => { await borrarPregunta(p.id); await refrescar() }}>
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form className="mt-3 space-y-2" noValidate onSubmit={async (e) => {
        e.preventDefault()
        setError('')
        if (!f.pregunta.trim() || !f.respuesta.trim()) return setError('Escribe la pregunta y la respuesta.')
        try {
          await guardarPregunta(null, { pregunta: f.pregunta.trim(), respuesta: f.respuesta.trim(), orden: (preguntas.data?.length ?? 0) + 1 })
          setF({ pregunta: '', respuesta: '' })
          await refrescar()
        } catch (err) {
          setError(mensajeError(err))
        }
      }}>
        <Input value={f.pregunta} onChange={(e) => setF({ ...f, pregunta: e.target.value })} placeholder="Pregunta nueva" aria-label="Pregunta nueva" />
        <textarea rows={2} value={f.respuesta} onChange={(e) => setF({ ...f, respuesta: e.target.value })} placeholder="Respuesta" aria-label="Respuesta" className={`${claseInput} h-auto py-3`} />
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        <Boton type="submit" tam="sm" variante="secundario">Agregar pregunta</Boton>
      </form>
    </Seccion>
  )
}

export default function Configuracion() {
  return (
    <>
      <Encabezado titulo="Configuración" descripcion="WhatsApp, datos bancarios, reglas de reservación y textos del sitio" />
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Parametros />
        <div className="space-y-5">
          <TextosLegales />
          <PreguntasFrecuentes />
        </div>
      </div>
    </>
  )
}
