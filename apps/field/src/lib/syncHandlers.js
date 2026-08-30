/**
 * Handlers del outbox — SSoT para flush desde Hoy, SyncBanner y online event.
 * Tipos: checkin | completar | nota | pedido | no_venta
 */
import { supabase } from './supabase.js'

export async function handleCheckin(item) {
  const p = item.payload || {}
  const row = {
    client_op_id: item.client_op_id || item.id || null,
    visita_id: p.visita_id || null,
    cliente_key: p.cliente_key || null,
    ejecutivo_id: p.ejecutivo_id || null,
    hora_llegada: p.hora_llegada || new Date().toISOString(),
    lat_real: p.lat_real ?? p.lat ?? null,
    lng_real: p.lng_real ?? p.lng ?? null,
  }
  const { data, error } = await supabase.from('checkins').insert(row).select('id')
  if (error && (error.code === '23505' || /duplicate key|already exists/i.test(String(error.message)))) {
    console.info('[sync:checkin] ya estaba guardado (idempotencia)')
    return { ok: true, yaExistia: true }
  }
  if (error) {
    const schemaIssue = /column|schema cache|42703|PGRST204/i.test(String(error.message || ''))
    if (!schemaIssue) return { ok: false, error: error.message }
    const { error: e2 } = await supabase.from('checkins').insert({
      visita_id: row.visita_id,
      hora_llegada: row.hora_llegada,
      lat_real: row.lat_real,
      lng_real: row.lng_real,
    })
    return e2 ? { ok: false, error: e2.message } : { ok: true, degraded: true }
  }
  if (!data || !data.length) return { ok: false, error: 'el insert no devolvió fila — sin confirmar' }
  return { ok: true, id: data[0].id }
}

export async function handleCompletar(item) {
  const p = item.payload || {}
  if (p.checkin_id && !String(p.checkin_id).startsWith('offline_')) {
    const { error } = await supabase
      .from('checkins')
      .update({ hora_fin: p.hora_fin || new Date().toISOString(), resultado: p.resultado || null })
      .eq('id', p.checkin_id)
    if (error) return { ok: false, error: error.message }
  }
  if (p.visita_id) {
    const { error } = await supabase.from('visitas').update({ estado: 'visitada' }).eq('id', p.visita_id)
    if (error) return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function handleNota(item) {
  const { error } = await supabase.from('notas_cliente').insert(item.payload || {})
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function handlePedido(item) {
  const p = item.payload || {}
  if (!p || !Object.keys(p).length) {
    console.error('[sync:pedido] payload vacío — item corrupto, se descarta')
    return { ok: false, error: 'payload vacío', descartar: true }
  }

  const opId = item.client_op_id || item.id || null

  if (p.table && p.row) {
    const row = { ...p.row }
    if (opId && row.client_op_id == null) row.client_op_id = opId
    const { data, error } = await supabase.from(p.table).insert(row).select('id')
    if (error && (error.code === '23505' || /duplicate key|already exists/i.test(String(error.message)))) {
      return { ok: true, yaExistia: true }
    }
    if (error) return { ok: false, error: error.message }
    if (!data || !data.length) return { ok: false, error: 'el insert no devolvió fila — sin confirmar' }
    return { ok: true, id: data[0].id }
  }

  const row = {
    client_op_id: opId,
    ejecutivo_id: p.ejecutivoId,
    cliente_key: p.clienteKey || null,
    nombre_cliente: p.nombreCliente || null,
    lineas: p.lineas || [],
    nota: p.nota || null,
    estado: p.estado || 'borrador',
    fuente: p.fuente || 'field_app_offline',
    creado_en: p.creado_en || item.enqueuedAt || new Date().toISOString(),
  }
  row.total_estimado = (p.lineas || []).reduce(
    (a, l) => a + (Number(l.precio) || 0) * (Number(l.cantidad) || 0),
    0
  )

  const { data, error } = await supabase.from('pedidos').insert(row).select('id')
  if (error && (error.code === '23505' || /duplicate key|already exists/i.test(String(error.message)))) {
    return { ok: true, yaExistia: true }
  }
  if (error) {
    const schemaIssue = /column|schema cache|42703|PGRST204/i.test(String(error.message || ''))
    if (!schemaIssue) return { ok: false, error: error.message }
    const minimal = {
      ejecutivo_id: row.ejecutivo_id,
      cliente_key: row.cliente_key,
      nombre_cliente: row.nombre_cliente,
      lineas: row.lineas,
      nota: row.nota,
      estado: row.estado,
      fuente: row.fuente,
    }
    const r2 = await supabase.from('pedidos').insert(minimal).select('id')
    if (r2.error) return { ok: false, error: r2.error.message }
    if (!r2.data || !r2.data.length) return { ok: false, error: 'fallback sin fila — sin confirmar' }
    return { ok: true, id: r2.data[0].id, degraded: true }
  }
  if (!data || !data.length) return { ok: false, error: 'el insert no devolvió fila — sin confirmar' }
  return { ok: true, id: data[0].id }
}

export async function handleNoVenta(item) {
  const p = item.payload || {}
  if (p.visita_id) {
    const { error } = await supabase
      .from('visitas')
      .update({ estado: p.estado || 'visitada', resultado: 'no_venta' })
      .eq('id', p.visita_id)
    if (error) return { ok: false, error: error.message }
  }
  if (p.nota) {
    const { error } = await supabase.from('notas_cliente').insert({
      client_op_id: item.client_op_id || item.id || null,
      cliente_key: p.cliente_key,
      texto: p.nota,
      tipo: 'no_venta',
    })
    if (error) return { ok: false, error: error.message }
  }
  return { ok: true }
}

/** Mapa listo para flushActionQueue */
export const syncHandlers = {
  checkin: handleCheckin,
  completar: handleCompletar,
  nota: handleNota,
  pedido: handlePedido,
  no_venta: handleNoVenta,
}

export default syncHandlers
