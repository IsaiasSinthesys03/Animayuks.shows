import { Upload } from 'lucide-react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mensajeError, subirComprobante } from '../lib/api'
import { enlaceWhatsapp } from '../lib/consultas'
import { useAuth } from '../auth'
import { Boton, Campo, Input } from './ui'

/** Datos para transferir, tal como los capturó el administrador en el panel. */
export function DatosTransferencia({ cfg, folio }) {
  const whatsapp = enlaceWhatsapp(cfg, folio ? `Hola, quiero pagar el anticipo de mi reservación ${folio}.` : undefined)
  if (cfg?.clabe) {
    return (
      <dl className="space-y-1 rounded-2xl bg-butaca p-4 text-[15px]">
        <div className="flex justify-between gap-3"><dt className="text-tinta-soft">Banco</dt><dd className="font-semibold">{cfg.banco}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-tinta-soft">Titular</dt><dd className="text-right font-semibold">{cfg.titular_cuenta}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-tinta-soft">CLABE</dt><dd className="num font-semibold tracking-wide">{cfg.clabe}</dd></div>
        {folio && <div className="flex justify-between gap-3"><dt className="text-tinta-soft">Concepto</dt><dd className="num font-semibold">{folio}</dd></div>}
      </dl>
    )
  }
  return (
    <p className="rounded-2xl bg-butaca p-4 text-[15px]">
      Te enviaremos los datos para transferir.{' '}
      {whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer" className="font-semibold text-telon-700 underline">Pídelos por WhatsApp</a> : cfg?.correo_contacto ? <>Escríbenos a <span className="font-semibold">{cfg.correo_contacto}</span>.</> : null}
    </p>
  )
}

const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
const MAX_MB = 10

/** Subir el comprobante de una transferencia: queda pendiente hasta que el administrador lo apruebe. */
export function SubirComprobante({ reservacion, onListo }) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()
  const sugerido = Math.max(Number(reservacion.anticipo_requerido) - Number(reservacion.total_pagado), 0) || Math.max(Number(reservacion.total) - Number(reservacion.total_pagado), 0)
  const [monto, setMonto] = useState(String(sugerido))
  const [archivo, setArchivo] = useState(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    if (!archivo) return setError('Elige la foto o el PDF de tu comprobante.')
    if (!TIPOS.includes(archivo.type)) return setError('El comprobante debe ser una imagen o un PDF.')
    if (archivo.size > MAX_MB * 1024 * 1024) return setError(`El archivo pesa más de ${MAX_MB} MB.`)
    if (!(Number(monto) > 0)) return setError('Escribe el monto que transferiste.')
    setEnviando(true)
    try {
      await subirComprobante({
        usuarioId: usuario.id,
        reservacionId: reservacion.id,
        archivo,
        monto: Number(monto),
        tipo: Number(reservacion.total_pagado) < Number(reservacion.anticipo_requerido) ? 'anticipo' : 'abono',
      })
      await queryClient.invalidateQueries({ queryKey: ['mis-reservaciones'] })
      onListo?.()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3" noValidate>
      <Campo etiqueta="Monto transferido">
        <Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d.]/g, ''))} />
      </Campo>
      <Campo etiqueta="Comprobante" ayuda={`Foto o PDF, máximo ${MAX_MB} MB.`} error={error}>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-butaca file:px-4 file:font-semibold"
        />
      </Campo>
      <Boton type="submit" disabled={enviando} className="w-full">
        <Upload className="size-4" /> {enviando ? 'Subiendo…' : 'Enviar comprobante'}
      </Boton>
    </form>
  )
}
