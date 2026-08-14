/**
 * Single source of truth — métricas de campo KeyFoods
 * Usado por Hoy, Cartera y Mapa para que "Reponer hoy" sea siempre el mismo número.
 */
import { parseSkuDetalle } from './coach'

export function esActivoMes(c) {
  return Number(c?.venta_mtd) > 0
}

export function esNuevoMes(c) {
  if (c?.es_nuevo_mes === true || c?.es_nuevo_mes === 1 || c?.es_nuevo_mes === 'true') return true
  const mtd = Number(c?.venta_mtd) || 0
  if (mtd <= 0) return false
  const snap = String(c?.fecha_snapshot || '').slice(0, 7)
  const u = String(c?.ultima_compra || '').slice(0, 10)
  if (!snap || !u.startsWith(snap)) return false
  const hist = Number(c?.venta_historica) || 0
  if (hist > 0 && hist <= mtd * 1.15) return true
  if (/NUNCA/i.test(c?.estado_fuga || '')) return true
  return false
}

/** Ciclo real desde sku_detalle (mediana gaps) — no inventar desde volumen */
export function cicloReposicion(s) {
  let diasUltima = null
  if (s?.ultima) {
    const d = new Date(String(s.ultima).slice(0, 10) + 'T12:00:00')
    if (!isNaN(d.getTime())) {
      diasUltima = Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000))
    }
  }
  const cicloEst =
    s?.cicloDias != null && !isNaN(Number(s.cicloDias)) && Number(s.cicloDias) > 0
      ? Math.round(Number(s.cicloDias))
      : null

  let recompra = null
  if (diasUltima != null && cicloEst != null) {
    const delta = diasUltima - cicloEst
    if (delta >= 3) recompra = { label: `Debería comprar ya · atrasa ${delta}d`, tone: 'bad' }
    else if (delta >= 0) recompra = { label: 'Hoy debería reponer', tone: 'warn' }
    else if (delta === -1) recompra = { label: 'Mañana debería reponer', tone: 'ok' }
    else recompra = { label: `Próxima ~${Math.abs(delta)}d`, tone: 'muted' }
  } else if (diasUltima != null) {
    recompra = {
      label: `Sin compra hace ${diasUltima}d`,
      tone: diasUltima >= 21 ? 'bad' : 'warn',
    }
  }
  return { diasUltima, cicloEst, recompra }
}

export function skusAReponer(c) {
  try {
    const skus = parseSkuDetalle(c?.sku_detalle)
    const out = []
    for (const s of skus) {
      const { diasUltima, cicloEst, recompra } = cicloReposicion(s)
      if (!recompra) continue
      if (recompra.tone === 'bad' || recompra.tone === 'warn') {
        out.push({
          nombre: s.nombre,
          diasUltima,
          cicloEst,
          label: recompra.label,
          tone: recompra.tone,
          promClp: s.promClp,
        })
      }
    }
    return out
  } catch {
    return []
  }
}

export function clienteTocaReponer(c) {
  return skusAReponer(c).length > 0
}

export function scorePrioridad(c) {
  const dias = Number(c?.dias_sin_comprar) || 0
  const mtd = Number(c?.venta_mtd) || 0
  const hist = Number(c?.venta_mensual) || Number(c?.venta_historica) || 0
  const ef = String(c?.estado_fuga || '')
  let s = 0
  if (/RIESGO/i.test(ef)) s += 80
  else if (/ENFRI/i.test(ef)) s += 55
  else if (/FUGADO|DORMIDO/i.test(ef)) s += 40
  if (clienteTocaReponer(c)) s += 35
  if (dias >= 45) s += 30
  else if (dias >= 28) s += 20
  else if (dias >= 21) s += 12
  if (hist > mtd) s += Math.min(25, Math.round((hist - mtd) / 50000))
  if (esNuevoMes(c) && mtd > 0) s += 15
  return s
}

export function ofertaCorta(oferta) {
  if (!oferta) return null
  const t = String(oferta).replace(/_/g, ' ')
  const m = t.match(/(?:Foco|Ofrece|Ofrecé)[:\s]+([^·|]+)/i)
  if (m) return m[1].trim().slice(0, 48)
  return t.split(/[·|]/)[0].trim().slice(0, 48)
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

  const dia = new Date().getDate()
  const diasHabilesEst = Math.max(1, Math.min(22, Math.round((dia / 30) * 22)))
  const ritmoDia = diasHabilesEst > 0 ? ventaMtd / diasHabilesEst : 0
  const proyeccion = ritmoDia * 22
  const proyeccionDiff = metaMensual ? proyeccion - metaMensual : 0

  const reponerList = rows.filter(clienteTocaReponer)
  const riesgoList = rows.filter(c => /RIESGO/i.test(c.estado_fuga || ''))
  const enfriList = rows.filter(c => /ENFRI/i.test(c.estado_fuga || ''))
  const activosList = rows.filter(esActivoMes)
  const nuevosList = rows.filter(esNuevoMes)
  const ventaRiesgo = rows
    .filter(c => /RIESGO|ENFRI|FUGADO|DORMIDO/i.test(c.estado_fuga || ''))
    .reduce((s, c) => {
      const men = Number(c.venta_mensual) || 0
      if (men > 0) return s + men
      const hist = Number(c.venta_historica) || 0
      return s + (hist > 0 ? hist / 12 : 0)
    }, 0)

  const actionQueue = [...rows]
    .map(c => {
      const skus = skusAReponer(c)
      const score = scorePrioridad(c)
      const ef = String(c.estado_fuga || '')
      let type = 'visita'
      let ctaLabel = 'Visitar'
      if (/RIESGO|FUGADO/i.test(ef)) {
        type = 'riesgo'
        ctaLabel = 'Recuperar'
      } else if (/ENFRI/i.test(ef)) {
        type = 'enfriandose'
        ctaLabel = 'Reactivar'
      } else if (skus.length) {
        type = 'reponer'
        ctaLabel = 'Ir a reponer'
      } else if (esNuevoMes(c)) {
        type = 'nuevo'
        ctaLabel = 'Seguir nuevo'
      }
      return {
        id: c.cliente_key || c.id,
        type,
        priority: score,
        title: c.razon_social || c.nombre_cliente || c.cliente_key || 'Cliente',
        subtitle: [
          c.comuna,
          skus.length ? `Reponer ${skus.length}` : null,
          Number(c.dias_sin_comprar) < 999 ? `hace ${c.dias_sin_comprar}d` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        count: skus.length || undefined,
        amount: Number(c.venta_mtd) || Number(c.venta_mensual) || undefined,
        clientId: c.cliente_key || c.id,
        ctaLabel,
        oferta: ofertaCorta(c.oferta_real),
        telefono: c.telefono,
        whatsapp: c.link_whatsapp,
        raw: c,
      }
    })
    .filter(a => a.priority >= 40)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8)

  return {
    ventaMtd,
    metaMensual,
    pct,
    brecha,
    ritmoDia,
    proyeccion,
    proyeccionDiff,
    reponerHoy: reponerList.length,
    reponerList,
    nRiesgo: riesgoList.length,
    nEnfri: enfriList.length,
    nActivos: activosList.length,
    nNuevos: nuevosList.length,
    ventaRiesgo,
    actionQueue,
    totalClientes: rows.length,
  }
}
