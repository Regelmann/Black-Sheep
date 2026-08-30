import { supabase } from '../../lib/supabase.js'

export async function getActiveCatalog(clienteKey) {
  if (!clienteKey) return null
  const { data, error } = await supabase
    .from('ofertas_cliente')
    .select('id,token,cliente_key,nombre_cliente,activo,actualizado_en')
    .eq('cliente_key', String(clienteKey))
    .eq('activo', true)
    .order('actualizado_en', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export function buildCatalogUrl(tokenValue, origin = window.location.origin) {
  if (!tokenValue) return null
  return `${origin}/catalogo/${encodeURIComponent(String(tokenValue))}`
}

export async function getCatalogAccess(clienteKey) {
  const oferta = await getActiveCatalog(clienteKey)
  if (!oferta) return { active: false, url: null, updatedAt: null }
  return { active: true, url: buildCatalogUrl(oferta.token), updatedAt: oferta.actualizado_en || null }
}
