/**
 * Ciclo de vida del pedido — una sola fuente de verdad.
 *
 * borrador → recibido → confirmado → preparado → enviado → entregado
 *                ↘ cancelado
 * catalogo_publico entra como "recibido"
 */

export const ESTADOS_PEDIDO = [
  { id: 'borrador', label: 'Borrador', color: '#78716c', next: ['recibido', 'confirmado', 'cancelado'] },
  { id: 'recibido', label: 'Recibido', color: '#c2410c', next: ['confirmado', 'cancelado'] },
  { id: 'confirmado', label: 'Confirmado', color: '#0369a1', next: ['preparado', 'enviado', 'cancelado'] },
  { id: 'preparado', label: 'Preparado', color: '#7c3aed', next: ['enviado', 'entregado', 'cancelado'] },
  { id: 'enviado', label: 'Enviado', color: '#0f766e', next: ['entregado'] },
  { id: 'entregado', label: 'Entregado', color: '#15803d', next: [] },
  { id: 'cancelado', label: 'Cancelado', color: '#b91c1c', next: [] },
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
  return MAP[id]?.color || '#78716c'
}

export function siguientesEstados(estado, fuente) {
  const id = normalizarEstado(estado, fuente)
  return (MAP[id]?.next || []).map(n => MAP[n]).filter(Boolean)
}

export function esPendienteOperativo(estado, fuente) {
  const id = normalizarEstado(estado, fuente)
  return ['borrador', 'recibido', 'confirmado', 'preparado'].includes(id)
}
