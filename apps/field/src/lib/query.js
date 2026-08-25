/**
 * query.js — capa fina sobre supabase para que NINGÚN error muera en silencio.
 *
 * EL PROBLEMA QUE RESUELVE (V8.2/V9.0):
 *   const { data } = await supabase.from('cartera').select('a,b,c')
 *   setCartera(data || [])
 *
 * Si una sola columna no existe, Supabase rechaza TODA la query con 400.
 * `data` queda undefined, cae al `|| []`, y la UI muestra "0 clientes"
 * como si fuera un resultado vacío legítimo. El vendedor no puede
 * distinguir "no hay compradores" de "la consulta nunca corrió".
 *
 * Había 27 consultas así en la app.
 *
 * REGLA: toda lectura devuelve { rows, error, ok }. `ok` es false SOLO si
 * hubo error real — un resultado vacío es ok:true con rows:[].
 */

/** Estado canónico de un bloque de datos. */
export const DATA_STATE = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  EMPTY: 'empty',
  ERROR: 'error',
})

/**
 * Traduce un error de PostgREST a algo que un vendedor pueda entender
 * y que un dev pueda depurar.
 */
export function explainError(error) {
  if (!error) return null
  const code = error.code || ''
  const msg = String(error.message || '')

  // 42703 = undefined_column · PGRST204 = column not found in schema cache
  if (code === '42703' || /column .* does not exist/i.test(msg)) {
    const col = msg.match(/column "?([\w.]+)"?/i)?.[1]
    return {
      kind: 'schema',
      user: 'Esta vista está desactualizada. Avisá a soporte.',
      dev: `Columna inexistente${col ? `: ${col}` : ''}. La vista cambió y el select no.`,
    }
  }
  // 42501 = insufficient_privilege · PGRST301 = JWT / RLS
  if (code === '42501' || code === 'PGRST301' || /permission denied|RLS|row-level/i.test(msg)) {
    return {
      kind: 'permission',
      user: 'No tenés acceso a estos datos. Cerrá sesión y volvé a entrar.',
      dev: 'RLS o JWT vencido. Revisar policy de la tabla.',
    }
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return {
      kind: 'network',
      user: 'Sin conexión. Los datos que ves pueden estar viejos.',
      dev: 'Fetch falló — offline o CORS.',
    }
  }
  return {
    kind: 'unknown',
    user: 'No se pudieron cargar los datos.',
    dev: msg || 'Error desconocido',
  }
}

/**
 * Ejecuta un query builder de supabase y devuelve un resultado explícito.
 *
 * @param {PromiseLike<{data:any,error:any}>} builder
 * @param {{ label?: string, fallback?: any[] }} [opts]
 * @returns {Promise<{ rows: any[], error: object|null, ok: boolean, state: string }>}
 */
export async function safeSelect(builder, opts = {}) {
  const { label = 'query', fallback = [] } = opts
  try {
    const { data, error } = await builder
    if (error) {
      const info = explainError(error)
      console.error(`[data:${label}] ${info.dev}`, error)
      return { rows: fallback, error: info, ok: false, state: DATA_STATE.ERROR }
    }
    const rows = Array.isArray(data) ? data : data ? [data] : []
    return {
      rows,
      error: null,
      ok: true,
      state: rows.length ? DATA_STATE.READY : DATA_STATE.EMPTY,
    }
  } catch (e) {
    const info = explainError(e)
    console.error(`[data:${label}] ${info.dev}`, e)
    return { rows: fallback, error: info, ok: false, state: DATA_STATE.ERROR }
  }
}

/**
 * Igual que safeSelect pero para una sola fila.
 * @returns {Promise<{ row: any|null, error: object|null, ok: boolean }>}
 */
export async function safeSingle(builder, opts = {}) {
  const r = await safeSelect(builder, opts)
  return { row: r.rows[0] ?? null, error: r.error, ok: r.ok }
}

/**
 * Corre varias lecturas en paralelo y reporta cuáles fallaron.
 * Un fallo NO tumba a las demás — cada bloque sabe su propio estado.
 *
 * @example
 *   const { stock, cartera, failed } = await safeAll({
 *     stock:   supabase.from('stock').select('*'),
 *     cartera: supabase.from('cartera').select('cliente_key'),
 *   })
 *   if (failed.includes('cartera')) // mostrar error SOLO en ese bloque
 */
export async function safeAll(map) {
  const keys = Object.keys(map)
  const results = await Promise.all(
    keys.map((k) => safeSelect(map[k], { label: k }))
  )
  const out = { failed: [], errors: {} }
  keys.forEach((k, i) => {
    out[k] = results[i].rows
    out[`${k}State`] = results[i].state
    if (!results[i].ok) {
      out.failed.push(k)
      out.errors[k] = results[i].error
    }
  })
  return out
}

/**
 * Reintenta con backoff. Para lecturas críticas del arranque.
 */
export async function safeSelectRetry(makeBuilder, opts = {}) {
  const { attempts = 3, baseDelay = 400 } = opts
  let last = null
  for (let i = 0; i < attempts; i++) {
    last = await safeSelect(makeBuilder(), opts)
    if (last.ok) return last
    // No reintentar errores de esquema o permisos: no se arreglan solos.
    if (last.error?.kind === 'schema' || last.error?.kind === 'permission') return last
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, i)))
    }
  }
  return last
}
