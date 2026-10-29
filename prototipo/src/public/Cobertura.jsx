import { ZONAS } from '../data/mock'
import { pesos } from '../lib/format'
import VerificadorCP from '../components/VerificadorCP'
import MapaZonas from '../components/MapaZonas'

export default function Cobertura() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.25fr]">
        <div>
          <h1 className="font-cartel text-6xl leading-[0.9] font-black uppercase sm:text-7xl">¿Llegamos a tu zona?</h1>
          <p className="mt-4 max-w-[48ch] text-lg text-tinta-soft">
            Solo aceptamos reservaciones dentro de la zona metropolitana de Guadalajara. Escribe el código postal donde será tu evento.
          </p>
          <div className="mt-6">
            <VerificadorCP />
          </div>
          <p className="mt-6 text-sm text-tinta-soft">Prueba con 44160 (Guadalajara), 45110 (Zapopan) o 45640 (fuera de cobertura).</p>

          <table className="mt-8 w-full text-left text-[15px]">
            <caption className="sr-only">Zonas y cargos de traslado</caption>
            <thead>
              <tr className="border-b border-linea text-sm text-tinta-soft">
                <th className="py-2 font-medium">Zona</th>
                <th className="py-2 font-medium">Traslado</th>
                <th className="py-2 text-right font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {ZONAS.map((z) => (
                <tr key={z.id} className="border-b border-linea">
                  <td className="py-3 font-medium">
                    <span className={`mr-2.5 inline-block size-2.5 rounded-full ${z.color}`} aria-hidden />
                    {z.nombre}
                  </td>
                  <td className="num py-3">{z.cargo ? pesos(z.cargo) : 'Sin cargo'}</td>
                  <td className="py-3 text-right">{z.activa ? <span className="text-ok">Disponible</span> : <span className="text-tinta-soft">Próximamente</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MapaZonas />
      </div>
    </div>
  )
}
