import { usePreguntas } from '../lib/consultas'
import { Cargando, ErrorCarga } from '../components/ui'

export default function Preguntas() {
  const preguntas = usePreguntas()
  return (
    <div className="mx-auto max-w-[70ch] px-4 py-10 sm:px-6 lg:py-14">
      <h1 className="font-bungee text-4xl leading-[1.05] uppercase sm:text-4xl">Preguntas frecuentes</h1>
      {preguntas.isLoading && <Cargando />}
      {preguntas.isError && <ErrorCarga onReintentar={preguntas.refetch} />}
      <div className="mt-8 divide-y divide-linea">
        {(preguntas.data ?? []).map((p) => (
          <details key={p.id} className="group py-4">
            <summary className="cursor-pointer text-lg font-semibold marker:text-selva-600">{p.pregunta}</summary>
            <p className="mt-2 leading-relaxed whitespace-pre-line text-tinta-soft">{p.respuesta}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
