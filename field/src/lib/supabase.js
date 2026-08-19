/**
 * Cliente Supabase multi-tenant.
 * Un createClient por empresa; se reinicia al cambiar de tenant.
 */
import { createClient } from '@supabase/supabase-js'
import { resolveTenant, saveTenantId, getTenantById, listTenants } from './tenants'

let client = null
let activeTenant = null

function buildClient(tenant) {
  if (!tenant?.supabaseUrl || !tenant?.supabaseAnon) {
    console.error('[Black Sheep] Tenant sin URL/anon key', tenant?.id)
    return null
  }
  return createClient(tenant.supabaseUrl, tenant.supabaseAnon, {
    auth: {
      persistSession: true,
      storageKey: `bs-auth-${tenant.id}`,
      autoRefreshToken: true,
    },
  })
}

/** Inicializa (o cambia) el cliente al tenant dado. */
export function initSupabase(tenant) {
  if (!tenant) {
    tenant = resolveTenant()
  }
  if (!tenant) {
    console.error('[Black Sheep] No hay tenant configurado. Revisá VITE_SUPABASE_URL.')
    // fallback vacío para no romper imports
    client = createClient('https://placeholder.supabase.co', 'public-anon-key')
    activeTenant = null
    return client
  }
  if (client && activeTenant?.id === tenant.id) return client
  activeTenant = tenant
  saveTenantId(tenant.id)
  client = buildClient(tenant)
  if (typeof window !== 'undefined') {
    window.__BS_TENANT__ = { id: tenant.id, name: tenant.name }
  }
  return client
}

/** Proxy estable: siempre apunta al cliente activo. */
function ensure() {
  if (!client) initSupabase(resolveTenant())
  return client
}

export const supabase = new Proxy(
  {},
  {
    get(_t, prop) {
      const c = ensure()
      const v = c[prop]
      return typeof v === 'function' ? v.bind(c) : v
    },
  }
)

export function getActiveTenant() {
  return activeTenant
}

export function switchTenant(tenantOrId) {
  const t = typeof tenantOrId === 'string' ? getTenantById(tenantOrId) : tenantOrId
  if (!t) return null
  return initSupabase(t)
}

export function availableTenants() {
  return listTenants()
}

// Bootstrap al cargar el módulo
initSupabase(resolveTenant())
