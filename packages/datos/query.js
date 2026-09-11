/**
 * Capa fina sobre supabase para que NINGÚN error muera en silencio.
 *
 * EL PROBLEMA QUE RESUELVE (heredado de la 15.x, y sigue vigente):
 *   const { data } = await supabase.from('cartera').select('a,b,c')
 *   setCartera(data || [])
 *
 * Si una columna no existe, PostgREST rechaza TODA la consulta con 400.
 * `data` queda undefined, cae al `|| []`, y la pantalla muestra
 * "0 clientes" como si fuera un resultado vacío legítimo. Nadie puede
 * distinguir "no hay nada" de "la consulta nunca corrió".
 *
 * REGLA: toda lectura devuelve { rows, error, ok }. `ok` es false SOLO
 * si hubo error real; un resultado vacío es ok:true con rows:[].
 */
export const DATA_STATE = Object.freeze({
  LOADING: 'loading', READY: 'ready', EMPTY: 'empty', ERROR: 'error',
})

/** Traduce un error de PostgREST a algo que el usuario entienda y el dev pueda depurar. */
export function explicarError(error) {
  // NUNCA devolver null: quien llama lee .user y .dev, y un null acá se
  // convierte en un TypeError que tapa el error original.
  if (!error) {
    return { tipo: 'desconocido', code: '', user: 'No se pudieron cargar los datos.', dev: 'Error sin detalle' }
  }
  const code = error.code || ''
  const msg = String(error.message || '')

  if (code === '42703' || /column .* does not exist/i.test(msg)) {
    const col = msg.match(/column "?([\w.]+)"?/i)?.[1]
    return {
      tipo: 'esquema', code,
      user: 'Esta vista quedó desactualizada. Avisa a soporte.',
      dev: `Columna inexistente${col ? `: ${col}` : ''}. La vista cambió y el select no.`,
    }
  }
  if (code === '42501' || code === 'PGRST301' || /permission denied|row-level/i.test(msg)) {
    return {
      tipo: 'permiso', code,
      user: 'No tienes acceso a estos datos. Cierra sesión y vuelve a entrar.',
      dev: 'RLS o JWT vencido. Revisar la política de la tabla.',
    }
  }
  if (code === '55P03') {
    return { tipo: 'ocupado', code, user: 'Hay otra carga en curso. Espera a que termine.', dev: 'advisory lock tomado' }
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return { tipo: 'red', code, user: 'Sin conexión. Lo que ves puede estar viejo.', dev: 'fetch falló' }
  }
  return { tipo: 'desconocido', code, user: 'No se pudieron cargar los datos.', dev: msg || 'error desconocido' }
}

export async function safeSelect(builder, { label = 'consulta', fallback = [] } = {}) {
  try {
    const { data, error } = await builder
    if (error) {
      console.error(`[datos:${label}]`, error)
      return { ok: false, rows: fallback, error: explicarError(error) }
    }
    return { ok: true, rows: data ?? fallback, error: null }
  } catch (e) {
    console.error(`[datos:${label}]`, e)
    return { ok: false, rows: fallback, error: explicarError(e) }
  }
}

/** Igual que safeSelect pero para RPC: devuelve { ok, data, error }. */
export async function safeRpc(nombre, args = {}) {
  try {
    const { data, error } = await supabaseRef.rpc(nombre, args)
    if (error) {
      console.error(`[rpc:${nombre}]`, error)
      return { ok: false, data: null, error: explicarError(error) }
    }
    return { ok: true, data, error: null }
  } catch (e) {
    console.error(`[rpc:${nombre}]`, e)
    return { ok: false, data: null, error: explicarError(e) }
  }
}

// Import diferido para no crear un ciclo entre supabase.js y query.js.
import { supabase as supabaseRef } from './supabase.js'
