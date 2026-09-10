/**
 * Cliente Supabase · UNO solo.
 *
 * Diferencia con la 15.x: allá había un createClient por empresa, con su
 * propia URL y su propia anon key. Acá hay una sola instancia y el
 * tenant sale del JWT (`app_metadata.tenant_id`), que escribe el
 * servidor. El aislamiento lo hace la RLS, no el build.
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

/** Lee el contexto del usuario desde el token, sin ir a la base. */
export function contextoDeSesion(session) {
  const meta = session?.user?.app_metadata || {}
  return {
    usuarioId: session?.user?.id || null,
    email: session?.user?.email || null,
    tenantId: meta.tenant_id || null,
    esSuperadmin: meta.rol_plataforma === 'superadmin',
  }
}
