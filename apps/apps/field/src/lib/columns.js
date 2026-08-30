/**
 * columns.js — el front deja de romperse cuando la vista cambia.
 *
 * EL PROBLEMA
 * -----------
 * PostgREST rechaza la consulta ENTERA si UNA columna del select no
 * existe. No devuelve las que sí existen: devuelve 400 y nada.
 *
 *   .select('a,b,c,columna_que_ya_no_existe')  →  400, cero filas
 *
 * Como el ETL evoluciona (se renombran columnas, se agregan campos,
 * cambia una vista), cada cambio de la bajada puede tumbar una pantalla
 * completa del teléfono. Eso es exactamente lo que pasa hoy en Stock
 * ("no pude leer tu cartera") y en Gerencia ("no cargó stock · notas").
 *
 * LA SOLUCIÓN
 * -----------
 * El mismo patrón que ya usa KEYFOODS_CICLO_UNICO.py con pick_col():
 * no asumir el nombre exacto — resolverlo contra lo que la fila trae.
 *
 *   1. Se pide `*` en vez de una lista rígida.
 *   2. Los campos se leen con pick(), que acepta varios alias.
 *   3. Si falta un campo, se degrada con un valor por defecto y se
 *      registra UNA vez, en vez de tumbar la pantalla.
 *
 * Costo: `*` trae más columnas de las necesarias. A cambio, un cambio
 * de esquema pasa de "pantalla muerta" a "un dato menos".
 */

const yaAvisado = new Set()

/**
 * Lee un campo probando varios nombres posibles.
 *
 * @param {object} row
 * @param {string[]} alias  nombres candidatos, del más probable al menos
 * @param {*} porDefecto
 *
 * @example
 *   pick(r, ['venta_mtd', 'venta_mtd_clp', 'venta_mes'], 0)
 */
export function pick(row, alias, porDefecto = null) {
  if (!row) return porDefecto
  for (const k of alias) {
    const v = row[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return porDefecto
}

/** pick() forzando número. Los numéricos de PostgREST llegan como string. */
export function pickNum(row, alias, porDefecto = 0) {
  const v = pick(row, alias, null)
  if (v === null) return porDefecto
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? porDefecto : n
}

/** pick() forzando texto limpio. */
export function pickStr(row, alias, porDefecto = '') {
  const v = pick(row, alias, null)
  return v === null ? porDefecto : String(v).trim()
}

/** pick() forzando booleano, tolerando 'true' / 't' / 1 / 'SI'. */
export function pickBool(row, alias, porDefecto = false) {
  const v = pick(row, alias, null)
  if (v === null) return porDefecto
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  return s === 'true' || s === 't' || s === '1' || s === 'si' || s === 'sí'
}

/**
 * Avisa UNA sola vez por campo faltante. Sin esto, una lista de 2000
 * filas genera 2000 líneas idénticas en consola y tapa el error real.
 */
export function avisarFaltante(contexto, campo, alias) {
  const k = `${contexto}:${campo}`
  if (yaAvisado.has(k)) return
  yaAvisado.add(k)
  console.warn(
    `[schema:${contexto}] no encontré "${campo}". Probé: ${alias.join(', ')}. ` +
    `Se usa el valor por defecto — la vista pudo haber cambiado.`
  )
}

/**
 * Diagnóstico: qué columnas trae realmente una tabla.
 * Sirve para saber qué existe sin abrir Supabase.
 *
 * @example
 *   console.table(columnasReales(filas, 'cartera'))
 */
export function columnasReales(filas, etiqueta = '') {
  if (!filas?.length) return []
  const cols = Object.keys(filas[0]).sort()
  if (etiqueta) console.info(`[schema:${etiqueta}] ${cols.length} columnas:`, cols.join(', '))
  return cols
}

/**
 * Compara lo que el código espera contra lo que la vista trae.
 * Devuelve los alias que NO existen en ninguna variante.
 */
export function faltantes(filas, mapaAlias) {
  if (!filas?.length) return []
  const set = new Set(Object.keys(filas[0]))
  return Object.entries(mapaAlias)
    .filter(([, alias]) => !alias.some((a) => set.has(a)))
    .map(([campo]) => campo)
}

/* ============================================================
   MAPAS DE ALIAS
   Fuente única: si el ETL renombra algo, se agrega el alias ACÁ
   y toda la app lo toma. No hay que buscar por las páginas.
   ============================================================ */

export const CARTERA = {
  clienteKey:     ['cliente_key', 'clientekey', 'rut_normalizado', 'rut'],
  nombre:         ['nombre_cliente', 'razon_social', 'nombre_local', 'nombre'],
  comuna:         ['comuna', 'comuna_cliente'],
  ventaMtd:       ['venta_mtd', 'venta_mtd_clp', 'venta_mes', 'venta_mtd_oficial_clp'],
  ventaMensual:   ['venta_mensual', 'promedio_mensual', 'prom_mensual_clp'],
  skuDetalle:     ['sku_detalle', 'skus_detalle', 'detalle_sku'],
  diasSinComprar: ['dias_sin_comprar', 'dias_sin_compra', 'dias_ultima_compra'],
  cicloDias:      ['ciclo_dias', 'ciclo', 'ciclo_promedio_dias'],
  estadoFuga:     ['estado_fuga', 'estado', 'salud'],
  bloqueado:      ['es_bloqueado', 'bloqueado', 'cliente_bloqueado'],
  productosTop:   ['productos_top', 'top_productos', 'productos'],
  ejecutivoId:    ['ejecutivo_id', 'ejecutivo', 'ejecutivo_asignacion'],
  zona:           ['zona_comercial_asignacion', 'zona', 'zona_comercial'],
  ultimaCompra:   ['ultima_compra', 'fecha_ultima_compra', 'ult_venta'],
}

export const STOCK = {
  sku:            ['sku_canon', 'sku', 'sku_producto', 'codigo'],
  nombre:         ['producto_nombre', 'nombre_producto', 'descripcion', 'producto'],
  precioUnidad:   ['precio_unidad', 'precio_lista', 'precio', 'precio_un'],
  precioCaja:     ['precio_caja', 'precio_cja'],
  precioKilo:     ['precio_kilo', 'precio_kg'],
  cobertura:      ['cobertura_dias', 'dias_cobertura', 'cobertura'],
  estado:         ['estado_stock', 'estado', 'situacion'],
  esFoco:         ['es_foco_mes', 'es_foco', 'foco'],
  operativo:      ['stock_operativo', 'stock', 'stock_kg', 'existencia'],
  subfamilia:     ['subfamilia', 'categoria', 'familia', 'rubro'],
  marca:          ['marca', 'proveedor'],
  snapshot:       ['fecha_snapshot', 'snapshot', 'fecha'],
}

export const GERENCIA = {
  zona:           ['zona_comercial_asignacion', 'zona', 'zona_comercial'],
  ventaMtd:       ['venta_mtd_oficial_clp', 'venta_mtd', 'venta_mes'],
  meta:           ['meta_mensual', 'meta', 'meta_clp'],
  pctAvance:      ['pct_avance', 'avance', 'porcentaje_avance'],
  clientesMtd:    ['clientes_mtd', 'n_clientes', 'clientes'],
  margen:         ['margen_pct', 'margen', 'margen_global'],
}

/**
 * Reporta de una sola vez qué campos esperados no existen.
 * Llamar una vez tras cargar, no por fila.
 *
 * @returns {string[]} campos faltantes
 */
export function auditar(filas, mapa, contexto) {
  const falta = faltantes(filas, mapa)
  falta.forEach((c) => avisarFaltante(contexto, c, mapa[c]))
  return falta
}
