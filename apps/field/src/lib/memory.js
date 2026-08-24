/**
 * BLACK SHEEP — Memory System
 *
 * Registra qué hizo el ejecutivo después de ver cada DecisionCard.
 * Con el tiempo el Decision Engine aprende qué recomienda
 * realmente genera ventas y ajusta los scores.
 *
 * Uso:
 *   import { trackDecision, trackPedido } from '../lib/memory'
 *
 *   // Al abrir una DecisionCard
 *   trackDecision({ decisionId, decisionType, attention, clienteKey, ejecutivoId, accion: 'visto' })
 *
 *   // Al guardar un pedido originado en una decisión
 *   trackPedido({ decisionId, clienteKey, ejecutivoId, pedidoId, total })
 */
import { supabase } from './supabase'

/** Registra cualquier acción sobre una decisión */
export async function trackDecision({
  decisionId,
  decisionType,
  attention,
  clienteKey,
  ejecutivoId,
  pedidoId   = null,
  accion     = 'visto',
  totalPedido = 0,
} = {}) {
  if (!decisionId) return
  try {
    await supabase.from('decision_feedback').insert({
      decision_id:   String(decisionId),
      decision_type: decisionType || null,
      attention:     attention    || null,
      cliente_key:   clienteKey   ? String(clienteKey) : null,
      ejecutivo_id:  ejecutivoId  || null,
      pedido_id:     pedidoId     || null,
      accion,
      total_pedido:  totalPedido  || 0,
    })
  } catch {
    // Memory no es crítico — falla silenciosamente
  }
}

/** Shortcut para registrar pedido generado desde una decisión */
export async function trackPedido({ decisionId, decisionType, attention, clienteKey, ejecutivoId, pedidoId, total }) {
  return trackDecision({
    decisionId, decisionType, attention,
    clienteKey, ejecutivoId, pedidoId,
    accion: 'pedido',
    totalPedido: total || 0,
  })
}

/**
 * Carga la efectividad histórica de cada tipo de decisión.
 * El Decision Engine usa esto para ajustar scores.
 *
 * Retorna: Map<decisionType, { pctConversion, ticketPromedio }>
 */
export async function loadEffectiveness() {
  try {
    const { data } = await supabase
      .from('decision_effectiveness')
      .select('decision_type,attention,pct_conversion_pedido,ticket_promedio')
    if (!data?.length) return new Map()
    const m = new Map()
    for (const r of data) {
      const key = `${r.decision_type}_${r.attention}`
      m.set(key, {
        pctConversion: Number(r.pct_conversion_pedido) || 0,
        ticketPromedio: Number(r.ticket_promedio) || 0,
      })
    }
    return m
  } catch {
    return new Map()
  }
}

/**
 * Ajusta el score de una decisión según datos históricos.
 * Si un tipo de decisión históricamente convierte bien → sube el score.
 */
export function adjustScoreByMemory(decision, effectiveness) {
  if (!effectiveness?.size) return decision
  const key = `${decision.type}_${decision.attention}`
  const hist = effectiveness.get(key)
  if (!hist) return decision
  // Bonus/malus de hasta ±15 puntos según conversión histórica
  const bonus = Math.round((hist.pctConversion - 50) * 0.3)
  return { ...decision, score: Math.max(0, Math.min(100, (decision.score || 50) + bonus)) }
}
