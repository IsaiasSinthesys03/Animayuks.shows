import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, Loader2, Timer } from 'lucide-react'
import { useAuth } from '../auth'
import { aceptarPaginas, apartarHorario, catalogoCpsPorCodigo, crearReservacion, horariosDisponibles, mensajeError } from '../lib/api'
import { useConfiguracion, useExtras, useShows } from '../lib/consultas'
import { fechaDeDia, fechaLarga, hora, pesos } from '../lib/format'
import { Boton, Campo, Cargando, ErrorCarga, Input, Miniatura, Select, claseInput } from '../components/ui'
import Calendario from '../components/Calendario'
import VerificadorCP from '../components/VerificadorCP'
import { DatosTransferencia, SubirComprobante } from '../components/DatosPago'

const PASOS = ['Show', 'Lugar', 'Fecha', 'Detalles', 'Tus datos', 'Confirmar']
const CLAVE_BORRADOR = 'ay-reservacion-borrador'
const VIGENCIA_BORRADOR = 24 * 60 * 60 * 1000

const VACIO = {
  paso: 0, showId: '', paqueteId: '', extras: [],
  cp: '', zona: null, calle: '', colonia: '', referencias: '',
  fecha: '', inicio: '', expiraEn: '',
  tipoEvento: 'Cumpleaños', festejado: '', asistentes: '', espacio: 'Jardín', comentarios: '',
  nombre: '', telefono: '', contactoDia: '',
}

// El borrador sobrevive a iniciar sesión o a confirmar el correo en otra pestaña (RF-RES-15)
function leerBorrador() {
  try {
    const b = JSON.parse(localStorage.getItem(CLAVE_BORRADOR))
    return b && Date.now() - b.guardado < VIGENCIA_BORRADOR ? b.datos : null
  } catch {
    return null
  }
}
function guardarBorrador(datos) {
  try {
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ guardado: Date.now(), datos }))
  } catch { /* sin almacenamiento: el asistente sigue funcionando */ }
}
function borrarBorrador() {
  try {
    localStorage.removeItem(CLAVE_BORRADOR)
  } catch { /* nada que borrar */ }
}

function Boleto({ datos, show, paquete, extrasSel, total, anticipoPct }) {
  return (
    <div className="rounded-3xl bg-butaca [--boleto-fondo:white]">
      <div className="p-5">
        <p className="text-sm font-semibold text-tinta-soft">Tu reservación</p>
        <p className="mt-1 font-cartel text-3xl leading-none font-black uppercase">{show ? show.nombre : 'Elige un show'}</p>
        {paquete && <p className="mt-1 text-sm text-tinta-soft">Paquete {paquete.nombre.toLowerCase()}</p>}
        <dl className="mt-4 space-y-2 text-[15px]">
          <div className="flex justify-between gap-3">
            <dt className="text-tinta-soft">Fecha</dt>
            <dd className="text-right font-medium">{datos.fecha ? fechaDeDia(datos.fecha) : 'Por elegir'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-tinta-soft">Hora</dt>
            <dd className="font-medium">{datos.inicio ? hora(datos.inicio) : 'Por elegir'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-tinta-soft">Zona</dt>
            <dd className="font-medium">{datos.zona ? datos.zona.nombre : 'Por confirmar'}</dd>
          </div>
        </dl>
      </div>
      <div className="boleto-corte p-5">
        <dl className="num space-y-1.5 text-[15px]">
          <div className="flex justify-between"><dt className="text-tinta-soft">Show</dt><dd>{pesos(paquete?.precio ?? show?.precio_base ?? 0)}</dd></div>
          {extrasSel.map((e) => (
            <div key={e.id} className="flex justify-between gap-3"><dt className="text-tinta-soft">{e.nombre}</dt><dd>{pesos(e.precio)}</dd></div>
          ))}
          <div className="flex justify-between"><dt className="text-tinta-soft">Traslado</dt><dd>{datos.zona ? pesos(datos.zona.cargo_traslado) : 'Por confirmar'}</dd></div>
          <div className="flex justify-between border-t border-linea pt-2 text-lg font-bold"><dt>Total</dt><dd>{pesos(total)}</dd></div>
          <div className="flex justify-between text-selva-700"><dt>Anticipo para apartar</dt><dd className="font-semibold">{pesos((total * anticipoPct) / 100)}</dd></div>
        </dl>
      </div>
    </div>
  )
}

function Confirmacion({ reservacion, show, cfg }) {
  const navigate = useNavigate()
  const [comprobante, setComprobante] = useState(false)
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:py-16">
      <div className="entra text-center">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-ok text-white">
          <Check className="size-7" strokeWidth={3} />
        </span>
        <h1 className="mt-5 font-cartel text-5xl leading-none font-black uppercase sm:text-6xl">Apartamos tu fecha</h1>
        <p className="mx-auto mt-3 max-w-[46ch] text-tinta-soft">
          Te enviamos los detalles por correo. Para confirmarla, paga el anticipo antes del {fechaLarga(reservacion.expira_en)} a las {hora(reservacion.expira_en)}.
        </p>
      </div>

      <div className="mt-8 rounded-3xl bg-selva-700 text-white [--boleto-fondo:white]">
        <div className="p-6">
          <p className="text-sm text-white/85">Folio</p>
          <p className="num font-cartel text-4xl font-extrabold tracking-wide text-maiz">{reservacion.folio}</p>
          <p className="mt-4 font-cartel text-3xl leading-none font-black uppercase">{show.nombre}</p>
          <p className="mt-2 text-white first-letter:uppercase">{fechaLarga(reservacion.inicio)}, {hora(reservacion.inicio)}</p>
          <p className="mt-1 text-white">{reservacion.calle}, {reservacion.colonia}, {reservacion.codigo_postal}</p>
        </div>
        <div className="boleto-corte border-white/20 p-6">
          <dl className="num grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-white/85">Total</dt><dd className="mt-0.5 text-lg font-bold">{pesos(reservacion.total)}</dd></div>
            <div><dt className="text-white/85">Anticipo</dt><dd className="mt-0.5 text-lg font-bold">{pesos(reservacion.anticipo_requerido)}</dd></div>
          </dl>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-bold">Paga el anticipo</h2>
        <div className="mt-3"><DatosTransferencia cfg={cfg} folio={reservacion.folio} /></div>
        <p className="mt-3 text-[15px] text-tinta-soft">{cfg?.instrucciones_pago}</p>
      </section>

      <section className="mt-8 rounded-2xl border border-linea p-5">
        {comprobante ? (
          <p role="status" className="font-semibold text-ok">Recibimos tu comprobante. Te avisaremos por correo cuando lo confirmemos.</p>
        ) : (
          <>
            <h2 className="mb-3 font-bold">¿Ya transferiste? Sube tu comprobante</h2>
            <SubirComprobante reservacion={reservacion} onListo={() => setComprobante(true)} />
          </>
        )}
      </section>

      <Boton variante="secundario" className="mt-6 w-full" onClick={() => navigate('/mi-cuenta')}>Ver mis reservaciones</Boton>
    </div>
  )
}

export default function Reservar() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { usuario, cliente, cargando: cargandoSesion } = useAuth()
  const shows = useShows()
  const { data: extras } = useExtras()
  const { data: cfg } = useConfiguracion()

  const [d, setD] = useState(() => ({ ...VACIO, ...leerBorrador() }))
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState('')
  const [apartando, setApartando] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [acepta, setAcepta] = useState(false)
  const [confirmada, setConfirmada] = useState(null)
  const [restante, setRestante] = useState(null)
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }))

  const activos = useMemo(() => (shows.data ?? []).filter((s) => s.activo), [shows.data])

  // Lo que viene en la URL (desde un cartel o del verificador de cobertura) manda sobre el borrador
  const slugUrl = params.get('show')
  useEffect(() => {
    if (!shows.data) return
    const s = slugUrl && shows.data.find((x) => x.slug === slugUrl)
    const paqueteUrl = params.get('paquete')
    const cpUrl = params.get('cp')
    if (s || cpUrl) {
      setD((x) => ({
        ...x,
        ...(s ? { showId: s.id, paqueteId: paqueteUrl ?? s.paquetes.find((p) => p.activo)?.id ?? '', paso: Math.max(x.paso, 0) } : {}),
        ...(cpUrl && cpUrl !== x.cp ? { cp: cpUrl, zona: null } : {}),
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows.data, slugUrl])

  useEffect(() => {
    if (!confirmada) guardarBorrador(d)
  }, [d, confirmada])

  // Datos de contacto desde la ficha del cliente
  useEffect(() => {
    if (cliente) setD((x) => ({ ...x, nombre: x.nombre || cliente.nombre || '', telefono: x.telefono || cliente.telefono || '' }))
  }, [cliente])

  const show = activos.find((s) => s.id === d.showId) ?? null
  const paquetes = show?.paquetes.filter((p) => p.activo) ?? []
  const paquete = paquetes.find((p) => p.id === d.paqueteId) ?? null
  const extrasActivos = (extras ?? []).filter((e) => e.activo)
  const extrasSel = extrasActivos.filter((e) => d.extras.includes(e.id))
  const lugarCP = useQuery({ queryKey: ['catalogo-codigos', [d.cp]], queryFn: () => catalogoCpsPorCodigo([d.cp]), enabled: !!d.zona && d.cp.length === 5, staleTime: 60 * 60 * 1000 })
  const total = Number(paquete?.precio ?? show?.precio_base ?? 0) + extrasSel.reduce((a, e) => a + Number(e.precio), 0) + Number(d.zona?.cargo_traslado ?? 0)
  const anticipoPct = Number(cfg?.anticipo_porcentaje ?? 30)

  const horarios = useQuery({
    queryKey: ['horarios', d.showId, d.paqueteId || null, d.extras, d.cp, d.fecha],
    queryFn: () => horariosDisponibles({ showId: d.showId, paqueteId: d.paqueteId || null, extras: d.extras, cp: d.cp, fecha: d.fecha }),
    enabled: d.paso === 2 && !!d.fecha && !!d.zona,
    staleTime: 15 * 1000,
  })

  // Cuenta regresiva del horario apartado (RN-08)
  useEffect(() => {
    if (!d.expiraEn) {
      setRestante(null)
      return undefined
    }
    const calcular = () => setRestante(Math.max(0, Math.floor((new Date(d.expiraEn) - Date.now()) / 1000)))
    calcular()
    const t = setInterval(calcular, 1000)
    return () => clearInterval(t)
  }, [d.expiraEn])

  // Cambiar show, paquete, extras o lugar invalida el horario elegido
  const reiniciarHorario = { fecha: '', inicio: '', expiraEn: '' }

  const irA = (paso) => {
    setErrores({})
    setErrorGeneral('')
    setD((x) => ({ ...x, paso }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const validar = () => {
    const e = {}
    if (d.paso === 0 && !show) e.show = 'Elige el show que quieres reservar.'
    if (d.paso === 1) {
      if (!d.zona) e.cp = 'Verifica un código postal con cobertura para continuar.'
      if (!d.calle.trim()) e.calle = 'Escribe la calle y el número.'
      if (!d.colonia.trim()) e.colonia = 'Escribe la colonia.'
    }
    if (d.paso === 2 && !d.inicio) e.hora = d.fecha ? 'Elige la hora de inicio.' : 'Elige un día en el calendario.'
    if (d.paso === 4) {
      if (!d.nombre.trim()) e.nombre = 'Escribe tu nombre.'
      if (d.telefono.replace(/\D/g, '').length < 10) e.telefono = 'Escribe un teléfono de 10 dígitos.'
    }
    if (d.paso === 5 && !acepta) e.acepta = 'Acepta la política de cancelación para confirmar.'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const siguiente = () => {
    if (!validar()) return
    if (d.paso === 1 && !usuario) {
      // Apartar exige cuenta: el borrador espera guardado hasta que regrese
      guardarBorrador({ ...d, paso: 2 })
      navigate('/entrar?siguiente=/reservar&modo=registro')
      return
    }
    if (d.paso === 5) {
      confirmar()
      return
    }
    irA(d.paso + 1)
  }

  const elegirHora = async (h) => {
    setErrorGeneral('')
    setErrores({})
    setApartando(h.inicio)
    try {
      const r = await apartarHorario({ showId: d.showId, paqueteId: d.paqueteId || null, extras: d.extras, cp: d.cp, inicio: h.inicio })
      setD((x) => ({ ...x, inicio: r.inicio, expiraEn: r.expira_en }))
    } catch (err) {
      setErrorGeneral(mensajeError(err))
      setD((x) => ({ ...x, inicio: '', expiraEn: '' }))
      queryClient.invalidateQueries({ queryKey: ['horarios'] })
      queryClient.invalidateQueries({ queryKey: ['disponibilidad'] })
    } finally {
      setApartando('')
    }
  }

  const confirmar = async () => {
    setEnviando(true)
    setErrorGeneral('')
    try {
      const r = await crearReservacion({
        p_show_id: d.showId,
        p_paquete_id: d.paqueteId || null,
        p_inicio: d.inicio,
        p_codigo_postal: d.cp,
        p_calle: d.calle,
        p_colonia: d.colonia,
        p_referencias: d.referencias || null,
        p_extras: d.extras,
        p_evento: {
          tipo_evento: d.tipoEvento, festejado: d.festejado, asistentes: d.asistentes,
          espacio: d.espacio, comentarios: d.comentarios, contacto_dia: d.contactoDia,
        },
        p_cliente: { nombre: d.nombre.trim(), telefono: d.telefono.trim() },
      })
      // Registro de qué versión de los textos legales aceptó (RNF-LEG-03); no detiene la reservación
      aceptarPaginas(['aviso-de-privacidad', 'terminos', 'politica-de-cancelacion']).catch(() => {})
      borrarBorrador()
      queryClient.invalidateQueries({ queryKey: ['mis-reservaciones'] })
      setConfirmada(r)
      window.scrollTo({ top: 0 })
    } catch (err) {
      setErrorGeneral(mensajeError(err))
      if (/^(HORARIO_OCUPADO|FUERA_DE_HORARIO|FECHA_BLOQUEADA|ANTICIPACION)/.test(err.message ?? '')) {
        // Otro tomó el horario o ya no se puede: regresa a elegir
        queryClient.invalidateQueries({ queryKey: ['horarios'] })
        queryClient.invalidateQueries({ queryKey: ['disponibilidad'] })
        setD((x) => ({ ...x, paso: 2, inicio: '', expiraEn: '' }))
      }
    } finally {
      setEnviando(false)
    }
  }

  if (confirmada) return <Confirmacion reservacion={confirmada} show={show} cfg={cfg} />
  if (shows.isLoading || cargandoSesion) return <Cargando />
  if (shows.isError) return <ErrorCarga onReintentar={shows.refetch} />
  if (activos.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-cartel text-5xl leading-none font-black uppercase">Pronto podrás reservar</h1>
        <p className="mt-3 text-tinta-soft">Todavía no hay shows disponibles.</p>
      </div>
    )
  }

  const mm = restante !== null && restante > 0 ? `${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, '0')}` : null

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-32 sm:px-6 lg:pt-10 lg:pb-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-cartel text-4xl leading-none font-black uppercase sm:text-5xl">Reservar un show</h1>
        {mm && (
          <p className={`num inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${restante < 120 ? 'bg-error-soft text-error' : 'bg-maiz-soft text-tinta'}`}>
            <Timer className="size-4" /> Apartado {mm}
          </p>
        )}
      </div>

      <ol className="mt-6 flex gap-1.5" aria-label="Pasos de la reservación">
        {PASOS.map((p, i) => (
          <li key={p} className="flex-1">
            <button type="button" disabled={i > d.paso} onClick={() => irA(i)} className="group block w-full text-left disabled:cursor-default" aria-current={i === d.paso ? 'step' : undefined}>
              <span className={`block h-1.5 rounded-full transition-colors ${i <= d.paso ? 'bg-selva-600' : 'bg-linea'}`} />
              <span className={`mt-2 hidden text-sm sm:block ${i === d.paso ? 'font-semibold text-tinta' : 'text-tinta-soft'}`}>{i + 1}. {p}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm text-tinta-soft sm:hidden">Paso {d.paso + 1} de {PASOS.length}: <span className="font-semibold text-tinta">{PASOS[d.paso]}</span></p>

      {errorGeneral && <p role="alert" className="mt-5 rounded-xl bg-error-soft px-4 py-3 font-medium text-error">{errorGeneral}</p>}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div key={d.paso} className="entra">
          {d.paso === 0 && (
            <section>
              <h2 className="text-2xl font-bold">¿Qué show quieres?</h2>
              {errores.show && <p role="alert" className="mt-2 text-error">{errores.show}</p>}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {activos.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setD((x) => ({ ...x, ...reiniciarHorario, showId: s.id, paqueteId: s.paquetes.find((p) => p.activo)?.id ?? '' }))}
                    className={`flex items-center gap-4 rounded-2xl border-2 p-3 text-left transition-colors ${d.showId === s.id ? 'border-selva-600 bg-selva-50/50' : 'border-linea hover:border-tinta-soft/40'}`}
                  >
                    <Miniatura show={s} />
                    <span>
                      <span className="block font-semibold">{s.nombre}</span>
                      <span className="block text-sm text-tinta-soft">{s.categorias?.nombre}, {s.duracion_min} min</span>
                      <span className="num block text-sm font-semibold">Desde {pesos(s.precio_base)}</span>
                    </span>
                  </button>
                ))}
              </div>
              {paquetes.length > 0 && (
                <fieldset className="mt-8">
                  <legend className="text-lg font-bold">Paquete</legend>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {paquetes.map((p) => (
                      <label key={p.id} className={`flex cursor-pointer gap-3 rounded-2xl border-2 p-4 ${d.paqueteId === p.id ? 'border-selva-600 bg-selva-50/50' : 'border-linea'}`}>
                        <input type="radio" checked={d.paqueteId === p.id} onChange={() => setD((x) => ({ ...x, ...reiniciarHorario, paqueteId: p.id }))} className="mt-1 accent-selva-600" />
                        <span>
                          <span className="block font-semibold">{p.nombre} <span className="num">{pesos(p.precio)}</span></span>
                          {p.incluye.length > 0 && <span className="block text-sm text-tinta-soft">{p.incluye.join(', ')}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {show && extrasActivos.length > 0 && (
                <fieldset className="mt-8">
                  <legend className="text-lg font-bold">Extras (opcional)</legend>
                  <div className="mt-3 space-y-2">
                    {extrasActivos.map((e) => {
                      const on = d.extras.includes(e.id)
                      return (
                        <label key={e.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 ${on ? 'border-selva-600 bg-selva-50/50' : 'border-linea'}`}>
                          <span className="flex items-center gap-3">
                            <input type="checkbox" checked={on} onChange={() => setD((x) => ({ ...x, ...reiniciarHorario, extras: on ? x.extras.filter((i) => i !== e.id) : [...x.extras, e.id] }))} className="size-4 accent-selva-600" />
                            {e.nombre}
                          </span>
                          <span className="num font-semibold">+{pesos(e.precio)}</span>
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
              )}
            </section>
          )}

          {d.paso === 1 && (
            <section className="max-w-xl">
              <h2 className="text-2xl font-bold">¿Dónde será el evento?</h2>
              <p className="mt-1 text-tinta-soft">Primero confirmamos que llegamos a tu zona.</p>
              <div className="mt-5">
                <VerificadorCP inicial={d.cp} onResultado={(zona, cp) => setD((x) => ({ ...x, ...reiniciarHorario, zona, cp }))} />
                {d.zona && !errores.cp && <p className="mt-2 text-sm font-medium text-ok">Zona: {d.zona.nombre}</p>}
                {errores.cp && <p role="alert" className="mt-2 text-sm text-error">{errores.cp}</p>}
              </div>
              <fieldset disabled={!d.zona} className="mt-6 space-y-4 transition-opacity disabled:opacity-40">
                <Campo etiqueta="Calle y número" error={errores.calle}>
                  <Input value={d.calle} onChange={(e) => set('calle', e.target.value)} autoComplete="street-address" aria-invalid={!!errores.calle} />
                </Campo>
                <Campo etiqueta="Colonia" error={errores.colonia}>
                  <Input list="colonias-cp" value={d.colonia} onChange={(e) => set('colonia', e.target.value)} aria-invalid={!!errores.colonia} />
                  <datalist id="colonias-cp">
                    {(lugarCP.data?.[0]?.colonias ?? []).map((c) => <option key={c} value={c} />)}
                  </datalist>
                </Campo>
                <Campo etiqueta="Referencias (opcional)" ayuda="Ayuda a los artistas a llegar: color de la casa, entre qué calles, nombre del salón.">
                  <Input value={d.referencias} onChange={(e) => set('referencias', e.target.value)} />
                </Campo>
              </fieldset>
              {!usuario && <p className="mt-5 rounded-2xl bg-butaca px-4 py-3 text-[15px]">Para ver los horarios te pediremos entrar o crear tu cuenta. No pierdes lo que ya llenaste.</p>}
            </section>
          )}

          {d.paso === 2 && (
            <section>
              <h2 className="text-2xl font-bold">¿Qué día y a qué hora?</h2>
              <p className="mt-1 text-tinta-soft">Solo ves horarios libres. Todas las horas son de Guadalajara.</p>
              <div className="mt-5 grid gap-8 md:grid-cols-[1fr_220px]">
                <div className="max-w-md">
                  <Calendario showId={d.showId} paqueteId={d.paqueteId || null} extras={d.extras} cp={d.cp} valor={d.fecha}
                    onCambio={(f) => setD((x) => ({ ...x, fecha: f, inicio: '', expiraEn: '' }))} />
                </div>
                <div>
                  <p className="font-semibold">Hora de inicio</p>
                  {!d.fecha && <p className="mt-2 text-sm text-tinta-soft">Elige un día para ver los horarios libres.</p>}
                  {d.fecha && horarios.isLoading && <p className="mt-2 flex items-center gap-2 text-sm text-tinta-soft"><Loader2 className="size-4 animate-spin" /> Buscando…</p>}
                  {d.fecha && horarios.isError && <ErrorCarga onReintentar={horarios.refetch} texto="No pudimos cargar los horarios." />}
                  {d.fecha && horarios.data?.length === 0 && <p className="mt-2 text-sm text-tinta-soft">Ya no quedan horarios ese día. Elige otro.</p>}
                  {horarios.data?.length > 0 && (
                    <div className="mt-3 grid max-h-96 grid-cols-2 gap-2 overflow-y-auto pr-1 md:grid-cols-1">
                      {horarios.data.map((h) => {
                        const elegido = d.inicio && new Date(d.inicio).getTime() === new Date(h.inicio).getTime()
                        return (
                          <button
                            key={h.inicio}
                            type="button"
                            disabled={!!apartando}
                            onClick={() => elegirHora(h)}
                            className={`num h-11 shrink-0 rounded-xl border-2 text-[15px] font-semibold transition-colors disabled:opacity-60 ${elegido ? 'border-selva-600 bg-selva-600 text-white' : 'border-linea hover:border-tinta-soft/50'}`}
                          >
                            {apartando === h.inicio ? 'Apartando…' : hora(h.inicio)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {errores.hora && <p role="alert" className="mt-2 text-sm text-error">{errores.hora}</p>}
                  {d.inicio && <p className="mt-3 text-sm text-tinta-soft">Apartamos este horario {cfg?.retencion_minutos ?? 10} minutos mientras terminas.</p>}
                </div>
              </div>
            </section>
          )}

          {d.paso === 3 && (
            <section className="max-w-xl">
              <h2 className="text-2xl font-bold">Cuéntanos del evento</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Tipo de evento">
                  <Select value={d.tipoEvento} onChange={(e) => set('tipoEvento', e.target.value)}>
                    {['Cumpleaños', 'Bautizo', 'Boda', 'XV años', 'Evento escolar', 'Evento de empresa', 'Otro'].map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </Campo>
                <Campo etiqueta="Nombre del festejado (opcional)"><Input value={d.festejado} onChange={(e) => set('festejado', e.target.value)} /></Campo>
                <Campo etiqueta="Invitados aproximados"><Input inputMode="numeric" value={d.asistentes} onChange={(e) => set('asistentes', e.target.value.replace(/\D/g, ''))} /></Campo>
                <Campo etiqueta="Espacio">
                  <Select value={d.espacio} onChange={(e) => set('espacio', e.target.value)}>
                    {['Jardín', 'Salón de eventos', 'Casa (interior)', 'Escuela', 'Oficina'].map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </Campo>
              </div>
              <Campo etiqueta="Algo que debamos saber (opcional)" className="mt-4">
                <textarea value={d.comentarios} onChange={(e) => set('comentarios', e.target.value)} rows={3} className={`${claseInput} h-auto py-3`} />
              </Campo>
            </section>
          )}

          {d.paso === 4 && (
            <section className="max-w-xl">
              <h2 className="text-2xl font-bold">Tus datos</h2>
              <div className="mt-5 space-y-4">
                <Campo etiqueta="Nombre completo" error={errores.nombre}>
                  <Input value={d.nombre} onChange={(e) => set('nombre', e.target.value)} autoComplete="name" aria-invalid={!!errores.nombre} />
                </Campo>
                <Campo etiqueta="Celular" error={errores.telefono}>
                  <Input type="tel" inputMode="tel" value={d.telefono} onChange={(e) => set('telefono', e.target.value)} autoComplete="tel" aria-invalid={!!errores.telefono} />
                </Campo>
                <Campo etiqueta="¿Quién nos recibe el día del evento? (opcional)" ayuda="Si no eres tú, déjanos su nombre y celular.">
                  <Input value={d.contactoDia} onChange={(e) => set('contactoDia', e.target.value)} />
                </Campo>
              </div>
            </section>
          )}

          {d.paso === 5 && (
            <section className="max-w-xl">
              <h2 className="text-2xl font-bold">Revisa y aparta tu fecha</h2>
              <p className="mt-1 text-tinta-soft">
                Después de confirmar, tienes {cfg?.expiracion_pendiente_horas ?? 24} horas para transferir el anticipo de <span className="num font-semibold text-tinta">{pesos((total * anticipoPct) / 100)}</span>. El resto se paga el día del evento.
              </p>
              <div className="mt-5"><DatosTransferencia cfg={cfg} /></div>
              <dl className="mt-5 space-y-1 text-[15px]">
                <div><dt className="inline text-tinta-soft">Dónde: </dt><dd className="inline">{d.calle}, {d.colonia}, {d.cp}</dd></div>
                <div><dt className="inline text-tinta-soft">Evento: </dt><dd className="inline">{d.tipoEvento}{d.festejado ? ` de ${d.festejado}` : ''}</dd></div>
                <div><dt className="inline text-tinta-soft">Contacto: </dt><dd className="inline">{d.nombre}, {d.telefono}</dd></div>
              </dl>
              <label className="mt-5 flex cursor-pointer gap-3 text-[15px]">
                <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-1 size-4 accent-selva-600" />
                <span>
                  Acepto la <Link to="/paginas/politica-de-cancelacion" target="_blank" className="font-semibold underline">política de cancelación</Link>, el{' '}
                  <Link to="/paginas/aviso-de-privacidad" target="_blank" className="font-semibold underline">aviso de privacidad</Link> y los{' '}
                  <Link to="/paginas/terminos" target="_blank" className="font-semibold underline">términos</Link>.
                </span>
              </label>
              {errores.acepta && <p role="alert" className="mt-2 text-sm text-error">{errores.acepta}</p>}
            </section>
          )}

          <div className="mt-10 hidden items-center gap-3 lg:flex">
            {d.paso > 0 && (
              <Boton variante="fantasma" onClick={() => irA(d.paso - 1)}>
                <ChevronLeft className="size-4" /> Atrás
              </Boton>
            )}
            <Boton tam="lg" onClick={siguiente} disabled={enviando}>
              {enviando ? 'Guardando…' : d.paso === 5 ? 'Apartar mi fecha' : 'Continuar'}
            </Boton>
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Boleto datos={d} show={show} paquete={paquete} extrasSel={extrasSel} total={total} anticipoPct={anticipoPct} />
          </div>
        </aside>
      </div>

      {/* Barra inferior en móvil */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-white px-4 py-3 lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {d.paso > 0 && (
            <button onClick={() => irA(d.paso - 1)} className="inline-flex size-12 shrink-0 items-center justify-center rounded-full ring-1 ring-linea" aria-label="Atrás">
              <ChevronLeft className="size-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-tinta-soft">Total</p>
            <p className="num text-lg leading-tight font-bold">{pesos(total)}</p>
          </div>
          <Boton tam="lg" onClick={siguiente} disabled={enviando} className="shrink-0">
            {enviando ? 'Guardando…' : d.paso === 5 ? 'Apartar' : 'Continuar'}
          </Boton>
        </div>
      </div>
    </div>
  )
}
