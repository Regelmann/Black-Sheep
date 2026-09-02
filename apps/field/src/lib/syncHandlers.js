/**
 * Handlers del outbox — SSoT para flush desde Hoy, SyncBanner y online event.
 * Tipos: checkin | completar | nota | pedido | no_venta
 */
import { supabase } from './supabase.js'

/** 23505 = unique_violation: ESTE MISMO op ya se insertó. Es éxito. */
function esDuplicadoIdempotente(error) {
  if (!error) return false
  return error.code === '23505' || /duplicate key|already exists/i.test(String(error.message || ''))
}

function opIdDe(item) {
  return item?.client_op_id || item?.id || item?.payload?.client_op_id || null
}

function esErrorDeEsquema(error) {
  return /column|schema cache|42703|PGRST204/i.test(String(error?.message || ''))
}

export async function handleCheckin(item) {
  const p = item.payload || {}
  const row = {
    // Llave de idempotencia: si el insert llegó pero la respuesta se
    // perdió, el reintento manda el MISMO id y el índice único lo
    // rechaza en vez de duplicar el check-in.
    client_op_id: item.client_op_id || item.id || null,
    visita_id: p.visita_id || null,
    cliente_key: p.cliente_key || null,
    ejecutivo_id: p.ejecutivo_id || null,
    hora_llegada: p.hora_llegada || new Date().toISOString(),
    lat_real: p.lat_real ?? p.lat ?? null,
    lng_real: p.lng_real ?? p.lng ?? null,
  }
  // Quitar nulls innecesarios si la tabla no tiene la columna
  // .select() fuerza que Postgres devuelva la fila insertada:
  // confirmación en el mismo viaje, sin una segunda consulta.
  const { data, error } = await supabase.from('checkins').insert(row).select('id')
  // 23505 = unique_violation. Significa que ESTE MISMO op ya se insertó
  // en un intento anterior cuya respuesta se perdió. Es éxito, no error:
  // el dato está en la base. Tratarlo como fallo dejaría el item en la
  // cola reintentando para siempre.
  if (esDuplicadoIdempotente(error)) {
    console.info('[sync:checkin] ya estaba guardado (idempotencia)')
    return { ok: true, yaExistia: true }
  }

  if (error) {
    // Reintento sin columnas opcionales SOLO si el fallo es de esquema.
    // Ante RLS/red hay que reintentar completo mas tarde, no mutilar la fila.
    const schemaIssue = esErrorDeEsquema(error)
    if (!schemaIssue) return { ok: false, error: error.message }
    console.warn('[sync:checkin] esquema reducido, se pierden cliente_key/ejecutivo_id', error)
    const { error: e2 } = await supabase.from('checkins').insert({
      visita_id: row.visita_id,
      hora_llegada: row.hora_llegada,
      lat_real: row.lat_real,
      lng_real: row.lng_real,
    })
    return e2 ? { ok: false, error: e2.message } : { ok: true, degraded: true }
  }
  return { ok: true }
}

export async function handleCompletar(item) {
  const p = item.payload || {}
  if (p.checkin_id && !String(p.checkin_id).startsWith('offline_')) {
    const { error } = await supabase
      .from('checkins')
      .update({
        hora_fin: p.hora_fin || new Date().toISOString(),
        resultado: p.resultado || null,
      })
      .eq('id', p.checkin_id)
    if (error) return { ok: false, error: error.message }
  }
  if (p.visita_id) {
    const { error } = await supabase
      .from('visitas').update({ estado: 'visitada' }).eq('id', p.visita_id)
    if (error) return { ok: false, error: error.message }
  }

  // Un cierre sin checkin_id ni visita_id no tiene nada que escribir,
  // pero tampoco es un fallo: el item sale de la cola.
  return { ok: true }
}

export async function handleNota(item) {
  const p = item.payload || {}
  if (!p || typeof p !== 'object' || !Object.keys(p).length) {
    console.error('[sync:nota] payload vacío — item corrupto, se descarta')
    return { ok: false, error: 'payload vacío', descartar: true }
  }
  // El id vive en el item, NO sólo en el payload. Antes se insertaba
  // el payload crudo: client_op_id iba NULL y el índice único de 27
  // no protegía. Un reintento duplicaba la nota.
  const row = { ...p, client_op_id: opIdDe(item) }
  const { error } = await supabase.from('notas_cliente').insert(row)
  if (esDuplicadoIdempotente(error)) {
    console.info('[sync:nota] ya estaba guardada (idempotencia)')
    return { ok: true, yaExistia: true }
  }
  if (error) {
    if (!esErrorDeEsquema(error) || !row.client_op_id) {
      return { ok: false, error: error.message }
    }
    const { client_op_id: _op, ...sinOp } = row
    const { error: e2 } = await supabase.from('notas_cliente').insert(sinOp)
    if (esDuplicadoIdempotente(e2)) return { ok: true, yaExistia: true }
    return e2 ? { ok: false, error: e2.message } : { ok: true, degraded: true }
  }
  return { ok: true }
}

export async function handlePedido(item) {
  const p = item.payload || {}

  // Un payload vacío NO es un éxito: es un item corrupto. Devolver
  // {ok:true} lo borraba de la cola como si se hubiera subido.
  if (!p || !Object.keys(p).length) {
    console.error('[sync:pedido] payload vacío — item corrupto, se descarta')
    return { ok: false, error: 'payload vacío', descartar: true }
  }

  const opId = opIdDe(item)

  if (p.table && p.row) {
    const row = { ...p.row, client_op_id: opId }
    const { data, error } = await supabase.from(p.table).insert(row).select('id')
    if (esDuplicadoIdempotente(error)) {
      console.info('[sync:pedido] ya estaba guardado (idempotencia)')
      return { ok: true, yaExistia: true }
    }
    if (error) return { ok: false, error: error.message }
    // DOBLE CHEQUEO: el insert "sin error" no basta. Si no volvió id,
    // no hay confirmación de que la fila exista.
    if (!data || !data.length) {
      return { ok: false, error: 'el insert no devolvió fila — sin confirmar' }
    }
    return { ok: true, id: data[0].id }
  }
  // Insert directo (nunca reencolar desde acá: lo maneja flushActionQueue).
  const row = {
    ejecutivo_id: p.ejecutivoId || p.ejecutivo_id,
    cliente_key: p.clienteKey || p.cliente_key || null,
    nombre_cliente: p.nombreCliente || p.nombre_cliente || null,
    lineas: p.lineas || [],
    nota: p.nota || null,
    estado: p.estado || 'borrador',
    fuente: p.fuente || 'field_app_offline',
    creado_en: p.creado_en || item.enqueuedAt || new Date().toISOString(),
    client_op_id: opId,
  }
  try {
    row.total_estimado = (p.lineas || []).reduce(
      (a, l) => a + (Number(l.precio) || 0) * (Number(l.cantidad) || 0),
      0
    )
  } catch (_) { void _ }
  const { error } = await supabase.from('pedidos').insert(row)
  if (esDuplicadoIdempotente(error)) {
    console.info('[sync:pedido] ya estaba guardado (idempotencia)')
    return { ok: true, yaExistia: true }
  }
  if (error) {
    const minimal = {
      ejecutivo_id: row.ejecutivo_id,
      cliente_key: row.cliente_key,
      nombre_cliente: row.nombre_cliente,
      lineas: row.lineas,
      nota: row.nota,
      estado: row.estado,
      fuente: row.fuente,
    }
    const r2 = await supabase.from('pedidos').insert(minimal)
    if (esDuplicadoIdempotente(r2.error)) return { ok: true, yaExistia: true }
    return r2.error ? { ok: false, error: r2.error.message } : { ok: true, degraded: true }
  }
  return { ok: true }
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
      cliente_key: p.cliente_key,
      texto: p.nota,
      tipo: 'no_venta',
      client_op_id: opIdDe(item),
    })
    if (esDuplicadoIdempotente(error)) {
      return { ok: true, yaExistia: true }
    }
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
