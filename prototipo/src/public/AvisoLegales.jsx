import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { useAuth } from '../auth'
import { aceptarPaginas, legalesPendientes, mensajeError } from '../lib/api'
import { fechaDeDia, diaDe } from '../lib/format'
import { Boton } from '../components/ui'

const CLAVE = 'ay-legales-despues'

// "Recordarme después" dura hasta la siguiente visita (la sesión del navegador)
const leerPospuesto = () => {
  try { return sessionStorage.getItem(CLAVE) } catch { return null }
}
const posponer = (firma) => {
  try { sessionStorage.setItem(CLAVE, firma) } catch { /* sin almacenamiento: el aviso vuelve a salir */ }
}

/** "Actualizamos nuestros documentos": pide aceptar las versiones nuevas */
export default function AvisoLegales() {
  const { usuario, esAdmin, cargando } = useAuth()
  const queryClient = useQueryClient()
  const pendientes = useQuery({
    queryKey: ['legales-pendientes', usuario?.id],
    queryFn: legalesPendientes,
    enabled: !!usuario && !cargando && !esAdmin,
    staleTime: 5 * 60 * 1000,
  })
  const [acepta, setAcepta] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [cerrado, setCerrado] = useState(null)

  const lista = pendientes.data ?? []
  const firma = lista.map((p) => `${p.slug}:${p.version}`).join(',')
  if (!usuario || esAdmin || lista.length === 0 || cerrado === firma || leerPospuesto() === firma) return null

  const aceptar = async () => {
    setEnviando(true)
    setError('')
    try {
      await aceptarPaginas(lista.map((p) => p.slug))
      await queryClient.invalidateQueries({ queryKey: ['legales-pendientes'] })
      setCerrado(firma)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="aviso-legales-titulo">
      <div className="entra w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="aviso-legales-titulo" className="text-lg font-bold">Actualizamos nuestros documentos</h2>
        <p className="mt-1 text-[15px] text-tinta-soft">Revisa los cambios y acéptalos para seguir reservando con nosotros.</p>
        <ul className="mt-4 space-y-2">
          {lista.map((p) => (
            <li key={p.slug} className="flex items-center gap-3 rounded-xl bg-butaca/70 px-3 py-2">
              <FileText className="size-5 shrink-0 text-selva-700" aria-hidden />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold">{p.titulo}</span>
                <span className="num block text-tinta-soft">Versión {p.version}, desde el {fechaDeDia(diaDe(p.vigente_desde)).replace(/^[^,]+, /, '')}</span>
              </span>
              <Link to={`/paginas/${p.slug}`} target="_blank" className="text-sm font-semibold text-selva-700 underline">Leer</Link>
            </li>
          ))}
        </ul>
        <label className="mt-4 flex cursor-pointer gap-3 text-[15px]">
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-1 size-4 accent-selva-600" />
          <span>Leí y acepto los documentos actualizados.</span>
        </label>
        {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Boton onClick={aceptar} disabled={!acepta || enviando}>{enviando ? 'Guardando…' : 'Aceptar'}</Boton>
          <button type="button" onClick={() => { posponer(firma); setCerrado(firma) }} className="text-sm font-semibold text-tinta-soft underline">
            Recordarme después
          </button>
        </div>
      </div>
    </div>
  )
}
