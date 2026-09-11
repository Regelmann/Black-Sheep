/**
 * Sincronización de la cola de terreno contra la App 2.0.
 *
 * DIFERENCIA CON LA 15.3
 * Allá cada handler hacía un `insert` directo a una tabla y la
 * idempotencia dependía de que el cliente no reintentara. Acá cada
 * operación llama a una función de `api` con su `client_op_id`, y el
 * servidor resuelve con ON CONFLICT DO NOTHING (D-13).
 *
 * Consecuencia práctica: reintentar es SEGURO. El vendedor puede tocar
 * "Reintentar" diez veces y se registra UN pedido. Sin esa garantía el
 * vendedor no se atreve y vuelve al cuaderno.
 *
 * La mecánica de la cola (respaldo exponencial, agotados, escritura
 * durable en IndexedDB) se hereda de la 15.3 sin tocar: está probada en
 * producción y es el código más crítico del producto.
 */
import { llamar } from '../../../../packages/datos/rpc.js'
import { enqueueAction, flushActionQueue, loadActionQueue } from './offline.js'

/**
 * Errores que NO se reintentan. Reintentar no los arregla y consumen
 * batería: un permiso denegado no aparece por insistir. Se descartan
 * para que no bloqueen la cola detrás suyo.
 */
const DEFINITIVOS = ['42501', '0A000', '22023', 'P0002']

/** Envuelve una llamada para cumplir el contrato de flushActionQueue. */
function handler(fn) {
  return async (item) => {
    try {
      await fn(item.payload || {}, item.client_op_id)
      return { ok: true }
    } catch (e) {
      if (DEFINITIVOS.includes(e.code)) {
        return { descartar: true, error: e.message }
      }
      return { ok: false, error: e.message }
    }
  }
}

export const manejadores = {
  checkin: handler((p, opId) => llamar('registrar_checkin', {
    p_client_op_id: opId, p_cliente_key: p.cliente_key,
    p_lat: p.lat ?? null, p_lng: p.lng ?? null,
    p_precision_m: p.precision_m ?? null, p_visita_id: p.visita_id ?? null,
  })),
  visita: handler((p, opId) => llamar('registrar_visita', {
    p_client_op_id: opId, p_cliente_key: p.cliente_key,
    p_estado: p.estado || 'visitada', p_resultado: p.resultado ?? null,
  })),
  nota: handler((p, opId) => llamar('registrar_nota', {
    p_client_op_id: opId, p_cliente_key: p.cliente_key, p_texto: p.texto,
  })),
  pedido: handler((p, opId) => llamar('crear_pedido', {
    p_client_op_id: opId, p_cliente_key: p.cliente_key,
    p_lineas: p.lineas, p_nota: p.nota ?? null,
  })),
  prospecto: handler((p) => llamar('guardar_prospecto', {
    p_cliente_key: p.cliente_key, p_nombre: p.nombre, p_ejecutivo: p.ejecutivo,
    p_comuna: p.comuna ?? null, p_lat: p.lat ?? null, p_lng: p.lng ?? null,
  })),
}

/** Encola una acción de terreno. Devuelve el item con su client_op_id. */
export const registrar = (type, payload) => enqueueAction({ type, payload })

export async function sincronizar() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: 0, fail: 0, remaining: loadActionQueue().length, sinRed: true }
  }
  return flushActionQueue(manejadores)
}

/** Reintento automático: al volver la red y cada minuto. */
export function iniciarSincronizacion(alCambiar) {
  const correr = () => sincronizar().then(alCambiar).catch(() => {})
  window.addEventListener('online', correr)
  const t = setInterval(correr, 60_000)
  correr()
  return () => { window.removeEventListener('online', correr); clearInterval(t) }
}
