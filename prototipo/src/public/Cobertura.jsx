import { useZonas } from '../lib/consultas'
import { pesos } from '../lib/format'
import { Cargando, ErrorCarga } from '../components/ui'
import VerificadorCP from '../components/VerificadorCP'

export default function Cobertura() {
  const zonas = useZonas()
  const activas = (zonas.data ?? []).filter((z) => z.activa)

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <h1 className="font-cartel text-6xl leading-[0.9] font-black uppercase sm:text-7xl">¿Llegamos a tu zona?</h1>
      <p className="mt-4 max-w-[52ch] text-lg text-tinta-soft">
        Solo aceptamos reservaciones dentro de nuestras zonas de cobertura. Escribe el código postal donde será tu evento.
      </p>
      <div className="mt-6">
        <VerificadorCP />
      </div>

      {zonas.isLoading && <Cargando />}
      {zonas.isError && <ErrorCarga onReintentar={zonas.refetch} />}
      {activas.length > 0 && (
        <table className="mt-10 w-full text-left text-[15px]">
          <caption className="sr-only">Zonas y cargos de traslado</caption>
          <thead>
            <tr className="border-b border-linea text-sm text-tinta-soft">
              <th className="py-2 font-medium">Zona</th>
              <th className="py-2 text-right font-medium">Traslado</th>
            </tr>
          </thead>
          <tbody>
            {activas.map((z) => (
              <tr key={z.id} className="border-b border-linea">
                <td className="py-3 font-medium">
                  <span className="mr-2.5 inline-block size-2.5 rounded-full" style={{ background: z.color }} aria-hidden />
                  {z.nombre}
                </td>
                <td className="num py-3 text-right">{Number(z.cargo_traslado) ? pesos(z.cargo_traslado) : 'Sin cargo'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
