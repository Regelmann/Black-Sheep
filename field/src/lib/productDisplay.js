/**
 * Nombre comercial para UI — nunca mostrar solo el código si hay mejor dato.
 * Multi-tenant: no asume industria; solo normaliza lo que venga en stock/catálogo.
 */

export function looksLikeSkuOnly(name, sku) {
  const n = String(name || '').trim()
  const s = String(sku || '').trim()
  if (!n) return true
  if (s && n === s) return true
  // solo dígitos (o casi) del mismo largo que un código
  if (/^\d{6,14}$/.test(n)) return true
  return false
}

/**
 * @returns {{ title: string, subtitle: string, isFallback: boolean }}
 */
export function productTitle(row = {}) {
  const sku = String(row.sku_canon || row.sku || '').trim()
  const rawName = String(
    row.producto_nombre || row.nombre || row.name || ''
  ).trim()
  const marca = String(row.marca || '').trim()
  const sub = String(row.subfamilia || row.categoria || '').trim()

  if (!looksLikeSkuOnly(rawName, sku)) {
    const parts = [sku]
    if (sub) parts.push(sub)
    if (marca) parts.push(marca)
    return {
      title: rawName,
      subtitle: parts.filter(Boolean).join(' · '),
      isFallback: false,
    }
  }

  // Sin nombre usable: armar lo mejor posible
  if (marca && sub) {
    return {
      title: `${marca} · ${sub}`,
      subtitle: sku || 'Sin código',
      isFallback: true,
    }
  }
  if (marca) {
    return {
      title: marca,
      subtitle: sku ? `${sku}${sub ? ` · ${sub}` : ''}` : sub || '',
      isFallback: true,
    }
  }
  if (sub) {
    return {
      title: sub,
      subtitle: sku || '',
      isFallback: true,
    }
  }
  return {
    title: sku || 'Producto sin nombre',
    subtitle: 'Falta nombre en stock / lista de precios',
    isFallback: true,
  }
}

export function productLabel(row) {
  return productTitle(row).title
}
