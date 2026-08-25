/**
 * BLACK SHEEP FIELD — Multi-tenant registry
 *
 * Arquitectura:
 *   - Black Sheep = identidad de plataforma (logo, colores propios)
 *   - Cada empresa cliente = sus colores + logo aplicados dinámicamente
 *   - El theming se aplica en runtime via CSS custom properties en <html>
 *   - Un Supabase por empresa → aislamiento total de datos
 *
 * Flujo de resolución (orden):
 *   URL ?tenant= → subdominio → localStorage → email → default
 */

const env = (k, fallback = '') => {
  try { return (import.meta.env[k] || fallback || '').trim() } catch { return fallback }
}

/**
 * @typedef {{
 *   id: string
 *   name: string           // nombre de la empresa cliente
 *   slug: string
 *   domains: string[]
 *   emailHints: string[]
 *   supabaseUrl: string
 *   supabaseAnon: string
 *   features: { gerencia: boolean, catalogo: boolean, mapa: boolean, commerce: boolean }
 *   brand: {
 *     accent: string       // color primario de la empresa
 *     accentDark: string   // versión oscura del accent
 *     accentSoft: string   // versión suave (bg de botones ghost)
 *     accentRing: string   // sombra de focus/ring
 *     logoUrl?: string     // URL del logo de la empresa (para cabeceras de la app)
 *     name: string         // nombre para mostrar en la app
 *   }
 * }} Tenant
 */

/** @type {Tenant[]} */
export const TENANTS = [
  {
    id: 'keyfoods',
    name: 'KeyFoods',
    slug: 'keyfoods',
    domains: ['keyfoods.cl', 'keyfoods.com', 'app.black-sheep.cl'],
    emailHints: ['keyfoods'],
    supabaseUrl:  env('VITE_TENANT_KEYFOODS_URL',  env('VITE_SUPABASE_URL')),
    supabaseAnon: env('VITE_TENANT_KEYFOODS_ANON_KEY', env('VITE_SUPABASE_ANON_KEY')),
    features: { gerencia: true, catalogo: true, mapa: true, commerce: true },
    brand: {
      name:        'KeyFoods',
      accent:      '#c2410c',   // naranja KeyFoods
      accentDark:  '#9a3412',
      accentSoft:  '#fff4eb',
      accentRing:  'rgba(194,65,12,0.20)',
      logoUrl:     null,        // usar logo de Black Sheep hasta que tengan el suyo
    },
  },
  {
    id: 'demo',
    name: 'Demo',
    slug: 'demo',
    domains: ['demo.black-sheep.cl'],
    emailHints: ['demo', 'blacksheep', 'black-sheep'],
    supabaseUrl:  env('VITE_TENANT_DEMO_URL',  env('VITE_SUPABASE_URL')),
    supabaseAnon: env('VITE_TENANT_DEMO_ANON_KEY', env('VITE_SUPABASE_ANON_KEY')),
    features: { gerencia: true, catalogo: true, mapa: true, commerce: true },
    brand: {
      name:        'Demo',
      accent:      '#0ea5e9',   // azul demo → diferente del naranja de prod
      accentDark:  '#0284c7',
      accentSoft:  '#e0f2fe',
      accentRing:  'rgba(14,165,233,0.20)',
      logoUrl:     null,
    },
  },
]

const STORAGE_KEY = 'bs_tenant_id'

export const listTenants    = () => TENANTS.filter(t => t.supabaseUrl && t.supabaseAnon)
export const getTenantById  = id => TENANTS.find(t => t.id === id || t.slug === id) || null

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
  if (available.length === 1) return available[0]
  return getTenantById('keyfoods') || available[0] || null
}

export const saveTenantId    = id => { try { id ? localStorage.setItem(STORAGE_KEY, id) : localStorage.removeItem(STORAGE_KEY) } catch {} }
export const loadSavedTenantId = () => { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } }

export function resolveTenantFromUrl() {
  try {
    const u = new URL(window.location.href)
    const q = u.searchParams.get('tenant') || u.searchParams.get('empresa')
    if (q) return getTenantById(q)
    const host = u.hostname || ''
    const parts = host.split('.')
    if (parts.length >= 3) {
      const sub = parts[0]
      if (sub && sub !== 'app' && sub !== 'www') return getTenantById(sub)
    }
  } catch {}
  return null
}

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

/**
 * Aplica el branding del tenant al documento.
 * Sobreescribe SOLO las variables de brand — el resto del design system no cambia.
 * <cite index="32-1">El patrón correcto: base stylesheet define tokens por defecto,
 * al resolver tenant se aplican overrides en document.documentElement.</cite>
 */
export function applyTenantBrand(tenant) {
  if (!tenant?.brand) return
  const r = document.documentElement
  const b = tenant.brand
  const safe = (v, fb) => {
    const s = String(v || '')
    if (!s || s.startsWith('var(')) {
      if (typeof console !== 'undefined') console.warn('[tenants] accent inválido (var circular):', v)
      return fb
    }
    return s
  }
  r.style.setProperty('--brand',      safe(b.accent, '#c2410c'))
  r.style.setProperty('--brand-dk',   safe(b.accentDark, '#9a3412'))
  r.style.setProperty('--brand-lt',   safe(b.accentSoft, '#fff4eb'))
  r.style.setProperty('--brand-ring', b.accentRing)
  // aliases backward-compat
  r.style.setProperty('--brand-dark', b.accentDark)
  r.style.setProperty('--brand-soft', b.accentSoft)
  r.style.setProperty('--kf-brand',   b.accent)
  r.style.setProperty('--bs-accent',  b.accent)
  // Nombre de la empresa para mostrar
  if (b.name) r.setAttribute('data-tenant', b.name)
  if (tenant.id) r.setAttribute('data-tenant-id', tenant.id)
}
