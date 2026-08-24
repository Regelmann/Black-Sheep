/**
 * Stock → compradores (ONE BRAIN surface)
 */
import { parseSkuDetalle } from './coach'

const n = v => Number(v) || 0

/**
 * Clientes de cartera que compran este SKU (via sku_detalle).
 * Prioriza reposición y valor.
 */
export function findBuyersForSku(skuCanon, cartera = [], { limit = 12 } = {}) {
  const sku = String(skuCanon || '').trim().toLowerCase()
  if (!sku) return { buyers: [], potencial: 0 }

  const buyers = []
  for (const c of cartera || []) {
    if (c.es_bloqueado) continue
    const items = parseSkuDetalle(c.sku_detalle) || []
    let hit = null
    for (const it of items) {
      const sk = String(it.sku_canon || it.sku || '').trim().toLowerCase()
      const name = String(it.nombre || it.producto || '').toLowerCase()
      if (sk === sku || (sk && sku.includes(sk)) || (sk && sk.includes(sku))) {
        hit = it
        break
      }
      // match by name fragment if sku empty on item
      if (!sk && name && sku.length > 4 && name.includes(sku)) {
        hit = it
        break
      }
    }
    if (!hit) continue
    const dias = n(c.dias_sin_comprar)
    const venta = n(c.venta_mtd || c.venta_mensual)
    const ciclo = n(c.ciclo_dias)
    const enReposicion = dias > 0 && dias < 180 && (ciclo <= 0 || dias >= Math.max(5, ciclo - 2))
    const score =
      (enReposicion ? 40 : 0) +
      (venta >= 200000 ? 30 : venta >= 50000 ? 15 : 5) +
      (dias >= 7 && dias <= 45 ? 25 : 0)
    buyers.push({
      cliente_key: c.cliente_key,
      nombre: c.nombre_cliente || c.razon_social || c.cliente_key,
      dias,
      venta,
      enReposicion,
      score,
      potencial: Math.round(venta > 0 ? venta * 0.2 : 40000),
    })
  }

  buyers.sort((a, b) => b.score - a.score || b.potencial - a.potencial)
  const top = buyers.slice(0, limit)
  const potencial = top.reduce((s, b) => s + (b.potencial || 0), 0)
  return {
    buyers: top,
    totalMatch: buyers.length,
    potencial,
    enReposicion: top.filter(b => b.enReposicion).length,
  }
}
