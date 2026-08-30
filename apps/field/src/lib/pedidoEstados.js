/**
 * Ciclo de vida del pedido — una sola fuente de verdad.
 *
 * borrador → recibido → confirmado → preparado → enviado → entregado
 *                ↘ cancelado
 * catalogo_publico entra como "recibido"
 */

export const ESTADOS_PEDIDO = [
  { id: 'borrador', label: 'Borrador', color: 'var(--ink-3)', next: ['recibido', 'confirmado', 'cancelado'] },
  { id: 'recibido', label: 'Recibido', color: 'var(--brand)', next: ['confirmado', 'cancelado'] },
  { id: 'confirmado', label: 'Confirmado', color: 'var(--info-dk3)', next: ['preparado', 'enviado', 'cancelado'] },
  { id: 'preparado', label: 'Preparado', color: 'var(--purple)', next: ['enviado', 'entregado', 'cancelado'] },
  { id: 'enviado', label: 'Enviado', color: 'var(--teal)', next: ['entregado'] },
  { id: 'entregado', label: 'Entregado', color: 'var(--ok)', next: [] },
  { id: 'cancelado', label: 'Cancelado', color: 'var(--danger-dk)', next: [] },
]

const MAP = Object.fromEntries(ESTADOS_PEDIDO.map(e => [e.id, e]))

export function normalizarEstado(estado, fuente) {
  const e = String(estado || '').toLowerCase().trim()
  if (MAP[e]) return e
  if (fuente === 'catalogo_publico' && (!e || e === 'pendiente' || e === 'nuevo')) return 'recibido'
  if (e === 'pendiente' || e === 'pendiente_carga') return 'recibido'
  if (e === 'ok' || e === 'cerrado') return 'entregado'
  return e || 'borrador'
}

export function etiquetaEstado(estado, fuente) {
  const id = normalizarEstado(estado, fuente)
  return MAP[id]?.label || id
}

export function colorEstado(estado, fuente) {
  const id = normalizarEstado(estado, fuente)
  return MAP[id]?.color || 'var(--ink-3)'
}

export function siguientesEstados(estado, fuente) {
  const id = normalizarEstado(estado, fuente)
  return (MAP[id]?.next || []).map(n => MAP[n]).filter(Boolean)
}

export function esPendienteOperativo(estado, fuente) {
  const id = normalizarEstado(estado, fuente)
  return ['borrador', 'recibido', 'confirmado', 'preparado'].includes(id)
}
