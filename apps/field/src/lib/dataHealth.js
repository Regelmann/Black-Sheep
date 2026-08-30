/**
 * Data Health (Reconciliación liviana) — Black Sheep V92
 * ======================================================
 * No es un data warehouse: cruza señales entre tablas del dispositivo
 * y entrega un score 0–100 + estado para la UI.
 *
 * VENTAS/CARTERA (vía cartera.venta_mtd, sku_detalle)
 *   × STOCK × FOCOS × METAS × PRECIOS (si hay)
 *     → DATA HEALTH
 */

import { assessDataIntegrity } from './dataIntegrity.js'

const n = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * @returns {{
 *   health: number,
 *   status: 'healthy'|'degraded'|'paused',
 *   canRecommend: boolean,
 *   lines: string[],
 *   integrity: object
 * }}
 */
export function assessDataHealth(ctx = {}) {
  const integrity = assessDataIntegrity(ctx)
  const cartera = ctx.cartera || []
  const stock = ctx.stock || []
  const focos = ctx.focos || []
  const lines = []

  let health = integrity.score

  // Conciliación cartera ↔ stock: % de SKUs de reposición que aparecen en stock
  let matchAttempts = 0
  let matchHits = 0
  const stockNames = new Set()
  for (const s of stock) {
    const name = String(s.producto_nombre || s.nombre || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    if (name.length >= 4) stockNames.add(name.slice(0, 24))
    const sku = String(s.sku_canon || s.sku || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
    if (sku) stockNames.add(sku)
  }

  for (const c of cartera.slice(0, 80)) {
    const raw = c.sku_detalle
    if (!raw || typeof raw !== 'string') continue
    const blocks = raw.includes('||') ? raw.split('||') : raw.split(/\n/)
    for (const b of blocks.slice(0, 3)) {
      const p = b.split('|')
      const nom = String(p[0] || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      const sku = String(p[11] || p[0] || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
      if (nom.length < 3 && !sku) continue
      matchAttempts++
      let hit = false
      if (sku && [...stockNames].some((x) => x.includes(sku) || sku.includes(x))) hit = true
      if (!hit && nom) {
        const key = nom.slice(0, 24)
        hit = [...stockNames].some((x) => x.includes(key.slice(0, 8)) || key.includes(x.slice(0, 8)))
      }
      if (hit) matchHits++
    }
  }

  const matchPct = matchAttempts ? matchHits / matchAttempts : null
  if (matchPct != null && stock.length > 0) {
    if (matchPct < 0.1) {
      health = Math.min(health, 45)
      lines.push(`Match mix↔stock bajo (${Math.round(matchPct * 100)}%) — revisá códigos SKU`)
    } else if (matchPct < 0.35) {
      health = Math.min(health, health - 8)
      lines.push(`Match mix↔stock parcial (${Math.round(matchPct * 100)}%)`)
    } else {
      lines.push(`Match mix↔stock ${Math.round(matchPct * 100)}%`)
    }
  }

  // Focos vs stock con es_foco_mes
  const focoStock = stock.filter((s) => s.es_foco_mes || s.foco).length
  if (focos.length > 0 && stock.length > 0 && focoStock === 0) {
    health = Math.max(0, health - 6)
    lines.push('Focos definidos pero ningún SKU marcado es_foco_mes en stock')
  }

  // Venta MTD coherencia: si nadie tiene venta_mtd pero hay cartera histórica
  const withMtd = cartera.filter((c) => n(c.venta_mtd) > 0).length
  if (cartera.length >= 20 && withMtd === 0) {
    health = Math.max(0, health - 10)
    lines.push('Nadie con venta_mtd > 0 — ¿ventas del mes cargadas?')
  }

  health = Math.max(0, Math.min(100, Math.round(health)))

  let status = 'healthy'
  let canRecommend = integrity.canRecommend
  if (!integrity.canRecommend || health < 50) {
    status = 'paused'
    canRecommend = false
  } else if (health < 75 || integrity.warnings.length) {
    status = 'degraded'
  }

  if (status === 'healthy') lines.unshift(`Data Health ${health}/100 — recomendaciones OK`)
  else if (status === 'degraded')
    lines.unshift(`Data Health ${health}/100 — recomendaciones con advertencias`)
  else lines.unshift(`Data Health ${health}/100 — recomendaciones pausadas`)

  return {
    health,
    status,
    canRecommend,
    lines,
    integrity,
    matchPct: matchPct != null ? Math.round(matchPct * 100) : null,
  }
}
