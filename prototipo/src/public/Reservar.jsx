import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarPlus, Check, ChevronLeft, Download, Timer } from 'lucide-react'
import { EXTRAS, HORARIOS, SHOWS, showPorId } from '../data/mock'
import { fechaLarga, hora12, nuevoFolio, pesos } from '../lib/format'
import { useStore } from '../store'
import { Boton, Campo, Input, Select, claseInput } from '../components/ui'
import Calendario from '../components/Calendario'
import VerificadorCP from '../components/VerificadorCP'

const PASOS = ['Show', 'Lugar', 'Fecha', 'Detalles', 'Tus datos', 'Pago']
const ANTICIPO = 0.3

function Boleto({ datos, show, paquete, total, subtotal, extrasSel }) {
  return (
    <div className="rounded-3xl bg-butaca [--boleto-fondo:white]">
      <div className="p-5">
        <p className="text-sm font-semibold text-tinta-soft">Tu reservación</p>
        <p className="mt-1 font-cartel text-3xl leading-none font-black uppercase">{show ? show.nombre : 'Elige un show'}</p>
        {paquete && <p className="mt-1 text-sm text-tinta-soft">Paquete {paquete.nombre.toLowerCase()}</p>}
        <dl className="mt-4 space-y-2 text-[15px]">
          <div className="flex justify-between gap-3">
            <dt className="text-tinta-soft">Fecha</dt>
            <dd className="text-right font-medium">{datos.fecha ? fechaLarga(datos.fecha) : 'Por elegir'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-tinta-soft">Hora</dt>
            <dd className="font-medium">{datos.hora ? hora12(datos.hora) : 'Por elegir'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-tinta-soft">Zona</dt>
            <dd className="font-medium">{datos.zona ? datos.zona.nombre : 'Por confirmar'}</dd>
          </div>
        </dl>
      </div>
      <div className="boleto-corte mx-0 p-5">
        <dl className="num space-y-1.5 text-[15px]">
          <div className="flex justify-between"><dt className="text-tinta-soft">Show</dt><dd>{pesos(paquete?.precio ?? 0)}</dd></div>
          {extrasSel.map((e) => (
            <div key={e.id} className="flex justify-between"><dt className="text-tinta-soft">{e.nombre}</dt><dd>{pesos(e.precio)}</dd></div>
          ))}
          <div className="flex justify-between"><dt className="text-tinta-soft">Traslado</dt><dd>{datos.zona ? pesos(datos.zona.cargo) : '—'}</dd></div>
          {datos.cupon === 'FIESTA10' && (
            <div className="flex justify-between text-ok"><dt>Cupón FIESTA10</dt><dd>−{pesos(subtotal * 0.1)}</dd></div>
          )}
          <div className="flex justify-between border-t border-linea pt-2 text-lg font-bold"><dt>Total</dt><dd>{pesos(total)}</dd></div>
          <div className="flex justify-between text-telon-700"><dt>Anticipo para apartar</dt><dd className="font-semibold">{pesos(total * ANTICIPO)}</dd></div>
        </dl>
      </div>
    </div>
  )
}

export default function Reservar() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { ocupacion, agregarReservacion, sesion, avisar } = useStore()

  const [paso, setPaso] = useState(params.get('show') ? 1 : 0)
  const [confirmada, setConfirmada] = useState(null)
  const [retencion, setRetencion] = useState(null)
  const [datos, setDatos] = useState({
    showId: params.get('show') ?? '',
    paqueteId: params.get('paquete') ?? '',
    cp: params.get('cp') ?? '',
    zona: null,
    calle: '',
    colonia: '',
    referencias: '',
    fecha: '',
    hora: '',
    extras: [],
    tipoEvento: 'Cumpleaños',
    festejado: '',
    asistentes: '',
    espacio: 'Jardín',
    comentarios: '',
    nombre: sesion?.rol === 'cliente' ? 'Mariana López Ríos' : '',
    telefono: sesion?.rol === 'cliente' ? '33 1845 2290' : '',
    correo: sesion?.rol === 'cliente' ? 'mariana.lr@gmail.com' : '',
    contactoDia: '',
    cupon: '',
    metodo: 'tarjeta',
    acepta: false,
  })
  const [errores, setErrores] = useState({})
  const set = (k, v) => setDatos((d) => ({ ...d, [k]: v }))

  const show = showPorId(datos.showId)
  const paquete = show?.paquetes.find((p) => p.id === datos.paqueteId) ?? show?.paquetes[0]
  const extrasSel = EXTRAS.filter((e) => datos.extras.includes(e.id))
  const subtotal = (paquete?.precio ?? 0) + extrasSel.reduce((a, e) => a + e.precio, 0)
  const descuento = datos.cupon === 'FIESTA10' ? subtotal * 0.1 : 0
  const total = subtotal + (datos.zona?.cargo ?? 0) - descuento

  // Cuenta regresiva de la retención temporal del horario (RN-08)
  useEffect(() => {
    if (!retencion) return
    const t = setInterval(() => setRetencion((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [retencion !== null])

  const libres = useMemo(() => (datos.fecha ? HORARIOS.filter((h) => !ocupacion(datos.fecha).ocupados.includes(h)) : []), [datos.fecha, ocupacion])

  const validar = () => {
    const e = {}
    if (paso === 0 && !show) e.show = 'Elige el show que quieres reservar.'
    if (paso === 1) {
      if (!datos.zona) e.cp = 'Verifica un código postal con cobertura para continuar.'
      if (!datos.calle.trim()) e.calle = 'Escribe la calle y el número.'
      if (!datos.colonia.trim()) e.colonia = 'Escribe la colonia.'
    }
    if (paso === 2) {
      if (!datos.fecha) e.fecha = 'Elige un día en el calendario.'
      else if (!datos.hora) e.hora = 'Elige la hora de inicio.'
    }
    if (paso === 4) {
      if (!datos.nombre.trim()) e.nombre = 'Escribe tu nombre.'
      if (!/^[\d\s]{10,}$/.test(datos.telefono)) e.telefono = 'Escribe un teléfono de 10 dígitos.'
      if (!/^\S+@\S+\.\S+$/.test(datos.correo)) e.correo = 'Escribe un correo válido, ahí te llega la confirmación.'
    }
    if (paso === 5 && !datos.acepta) e.acepta = 'Acepta la política de cancelación para confirmar.'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const siguiente = () => {
    if (!validar()) return
    if (paso === 5) return confirmar()
    setPaso(paso + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const confirmar = () => {
    const r = {
      folio: nuevoFolio(),
      clienteId: 'c1',
      showId: show.id,
      paquete: paquete.nombre,
      fecha: datos.fecha,
      hora: datos.hora,
      zona: datos.zona.nombre,
      direccion: `${datos.calle}, ${datos.colonia}, ${datos.cp}`,
      total,
      pagado: datos.metodo === 'tarjeta' ? Math.round(total * ANTICIPO) : 0,
      estado: datos.metodo === 'tarjeta' ? 'confirmada' : 'pendiente',
      canal: 'En línea',
      evento: `${datos.tipoEvento}${datos.festejado ? ` de ${datos.festejado}` : ''}`,
    }
    agregarReservacion(r)
    setConfirmada(r)
    setRetencion(null)
    avisar(`Reservación ${r.folio} creada`)
    window.scrollTo({ top: 0 })
  }

  if (confirmada) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:py-16">
        <div className="entra text-center">
          <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-ok text-white">
            <Check className="size-7" strokeWidth={3} />
          </span>
          <h1 className="mt-5 font-cartel text-5xl leading-none font-black uppercase sm:text-6xl">
            {confirmada.estado === 'confirmada' ? '¡Función apartada!' : 'Solicitud recibida'}
          </h1>
          <p className="mx-auto mt-3 max-w-[44ch] text-tinta-soft">
            {confirmada.estado === 'confirmada'
              ? `Recibimos tu anticipo. Te enviamos la confirmación a ${datos.correo}.`
              : `Tu horario queda apartado 24 horas. Envía tu comprobante de transferencia para confirmarlo.`}
          </p>
        </div>
        <div className="mt-8 rounded-3xl bg-tinta text-white [--boleto-fondo:white]">
          <div className="p-6">
            <p className="text-sm text-white/60">Folio</p>
            <p className="num font-cartel text-4xl font-extrabold tracking-wide text-marquesina">{confirmada.folio}</p>
            <p className="mt-4 font-cartel text-3xl leading-none font-black uppercase">{show.nombre}</p>
            <p className="mt-2 text-white/80 first-letter:uppercase">{fechaLarga(confirmada.fecha)}, {hora12(confirmada.hora)}</p>
            <p className="mt-1 text-white/80">{confirmada.direccion}</p>
          </div>
          <div className="boleto-corte border-white/20 p-6">
            <dl className="num grid grid-cols-3 gap-3 text-sm">
              <div><dt className="text-white/60">Total</dt><dd className="mt-0.5 text-lg font-bold">{pesos(confirmada.total)}</dd></div>
              <div><dt className="text-white/60">Pagado</dt><dd className="mt-0.5 text-lg font-bold">{pesos(confirmada.pagado)}</dd></div>
              <div><dt className="text-white/60">Saldo</dt><dd className="mt-0.5 text-lg font-bold">{pesos(confirmada.total - confirmada.pagado)}</dd></div>
            </dl>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Boton variante="secundario" onClick={() => avisar('Evento agregado a tu calendario')}><CalendarPlus className="size-4" /> Agregar a mi calendario</Boton>
          <Boton variante="secundario" onClick={() => avisar('Comprobante descargado')}><Download className="size-4" /> Descargar comprobante</Boton>
        </div>
        <Boton className="mt-3 w-full" onClick={() => navigate('/mi-cuenta')}>Ver mis reservaciones</Boton>
      </div>
    )
  }

  const mm = retencion !== null ? `${Math.floor(retencion / 60)}:${String(retencion % 60).padStart(2, '0')}` : null

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-32 sm:px-6 lg:pt-10 lg:pb-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-cartel text-4xl leading-none font-black uppercase sm:text-5xl">Reservar un show</h1>
        {mm && (
          <p className={`num inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${retencion < 120 ? 'bg-telon-50 text-telon-700' : 'bg-marquesina-soft text-tinta'}`}>
            <Timer className="size-4" /> Apartado {mm}
          </p>
        )}
      </div>

      <ol className="mt-6 flex gap-1.5" aria-label="Pasos de la reservación">
        {PASOS.map((p, i) => (
          <li key={p} className="flex-1">
            <button
              type="button"
              disabled={i > paso}
              onClick={() => setPaso(i)}
              className="group block w-full text-left disabled:cursor-default"
              aria-current={i === paso ? 'step' : undefined}
            >
              <span className={`block h-1.5 rounded-full transition-colors ${i <= paso ? 'bg-telon-600' : 'bg-linea'}`} />
              <span className={`mt-2 hidden text-sm sm:block ${i === paso ? 'font-semibold text-tinta' : 'text-tinta-soft'}`}>
                {i + 1}. {p}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm text-tinta-soft sm:hidden">Paso {paso + 1} de {PASOS.length}: <span className="font-semibold text-tinta">{PASOS[paso]}</span></p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div key={paso} className="entra">
          {paso === 0 && (
            <section>
              <h2 className="text-2xl font-bold">¿Qué show quieres?</h2>
              {errores.show && <p role="alert" className="mt-2 text-telon-700">{errores.show}</p>}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {SHOWS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setDatos((d) => ({ ...d, showId: s.id, paqueteId: s.paquetes[0].id }))}
                    className={`flex items-center gap-4 rounded-2xl border-2 p-3 text-left transition-colors ${datos.showId === s.id ? 'border-telon-600 bg-telon-50/50' : 'border-linea hover:border-tinta-soft/40'}`}
                  >
                    <span className={`flex size-16 shrink-0 items-end rounded-xl p-1.5 ${s.cartel.fondo} ${s.cartel.texto}`}>
                      <span className="font-cartel text-sm leading-none font-black uppercase">{s.nombre}</span>
                    </span>
                    <span>
                      <span className="block font-semibold">{s.nombre}</span>
                      <span className="block text-sm text-tinta-soft">{s.categoria}, {s.duracion} min</span>
                      <span className="num block text-sm font-semibold">Desde {pesos(s.precio)}</span>
                    </span>
                  </button>
                ))}
              </div>
              {show && show.paquetes.length > 1 && (
                <fieldset className="mt-8">
                  <legend className="text-lg font-bold">Paquete</legend>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {show.paquetes.map((p) => (
                      <label key={p.id} className={`flex cursor-pointer gap-3 rounded-2xl border-2 p-4 ${paquete?.id === p.id ? 'border-telon-600 bg-telon-50/50' : 'border-linea'}`}>
                        <input type="radio" checked={paquete?.id === p.id} onChange={() => set('paqueteId', p.id)} className="mt-1 accent-telon-600" />
                        <span>
                          <span className="block font-semibold">{p.nombre} <span className="num">{pesos(p.precio)}</span></span>
                          <span className="block text-sm text-tinta-soft">{p.incluye.join(', ')}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </section>
          )}

          {paso === 1 && (
            <section className="max-w-xl">
              <h2 className="text-2xl font-bold">¿Dónde será el evento?</h2>
              <p className="mt-1 text-tinta-soft">Primero confirmamos que llegamos a tu zona.</p>
              <div className="mt-5">
                <VerificadorCP inicial={datos.cp} onResultado={(zona, cp) => setDatos((d) => ({ ...d, zona, cp }))} />
                {errores.cp && !datos.zona && <p role="alert" className="mt-2 text-sm text-telon-700">{errores.cp}</p>}
              </div>
              <fieldset disabled={!datos.zona} className="mt-6 space-y-4 transition-opacity disabled:opacity-40">
                <Campo etiqueta="Calle y número" error={errores.calle}>
                  <Input value={datos.calle} onChange={(e) => set('calle', e.target.value)} placeholder="Av. Patria 1840, interior 3" autoComplete="street-address" aria-invalid={!!errores.calle} />
                </Campo>
                <Campo etiqueta="Colonia" error={errores.colonia}>
                  <Input value={datos.colonia} onChange={(e) => set('colonia', e.target.value)} placeholder="Jardines Universidad" aria-invalid={!!errores.colonia} />
                </Campo>
                <Campo etiqueta="Referencias (opcional)" ayuda="Ayuda a los artistas a llegar: color de la casa, entre qué calles, nombre del salón.">
                  <Input value={datos.referencias} onChange={(e) => set('referencias', e.target.value)} placeholder="Salón Los Arcos, portón negro" />
                </Campo>
              </fieldset>
            </section>
          )}

          {paso === 2 && (
            <section>
              <h2 className="text-2xl font-bold">¿Qué día y a qué hora?</h2>
              <p className="mt-1 text-tinta-soft">Reservaciones en línea con al menos 48 horas de anticipación.</p>
              <div className="mt-5 grid gap-8 md:grid-cols-[1fr_220px]">
                <div className="max-w-md">
                  <Calendario valor={datos.fecha} onCambio={(f) => setDatos((d) => ({ ...d, fecha: f, hora: '' }))} />
                  {errores.fecha && <p role="alert" className="mt-2 text-sm text-telon-700">{errores.fecha}</p>}
                </div>
                <div>
                  <p className="font-semibold">Hora de inicio</p>
                  {!datos.fecha ? (
                    <p className="mt-2 text-sm text-tinta-soft">Elige un día para ver los horarios libres.</p>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-1">
                      {HORARIOS.map((h) => {
                        const libre = libres.includes(h)
                        return (
                          <button
                            key={h}
                            type="button"
                            disabled={!libre}
                            onClick={() => {
                              set('hora', h)
                              setRetencion(600)
                            }}
                            className={`num h-11 rounded-xl border-2 text-[15px] font-semibold transition-colors ${
                              datos.hora === h ? 'border-telon-600 bg-telon-600 text-white' : libre ? 'border-linea hover:border-tinta-soft/50' : 'border-transparent bg-butaca text-tinta-soft/50 line-through'
                            }`}
                          >
                            {hora12(h)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {errores.hora && <p role="alert" className="mt-2 text-sm text-telon-700">{errores.hora}</p>}
                  {datos.hora && <p className="mt-3 text-sm text-tinta-soft">Apartamos este horario 10 minutos mientras terminas.</p>}
                </div>
              </div>
            </section>
          )}

          {paso === 3 && (
            <section className="max-w-xl">
              <h2 className="text-2xl font-bold">Cuéntanos del evento</h2>
              <fieldset className="mt-5">
                <legend className="font-semibold">Extras</legend>
                <div className="mt-3 space-y-2">
                  {EXTRAS.map((e) => {
                    const on = datos.extras.includes(e.id)
                    return (
                      <label key={e.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 ${on ? 'border-telon-600 bg-telon-50/50' : 'border-linea'}`}>
                        <span className="flex items-center gap-3">
                          <input type="checkbox" checked={on} onChange={() => set('extras', on ? datos.extras.filter((x) => x !== e.id) : [...datos.extras, e.id])} className="size-4 accent-telon-600" />
                          {e.nombre}
                        </span>
                        <span className="num font-semibold">+{pesos(e.precio)}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Tipo de evento">
                  <Select value={datos.tipoEvento} onChange={(e) => set('tipoEvento', e.target.value)}>
                    {['Cumpleaños', 'Bautizo', 'Boda', 'XV años', 'Evento escolar', 'Evento de empresa', 'Otro'].map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </Campo>
                <Campo etiqueta="Nombre del festejado (opcional)">
                  <Input value={datos.festejado} onChange={(e) => set('festejado', e.target.value)} placeholder="Emilio" />
                </Campo>
                <Campo etiqueta="Invitados aproximados">
                  <Input inputMode="numeric" value={datos.asistentes} onChange={(e) => set('asistentes', e.target.value.replace(/\D/g, ''))} placeholder="40" />
                </Campo>
                <Campo etiqueta="Espacio">
                  <Select value={datos.espacio} onChange={(e) => set('espacio', e.target.value)}>
                    {['Jardín', 'Salón de eventos', 'Casa (interior)', 'Escuela', 'Oficina'].map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </Campo>
              </div>
              <Campo etiqueta="Algo que debamos saber (opcional)" className="mt-4">
                <textarea value={datos.comentarios} onChange={(e) => set('comentarios', e.target.value)} rows={3} className={`${claseInput} h-auto py-3`} placeholder="Hay escaleras para llegar al jardín." />
              </Campo>
            </section>
          )}

          {paso === 4 && (
            <section className="max-w-xl">
              <h2 className="text-2xl font-bold">Tus datos</h2>
              {!sesion && (
                <p className="mt-2 rounded-2xl bg-butaca px-4 py-3 text-[15px]">
                  ¿Ya tienes cuenta? <Link to="/entrar" className="font-semibold text-telon-700 underline">Entra</Link> y llenamos esto por ti.
                </p>
              )}
              <div className="mt-5 space-y-4">
                <Campo etiqueta="Nombre completo" error={errores.nombre}>
                  <Input value={datos.nombre} onChange={(e) => set('nombre', e.target.value)} autoComplete="name" aria-invalid={!!errores.nombre} />
                </Campo>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Celular" error={errores.telefono}>
                    <Input type="tel" inputMode="tel" value={datos.telefono} onChange={(e) => set('telefono', e.target.value)} autoComplete="tel" placeholder="33 1234 5678" aria-invalid={!!errores.telefono} />
                  </Campo>
                  <Campo etiqueta="Correo" error={errores.correo}>
                    <Input type="email" value={datos.correo} onChange={(e) => set('correo', e.target.value)} autoComplete="email" aria-invalid={!!errores.correo} />
                  </Campo>
                </div>
                <Campo etiqueta="¿Quién nos recibe el día del evento? (opcional)" ayuda="Si no eres tú, déjanos su nombre y celular.">
                  <Input value={datos.contactoDia} onChange={(e) => set('contactoDia', e.target.value)} placeholder="Tía Laura, 33 9876 5432" />
                </Campo>
              </div>
            </section>
          )}

          {paso === 5 && (
            <section className="max-w-xl">
              <h2 className="text-2xl font-bold">Aparta tu fecha</h2>
              <p className="mt-1 text-tinta-soft">Pagas el 30 % ahora y el resto el día del evento.</p>
              <fieldset className="mt-5 space-y-2">
                <legend className="sr-only">Método de pago</legend>
                {[
                  { id: 'tarjeta', t: 'Tarjeta de crédito o débito', d: 'Confirmación inmediata.' },
                  { id: 'transferencia', t: 'Transferencia SPEI', d: 'Subes tu comprobante y lo validamos en horas hábiles.' },
                  { id: 'oxxo', t: 'Efectivo en OXXO', d: 'Tienes 24 horas para pagar la referencia.' },
                ].map((m) => (
                  <label key={m.id} className={`flex cursor-pointer gap-3 rounded-2xl border-2 p-4 ${datos.metodo === m.id ? 'border-telon-600 bg-telon-50/50' : 'border-linea'}`}>
                    <input type="radio" checked={datos.metodo === m.id} onChange={() => set('metodo', m.id)} className="mt-1 accent-telon-600" />
                    <span>
                      <span className="block font-semibold">{m.t}</span>
                      <span className="block text-sm text-tinta-soft">{m.d}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {datos.metodo === 'tarjeta' && (
                <div className="mt-4 grid gap-3 rounded-2xl border border-linea p-4 sm:grid-cols-[1fr_110px_90px]">
                  <Campo etiqueta="Número de tarjeta"><Input inputMode="numeric" placeholder="4242 4242 4242 4242" /></Campo>
                  <Campo etiqueta="Vence"><Input placeholder="MM/AA" /></Campo>
                  <Campo etiqueta="CVC"><Input inputMode="numeric" placeholder="123" /></Campo>
                  <p className="text-xs text-tinta-soft sm:col-span-3">Campos de demostración: en producción los aloja la pasarela de pago.</p>
                </div>
              )}
              <Campo etiqueta="Cupón de descuento" ayuda={datos.cupon === 'FIESTA10' ? 'Cupón aplicado: 10 % de descuento.' : 'Prueba con FIESTA10.'} className="mt-5">
                <Input value={datos.cupon} onChange={(e) => set('cupon', e.target.value.toUpperCase())} placeholder="FIESTA10" />
              </Campo>
              <label className="mt-5 flex cursor-pointer gap-3 text-[15px]">
                <input type="checkbox" checked={datos.acepta} onChange={(e) => set('acepta', e.target.checked)} className="mt-1 size-4 accent-telon-600" />
                <span>
                  Acepto la <a href="#" className="font-semibold underline">política de cancelación</a>: reembolso del anticipo si cancelo con 7 días o más de anticipación.
                </span>
              </label>
              {errores.acepta && <p role="alert" className="mt-2 text-sm text-telon-700">{errores.acepta}</p>}
            </section>
          )}

          <div className="mt-10 hidden items-center gap-3 lg:flex">
            {paso > 0 && (
              <Boton variante="fantasma" onClick={() => setPaso(paso - 1)}>
                <ChevronLeft className="size-4" /> Atrás
              </Boton>
            )}
            <Boton tam="lg" onClick={siguiente}>
              {paso === 5 ? `Pagar ${pesos(total * ANTICIPO)} y apartar` : 'Continuar'}
            </Boton>
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Boleto datos={datos} show={show} paquete={paquete} total={total} subtotal={subtotal} extrasSel={extrasSel} />
          </div>
        </aside>
      </div>

      {/* Barra inferior en móvil */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-white px-4 py-3 lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {paso > 0 && (
            <button onClick={() => setPaso(paso - 1)} className="inline-flex size-12 shrink-0 items-center justify-center rounded-full ring-1 ring-linea" aria-label="Atrás">
              <ChevronLeft className="size-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-tinta-soft">Total</p>
            <p className="num text-lg leading-tight font-bold">{pesos(total)}</p>
          </div>
          <Boton tam="lg" onClick={siguiente} className="shrink-0">
            {paso === 5 ? 'Pagar y apartar' : 'Continuar'}
          </Boton>
        </div>
      </div>
    </div>
  )
}
