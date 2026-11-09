import { useQuery } from '@tanstack/react-query'
import { obtenerMapaCobertura } from '../lib/api'
import MapaCobertura from '../components/MapaCobertura'
import { Cargando, ErrorCarga } from '../components/ui'
import VerificadorCP from '../components/VerificadorCP'

export default function Cobertura() {
  const mapa = useQuery({ queryKey: ['mapa-cobertura'], queryFn: obtenerMapaCobertura, staleTime: 5 * 60 * 1000 })

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <h1 className="font-cartel text-6xl leading-[0.9] font-black uppercase sm:text-7xl">¿Llegamos a tu zona?</h1>
      <p className="mt-4 max-w-[52ch] text-lg text-tinta-soft">
        Solo aceptamos reservaciones dentro de nuestras zonas de cobertura. Escribe el código postal donde será tu evento.
      </p>
      <div className="mt-6">
        <VerificadorCP ocultarCosto />
      </div>

      <section className="mt-10" aria-label="Mapa de cobertura">
        <h2 className="mb-3 text-xl font-bold">Dónde damos servicio</h2>
        {mapa.isLoading && <Cargando />}
        {mapa.isError && <ErrorCarga onReintentar={mapa.refetch} />}
        {mapa.data?.features.length === 0 && <p className="rounded-2xl bg-butaca p-6 font-medium">Pronto publicaremos nuestras áreas de servicio.</p>}
        {mapa.data?.features.length > 0 && <MapaCobertura datos={mapa.data} />}
      </section>
      <p className="mt-8 text-xs text-tinta-soft">
        Códigos postales: Correos de México, <a href="https://www.datos.gob.mx/dataset/codigos_postales_entidad_federativa" target="_blank" rel="noreferrer" className="underline">SEPOMEX</a> y <a href="https://www.geonames.org" target="_blank" rel="noreferrer" className="underline">GeoNames</a>, licencia CC BY 4.0.
      </p>
    </div>
  )
}
