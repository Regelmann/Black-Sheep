/**
 * Single source of truth — métricas de campo KeyFoods
 * Usado por Hoy, Cartera y Mapa para que "Reponer hoy" sea siempre el mismo número.
 */
import { parseSkuDetalle, skusAReponer, cantidadSugerida, smartReorderBadge, cicloReposicion as cicloCoach } from './coach'
import { calcularRiesgoFuga, enrichCarteraRiesgo, resumenRiesgo } from './riesgo'

export function esActivoMes(c) {
  return Number(c?.venta_mtd) > 0
}

// NUEVO: compró este mes Y no tenía historial antes
// Fuente canónica — usada por Hoy, Cartera y Mapa
export function esNuevoMes(c) {
  const mtd = Number(c?.venta_mtd) || 0
  if (mtd <= 0) return false
  // Flag explícito del ciclo → máxima prioridad
  if (c?.es_nuevo_mes === true || c?.es_nuevo_mes === 1 || String(c?.es_nuevo_mes) === 'true') return true
  // Estado NUNCA = primer compra histórica
  if (/NUNCA/i.test(c?.estado_fuga || '')) return true
  // primera_compra dentro del mes actual
  const mesHoy = new Date().toISOString().slice(0, 7)
  const pri = String(c?.primera_compra || '').slice(0, 7)
  if (pri && pri === mesHoy) return true
  // Sin historial relevante: venta_historica ≈ 0 o igual a MTD
  const hist = Number(c?.venta_historica) || 0
  if (hist <= 0) return true
  if (hist > 0 && hist <= mtd * 1.06) return true
  return false
}

// RECUPERADO: compró este mes pero estaba dormido/fugado
export function esRecuperadoMes(c) {
  const mtd = Number(c?.venta_mtd) || 0
  if (mtd <= 0 || esNuevoMes(c)) return false
  return /DORMIDO|FUGADO/i.test(c?.estado_fuga || '')
}

// cicloReposicion + skusAReponer: single source en coach.js (Smart Reorder V2.4)
export { skusAReponer, cantidadSugerida, smartReorderBadge } from './coach'
export const cicloReposicion = cicloCoach

export function clienteTocaReponer(c) {
  return skusAReponer(c).length > 0
}

export function scorePrioridad(c) {
  const dias = Number(c?.dias_sin_comprar) || 0
  const mtd = Number(c?.venta_mtd) || 0
  const hist = Number(c?.venta_mensual) || Number(c?.venta_historica) || 0
  const ef = String(c?.estado_fuga || c?.estado_fuga_calc || '')
  const skus = skusAReponer(c)
  const riesgo = c?.riesgo_score != null ? Number(c.riesgo_score) : calcularRiesgoFuga(c).score
  let s = 0
  // Señal principal: algoritmo de fuga (0–100 → hasta 70 pts)
  s += Math.round(riesgo * 0.7)
  if (/RIESGO/i.test(ef)) s += 12
  else if (/ENFRI/i.test(ef)) s += 8
  else if (/FUGADO|DORMIDO/i.test(ef)) s += 6
  if (skus.length) s += 25 + Math.min(15, skus.length * 3)
  const top$ = skus.reduce((mx, x) => Math.max(mx, Number(x.promClp) || Number(x.clpMtd) || 0), 0)
  if (top$ > 0) s += Math.min(25, Math.round(top$ / 80000))
  if (dias >= 45) s += 12
  else if (dias >= 28) s += 8
  if (hist > mtd) s += Math.min(15, Math.round((hist - mtd) / 80000))
  if (esNuevoMes(c) && mtd > 0) s += 12
  return s
}

/** Insight de 1 línea para el vendedor: ciclo + qué llevar (Smart Reorder) */
export function insightRecompra(c) {
  const skus = skusAReponer(c)
  if (!skus.length) {
    const dias = Number(c?.dias_sin_comprar)
    if (!isNaN(dias) && dias >= 14) return { text: `Sin compra hace ${dias}d`, topSku: null, qty: null, ranked: [] }
    return null
  }
  const ranked = [...skus]
  const top = ranked[0]
  const nom = String(top.nombre || '').split(/\s+/).slice(0, 4).join(' ')
  const qty = top.cantidadSugerida || top.qty || cantidadSugerida(top)
  const label = top.recompra?.label || top.label || 'Reponer'
  return {
    text: `${label} · ${nom}`,
    topSku: top,
    qty,
    ranked,
  }
}

export function ofertaCorta(oferta) {
  if (!oferta) return null
  const t = String(oferta).replace(/_/g, ' ')
  const m = t.match(/(?:Foco|Ofrece|Ofrecé)[:\s]+([^·|]+)/i)
  if (m) return m[1].trim().slice(0, 48)
  return t.split(/[·|]/)[0].trim().slice(0, 48)
}

// Días hábiles transcurridos en el mes actual (sin sábados/domingos)
function diasHabilesHastahoy() {
  const hoy = new Date()
  const d1 = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  let count = 0
  const cur = new Date(d1)
  while (cur <= hoy) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return Math.max(1, count)
}

/**
 * Métricas consistentes a partir de un array de cartera del ejecutivo/zona.
 * Un solo cálculo → Hoy, filtros de Clientes y chips del mapa.
 */
export function computeConsistentMetrics(cartera, metaRow) {
  const rows = Array.isArray(cartera) ? cartera : []
  const ventaMtd = rows.reduce((s, c) => s + (Number(c.venta_mtd) || 0), 0)
  const metaMensual = Number(metaRow?.meta_mensual) || 0
  const pct = metaMensual ? Math.round((ventaMtd / metaMensual) * 100) : 0
  const brecha = Math.max(0, metaMensual - ventaMtd)

  // Ritmo real basado en días hábiles reales transcurridos
  const diasHabiles = diasHabilesHastahoy()
  const ritmoDia = ventaMtd / diasHabiles
  const proyeccion = ritmoDia * 22
  const proyeccionDiff = metaMensual ? proyeccion - metaMensual : 0

  // Días hábiles que faltan para cerrar el mes
  const hoy = new Date()
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
  let diasRestantes = 0
  const temp = new Date(hoy)
  temp.setDate(temp.getDate() + 1)
  while (temp <= fin) {
    const dow = temp.getDay()
    if (dow !== 0 && dow !== 6) diasRestantes++
    temp.setDate(temp.getDate() + 1)
  }
  const ventaNecesariaDia = diasRestantes > 0 ? brecha / diasRestantes : 0

  // Riesgo de fuga (algoritmo local — complementa estado_fuga del ciclo)
  const riesgoPack = resumenRiesgo(rows)
  const rowsRisk = riesgoPack.enriched
  const byKey = new Map(rowsRisk.map(r => [r.cliente_key || r.id, r]))
  const mergeRisk = (c) => byKey.get(c.cliente_key || c.id) || enrichCarteraRiesgo([c])[0]

  const reponerList = rows.filter(clienteTocaReponer)
  const riesgoList  = rowsRisk.filter(c => (c.riesgo_score || 0) >= 45 || /RIESGO/i.test(c.estado_fuga || ''))
  const enfriList   = rowsRisk.filter(c => ((c.riesgo_score || 0) >= 25 && (c.riesgo_score || 0) < 45) || /ENFRI/i.test(c.estado_fuga || ''))
  const activosList = rows.filter(esActivoMes)
  const nuevosList  = rows.filter(esNuevoMes)
  const recuperadosList = rows.filter(esRecuperadoMes)
  const ventaRiesgo = riesgoPack.plataEnRiesgo || rowsRisk
    .filter(c => (c.riesgo_score || 0) >= 45)
    .reduce((s, c) => s + (Number(c.riesgo_plata) || Number(c.venta_mensual) || 0), 0)

  // Bloqueados NO van a Hoy: están cerrados/deuda a propósito
  const actionQueue = [...rows]
    .filter(c => {
      if (c.es_bloqueado) return false
      const ef = String(c.estado_fuga || c.estado || '').toUpperCase()
      if (ef.includes('BLOQ')) return false
      return true
    })
    .map(c => {
      const cr = mergeRisk(c)
      const skus  = skusAReponer(cr)
      const score = scorePrioridad(cr)
      const ef    = String(cr.estado_fuga || cr.riesgo_nivel || '')
      const rs    = Number(cr.riesgo_score) || 0
      let type     = 'visita'
      let ctaLabel = 'Visitar'
      if (rs >= 65 || /FUGADO|DORMIDO/i.test(ef)) {
        type = 'riesgo'; ctaLabel = 'Recuperar'
      } else if (rs >= 45 || /RIESGO/i.test(ef)) {
        type = 'riesgo'; ctaLabel = 'Recuperar'
      } else if (rs >= 25 || /ENFRI/i.test(ef)) {
        type = 'enfriandose'; ctaLabel = 'Reactivar'
      } else if (skus.length) {
        type = 'reponer'; ctaLabel = 'Ir a reponer'
      } else if (esNuevoMes(cr)) {
        type = 'nuevo'; ctaLabel = 'Seguir nuevo'
      }

      const dias = Number(cr.dias_sin_comprar)
      const insight = insightRecompra(cr)
      const badge = smartReorderBadge(cr)
      const partes = [
        badge?.text || (skus.length ? `${skus.length} SKU a reponer` : null),
        !isNaN(dias) && dias < 999 ? `hace ${dias}d` : null,
        rs >= 25 ? `riesgo ${rs}` : null,
        cr.comuna,
      ].filter(Boolean)

      return {
        id:       cr.cliente_key || cr.id,
        type,
        priority: score,
        title:    cr.razon_social || cr.nombre_cliente || cr.cliente_key || 'Cliente',
        subtitle: partes.join(' · '),
        insight:  insight?.text || (cr.riesgo_razones && cr.riesgo_razones[0]) || null,
        nextSku:  insight?.topSku?.nombre || null,
        nextQty:  insight?.qty || null,
        skusRanked: insight?.ranked || skus,
        count:    skus.length || undefined,
        amount:   Number(cr.venta_mtd) || Number(cr.venta_mensual) || undefined,
        clientId: cr.cliente_key || cr.id,
        ctaLabel,
        riesgoScore: rs,
        riesgoLabel: cr.riesgo_label,
        oferta:   ofertaCorta(cr.oferta_real),
        telefono: cr.telefono,
        whatsapp: cr.link_whatsapp,
        raw:      cr,
      }
    })
    .filter(a => a.priority > 0)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10)

  return {
    ventaMtd,
    metaMensual,
    pct,
    brecha,
    ritmoDia,
    proyeccion,
    proyeccionDiff,
    diasRestantes,
    ventaNecesariaDia,
    reponerHoy:      reponerList.length,
    reponerList,
    nRiesgo:         riesgoList.length,
    plataEnRiesgo:   riesgoPack.plataEnRiesgo,
    topRiesgo:       riesgoPack.topRiesgo,
    nEnfri:          enfriList.length,
    nActivos:        activosList.length,
    nNuevos:         nuevosList.length,
    nRecuperados:    recuperadosList.length,
    ventaRiesgo,
    actionQueue,
    totalClientes:   rows.length,
  }
}



export { calcularRiesgoFuga, enrichCarteraRiesgo, resumenRiesgo } from './riesgo'
