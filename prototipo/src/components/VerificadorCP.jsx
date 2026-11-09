import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react'
import { anotarInteres, mensajeError, zonaPorCP } from '../lib/api'
import { pesos, resumenHorario } from '../lib/format'

/**
 * Verificador de cobertura por código postal, contra la base de datos.
 * `oscuro` lo adapta a fondos tinta; `onResultado` permite a un formulario reaccionar.
 */
export default function VerificadorCP({ oscuro = false, onResultado, inicial = '' }) {
  const [cp, setCp] = useState(inicial)
  const [estado, setEstado] = useState(null) // null | 'cargando' | 'invalido' | 'fuera' | { zona } | { error }
  const [contacto, setContacto] = useState('')
  const [interes, setInteres] = useState('inicial') // 'inicial' | 'enviando' | 'listo' | 'error'

  const verificar = async (e) => {
    e.preventDefault()
    setInteres('inicial')
    if (!/^\d{5}$/.test(cp)) {
      setEstado('invalido')
      onResultado?.(null, cp)
      return
    }
    setEstado('cargando')
    try {
      const zona = await zonaPorCP(cp)
      setEstado(zona ? { zona } : 'fuera')
      onResultado?.(zona, cp)
    } catch (error) {
      setEstado({ error: mensajeError(error) })
      onResultado?.(null, cp)
    }
  }

  const avisame = async (e) => {
    e.preventDefault()
    setInteres('enviando')
    try {
      await anotarInteres(cp, contacto.trim())
      setInteres('listo')
    } catch {
      setInteres('error')
    }
  }

  const textoSuave = oscuro ? 'text-white' : 'text-tinta-soft'

  return (
    <div>
      <form onSubmit={verificar} className="flex gap-2" noValidate>
        <label className="sr-only" htmlFor="cp">Código postal del evento</label>
        <input
          id="cp"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          placeholder="Código postal, ej. 45110"
          value={cp}
          onChange={(e) => {
            setCp(e.target.value.replace(/\D/g, ''))
            setEstado(null)
          }}
          aria-invalid={estado === 'invalido'}
          className={`num h-12 min-w-0 flex-1 border px-5 text-base focus:outline-none ${
            oscuro
              ? 'rounded-xl border-[2.5px] border-[#251206] bg-[#f6e7cb] font-semibold text-[#251206] placeholder:text-[#6b4a2b] focus:ring-3 focus:ring-maiz'
              : 'rounded-full border-linea bg-white placeholder:text-tinta-soft/70 focus:border-selva-500 focus:ring-3 focus:ring-selva-100'
          }`}
        />
        <button
          type="submit"
          disabled={estado === 'cargando'}
          className={`h-12 shrink-0 px-5 transition-colors disabled:opacity-60 ${
            oscuro
              ? 'rounded-xl border-[2.5px] border-[#251206] bg-maiz font-bold text-[#251206] shadow-[0_3px_0_#251206] hover:bg-[#f0c453] active:translate-y-[2px] active:shadow-[0_1px_0_#251206]'
              : 'rounded-full bg-selva-600 font-semibold text-white hover:bg-selva-700'
          }`}
        >
          Verificar
        </button>
      </form>

      <div aria-live="polite">
        {estado === 'cargando' && (
          <p className={`mt-4 flex items-center gap-2 text-sm ${textoSuave}`}>
            <Loader2 className="size-4 animate-spin" /> Buscando tu zona…
          </p>
        )}
        {estado === 'invalido' && (
          <p className={`mt-4 flex items-center gap-2 text-sm font-medium ${oscuro ? 'text-white' : 'text-error'}`}>
            <CircleAlert className="size-4" /> Escribe los 5 dígitos del código postal donde será el evento.
          </p>
        )}
        {estado?.error && (
          <p className={`mt-4 flex items-center gap-2 text-sm font-medium ${oscuro ? 'text-white' : 'text-error'}`}>
            <CircleAlert className="size-4" /> {estado.error}
          </p>
        )}
        {estado?.zona && (
          <div className={`entra mt-4 rounded-2xl p-4 ${oscuro ? 'bg-white/10' : 'bg-ok-soft'}`}>
            <p className={`flex items-center gap-2 font-semibold ${oscuro ? 'text-white' : 'text-ok'}`}>
              <CircleCheck className="size-5" /> Sí llegamos a {estado.zona.nombre}
            </p>
            <p className={`mt-1 text-sm ${textoSuave}`}>
              {Number(estado.zona.cargo_traslado) ? `Cargo por traslado: ${pesos(estado.zona.cargo_traslado)}.` : 'Sin cargo por traslado.'}
              {estado.zona.horario && ` En tu zona: ${resumenHorario(estado.zona.horario)}.`}
            </p>
            {!onResultado && (
              <Link to={`/reservar?cp=${cp}`} className={`mt-3 inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold ${oscuro ? 'bg-white text-tinta' : 'bg-selva-600 text-white'}`}>
                Reservar con este código postal
              </Link>
            )}
          </div>
        )}
        {estado === 'fuera' && (
          <div className={`entra mt-4 rounded-2xl p-4 ${oscuro ? 'bg-white/10' : 'bg-error-soft'}`}>
            <p className={`flex items-center gap-2 font-semibold ${oscuro ? 'text-white' : 'text-error'}`}>
              <CircleAlert className="size-5" /> Por ahora no damos servicio en ese código postal
            </p>
            {interes === 'listo' ? (
              <p className={`mt-2 text-sm font-semibold ${oscuro ? 'text-white' : 'text-ok'}`}>Listo. Te avisaremos cuando lleguemos a tu zona.</p>
            ) : (
              <form onSubmit={avisame} className="mt-3 flex gap-2">
                <label className="sr-only" htmlFor="interes">Tu correo o teléfono</label>
                <input
                  id="interes"
                  value={contacto}
                  onChange={(e) => setContacto(e.target.value)}
                  placeholder="Tu correo o teléfono"
                  required
                  className="h-10 min-w-0 flex-1 rounded-full border border-linea bg-white px-4 text-sm text-tinta focus:outline-none"
                />
                <button type="submit" disabled={interes === 'enviando'} className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold disabled:opacity-60 ${oscuro ? 'bg-white text-tinta' : 'bg-selva-600 text-white'}`}>
                  Avísame
                </button>
              </form>
            )}
            {interes === 'error' && <p className={`mt-2 text-sm ${textoSuave}`}>No pudimos guardarlo. Intenta de nuevo.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
