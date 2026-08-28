/**
 * Algoritmo de riesgo de fuga — Black Sheep Field
 *
 * Score 0–100 y nivel semántico a partir de:
 * - días sin compra vs ciclo de reposición
 * - caída de ticket (MTD vs promedio)
 * - SKUs atrasados en sku_detalle
 * - señales del ciclo (estado_fuga)
 *
 * Niveles (compatibles con filtros existentes):
 *   1_ACTIVO | 2_ENFRIANDO | 3_EN_RIESGO | 4_DORMIDO | 5_FUGADO | 0_NUNCA
 */

import { parseSkuDetalle } from './coach'

function num(v, d = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

function diasDesde(fecha) {
  if (!fecha) return null
  const d = new Date(String(fecha).slice(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return null
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000))
}

/** Ciclo estimado del cliente (días): mediana de ciclos SKU o fallback */
export function cicloClienteDias(c) {
  const skus = parseSkuDetalle(c?.sku_detalle)
  const ciclos = skus
    .map((s) => num(s.cicloDias ?? s.ciclo, 0))
    .filter((x) => x >= 5 && x <= 120)
  if (ciclos.length) {
    ciclos.sort((a, b) => a - b)
    return ciclos[Math.floor(ciclos.length / 2)]
  }
  // Fallback: si tiene venta mensual histórica alta, ciclo corto típico foodservice
  const hist = num(c?.venta_mensual) || num(c?.venta_historica)
  if (hist >= 500000) return 14
  if (hist >= 150000) return 21
  if (hist > 0) return 28
  return 30
}

/**
 * Calcula riesgo de fuga de un cliente.
 * @returns {{
 *   score: number,
 *   nivel: string,
 *   label: string,
 *   tone: 'ok'|'warn'|'bad'|'muted',
 *   razones: string[],
 *   diasSinCompra: number,
 *   cicloDias: number,
 *   ratioCiclo: number|null,
 *   plataEnRiesgo: number,
 * }}
 */
export function calcularRiesgoFuga(c) {
  if (!c) {
    return {
      score: 0,
      nivel: '1_ACTIVO',
      label: 'Activo',
      tone: 'ok',
      razones: [],
      diasSinCompra: 0,
      cicloDias: 30,
      ratioCiclo: null,
      plataEnRiesgo: 0,
    }
  }

  // Bloqueados: no son "fuga comercial" operativa en ruta
  if (c.es_bloqueado === true || c.es_bloqueado === 1 || c.bloqueado === true) {
    return {
      score: 0,
      nivel: 'BLOQUEADO',
      label: 'Bloqueado',
      tone: 'muted',
      razones: ['Cliente bloqueado'],
      diasSinCompra: num(c.dias_sin_comprar, 0),
      cicloDias: cicloClienteDias(c),
      ratioCiclo: null,
      plataEnRiesgo: 0,
    }
  }

  let dias = num(c.dias_sin_comprar, NaN)
  if (!Number.isFinite(dias) || dias < 0) {
    dias = diasDesde(c.ultima_compra) ?? diasDesde(c.fecha_ultima_compra) ?? 0
  }
  if (dias > 900) dias = 900

  const ciclo = cicloClienteDias(c)
  const ratio = ciclo > 0 ? dias / ciclo : null
  const mtd = num(c.venta_mtd)
  const histMes = num(c.venta_mensual) || num(c.venta_historica) / 12 || 0
  const skus = parseSkuDetalle(c?.sku_detalle)

  // --- Componentes ---
  let score = 0
  const razones = []

  // 1) Atraso vs ciclo (0–40)
  if (ratio != null) {
    if (ratio >= 3) {
      score += 40
      razones.push(`Lleva ${dias}d sin compra (ciclo ~${ciclo}d)`)
    } else if (ratio >= 2) {
      score += 32
      razones.push(`Atraso 2× ciclo (${dias}d / ${ciclo}d)`)
    } else if (ratio >= 1.5) {
      score += 24
      razones.push(`Atraso vs ciclo (${dias}d / ${ciclo}d)`)
    } else if (ratio >= 1.1) {
      score += 14
      razones.push('Pasó su ciclo de reposición')
    } else if (ratio >= 0.9) {
      score += 6
    }
  }

  // 2) Días absolutos (0–25) — independiente del ciclo
  if (dias >= 90) {
    score += 25
    if (!razones.some((r) => r.includes('sin compra'))) razones.push(`Sin compra hace ${dias}d`)
  } else if (dias >= 60) {
    score += 20
  } else if (dias >= 45) {
    score += 15
  } else if (dias >= 30) {
    score += 10
  } else if (dias >= 21) {
    score += 6
  }

  // 3) Caída de volumen en el mes (0–20)
  // Si el mes ya avanzó y MTD está muy bajo vs promedio histórico
  const day = new Date().getDate()
  const expected = histMes > 0 ? (histMes * Math.min(day, 28)) / 28 : 0
  if (histMes >= 50000 && day >= 10) {
    if (mtd <= 0 && expected > 0) {
      score += 20
      razones.push('Sin compra este mes y solía comprar')
    } else if (expected > 0 && mtd < expected * 0.35) {
      score += 16
      razones.push('Ticket del mes muy bajo vs su promedio')
    } else if (expected > 0 && mtd < expected * 0.55) {
      score += 10
      razones.push('Va lento vs su promedio')
    }
  }

  // 4) SKUs atrasados (0–15)
  let skusLate = 0
  let plataSku = 0
  for (const s of skus) {
    const dUlt = num(s.diasUltima, NaN)
    const cic = num(s.cicloDias ?? s.ciclo, 0)
    const late =
      (Number.isFinite(dUlt) && cic > 0 && dUlt >= cic) ||
      (Number.isFinite(dUlt) && dUlt >= 21 && cic <= 0)
    if (late) {
      skusLate += 1
      plataSku += num(s.promClp) || num(s.clpMtd) || 0
    }
  }
  if (skusLate >= 4) {
    score += 15
    razones.push(`${skusLate} productos para reponer`)
  } else if (skusLate >= 2) {
    score += 10
    razones.push(`${skusLate} productos atrasados`)
  } else if (skusLate === 1) {
    score += 6
    razones.push('1 producto atrasado')
  }

  // 5) Señal del ciclo backend (0–10) — no domina, alinea
  const ef = String(c.estado_fuga || '').toUpperCase()
  if (/FUGADO|5_/.test(ef)) score += 10
  else if (/DORMIDO|4_/.test(ef)) score += 8
  else if (/RIESGO|3_/.test(ef)) score += 5
  else if (/ENFRI|2_/.test(ef)) score += 2

  // Nunca compró / sin historial
  const nunca =
    /NUNCA|0_/.test(ef) ||
    (num(c.venta_historica) <= 0 && mtd <= 0 && dias >= 900)
  if (nunca && mtd <= 0) {
    return {
      score: 0,
      nivel: '0_NUNCA',
      label: 'Sin historial',
      tone: 'muted',
      razones: ['Sin historial de compra'],
      diasSinCompra: dias,
      cicloDias: ciclo,
      ratioCiclo: ratio,
      plataEnRiesgo: 0,
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  // Nivel
  let nivel = '1_ACTIVO'
  let label = 'Activo'
  let tone = 'ok'
  if (score >= 80) {
    nivel = '5_FUGADO'
    label = 'Fugado'
    tone = 'bad'
  } else if (score >= 65) {
    nivel = '4_DORMIDO'
    label = 'Dormido'
    tone = 'bad'
  } else if (score >= 45) {
    nivel = '3_EN_RIESGO'
    label = 'En riesgo'
    tone = 'warn'
  } else if (score >= 25) {
    nivel = '2_ENFRIANDO'
    label = 'Enfriando'
    tone = 'warn'
  }

  // Plata en riesgo: lo que suele comprar en un ciclo
  const plataEnRiesgo = Math.round(
    Math.max(plataSku, histMes > 0 ? histMes : 0, num(c.venta_promedio_ticket))
  )

  if (score >= 45 && plataEnRiesgo > 0 && razones.length < 3) {
    razones.push(`~$ ${plataEnRiesgo.toLocaleString('es-CL')} en juego`)
  }

  return {
    score,
    nivel,
    label,
    tone,
    razones: razones.slice(0, 4),
    diasSinCompra: dias,
    cicloDias: ciclo,
    ratioCiclo: ratio != null ? Math.round(ratio * 100) / 100 : null,
    plataEnRiesgo,
  }
}

/** Enriquece un cliente con campos de riesgo */
export function enrichRiesgo(c) {
  const r = calcularRiesgoFuga(c)
  return {
    ...c,
    riesgo_score: r.score,
    riesgo_nivel: r.nivel,
    riesgo_label: r.label,
    riesgo_tone: r.tone,
    riesgo_razones: r.razones,
    riesgo_plata: r.plataEnRiesgo,
    // Si el backend no trajo estado útil, sugerimos el calculado
    estado_fuga_calc: r.nivel,
    estado_fuga: c.estado_fuga || r.nivel,
  }
}

export function enrichCarteraRiesgo(rows) {
  return (rows || []).map(enrichRiesgo)
}

/** Resumen para Hoy / Gerencia */
export function resumenRiesgo(rows) {
  const enriched = enrichCarteraRiesgo(rows).filter(
    (c) => c.riesgo_nivel !== 'BLOQUEADO' && c.riesgo_nivel !== '0_NUNCA'
  )
  const enRiesgo = enriched.filter((c) => c.riesgo_score >= 45)
  const enfriando = enriched.filter((c) => c.riesgo_score >= 25 && c.riesgo_score < 45)
  const plata = enRiesgo.reduce((s, c) => s + num(c.riesgo_plata), 0)
  const top = [...enRiesgo].sort((a, b) => b.riesgo_score - a.riesgo_score).slice(0, 10)
  return {
    nRiesgo: enRiesgo.length,
    nEnfri: enfriando.length,
    plataEnRiesgo: plata,
    topRiesgo: top,
    enriched,
  }
}
