/**
 * Black Sheep Field — registro de tenants (empresas).
 *
 * Fase 1: un proyecto Supabase por empresa (aislamiento fuerte).
 * El login de blacksheep.cl resuelve el tenant y la app se conecta
 * a ese Supabase. KeyFoods es el primer cliente; Demo valida el producto.
 *
 * Env (Vercel / .env):
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY     → default (KeyFoods)
 *   VITE_TENANT_KEYFOODS_URL / _ANON_KEY           → opcional override
 *   VITE_TENANT_DEMO_URL / _ANON_KEY               → tenant demo
 */

const env = (k, fallback = '') => {
  try {
    return (import.meta.env[k] || fallback || '').trim()
  } catch {
    return fallback
  }
}

/** @typedef {{
 *  id: string
 *  name: string
 *  slug: string
 *  domains: string[]
 *  emailHints: string[]
 *  supabaseUrl: string
 *  supabaseAnon: string
 *  features: { gerencia: boolean, catalogo: boolean, mapa: boolean, commerce: boolean }
 *  brand?: { accent?: string }
 * }} Tenant */

/** @type {Tenant[]} */
export const TENANTS = [
  {
    id: 'keyfoods',
    name: 'KeyFoods',
    slug: 'keyfoods',
    domains: ['keyfoods.cl', 'keyfoods.com'],
    emailHints: ['keyfoods'],
    supabaseUrl: env('VITE_TENANT_KEYFOODS_URL', env('VITE_SUPABASE_URL')),
    supabaseAnon: env('VITE_TENANT_KEYFOODS_ANON_KEY', env('VITE_SUPABASE_ANON_KEY')),
    features: { gerencia: true, catalogo: true, mapa: true, commerce: true },
    brand: { accent: '#c2410c' },
  },
  {
    id: 'demo',
    name: 'Demo Black Sheep',
    slug: 'demo',
    domains: ['demo.blacksheep.cl', 'blacksheep.cl'],
    emailHints: ['demo', 'blacksheep'],
    supabaseUrl: env('VITE_TENANT_DEMO_URL', env('VITE_SUPABASE_URL')),
    supabaseAnon: env('VITE_TENANT_DEMO_ANON_KEY', env('VITE_SUPABASE_ANON_KEY')),
    features: { gerencia: true, catalogo: true, mapa: true, commerce: true },
    brand: { accent: '#39ff14' },
  },
]

const STORAGE_KEY = 'bs_tenant_id'

export function listTenants() {
  return TENANTS.filter(t => t.supabaseUrl && t.supabaseAnon)
}

export function getTenantById(id) {
  if (!id) return null
  return TENANTS.find(t => t.id === id || t.slug === id) || null
}

/**
 * Resuelve tenant por email (dominio o hint en local-part).
 * Ej: juan@keyfoods.cl → keyfoods
 *     demo@blacksheep.cl → demo
 */
export function resolveTenantFromEmail(email) {
  const e = String(email || '').trim().toLowerCase()
  if (!e || !e.includes('@')) return null
  const [local, domain] = e.split('@')
  const available = listTenants()

  for (const t of available) {
    if (t.domains.some(d => domain === d || domain.endsWith('.' + d))) return t
  }
  for (const t of available) {
    if (t.emailHints.some(h => local.includes(h) || domain.includes(h))) return t
  }

  // Un solo tenant configurado → ese
  if (available.length === 1) return available[0]
  // Default KeyFoods si existe
  return getTenantById('keyfoods') || available[0] || null
}

export function saveTenantId(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}

export function loadSavedTenantId() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function resolveTenantFromUrl() {
  try {
    const u = new URL(window.location.href)
    const q = u.searchParams.get('tenant') || u.searchParams.get('empresa')
    if (q) return getTenantById(q)
    // subdominio: keyfoods.app.blacksheep.cl
    const host = u.hostname || ''
    const parts = host.split('.')
    if (parts.length >= 3) {
      const sub = parts[0]
      if (sub && sub !== 'app' && sub !== 'www') return getTenantById(sub)
    }
  } catch { /* ignore */ }
  return null
}

/** Orden: URL → localStorage → email → default */
export function resolveTenant({ email } = {}) {
  return (
    resolveTenantFromUrl() ||
    getTenantById(loadSavedTenantId()) ||
    (email ? resolveTenantFromEmail(email) : null) ||
    getTenantById('keyfoods') ||
    listTenants()[0] ||
    null
  )
}
