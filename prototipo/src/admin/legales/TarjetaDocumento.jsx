import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ExternalLink, FileText, Upload } from 'lucide-react'
import { mensajeError, urlLegal } from '../../lib/api'
import { aceptacionesPorVersion, guardarPagina, obtenerVersionesPagina, publicarPdfLegal } from '../../lib/apiAdmin'
import { fechaLarga } from '../../lib/format'
import { useStore } from '../../store'
import { Boton, claseInput } from '../../components/ui'

const MAX_MB = 10
const peso = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

/** Un documento legal: PDF vigente, resumen e historial de versiones */
export default function TarjetaDocumento({ pagina: p }) {
  const queryClient = useQueryClient()
  const { avisar } = useStore()
  const entrada = useRef(null)
  const [elegido, setElegido] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const [resumen, setResumen] = useState(p.contenido)
  const [guardando, setGuardando] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const [error, setError] = useState('')
  const versiones = useQuery({ queryKey: ['admin-versiones', p.slug], queryFn: () => obtenerVersionesPagina(p.slug), enabled: verHistorial })
  const conteos = useQuery({ queryKey: ['admin-aceptaciones', p.slug], queryFn: () => aceptacionesPorVersion(p.slug), enabled: verHistorial })
  const tienePdf = !!p.pdf_ruta

  const refrescar = async () => {
    await Promise.all(['admin-paginas', 'admin-versiones', 'admin-aceptaciones'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
    queryClient.invalidateQueries({ queryKey: ['pagina', p.slug] })
  }

  const elegir = (archivo) => {
    setError('')
    if (!archivo) return
    if (archivo.type !== 'application/pdf' && !archivo.name.toLowerCase().endsWith('.pdf')) return setError('Solo se aceptan archivos PDF.')
    if (archivo.size > MAX_MB * 1048576) return setError(`El PDF debe pesar menos de ${MAX_MB} MB.`)
    setElegido(archivo)
  }

  const publicar = async () => {
    setSubiendo(true)
    setError('')
    try {
      const version = await publicarPdfLegal(p.slug, elegido)
      await refrescar()
      setElegido(null)
      avisar(`${p.titulo}: versión ${version} publicada`)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setSubiendo(false)
    }
  }

  const guardarResumen = async () => {
    setGuardando(true)
    setError('')
    try {
      await guardarPagina(p.slug, { contenido: resumen })
      await refrescar()
      avisar(tienePdf ? 'Resumen guardado' : `${p.titulo} actualizado`)
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <li className="rounded-xl ring-1 ring-linea">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3">
        <span className="font-semibold">{p.titulo}</span>
        <span className="num text-sm text-tinta-soft">Versión {p.version} · vigente desde {fechaLarga(p.vigente_desde ?? p.actualizado_en).replace(/^[^,]+, /, '')}</span>
      </div>

      <div className="px-4 py-3">
        {tienePdf ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-butaca/70 px-3 py-2">
            <FileText className="size-5 shrink-0 text-selva-700" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="font-medium">{p.pdf_nombre ?? 'documento.pdf'}</span>
              {p.pdf_bytes ? <span className="text-tinta-soft"> · {peso(p.pdf_bytes)}</span> : null}
            </span>
            <a href={urlLegal(p.pdf_ruta)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-selva-700 underline">
              Ver PDF <ExternalLink className="size-3.5" />
            </a>
          </div>
        ) : (
          <p className="rounded-lg bg-maiz-soft px-3 py-2 text-sm">Todavía no tiene PDF: el sitio muestra el texto de abajo. Sube el PDF oficial cuando lo tengas.</p>
        )}

        <input ref={entrada} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = '' }} />
        {!elegido ? (
          <Boton type="button" tam="sm" variante="secundario" className="mt-2" onClick={() => entrada.current?.click()}>
            <Upload className="size-4" /> {tienePdf ? 'Subir nueva versión' : 'Subir PDF'}
          </Boton>
        ) : (
          <div className="mt-2 rounded-lg bg-alerta-soft px-3 py-2 text-sm">
            <p>
              Vas a publicar <span className="font-semibold">{elegido.name}</span> ({peso(elegido.size)}) como la <span className="font-semibold">versión {p.version + 1}</span>.
              A los clientes con sesión se les pedirá aceptarla. Las versiones anteriores se conservan y no se pueden borrar.
            </p>
            <div className="mt-2 flex gap-2">
              <Boton type="button" tam="sm" onClick={publicar} disabled={subiendo}>{subiendo ? 'Publicando…' : 'Publicar versión'}</Boton>
              <Boton type="button" tam="sm" variante="secundario" onClick={() => setElegido(null)} disabled={subiendo}>Cancelar</Boton>
            </div>
          </div>
        )}

        <label className="mt-4 block">
          <span className="block text-sm font-semibold">{tienePdf ? 'Resumen (se lee arriba del PDF)' : 'Texto del documento'}</span>
          <span className="block text-xs text-tinta-soft">
            {tienePdf ? 'Cambiar el resumen no crea una versión nueva ni pide volver a aceptar.' : 'Cada cambio crea una versión nueva.'} Usa ## para títulos, ** para negritas y guiones para listas.
          </span>
          <textarea rows={tienePdf ? 4 : 10} value={resumen} onChange={(e) => setResumen(e.target.value)} className={`${claseInput} mt-1 h-auto py-3 font-mono text-sm`} />
        </label>
        <Boton type="button" tam="sm" className="mt-2" onClick={guardarResumen} disabled={guardando || resumen === p.contenido}>
          {guardando ? 'Guardando…' : tienePdf ? 'Guardar resumen' : 'Guardar texto'}
        </Boton>

        {error && <p role="alert" className="mt-2 rounded-lg bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}

        <button type="button" onClick={() => setVerHistorial(!verHistorial)} aria-expanded={verHistorial} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-tinta-soft hover:text-tinta">
          <ChevronDown className={`size-4 transition-transform ${verHistorial ? 'rotate-180' : ''}`} /> Historial de versiones
        </button>
        {verHistorial && (
          <ul className="mt-2 divide-y divide-linea text-sm">
            {(versiones.data ?? []).map((v) => {
              const n = conteos.data?.find((c) => c.version === v.version)?.clientes ?? 0
              return (
                <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="num">
                    <span className="font-semibold">v{v.version}</span> · {fechaLarga(v.publicado_en).replace(/^[^,]+, /, '')} · {v.pdf_nombre ?? 'texto'} · aceptada por {n} {Number(n) === 1 ? 'cliente' : 'clientes'}
                    {v.version === p.version ? <span className="ml-1 rounded-full bg-selva-50 px-2 py-0.5 text-xs font-semibold text-selva-700">vigente</span> : null}
                  </span>
                  {v.pdf_ruta && <a href={urlLegal(v.pdf_ruta)} target="_blank" rel="noreferrer" className="font-semibold text-selva-700 underline">Ver</a>}
                </li>
              )
            })}
            {versiones.isLoading && <li className="py-2 text-tinta-soft">Cargando…</li>}
          </ul>
        )}
      </div>
    </li>
  )
}
