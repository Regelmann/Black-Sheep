/**
 * Una sola puerta para notas de terreno.
 *
 * EL BUG QUE CIERRA
 * NotaRapidaMap, NotaModal, Visita y Cartera insertaban directo en
 * `notas_cliente`. Sin señal el insert fallaba, la UI decía "Guardada"
 * (o no decía nada) y la nota se perdía. Tampoco llevaban client_op_id,
 * así que un reintento del outbox duplicaba la fila.
 *
 * Contrato: { ok, encolado?, error? }. `ok:true` sólo si quedó en la
 * base O en la cola. Nunca "guardada" si no hay rastro.
 */
import { supabase } from './supabase.js'
import { enqueueAction, isProbablyOffline, nuevoOpId } from './offline.js'
import { esFalloDeRed } from './erroresUsuario.js'

/**
 * @param {{ ejecutivoId?: string, cliente?: any, tipo?: string, texto?: string, extra?: object, clientOpId?: string }} opts
 */
export function armarFilaNota(opts = {}) {
  const c = opts.cliente || {}
  return {
    ejecutivo_id: opts.ejecutivoId || null,
    cliente_key: c.cliente_key || c.punto_id_bq || null,
    nombre_local: c.nombre_cliente || c.nombre_local || c.razon_social || null,
    tipo: opts.tipo || 'otro',
    texto: String(opts.texto || '').trim(),
    client_op_id: opts.clientOpId || null,
    ...(opts.extra || {}),
  }
}

/**
 * @param {{ ejecutivoId?: string, cliente?: any, tipo?: string, texto?: string, extra?: object }} opts
 * @returns {Promise<{ ok: boolean, encolado?: boolean, yaExistia?: boolean, client_op_id?: string, error?: any }>}
 */
export async function guardarNotaTerreno(opts = {}) {
  const opId = opts.clientOpId || nuevoOpId()
  const row = armarFilaNota({ ...opts, clientOpId: opId })

  if (!row.texto && row.tipo === 'otro') {
    return { ok: false, error: { message: 'La nota está vacía' } }
  }

  const encolar = () => {
    enqueueAction({ type: 'nota', payload: row, client_op_id: opId })
    return { ok: true, encolado: true, client_op_id: opId }
  }

  if (isProbablyOffline()) return encolar()

  const { error } = await supabase.from('notas_cliente').insert(row)
  if (!error) return { ok: true, encolado: false, client_op_id: opId }
  if (error.code === '23505' || /duplicate key/i.test(String(error.message || ''))) {
    return { ok: true, yaExistia: true, client_op_id: opId }
  }
  // Red o columna que todavía no existe (27 no corrido): la nota no
  // se puede perder. El handler del outbox reintenta degradado.
  if (esFalloDeRed(error) || /column|schema cache|42703|PGRST204/i.test(String(error.message || ''))) {
    return encolar()
  }
  // Permiso: reintentar 8 veces no lo arregla.
  if (/permission|42501|row-level|not authorized|jwt/i.test(String(error.message || ''))) {
    return { ok: false, error }
  }
  return encolar()
}
