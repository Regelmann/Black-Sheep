/**
 * Data Integrity Gate — Black Sheep V92
 * =====================================
 * No se recomienda acción comercial si la cadena de datos no es confiable.
 *
 * Flujo:
 *   DATOS → INTEGRITY → ¿OK? → planDia / decisionEngine → UI
 *                    └─ NO → banner + plan vacío o solo lectura
 *
 * No reemplaza al ciclo ni a Supabase: valida lo que YA llegó al dispositivo.
 */

const n = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

const MAX_SNAPSHOT_AGE_HOURS = 36

/**
 * @param {object} ctx
 * @param {object[]} ctx.cartera
 * @param {object[]} [ctx.stock]
 * @param {object[]} [ctx.focos]
 * @param {object|null} [ctx.meta]
 * @param {string|null} [ctx.dataAsOf] ISO or date string del snapshot
 * @param {object} [ctx.actividad]
 */
export function assessDataIntegrity(ctx = {}) {
  const issues = []
  const warnings = []

  const cartera = Array.isArray(ctx.cartera) ? ctx.cartera : []
  const stock = Array.isArray(ctx.stock) ? ctx.stock : []
  const focos = Array.isArray(ctx.focos) ? ctx.focos : []
  const meta = ctx.meta || null
  const dataAsOf = ctx.dataAsOf || null

  // —— Bloqueantes ——
  if (cartera.length === 0) {
    issues.push({
      code: 'NO_CARTERA',
      severity: 'block',
      message: 'Sin cartera cargada — no se puede armar el plan del día',
    })
  }

  const conMix = cartera.filter((c) => {
    const s = c?.sku_detalle
    return s && String(s).length > 8
  }).length
  const mixRatio = cartera.length ? conMix / cartera.length : 0
  if (cartera.length >= 5 && mixRatio < 0.15) {
    issues.push({
      code: 'MIX_POBRE',
      severity: 'block',
      message: `Solo ${Math.round(mixRatio * 100)}% de clientes tienen mix (sku_detalle) — ciclo incompleto`,
    })
  } else if (cartera.length >= 5 && mixRatio < 0.4) {
    warnings.push({
      code: 'MIX_PARCIAL',
      severity: 'warn',
      message: `Mix parcial (${Math.round(mixRatio * 100)}% con sku_detalle)`,
    })
  }

  // Stock vacío con cartera grande → score "vendible" miente
  const stockPos = stock.filter((s) => n(s.stock_total ?? s.stock ?? s.cantidad) > 0).length
  if (cartera.length >= 10 && stock.length === 0) {
    warnings.push({
      code: 'NO_STOCK',
      severity: 'warn',
      message: 'Sin tabla stock — el plan no puede filtrar por vendible',
    })
  } else if (stock.length > 0 && stockPos === 0) {
    issues.push({
      code: 'STOCK_CERO',
      severity: 'block',
      message: 'Stock cargado pero todo en 0 — no hay nada vendible hoy',
    })
  }

  // Antigüedad del snapshot
  if (dataAsOf) {
    const t = Date.parse(String(dataAsOf).slice(0, 19))
    if (!Number.isNaN(t)) {
      const hours = (Date.now() - t) / 3600000
      if (hours > MAX_SNAPSHOT_AGE_HOURS * 2) {
        issues.push({
          code: 'SNAPSHOT_MUY_VIEJO',
          severity: 'block',
          message: `Datos de hace ${Math.round(hours)}h — corré el ciclo antes de recomendar`,
        })
      } else if (hours > MAX_SNAPSHOT_AGE_HOURS) {
        warnings.push({
          code: 'SNAPSHOT_VIEJO',
          severity: 'warn',
          message: `Snapshot de hace ${Math.round(hours)}h — conviene refrescar el ciclo`,
        })
      }
    }
  }

  // Meta sin número usable
  if (meta && n(meta.meta_mensual ?? meta.meta ?? meta.target) <= 0) {
    warnings.push({
      code: 'META_VACIA',
      severity: 'warn',
      message: 'Meta mensual no configurada o en 0',
    })
  }

  // Focos vacíos no bloquean, pero avisan
  if (focos.length === 0 && cartera.length >= 10) {
    warnings.push({
      code: 'SIN_FOCOS',
      severity: 'warn',
      message: 'Sin focos del mes — el score no prioriza producto foco',
    })
  }

  // Días sin compra absurdos en masa (dato basura)
  const diasRaros = cartera.filter((c) => {
    const d = n(c.dias_sin_comprar)
    return d > 400
  }).length
  if (cartera.length && diasRaros / cartera.length > 0.5) {
    warnings.push({
      code: 'DIAS_ANOMALOS',
      severity: 'warn',
      message: 'Muchos clientes con días sin compra anómalos — revisar ciclo de ventas',
    })
  }

  const blocked = issues.some((i) => i.severity === 'block')
  const score = computeIntegrityScore({
    carteraLen: cartera.length,
    mixRatio,
    stockPos,
    stockLen: stock.length,
    hasMeta: meta && n(meta.meta_mensual ?? meta.meta ?? meta.target) > 0,
    focosLen: focos.length,
    issueCount: issues.length,
    warnCount: warnings.length,
  })

  return {
    ok: !blocked,
    canRecommend: !blocked,
    score, // 0–100 integrity
    issues,
    warnings,
    stats: {
      cartera: cartera.length,
      conMix,
      mixRatio: Math.round(mixRatio * 100),
      stock: stock.length,
      stockPos,
      focos: focos.length,
    },
    banner: blocked
      ? issues[0]?.message || 'Datos no confiables — recomendaciones pausadas'
      : warnings[0]?.message || null,
  }
}

function computeIntegrityScore({
  carteraLen,
  mixRatio,
  stockPos,
  stockLen,
  hasMeta,
  focosLen,
  issueCount,
  warnCount,
}) {
  let s = 100
  if (carteraLen === 0) return 0
  if (mixRatio < 0.15) s -= 40
  else if (mixRatio < 0.4) s -= 15
  if (stockLen === 0) s -= 10
  else if (stockPos === 0) s -= 35
  if (!hasMeta) s -= 5
  if (focosLen === 0) s -= 5
  s -= issueCount * 12
  s -= warnCount * 4
  return Math.max(0, Math.min(100, Math.round(s)))
}

/** Cliente individual usable para scoring */
export function clientIntegrity(c) {
  if (!c) return { ok: false, reason: 'null' }
  if (!c.cliente_key && !c.id) return { ok: false, reason: 'sin_key' }
  const dias = n(c.dias_sin_comprar)
  if (dias > 500) return { ok: false, reason: 'dias_invalidos' }
  return { ok: true, reason: null }
}
