// ============================================================
// notificar-catalogo · Supabase Edge Function (Deno)
//
// Envía Web Push a todos los navegadores suscriptos a un catálogo
// B2B. Es el ÚNICO lugar que tiene la VAPID private key — el frontend
// nunca la ve (sólo tiene la pública para suscribirse).
//
// Endpoint:  POST https://<project-ref>.supabase.co/functions/v1/notificar-catalogo
//
// Body:
//   {
//     "token_catalogo": "<token del link>",
//     "titulo":  "Nuevos precios para ti",
//     "cuerpo":  "Se actualizó tu catálogo con 12 productos",
//     "url":     "/catalogo/<token>"
//   }
//
// Secrets (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY    — se comparte con el frontend vía VITE_VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY   — SOLO acá (privada)
//   VAPID_SUBJECT       — mailto: de contacto (opcional)
//   SUPABASE_SERVICE_KEY— para leer la tabla de suscripciones
//   INTERNAL_PUSH_TOKEN — token compartido con el trigger de la DB (sql/35) para
//                         que sólo Supabase (y no cualquiera) pueda disparar push.
//
// AUTENTICACIÓN
//   La función se depliega con `--no-verify-jwt` (la llama el trigger de la DB con
//   un token interno, no un JWT de usuario). Por eso la protección se hace acá:
//   · `x-internal-token: <INTERNAL_PUSH_TOKEN>` → llamada legítima desde Supabase.
//   · `Authorization: Bearer <SUPABASE_SERVICE_KEY>` → llamada admin/script
//     (por ejemplo el ETL, que ya tiene la service key).
//   Cualquier otra llamada → 401.
//
// Despliegue:
//   supabase functions deploy notificar-catalogo --no-verify-jwt
//   (--no-verify-jwt porque lo llama un proceso con la service key, no un JWT)
// ============================================================

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:notificaciones@black-sheep.cl'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY') ?? ''
const INTERNAL_PUSH_TOKEN = Deno.env.get('INTERNAL_PUSH_TOKEN') ?? ''

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  })

/** ¿La llamada es legítima? (token interno de la DB, o service key del ETL/admin). */
function autorizado(req: Request): boolean {
  const internal = req.headers.get('x-internal-token') ?? ''
  if (INTERNAL_PUSH_TOKEN && internal === INTERNAL_PUSH_TOKEN) return true
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (SUPABASE_SERVICE_KEY && bearer === SUPABASE_SERVICE_KEY) return true
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 204)

  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido — usar POST' }, 405)
  }

  if (!autorizado(req)) {
    return json({ error: 'No autorizado' }, 401)
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json({ error: 'Faltan secrets (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, SUPABASE_SERVICE_KEY)' }, 500)
  }

  const body = await req.json().catch(() => ({}))
  const tokenCatalogo = String(body?.token_catalogo ?? '').trim()
  const titulo = String(body?.titulo ?? 'Black Sheep')
  const cuerpo = String(body?.cuerpo ?? 'Tenés novedades en tu catálogo')
  const url = String(body?.url ?? '/').trim() || '/'

  if (!tokenCatalogo) {
    return json({ error: 'token_catalogo es requerido' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: subs, error } = await supabase
    .from('push_suscripciones')
    .select('id, suscripcion, activa')
    .eq('token_catalogo', tokenCatalogo)
    .eq('activa', true)

  if (error) {
    return json({ error: `No se pudo leer suscripciones: ${error.message}` }, 500)
  }

  const payload = JSON.stringify({ title: titulo, body: cuerpo, url })
  const enviados: string[] = []
  const fallidos: { id: string; error: string }[] = []

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.suscripcion, payload, { TTL: 3600 })
      enviados.push(sub.id)
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode ?? 0
      // 404/410 = la suscripción ya no existe (el navegador la invalidó o el
      // usuario borró el permiso). Se desactiva para no reintentar contra un
      // endpoint muerto.
      if (status === 404 || status === 410) {
        await supabase.from('push_suscripciones').update({ activa: false }).eq('id', sub.id)
      }
      fallidos.push({ id: sub.id, error: (e as Error)?.message ?? 'error' })
    }
  }

  return json({
    total: subs.length,
    enviados: enviados.length,
    fallidos: fallidos.length,
    errores: fallidos,
  })
})
