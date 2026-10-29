import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, CircleCheck, LocateFixed, Loader2 } from 'lucide-react'
import { zonaPorCP } from '../data/mock'
import { pesos } from '../lib/format'

/**
 * Verificador de cobertura por código postal.
 * `oscuro` lo adapta a fondos tinta; `onResultado` permite a un formulario reaccionar.
 */
export default function VerificadorCP({ oscuro = false, onResultado, inicial = '', compacto = false }) {
  const [cp, setCp] = useState(inicial)
  const [estado, setEstado] = useState(null) // null | 'cargando' | { zona } | 'fuera' | 'invalido'
  const [interes, setInteres] = useState(false)

  const verificar = (valor = cp) => {
    if (!/^\d{5}$/.test(valor)) {
      setEstado('invalido')
      onResultado?.(null, valor)
      return
    }
    setEstado('cargando')
    setTimeout(() => {
      const zona = zonaPorCP(valor)
      setEstado(zona ? { zona } : 'fuera')
      onResultado?.(zona, valor)
    }, 450)
  }

  const usarUbicacion = () => {
    setCp('44160')
    verificar('44160')
  }

  const textoSuave = oscuro ? 'text-white/75' : 'text-tinta-soft'

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          verificar()
        }}
        className="flex gap-2"
      >
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
          className={`num h-12 min-w-0 flex-1 rounded-full border px-5 text-base focus:outline-none ${
            oscuro
              ? 'border-white/20 bg-white text-tinta placeholder:text-tinta-soft focus:ring-3 focus:ring-marquesina/60'
              : 'border-linea bg-white placeholder:text-tinta-soft/70 focus:border-telon-500 focus:ring-3 focus:ring-telon-100'
          }`}
        />
        <button
          type="submit"
          className={`h-12 shrink-0 rounded-full px-5 font-semibold transition-colors ${
            oscuro ? 'bg-marquesina text-tinta hover:bg-[#ffc81f]' : 'bg-tinta text-white hover:bg-black'
          }`}
        >
          Verificar
        </button>
      </form>

      {!compacto && (
        <button type="button" onClick={usarUbicacion} className={`mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline ${textoSuave} hover:opacity-100`}>
          <LocateFixed className="size-4" /> Usar mi ubicación actual
        </button>
      )}

      <div aria-live="polite" className="min-h-0">
        {estado === 'cargando' && (
          <p className={`mt-4 flex items-center gap-2 text-sm ${textoSuave}`}>
            <Loader2 className="size-4 animate-spin" /> Buscando tu zona…
          </p>
        )}
        {estado === 'invalido' && (
          <p className={`mt-4 flex items-center gap-2 text-sm font-medium ${oscuro ? 'text-marquesina' : 'text-telon-700'}`}>
            <CircleAlert className="size-4" /> Escribe los 5 dígitos del código postal donde será el evento.
          </p>
        )}
        {estado?.zona && (
          <div className={`entra mt-4 rounded-2xl p-4 ${oscuro ? 'bg-white/10' : 'bg-ok-soft'}`}>
            <p className={`flex items-center gap-2 font-semibold ${oscuro ? 'text-white' : 'text-ok'}`}>
              <CircleCheck className="size-5" /> Sí llegamos a {estado.zona.nombre}
            </p>
            <p className={`mt-1 text-sm ${textoSuave}`}>
              {estado.zona.cargo ? `Cargo por traslado: ${pesos(estado.zona.cargo)}.` : 'Sin cargo por traslado.'}
            </p>
            {!onResultado && (
              <Link to={`/reservar?cp=${cp}`} className={`mt-3 inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold ${oscuro ? 'bg-white text-tinta' : 'bg-telon-600 text-white'}`}>
                Reservar con este código postal
              </Link>
            )}
          </div>
        )}
        {estado === 'fuera' && (
          <div className={`entra mt-4 rounded-2xl p-4 ${oscuro ? 'bg-white/10' : 'bg-telon-50'}`}>
            <p className={`flex items-center gap-2 font-semibold ${oscuro ? 'text-white' : 'text-telon-700'}`}>
              <CircleAlert className="size-5" /> Por ahora no damos servicio en ese código postal
            </p>
            <p className={`mt-1 text-sm ${textoSuave}`}>
              Solo hacemos eventos en Guadalajara, Zapopan, Tlaquepaque y Tonalá.
            </p>
            {interes ? (
              <p className={`mt-3 text-sm font-semibold ${oscuro ? 'text-marquesina' : 'text-ok'}`}>Listo. Te avisaremos cuando lleguemos a tu zona.</p>
            ) : (
              <button type="button" onClick={() => setInteres(true)} className={`mt-3 text-sm font-semibold underline ${oscuro ? 'text-white' : 'text-telon-700'}`}>
                Avísame cuando lleguen a mi zona
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
