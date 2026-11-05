import { useEffect, useRef } from 'react'

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const LLAVE = import.meta.env.VITE_TURNSTILE_SITE_KEY

let cargaScript

function cargarScript() {
  if (window.turnstile) return Promise.resolve()
  if (!cargaScript) {
    cargaScript = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SCRIPT
      s.async = true
      s.onload = resolve
      s.onerror = reject
      document.head.appendChild(s)
    })
  }
  return cargaScript
}

/** Verificación anti-bots. Normalmente no pide nada; llama a onToken cuando termina. */
export default function Turnstile({ onToken, reinicio = 0 }) {
  const contenedor = useRef(null)
  const widget = useRef(null)

  useEffect(() => {
    if (!LLAVE) return undefined
    let cancelado = false
    cargarScript()
      .then(() => {
        if (cancelado || !contenedor.current) return
        widget.current = window.turnstile.render(contenedor.current, {
          sitekey: LLAVE,
          language: 'es',
          callback: onToken,
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        })
      })
      .catch(() => onToken(null))
    return () => {
      cancelado = true
      if (widget.current != null) window.turnstile?.remove(widget.current)
      widget.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reinicio])

  return <div ref={contenedor} className="min-h-[65px]" />
}
