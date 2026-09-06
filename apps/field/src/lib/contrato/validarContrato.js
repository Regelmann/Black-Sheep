/**
 * VALIDADOR DE CONTRATO — la barrera de ingesta.
 *
 * POR QUÉ EXISTE
 * La práctica establecida es tratar los archivos del cliente como APIs:
 * contrato versionado, y validación **en el borde**. Un archivo que no
 * cumple se rechaza con el motivo, no se carga a medias.
 *
 * Eso es lo que faltaba. Hasta ahora un Excel con la columna mal escrita
 * subía igual, el ciclo lo leía como NULL, y el error aparecía tres
 * pantallas después como "cliente sin zona" o "producto sin precio" —
 * con la causa a diez capas de distancia.
 *
 * LAS TRES CAPAS, en orden de costo:
 *   1. ESQUEMA   → ¿están las columnas obligatorias?
 *   2. TIPOS     → ¿los números son números, las fechas son fechas?
 *   3. NEGOCIO   → ¿los SKU cruzan? ¿las zonas existen?
 *
 * Se corta en la primera que falla: no tiene sentido validar tipos de
 * una columna que no está.
 *
 * NO USA `SELECT *`. Las columnas se declaran en el contrato, así una
 * columna nueva del cliente no rompe nada y una que falta sale como
 * error claro.
 */
// El contrato entra como import normal de JSON.
//
// Se probaron dos alternativas y las dos fallaron, cada una en una capa
// distinta — vale dejarlo escrito:
//
//   `import ... with { type: 'json' }`  → ESLint 9 no parsea la sintaxis
//   `createRequire('node:module')`      → es de Node: el build de Vite
//                                          lo externaliza y explota en
//                                          el navegador
//
// Vite resuelve el import directo de JSON sin ayuda, y Node también
// desde la versión 22. Es lo que funciona en los dos lados.
import CONTRATO from '../../../../../contracts/archivos.v2.json'

export const VERSION_CONTRATO = CONTRATO.version

/** Normaliza un encabezado para comparar: sin tildes, sin espacios. */
export function normalizarEncabezado(h) {
  return String(h || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .trim()
}

/**
 * Busca qué columna del archivo corresponde a un campo del contrato.
 * Devuelve el nombre REAL de la columna, o null.
 */
export function resolverColumna(campo, def, encabezados) {
  const mapa = new Map(encabezados.map((h) => [normalizarEncabezado(h), h]))
  // El nombre canónico primero, después los alias en orden.
  for (const cand of [campo, ...(def.alias || [])]) {
    const hit = mapa.get(normalizarEncabezado(cand))
    if (hit) return hit
  }
  return null
}

/** ¿Este campo es obligatorio, y de qué forma? */
function esObligatorio(def) {
  if (def.obligatorio === true) return 'siempre'
  if (typeof def.obligatorio === 'string' && def.obligatorio.startsWith('uno_de:')) {
    return def.obligatorio.slice(7).split(',')
  }
  return false
}

/**
 * CAPA 1 · ESQUEMA — ¿están las columnas que hacen falta?
 *
 * @param {string} tipo        'precios' | 'stock' | 'maestra' | 'ventas'
 * @param {string[]} encabezados  la primera fila del archivo
 */
export function validarEsquema(tipo, encabezados) {
  const spec = CONTRATO.archivos[tipo]
  if (!spec) {
    return { ok: false, errores: [`Tipo de archivo desconocido: ${tipo}`] }
  }

  const errores = []
  const avisos = []
  const mapeo = {}
  const gruposUnoDe = new Map()

  for (const [campo, def] of Object.entries(spec.campos)) {
    const col = resolverColumna(campo, def, encabezados)
    if (col) mapeo[campo] = col

    const obl = esObligatorio(def)

    if (obl === 'siempre' && !col) {
      errores.push(
        `Falta la columna obligatoria "${campo}". ` +
        `Se acepta con cualquiera de estos nombres: ${[campo, ...(def.alias || [])].join(', ')}`
      )
    }

    // "uno_de": al menos una del grupo tiene que estar
    if (Array.isArray(obl)) {
      const clave = obl.join('|')
      if (!gruposUnoDe.has(clave)) gruposUnoDe.set(clave, { campos: obl, hallado: false })
      if (col) gruposUnoDe.get(clave).hallado = true
    }

    // Las opcionales que faltan se avisan, no bloquean — pero se dice
    // QUÉ se pierde, para que el cliente pueda decidir.
    if (!obl && !col && def.descripcion) {
      avisos.push(`Sin "${campo}": ${def.descripcion}`)
    }
  }

  for (const g of gruposUnoDe.values()) {
    if (!g.hallado) {
      errores.push(`Falta al menos una de estas columnas: ${g.campos.join(' o ')}`)
    }
  }

  // Columnas del archivo que el contrato no conoce. NO son error: el
  // cliente puede traer lo que quiera. Se informan para detectar un
  // nombre mal escrito que iba a ser una obligatoria.
  const conocidas = new Set(Object.values(mapeo).map(normalizarEncabezado))
  const extra = encabezados.filter((h) => h && !conocidas.has(normalizarEncabezado(h)))

  return {
    ok: errores.length === 0,
    errores,
    avisos,
    mapeo,
    extra,
    version: CONTRATO.version,
  }
}

/**
 * CAPA 2 · TIPOS — sobre una muestra, no sobre el archivo entero.
 *
 * Validar 500.000 filas en el navegador congela la pestaña. Con 200
 * filas alcanza para detectar una columna de texto donde debería haber
 * números, que es el error real.
 */
export function validarTipos(tipo, filas, mapeo, muestra = 200) {
  const spec = CONTRATO.archivos[tipo]
  const errores = []
  const lote = filas.slice(0, muestra)
  if (!lote.length) return { ok: true, errores: [] }

  for (const [campo, def] of Object.entries(spec.campos)) {
    const col = mapeo[campo]
    if (!col) continue

    let malos = 0
    let ejemplo = null

    for (const f of lote) {
      const v = f[col]
      if (v === null || v === undefined || v === '') continue

      if (def.tipo === 'numero') {
        // Acepta formato chileno: 1.234,56
        const n = Number(String(v).replace(/\./g, '').replace(',', '.'))
        if (!Number.isFinite(n)) { malos++; ejemplo ??= v }
      } else if (def.tipo === 'fecha') {
        const d = new Date(v)
        if (isNaN(d.getTime())) { malos++; ejemplo ??= v }
        else if (def.validacion?.no_futura && d > new Date()) {
          errores.push(`"${col}": hay fechas futuras (${v}). ¿El formato es día/mes o mes/día?`)
          break
        }
      }
    }

    if (malos > 0) {
      const pct = Math.round((malos / lote.length) * 100)
      errores.push(
        `"${col}" debería ser ${def.tipo} pero ${malos} de ${lote.length} filas ` +
        `no lo son (${pct}%). Ejemplo: "${ejemplo}"`
      )
    }
  }

  return { ok: errores.length === 0, errores }
}

/**
 * CAPA 3 · NEGOCIO — lo que sólo se puede saber cruzando.
 *
 * Estas NO bloquean la carga: informan. Un SKU de venta que no está en
 * la lista de precios es un dato real —se vendió— aunque el catálogo no
 * lo tenga.
 */
export function validarNegocio(tipo, filas, mapeo, contexto = {}) {
  const avisos = []
  const col = (c) => mapeo[c]

  if (tipo === 'ventas' && contexto.skusConocidos) {
    const sc = col('sku')
    if (sc) {
      const huerfanos = new Set()
      for (const f of filas) {
        const s = String(f[sc] || '').trim()
        if (s && !contexto.skusConocidos.has(s)) huerfanos.add(s)
      }
      if (huerfanos.size) {
        avisos.push(
          `${huerfanos.size} SKU vendidos que no están en la lista de precios. ` +
          `Se cargan igual —la venta ocurrió— pero no van a aparecer en el catálogo.`
        )
      }
    }
  }

  if (tipo === 'maestra' && contexto.zonasConocidas) {
    const zc = col('zona')
    if (zc) {
      const nuevas = new Set()
      for (const f of filas) {
        const z = String(f[zc] || '').trim().toUpperCase()
        if (z && !contexto.zonasConocidas.has(z)) nuevas.add(z)
      }
      if (nuevas.size) {
        avisos.push(
          `Zonas que no existen todavía: ${[...nuevas].slice(0, 5).join(', ')}` +
          `${nuevas.size > 5 ? ` y ${nuevas.size - 5} más` : ''}. ` +
          `Creálas en Dashboard → Zonas antes de correr el ciclo.`
        )
      }
    }
  }

  if (tipo === 'ventas') {
    const dc = col('documento')
    if (!dc) {
      avisos.push(
        'Sin columna de documento no hay idempotencia: si volvés a subir ' +
        'este archivo, las ventas se duplican.'
      )
    }
  }

  return { ok: true, avisos }
}

/**
 * Las tres capas, en orden. Corta en la primera que falla.
 */
export function validarArchivo(tipo, encabezados, filas, contexto = {}) {
  const esq = validarEsquema(tipo, encabezados)
  if (!esq.ok) return { ...esq, capa: 'esquema' }

  const tip = validarTipos(tipo, filas, esq.mapeo)
  if (!tip.ok) {
    return { ok: false, capa: 'tipos', errores: tip.errores, avisos: esq.avisos, mapeo: esq.mapeo }
  }

  const neg = validarNegocio(tipo, filas, esq.mapeo, contexto)

  return {
    ok: true,
    capa: 'completa',
    errores: [],
    avisos: [...esq.avisos, ...neg.avisos],
    mapeo: esq.mapeo,
    extra: esq.extra,
    version: esq.version,
    filas: filas.length,
  }
}

/** Lo mínimo que hay que pedirle a un cliente nuevo. */
export function columnasMinimas() {
  return CONTRATO.minimo_para_arrancar
}

export { CONTRATO }
