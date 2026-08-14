/**
 * useConsistentMetrics — single source of truth for field KPIs.
 * Same numbers flow to Hoy, Clientes filters, and Mapa chips.
 */
import { useMemo } from 'react'
import type { Client, MetaRow, ConsistentMetrics, ActionItem, ActionType } from '../types/domain'

/** Lightweight SKU parser (mirror of coach.parseSkuDetalle). Inject full parser in prod. */
export type ParseSkuFn = (text: string | null | undefined) => Array<{
  nombre: string
  promUd: number
  udMtd: number
  cicloDias: number | null
  ultima: string | null
  promClp?: number
}>

export function esActivoMes(c: Client): boolean {
  return Number(c.venta_mtd) > 0
}

export function esNuevoMes(c: Client): boolean {
  if (c.es_nuevo_mes === true || c.es_nuevo_mes === 1 || c.es_nuevo_mes === 'true') return true
  const mtd = Number(c.venta_mtd) || 0
  if (mtd <= 0) return false
  const snap = String(c.fecha_snapshot || '').slice(0, 7)
  const u = String(c.ultima_compra || '').slice(0, 10)
  if (!snap || !u.startsWith(snap)) return false
  const hist = Number(c.venta_historica) || 0
  if (hist > 0 && hist <= mtd * 1.15) return true
  if (/NUNCA/i.test(c.estado_fuga || '')) return true
  return false
}

export function cicloReposicion(s: {
  ultima?: string | null
  cicloDias?: number | null
}): { diasUltima: number | null; cicloEst: number | null; recompra: { label: string; tone: 'bad' | 'warn' | 'ok' | 'muted' } | null } {
  let diasUltima: number | null = null
  if (s.ultima) {
    const d = new Date(String(s.ultima).slice(0, 10) + 'T12:00:00')
    if (!isNaN(d.getTime())) {
      diasUltima = Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000))
    }
  }
  const cicloEst =
    s.cicloDias != null && !isNaN(Number(s.cicloDias)) && Number(s.cicloDias) > 0
      ? Math.round(Number(s.cicloDias))
      : null

  let recompra: { label: string; tone: 'bad' | 'warn' | 'ok' | 'muted' } | null = null
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

export function clienteTocaReponer(c: Client, parseSku: ParseSkuFn): boolean {
  try {
    const skus = parseSku(c.sku_detalle)
    return skus.some(s => {
      const { recompra } = cicloReposicion(s)
      return recompra?.tone === 'bad' || recompra?.tone === 'warn'
    })
  } catch {
    return false
  }
}

export function scorePrioridad(c: Client, parseSku: ParseSkuFn): number {
  const dias = Number(c.dias_sin_comprar) || 0
  const mtd = Number(c.venta_mtd) || 0
  const hist = Number(c.venta_mensual) || Number(c.venta_historica) || 0
  const ef = String(c.estado_fuga || '')
  let s = 0
  if (/RIESGO/i.test(ef)) s += 80
  else if (/ENFRI/i.test(ef)) s += 55
  else if (/FUGADO|DORMIDO/i.test(ef)) s += 40
  if (clienteTocaReponer(c, parseSku)) s += 35
  if (dias >= 45) s += 30
  else if (dias >= 28) s += 20
  else if (dias >= 21) s += 12
  if (hist > mtd) s += Math.min(25, Math.round((hist - mtd) / 50000))
  if (esNuevoMes(c) && mtd > 0) s += 15
  return s
}

export function ofertaCorta(oferta?: string | null): string | null {
  if (!oferta) return null
  const t = String(oferta).replace(/_/g, ' ')
  const m = t.match(/(?:Foco|Ofrece|Ofrecé)[:\s]+([^·|]+)/i)
  if (m) return m[1].trim().slice(0, 48)
  return t.split(/[·|]/)[0].trim().slice(0, 48)
}

export function buildActionQueue(
  rows: Client[],
  parseSku: ParseSkuFn,
  limit = 8
): ActionItem[] {
  return [...rows]
    .map(c => {
      const needsRestock = clienteTocaReponer(c, parseSku)
      const score = scorePrioridad(c, parseSku)
      const ef = String(c.estado_fuga || '')
      let type: ActionType = 'visita'
      let ctaLabel = 'Visitar'
      let count: number | undefined

      if (/RIESGO|FUGADO/i.test(ef)) {
        type = 'riesgo'
        ctaLabel = 'Recuperar'
      } else if (/ENFRI/i.test(ef)) {
        type = 'enfriandose'
        ctaLabel = 'Reactivar'
      } else if (needsRestock) {
        type = 'reponer'
        ctaLabel = 'Ir a reponer'
        try {
          count = parseSku(c.sku_detalle).filter(s => {
            const { recompra } = cicloReposicion(s)
            return recompra?.tone === 'bad' || recompra?.tone === 'warn'
          }).length
        } catch {
          count = undefined
        }
      } else if (esNuevoMes(c)) {
        type = 'nuevo'
        ctaLabel = 'Seguir nuevo'
      }

      return {
        id: c.cliente_key || c.id || String(Math.random()),
        type,
        priority: score,
        title: c.razon_social || c.nombre_cliente || c.cliente_key || 'Cliente',
        subtitle: [
          c.comuna,
          count ? `Reponer ${count}` : null,
          Number(c.dias_sin_comprar) < 999 ? `hace ${c.dias_sin_comprar}d` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        count,
        amount: Number(c.venta_mtd) || Number(c.venta_mensual) || undefined,
        clientId: c.cliente_key || c.id,
        ctaLabel,
        oferta: ofertaCorta(c.oferta_real),
        telefono: c.telefono,
        whatsapp: c.link_whatsapp,
        raw: c,
      } satisfies ActionItem
    })
    .filter(a => a.priority >= 40)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
}

export function computeConsistentMetrics(
  cartera: Client[],
  metaRow: MetaRow | null | undefined,
  parseSku: ParseSkuFn
): ConsistentMetrics {
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

  const reponerList = rows.filter(c => clienteTocaReponer(c, parseSku))
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
    actionQueue: buildActionQueue(rows, parseSku),
    totalClientes: rows.length,
  }
}

/**
 * React hook — pass cartera + meta from your data layer.
 * Inject parseSku from coach.ts so this file stays framework-agnostic for logic.
 */
export function useConsistentMetrics(
  cartera: Client[],
  metaRow: MetaRow | null | undefined,
  parseSku: ParseSkuFn
): ConsistentMetrics {
  return useMemo(
    () => computeConsistentMetrics(cartera, metaRow, parseSku),
    [cartera, metaRow, parseSku]
  )
}
