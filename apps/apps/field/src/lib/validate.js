/**
 * validate.js — doble chequeo en toda operación que escribe.
 *
 * EL PRINCIPIO
 * ------------
 * Una escritura no está confirmada porque el servidor no devolvió error.
 * Está confirmada cuando la volvés a leer y está.
 *
 * Ya nos pasó dos veces:
 *   · El outbox borraba items de la cola ante `{ok:false}` porque un
 *     objeto es truthy. La app decía "sincronizado" y la fila no existía.
 *   · Admin caía al INSERT cuando el SELECT previo fallaba, y creaba una
 *     meta duplicada en vez de actualizarla.
 *
 * En los dos casos el servidor "no dio error" y el dato estaba mal.
 *
 * EL PATRÓN
 *   1. ANTES  — validar el payload. Si está mal, ni se intenta.
 *   2. ESCRIBIR
 *   3. DESPUÉS — releer y confirmar que quedó. Si no quedó, se reporta
 *                como fallo aunque la escritura "haya salido bien".
 *
 * El paso 3 es el que falta en casi todos los sistemas y el que evita
 * la clase de bug más cara: la pérdida silenciosa.
 */

/* ============================================================
   1 · VALIDACIÓN PREVIA
   ============================================================ */

/** Resultado uniforme de validación. */
export function ok(valor) { return { valido: true, valor, errores: [] } }
export function mal(...errores) { return { valido: false, valor: null, errores: errores.flat() } }

const esVacio = (v) => v === null || v === undefined || String(v).trim() === ''

/**
 * Valida un objeto contra un esquema simple y declarativo.
 *
 * @example
 *   const v = validar(payload, {
 *     cliente_key: { req: true, tipo: 'string' },
 *     cantidad:    { req: true, tipo: 'number', min: 0.01 },
 *     nota:        { max: 500 },
 *   })
 *   if (!v.valido) return { ok: false, error: v.errores.join('; ') }
 */
export function validar(obj, esquema) {
  const errores = []
  const salida = {}

  for (const [campo, regla] of Object.entries(esquema)) {
    const v = obj?.[campo]

    if (regla.req && esVacio(v)) {
      errores.push(`falta "${campo}"`)
      continue
    }
    if (esVacio(v)) {
      if (regla.def !== undefined) salida[campo] = regla.def
      continue
    }

    if (regla.tipo === 'number') {
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
      if (isNaN(n)) { errores.push(`"${campo}" no es número: ${v}`); continue }
      if (regla.min != null && n < regla.min) { errores.push(`"${campo}" < ${regla.min}`); continue }
      if (regla.max != null && n > regla.max) { errores.push(`"${campo}" > ${regla.max}`); continue }
      salida[campo] = n
      continue
    }

    if (regla.tipo === 'string' || regla.max || regla.min) {
      const s = String(v).trim()
      if (regla.min != null && s.length < regla.min) { errores.push(`"${campo}" muy corto`); continue }
      if (regla.max != null && s.length > regla.max) { errores.push(`"${campo}" muy largo`); continue }
      if (regla.en && !regla.en.includes(s)) {
        errores.push(`"${campo}" inválido: ${s}`); continue
      }
      salida[campo] = s
      continue
    }

    if (regla.tipo === 'array') {
      if (!Array.isArray(v)) { errores.push(`"${campo}" debe ser lista`); continue }
      if (regla.min != null && v.length < regla.min) { errores.push(`"${campo}" vacío`); continue }
      salida[campo] = v
      continue
    }

    salida[campo] = v
  }

  return errores.length ? mal(errores) : ok(salida)
}

/* ============================================================
   2 · CONFIRMACIÓN POSTERIOR
   ============================================================ */

/**
 * Escribe y CONFIRMA leyendo de vuelta.
 *
 * @param {object} cfg
 * @param {() => Promise<any>} cfg.escribir     hace el insert/update
 * @param {() => Promise<any>} cfg.confirmar    relee; debe devolver la fila
 * @param {(fila:any)=>boolean} [cfg.esperado]  valida que la fila sea la correcta
 * @param {string} [cfg.etiqueta]
 * @param {number} [cfg.esperaMs]  pausa antes de releer (replicación)
 *
 * @returns {Promise<{ok:boolean, fila?:any, error?:string, confirmado:boolean}>}
 */
export async function escribirYConfirmar(cfg) {
  const {
    escribir,
    confirmar,
    esperado,
    etiqueta = 'escritura',
    esperaMs = 0,
  } = cfg

  // ---- Paso 1: escribir
  let resEscritura
  try {
    resEscritura = await escribir()
  } catch (e) {
    return { ok: false, confirmado: false, error: `no se pudo escribir: ${e?.message || e}` }
  }
  if (resEscritura?.error) {
    return { ok: false, confirmado: false, error: resEscritura.error.message || String(resEscritura.error) }
  }

  // ---- Paso 2: confirmar
  if (!confirmar) {
    // Sin verificador no se puede afirmar que quedó. Se dice explícito.
    return { ok: true, confirmado: false, fila: resEscritura?.data ?? null }
  }

  if (esperaMs > 0) await new Promise((r) => setTimeout(r, esperaMs))

  let fila = null
  try {
    const c = await confirmar()
    if (c?.error) throw new Error(c.error.message || String(c.error))
    fila = Array.isArray(c?.data) ? c.data[0] : (c?.data ?? c)
  } catch (e) {
    console.error(`[verify:${etiqueta}] no se pudo confirmar`, e)
    // Escribió pero no se pudo verificar. NO es un éxito limpio.
    return {
      ok: false,
      confirmado: false,
      error: 'Se envió, pero no pudimos confirmar que quedó guardado. Revisá antes de repetir.',
    }
  }

  if (!fila) {
    console.error(`[verify:${etiqueta}] la escritura "salió bien" pero la fila NO existe`)
    return {
      ok: false,
      confirmado: false,
      error: 'No quedó guardado. Intentá de nuevo.',
    }
  }

  if (esperado && !esperado(fila)) {
    console.error(`[verify:${etiqueta}] la fila existe pero no coincide`, fila)
    return {
      ok: false,
      confirmado: false,
      fila,
      error: 'Quedó guardado con datos distintos a los enviados.',
    }
  }

  return { ok: true, confirmado: true, fila }
}

/**
 * Upsert seguro: NUNCA adivina si existe.
 *
 * El bug que evita: en Admin, `const { data: existing } = await select(...)`
 * dejaba `existing` en undefined cuando el SELECT fallaba, y el flujo caía
 * al INSERT → meta DUPLICADA en vez de actualizada.
 *
 * Acá, si la verificación de existencia falla, se ABORTA. No se adivina.
 */
export async function upsertSeguro({ buscar, insertar, actualizar, confirmar, etiqueta = 'upsert' }) {
  let existe = null
  try {
    const r = await buscar()
    if (r?.error) throw new Error(r.error.message || String(r.error))
    existe = Array.isArray(r?.data) ? r.data[0] : (r?.data ?? null)
  } catch (e) {
    // Clave: ante duda NO se inserta. Duplicar es peor que fallar.
    return {
      ok: false,
      confirmado: false,
      error: `No se pudo verificar si el registro ya existe: ${e?.message || e}. ` +
             `Se abortó para no duplicar.`,
    }
  }

  return escribirYConfirmar({
    escribir: () => (existe ? actualizar(existe) : insertar()),
    confirmar,
    etiqueta: `${etiqueta}:${existe ? 'update' : 'insert'}`,
  })
}

/* ============================================================
   3 · ESQUEMAS DE LAS OPERACIONES CRÍTICAS
   ============================================================ */

export const ESQUEMA_CHECKIN = {
  visita_id:    { req: true, tipo: 'string' },
  hora_llegada: { req: true, tipo: 'string' },
  lat_real:     { tipo: 'number', min: -90,  max: 90 },
  lng_real:     { tipo: 'number', min: -180, max: 180 },
}

export const ESQUEMA_PEDIDO = {
  cliente_key: { req: true, tipo: 'string' },
  lineas:      { req: true, tipo: 'array', min: 1 },
  nota:        { max: 1000 },
}

export const ESQUEMA_LINEA = {
  sku_canon: { req: true, tipo: 'string' },
  cantidad:  { req: true, tipo: 'number', min: 0.01, max: 100000 },
  precio:    { tipo: 'number', min: 0, def: 0 },
}

export const ESQUEMA_NOTA = {
  cliente_key: { req: true, tipo: 'string' },
  texto:       { req: true, tipo: 'string', min: 1, max: 2000 },
  tipo:        { tipo: 'string', def: 'otro' },
}

/** Valida un pedido completo, líneas incluidas. */
export function validarPedido(p) {
  const base = validar(p, ESQUEMA_PEDIDO)
  if (!base.valido) return base

  const errores = []
  const lineas = []
  p.lineas.forEach((l, i) => {
    const v = validar(l, ESQUEMA_LINEA)
    if (!v.valido) errores.push(`línea ${i + 1}: ${v.errores.join(', ')}`)
    else lineas.push(v.valor)
  })

  if (errores.length) return mal(errores)
  if (!lineas.length) return mal('el pedido no tiene líneas válidas')
  return ok({ ...base.valor, lineas })
}
