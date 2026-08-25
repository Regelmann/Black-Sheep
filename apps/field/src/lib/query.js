/**
 * Safe Supabase queries — nunca tragar errores en silencio.
 * PostgREST 400/406 → mensaje legible para UI.
 */
import { supabase } from './supabase'

export function translatePgError(error) {
  if (!error) return null
  const msg = String(error.message || error.details || error.hint || 'Error de datos')
  const code = error.code || ''
  if (msg.includes('column') && msg.includes('does not exist')) {
    return `Esquema desactualizado: ${msg}. Corré el SQL de fix en Supabase.`
  }
  if (code === '42501' || /permission|rls|policy/i.test(msg)) {
    return 'Sin permiso para leer estos datos (RLS).'
  }
  if (code === 'PGRST116') return 'Sin resultados.'
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return 'Sin conexión. Reintentá cuando haya red.'
  }
  return msg
}

/**
 * @returns {{ data: any, error: string|null, rawError: any }}
 */
export async function safeSelect(table, build = (q) => q.select('*')) {
  try {
    let q = supabase.from(table)
    q = build(q) || q
    const { data, error } = await q
    if (error) {
      return { data: null, error: translatePgError(error), rawError: error }
    }
    return { data: data ?? null, error: null, rawError: null }
  } catch (e) {
    return { data: null, error: translatePgError(e) || String(e.message || e), rawError: e }
  }
}

export async function safeRpc(fn, args = {}) {
  try {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) return { data: null, error: translatePgError(error), rawError: error }
    return { data, error: null, rawError: null }
  } catch (e) {
    return { data: null, error: translatePgError(e) || String(e.message || e), rawError: e }
  }
}
