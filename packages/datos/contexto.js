/**
 * Contexto de tenant · frontera compartida de Black Sheep.
 *
 * Este módulo sólo interpreta la sesión para que las superficies de producto
 * sepan QUIÉN está conectado y a qué tenant pertenece. No decide permisos ni
 * aislamiento: eso lo hace Supabase/RLS.
 *
 * No acepta tenant_id desde parámetros de navegación, query string ni UI.
 * El tenant efectivo sale de los claims emitidos por el servidor.
 */

function claimsDelToken(session) {
  const jwt = session?.access_token
  if (!jwt) return {}

  try {
    const cuerpo = jwt.split('.')[1]
    if (!cuerpo) return {}

    const b64 = cuerpo.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(cuerpo.length + ((4 - (cuerpo.length % 4)) % 4), '=')

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return {}
  }
}

/**
 * Contexto de aplicación derivado de la sesión.
 *
 * app_metadata se mantiene como fallback por compatibilidad con cuentas
 * antiguas. El claim raíz es el contrato actual de la migración 027.
 */
export function contextoDeSesion(session) {
  const claims = claimsDelToken(session)
  const meta = session?.user?.app_metadata || {}

  const tenantId = claims.tenant_id || meta.tenant_id || null
  const rol = claims.rol || meta.rol || null
  const rolPlataforma = claims.rol_plataforma || meta.rol_plataforma || null

  return Object.freeze({
    usuarioId: session?.user?.id || claims.sub || null,
    email: session?.user?.email || claims.email || null,
    tenantId,
    rol,
    rolPlataforma,
    esSuperadmin: rolPlataforma === 'superadmin',
  })
}

/**
 * Utilidad de dominio de UI: una superficie tenant-bound no debe continuar
 * si no recibió contexto. No sustituye la seguridad de RLS.
 */
export function requiereTenant(contexto, mensaje = 'No hay tenant en la sesión.') {
  if (!contexto?.tenantId && !contexto?.esSuperadmin) {
    throw new Error(mensaje)
  }
  return contexto
}

export { claimsDelToken }
