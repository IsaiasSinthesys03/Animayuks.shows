// Edge Function: firmar-subida
// Da permiso temporal al panel para subir o borrar videos de banners en Cloudflare R2.
// Las llaves de R2 viven solo en los secretos de Supabase y nunca llegan al navegador.
//
// Acciones (POST con JSON):
//   { "accion": "subir", "tipo": "video/mp4", "tamano": 123456 } -> { url_subida, url_publica }
//   { "accion": "borrar", "url": "https://media.animayuks.com/landing/banners/x.mp4" } -> { ok: true }

import { createClient } from 'npm:@supabase/supabase-js@2'
import { AwsClient } from 'npm:aws4fetch@1'

const ORIGENES = ['https://animayuks.com', 'https://www.animayuks.com', 'http://localhost:5173', 'http://localhost:5174']
const TIPOS: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm' }
const TAMANO_MAXIMO = 50 * 1024 * 1024
const CARPETA = 'landing/banners'
const VIGENCIA_SEGUNDOS = 600

const cabeceras = (origen: string | null) => ({
  'Access-Control-Allow-Origin': origen && ORIGENES.includes(origen) ? origen : ORIGENES[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
})

Deno.serve(async (req) => {
  const origen = req.headers.get('origin')
  const responder = (cuerpo: unknown, estado = 200) =>
    new Response(JSON.stringify(cuerpo), {
      status: estado,
      headers: { ...cabeceras(origen), 'Content-Type': 'application/json' },
    })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabeceras(origen) })
  if (req.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405)

  // Solo una sesión real con rol de administrador
  const autorizacion = req.headers.get('Authorization') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false },
  })
  const { data: sesion, error: errorSesion } = await supabase.auth.getUser(autorizacion.replace(/^Bearer\s+/i, ''))
  if (errorSesion || !sesion.user) return responder({ error: 'Inicia sesión para continuar.' }, 401)
  const { data: esAdmin, error: errorRol } = await supabase.rpc('es_admin')
  if (errorRol || esAdmin !== true) return responder({ error: 'Solo un administrador puede hacer esto.' }, 403)

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = await req.json()
  } catch {
    return responder({ error: 'Solicitud inválida.' }, 400)
  }

  const cuenta = Deno.env.get('R2_ACCOUNT_ID')
  const llave = Deno.env.get('R2_ACCESS_KEY_ID')
  const secreto = Deno.env.get('R2_SECRET_ACCESS_KEY')
  const bucket = Deno.env.get('R2_BUCKET')
  const publica = Deno.env.get('R2_PUBLIC_URL')?.replace(/\/+$/, '')
  if (!cuenta || !llave || !secreto || !bucket || !publica) {
    return responder({ error: 'El almacenamiento de videos no está configurado.' }, 500)
  }

  const r2 = new AwsClient({ accessKeyId: llave, secretAccessKey: secreto, service: 's3', region: 'auto' })
  const base = `https://${cuenta}.r2.cloudflarestorage.com/${bucket}`

  if (cuerpo.accion === 'subir') {
    const tipo = String(cuerpo.tipo ?? '')
    const tamano = Number(cuerpo.tamano)
    const extension = TIPOS[tipo]
    if (!extension) return responder({ error: 'Solo se aceptan videos MP4 o WebM.' }, 400)
    if (!Number.isInteger(tamano) || tamano <= 0 || tamano > TAMANO_MAXIMO) {
      return responder({ error: 'El video debe pesar menos de 50 MB.' }, 400)
    }

    // El nombre lo decide el servidor, y el permiso solo sirve para ese archivo, tipo y tamaño
    const ruta = `${CARPETA}/${crypto.randomUUID()}.${extension}`
    const url = new URL(`${base}/${ruta}`)
    url.searchParams.set('X-Amz-Expires', String(VIGENCIA_SEGUNDOS))
    const firmada = await r2.sign(
      new Request(url, { method: 'PUT', headers: { 'content-type': tipo, 'content-length': String(tamano) } }),
      { aws: { signQuery: true, allHeaders: true } },
    )
    return responder({ url_subida: firmada.url, url_publica: `${publica}/${ruta}` })
  }

  if (cuerpo.accion === 'borrar') {
    const direccion = String(cuerpo.url ?? '')
    const prefijo = `${publica}/${CARPETA}/`
    const nombre = direccion.startsWith(prefijo) ? direccion.slice(prefijo.length) : ''
    if (!/^[A-Za-z0-9._-]+$/.test(nombre) || nombre.includes('..')) {
      return responder({ error: 'Ese archivo no se puede borrar.' }, 400)
    }
    const respuesta = await r2.fetch(`${base}/${CARPETA}/${nombre}`, { method: 'DELETE' })
    if (!respuesta.ok && respuesta.status !== 404) return responder({ error: 'No se pudo borrar el video.' }, 502)
    return responder({ ok: true })
  }

  return responder({ error: 'Acción desconocida.' }, 400)
})
