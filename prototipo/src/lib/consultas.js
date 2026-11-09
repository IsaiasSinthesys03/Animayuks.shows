import { useQuery } from '@tanstack/react-query'
import * as api from './api'

// El catálogo cambia poco: se reutiliza por unos minutos en lugar de pedirlo en cada pantalla
const CATALOGO = { staleTime: 5 * 60 * 1000 }

export const useConfiguracion = () => useQuery({ queryKey: ['configuracion'], queryFn: api.obtenerConfiguracion, ...CATALOGO })
export const useShows = () => useQuery({ queryKey: ['shows'], queryFn: api.obtenerShows, ...CATALOGO })
export const useShow = (slug) =>
  useQuery({ queryKey: ['show', slug], queryFn: () => api.obtenerShow(slug), enabled: !!slug, ...CATALOGO })
export const useCategorias = () => useQuery({ queryKey: ['categorias'], queryFn: api.obtenerCategorias, ...CATALOGO })
export const useExtras = () => useQuery({ queryKey: ['extras'], queryFn: api.obtenerExtras, ...CATALOGO })
export const useZonas = () => useQuery({ queryKey: ['zonas'], queryFn: api.obtenerZonas, ...CATALOGO })
export const useContenidoLanding = () => useQuery({ queryKey: ['landing-contenido'], queryFn: api.obtenerContenidoLanding, ...CATALOGO })
export const useBannersLanding = () => useQuery({ queryKey: ['landing-banners'], queryFn: api.obtenerBannersLanding, ...CATALOGO })
export const useVideosLanding = () => useQuery({ queryKey: ['landing-videos'], queryFn: api.obtenerVideosLanding, ...CATALOGO })
export const usePagina = (slug) => useQuery({ queryKey: ['pagina', slug], queryFn: () => api.obtenerPagina(slug), ...CATALOGO })
export const usePreguntas = () => useQuery({ queryKey: ['preguntas'], queryFn: api.obtenerPreguntas, ...CATALOGO })

/** Enlace a WhatsApp del negocio, o null si aún no se captura el número en el panel */
export const enlaceWhatsapp = (configuracion, mensaje = 'Hola, quiero información sobre sus shows.') =>
  configuracion?.whatsapp ? `https://wa.me/${configuracion.whatsapp}?text=${encodeURIComponent(mensaje)}` : null
