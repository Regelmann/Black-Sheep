/**
 * MI DÍA · la respuesta a "¿a quién le vendo qué, a qué precio y por qué ahora?"
 *
 * decisionEngine ya contesta el A QUIÉN y el POR QUÉ AHORA. Lo que faltaba
 * es el QUÉ y el A QUÉ PRECIO: sin eso el vendedor tiene que abrir el
 * cliente, mirar el histórico y decidir él. Justamente lo que un copiloto
 * tiene que ahorrarle.
 *
 * Este módulo no reemplaza al motor: lo enriquece. Toma la decisión
 * ganadora y le pega los productos concretos —los que el cliente ya
 * compra, cruzados contra lo que hay en bodega— con su último precio
 * pagado y el monto que suma la oportunidad.
 *
 * Es todo función pura sobre datos ya cargados. No consulta nada.
 */

import { skusAReponer, parseSkuDetalle } from './coach.js'
import { precioDesdeHistSku } from './precios.js'
import { cantidadSugeridaDesdeSku, sanitizeNombreProducto } from './pedido.js'

const num = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const t = v.trim()
    if (t === '') return 0
    const n = Number(t)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

const norm = s => String(s || '').toUpperCase().trim()

/**
 * Índice de bodega por nombre y por sku.
 * El nombre se normaliza porque cartera y stock rara vez coinciden exacto.
 */
function indexarStock(stock = []) {
  const porSku = new Map()
  const porNombre = new Map()
  for (const s of stock) {
    if (!s) continue
    const sku = norm(s.sku_canon || s.sku)
    const nom = norm(s.producto_nombre || s.nombre)
    // stock_operativo es la columna real; `cantidad` aparece en la demo.
    const unidades = num(s.stock_operativo ?? s.cantidad ?? s.stock)
    const item = { ...s, _unidades: unidades }
    if (sku) porSku.set(sku, item)
    if (nom) porNombre.set(nom, item)
  }
  return { porSku, porNombre }
}

function buscarEnStock(idx, sku, nombre) {
  if (!idx) return null
  const s = norm(sku)
  if (s && idx.porSku.has(s)) return idx.porSku.get(s)
  const n = norm(nombre)
  if (n && idx.porNombre.has(n)) return idx.porNombre.get(n)
  return null
}

/**
 * Qué ofrecerle a este cliente, en orden.
 *
 * Prioridad: lo que se le está acabando según SU ciclo (skusAReponer) y
 * después su mix habitual por peso en pesos. Un producto sin stock no se
 * esconde —se marca— porque el vendedor igual necesita saber que lo pidió
 * y no hay.
 */
export function productosSugeridos(cliente, stock = [], limite = 3) {
  if (!cliente) return []
  const idx = indexarStock(stock)
  const vistos = new Set()
  const out = []

  const agregar = (s, motivo) => {
    if (out.length >= limite) return
    const nombre = sanitizeNombreProducto(s?.nombre)
    if (!nombre) return
    const clave = norm(nombre)
    if (!clave || vistos.has(clave)) return
    vistos.add(clave)

    const enStock = buscarEnStock(idx, s.sku, nombre)
    const precio = precioDesdeHistSku(s)
    const cantidad = cantidadSugeridaDesdeSku(s)

    out.push({
      sku: s.sku || nombre,
      nombre,
      cantidad,
      // Último precio que ESTE cliente pagó. Si no hay histórico, cae al
      // precio de lista de bodega; si tampoco, null (la UI no inventa).
      precio: precio != null ? precio : (enStock ? num(enStock.precio_unidad) || null : null),
      precioEsDelCliente: precio != null,
      hayStock: enStock ? enStock._unidades > 0 : null, // null = no sabemos
      unidadesEnBodega: enStock ? enStock._unidades : null,
      motivo,
    })
  }

  // 1) lo que se le acaba según su propio ciclo
  for (const s of skusAReponer(cliente)) {
    agregar(s, s.recompra?.tone === 'bad' ? 'se_le_acaba' : 'reponer')
  }

  // 2) su mix habitual, por peso en pesos
  if (out.length < limite) {
    const mix = parseSkuDetalle(cliente?.sku_detalle)
      .slice()
      .sort((a, b) => (num(b.clpMtd) || num(b.promClp)) - (num(a.clpMtd) || num(a.promClp)))
    for (const s of mix) agregar(s, 'habitual')
  }

  return out
}

/** Lo que vale la oportunidad: suma de líneas sugeridas. */
export function montoSugerido(productos = []) {
  let total = 0
  for (const p of productos) {
    total += num(p.precio) * num(p.cantidad)
  }
  return Math.round(total)
}

/**
 * Métricas que aplican según el rol.
 *
 * Un KAM o un televendedor no hacen "8 visitas": trabajan desde oficina.
 * Medirlos con la vara de terreno es pedirles algo que su trabajo no
 * incluye, y ensucia la pantalla con un número que nunca van a mover.
 */
export function perfilRol(rol) {
  const r = String(rol || '').toLowerCase().trim()
  if (/kam|key.?account/.test(r)) {
    return {
      rol: 'KAM',
      usaDistancia: false,
      usaVisitas: false,
      unidadDeTrabajo: 'contacto',
      etiquetaAccion: 'Contactar',
      metricas: ['cobertura', 'venta', 'mix'],
    }
  }
  if (/televenta|telefon|inside/.test(r)) {
    return {
      rol: 'TELEVENTA',
      usaDistancia: false,
      usaVisitas: false,
      unidadDeTrabajo: 'llamada',
      etiquetaAccion: 'Llamar',
      metricas: ['llamadas', 'venta', 'conversion'],
    }
  }
  return {
    rol: 'TERRENO',
    usaDistancia: true,
    usaVisitas: true,
    unidadDeTrabajo: 'visita',
    etiquetaAccion: 'Visitar',
    metricas: ['visitas', 'venta', 'cobertura'],
  }
}

/**
 * Ciclo del cliente cuando la columna no viene.
 *
 * `ciclo_dias` no siempre está cargado en cartera, pero cada línea del
 * sku_detalle trae su propio cicloDias. La mediana de esos ciclos es una
 * estimación razonable del ritmo del cliente: mejor que caer a un umbral
 * fijo, que trata igual al que compra semanal y al que compra mensual.
 */
export function cicloEstimado(cliente) {
  const directo = num(cliente?.ciclo_dias)
  if (directo > 0) return Math.round(directo)
  const ciclos = parseSkuDetalle(cliente?.sku_detalle)
    .map(s => num(s.cicloDias))
    .filter(v => v > 0)
    .sort((a, b) => a - b)
  if (!ciclos.length) return 0
  const m = Math.floor(ciclos.length / 2)
  return ciclos.length % 2 ? ciclos[m] : Math.round((ciclos[m - 1] + ciclos[m]) / 2)
}

/** Días sin comprar contra el ciclo propio del cliente. */
export function ritmoCliente(cliente) {
  const dias = cliente?.dias_sin_comprar == null ? null : num(cliente.dias_sin_comprar)
  const ciclo = cicloEstimado(cliente)
  if (dias == null) return { dias: null, ciclo: ciclo || null, atraso: null, texto: 'Sin dato de última compra' }
  if (ciclo <= 0) {
    return { dias, ciclo: null, atraso: null, texto: `${dias} días sin comprar` }
  }
  const atraso = dias - ciclo
  return {
    dias,
    ciclo,
    atraso,
    texto: atraso > 0
      ? `${dias} días sin comprar · compra cada ${ciclo}`
      : `${dias} días · su ciclo es ${ciclo}`,
  }
}

/**
 * La pantalla completa: UNA mejor oportunidad y 2-3 más abajo.
 *
 * `decisiones` viene de buildDecisionFeed —o sea que ya trae el ajuste
 * por memoria. Acá sólo se le pega el detalle comercial.
 */
export function armarMiDia({ decisiones = [], cartera = [], stock = [], rol = 'terreno', cuantasMas = 3 } = {}) {
  const perfil = perfilRol(rol)
  const porKey = new Map()
  for (const c of cartera) {
    const k = c?.cliente_key || c?.id
    if (k) porKey.set(String(k), c)
  }

  const enriquecer = d => {
    const cliente = porKey.get(String(d.clientId)) || d.raw || null
    const productos = productosSugeridos(cliente, stock, 3)
    const monto = montoSugerido(productos)
    return {
      ...d,
      cliente,
      productos,
      // El motor estima expectedValue por fórmula; si tenemos líneas
      // reales con precio, ese número es mejor: sale de lo que este
      // cliente compra y de lo que hay en bodega hoy.
      monto: monto > 0 ? monto : num(d.expectedValue),
      montoEsReal: monto > 0,
      ritmo: ritmoCliente(cliente),
      perfil,
    }
  }

  const lista = decisiones.filter(Boolean).map(enriquecer)
  return {
    perfil,
    mejor: lista[0] || null,
    siguientes: lista.slice(1, 1 + cuantasMas),
    // Plata sobre la mesa hoy, si hiciera todo lo de la pantalla.
    montoTotal: lista.slice(0, 1 + cuantasMas).reduce((a, d) => a + num(d.monto), 0),
  }
}