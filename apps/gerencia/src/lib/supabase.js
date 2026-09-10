/**
 * Cliente Supabase · UNO solo.
 *
 * Diferencia con la 15.x: allá había un createClient por empresa, con su
 * propia URL y su propia anon key. Acá hay una sola instancia y el
 * tenant sale del JWT, que escribe el servidor. El aislamiento lo hace
 * la RLS, no el build.
 *
 * Consecuencia práctica: no hay forma de "apuntar" el front a otra
 * empresa cambiando una variable de entorno.
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('[Black Sheep] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.')
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'anon', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bs2-auth' },
  db: { schema: 'api' },   // ÚNICO esquema expuesto
})

/**
 * Lee el cuerpo del access token sin verificar la firma.
 *
 * Verificarla acá no tendría sentido: el navegador no tiene el secreto,
 * y aunque lo tuviera, un atacante controla su propio navegador. La
 * firma la verifica el servidor en cada consulta. Esto es SÓLO para
 * decidir qué dibujar; lo que se puede hacer lo decide la RLS.
 */
function claimsDelToken(session) {
  const jwt = session?.access_token
  if (!jwt) return {}
  try {
    const cuerpo = jwt.split('.')[1]
    if (!cuerpo) return {}
    // base64url → base64, y de ahí a texto respetando los acentos.
    const b64 = cuerpo.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(cuerpo.length + ((4 - (cuerpo.length % 4)) % 4), '=')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return {}
  }
}

/**
 * Contexto del usuario, leído del token.
 *
 * OJO CON DÓNDE VIVEN LOS CLAIMS. El hook de la migración 027 los
 * escribe en la RAÍZ del token (tenant_id, rol, rol_plataforma), no
 * dentro de app_metadata. `session.user.app_metadata` sólo trae lo que
 * Supabase guarda en el registro del usuario, así que buscarlos ahí da
 * siempre null. Se leen de los dos lugares por si alguna cuenta vieja
 * los tiene en app_metadata.
 */
export function contextoDeSesion(session) {
  const c = claimsDelToken(session)
  const meta = session?.user?.app_metadata || {}
  return {
    usuarioId: session?.user?.id || c.sub || null,
    email: session?.user?.email || c.email || null,
    tenantId: c.tenant_id || meta.tenant_id || null,
    rol: c.rol || meta.rol || null,
    esSuperadmin: (c.rol_plataforma || meta.rol_plataforma) === 'superadmin',
  }
}
