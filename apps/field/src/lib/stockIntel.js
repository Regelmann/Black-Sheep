/**
 * Stock → compradores
 * Match: sku_canon · nombre producto · productos_top (si existe)
 */
import { parseSkuDetalle } from './coach'

const n = v => Number(v) || 0

function normSku(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+/, '')
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s) {
  return normName(s)
    .split(' ')
    .filter(t => t.length >= 3 && !/^(kg|prom|caja|pack|und|ud|mm|lt|lts|bol|x\d+)$/i.test(t))
}

function nameMatch(stockName, itemName) {
  const a = tokens(stockName)
  const b = tokens(itemName)
  if (!a.length || !b.length) return false
  let hit = 0
  for (const t of a) {
    if (b.some(x => x === t || x.includes(t) || t.includes(x))) hit++
  }
  // Evitar cruces flojos (ej. "POLLO" match en toda la categoría)
  if (hit >= 2) return true
  if (hit >= 1 && a.some(t => t.length >= 6 && b.includes(t))) return true
  // substring full
  const na = normName(stockName)
  const nb = normName(itemName)
  if (na.length >= 8 && nb.includes(na.slice(0, 12))) return true
  if (nb.length >= 8 && na.includes(nb.slice(0, 12))) return true
  return false
}

function normZona(z) {
  return String(z || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '')
}

/**
 * Compradores de un SKU dentro de UNA cartera (nunca mezclar zonas).
 * opts: { productoNombre, limit, ejecutivoId, zona }
 */
export function findBuyersForSku(skuCanon, cartera = [], opts = {}) {
  const limit = opts.limit ?? 12
  const sku = normSku(skuCanon)
  const prodName = opts.productoNombre || ''
  const eidFilter = opts.ejecutivoId ? String(opts.ejecutivoId) : null
  const zonaFilter = opts.zona ? normZona(opts.zona) : null
  if (!sku && !prodName) return { buyers: [], potencial: 0, totalMatch: 0, enReposicion: 0 }

  const buyers = []
  for (const c of cartera || []) {
    if (c.es_bloqueado) continue
    // Aislamiento de cartera: solo el ejecutivo / zona en vista
    if (eidFilter && c.ejecutivo_id && String(c.ejecutivo_id) !== eidFilter) continue
    if (zonaFilter && c.zona && normZona(c.zona) !== zonaFilter) continue
    const items = parseSkuDetalle(c.sku_detalle) || []
    let hit = null
    for (const it of items) {
      const sk = normSku(it.sku_canon || it.sku)
      const nm = it.nombre || it.producto || ''
      if (sku && sk && (sk === sku || sk.includes(sku) || sku.includes(sk))) {
        hit = it
        break
      }
      if (prodName && nameMatch(prodName, nm)) {
        hit = it
        break
      }
    }
    // fallback: productos_top texto libre
    if (!hit && prodName && c.productos_top) {
      if (nameMatch(prodName, String(c.productos_top))) {
        hit = { nombre: prodName }
      }
    }
    // fallback: sku_detalle raw includes sku code
    if (!hit && sku && c.sku_detalle && String(c.sku_detalle).toLowerCase().includes(String(skuCanon).toLowerCase())) {
      hit = { nombre: prodName || skuCanon }
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
