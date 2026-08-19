/**
 * Resolución canónica de precios — Black Sheep Field.
 *
 * Jerarquía (aplicada):
 *  P0 override      → origen 'negociado'  (solo si el usuario/ejecutivo fuerza un precio)
 *  P1 histórico     → origen 'historico'  (sku_detalle / precio_cliente del cliente)
 *  P2 lista mes     → origen 'lista'      (stock.precio_unidad preferido)
 *  P3 sin precio    → origen 'consultar'
 *
 * Nunca devolver 0: null + etiqueta Consultar.
 */

import { parseSkuDetalle } from './coach'

export function numPos(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Precio de lista desde fila stock.
 * Prioriza unidad; caja/kilo solo si no hay unidad (evita tomar precio de caja como unitario).
 */
export function precioDesdeLista(stockOrLista) {
  if (!stockOrLista) return null
  for (const k of ['precio_unidad', 'precio_lista', 'precio']) {
    const v = numPos(stockOrLista[k])
    if (v) return Math.round(v)
  }
  // fallback caja/kilo solo si son el único dato disponible
  for (const k of ['precio_caja', 'precio_kilo']) {
    const v = numPos(stockOrLista[k])
    if (v) return Math.round(v)
  }
  return null
}

/**
 * Precio unitario desde entrada parseSkuDetalle (promClp/promUd o clpMtd/udMtd)
 * o desde objeto con campo precio directo.
 */
export function precioDesdeHistSku(s) {
  if (!s) return null
  // precio explícito (catálogo RPC / override histórico)
  for (const k of ['precio', 'precio_unitario', 'ultimo_precio', 'precio_cliente', 'p']) {
    const v = numPos(s[k])
    if (v) return Math.round(v)
  }
  const promUd = Number(s.promUd) || 0
  const promClp = Number(s.promClp) || 0
  if (promUd > 0 && promClp > 0) {
    const unit = promClp / promUd
    // sanity: evitar basura (ej. promClp mal parseado)
    if (unit > 0 && unit < 50_000_000) return Math.round(unit)
  }
  const udMtd = Number(s.udMtd) || 0
  const clpMtd = Number(s.clpMtd) || 0
  if (udMtd > 0 && clpMtd > 0) {
    const unit = clpMtd / udMtd
    if (unit > 0 && unit < 50_000_000) return Math.round(unit)
  }
  return null
}

export function matchHistPorNombre(histList, nombre) {
  const name = String(nombre || '')
    .toLowerCase()
    .trim()
  if (!name || !Array.isArray(histList) || !histList.length) return null

  // 1) match exacto normalizado
  for (const h of histList) {
    const k = String(h.nombre || '')
      .toLowerCase()
      .trim()
    if (k && k === name) return h
  }
  // 2) contains (nombre largo primero)
  const sorted = [...histList].sort(
    (a, b) => String(b.nombre || '').length - String(a.nombre || '').length
  )
  for (const h of sorted) {
    const k = String(h.nombre || '')
      .toLowerCase()
      .trim()
    if (!k || k.length < 4) continue
    if (name.includes(k) || k.includes(name.slice(0, Math.min(28, name.length)))) return h
  }
  return null
}

/**
 * @returns {{
 *   precio: number|null,
 *   origen: 'negociado'|'historico'|'lista'|'consultar',
 *   precio_lista: number|null,
 *   precio_hist: number|null,
 *   fecha_hist: string|null,
 *   etiqueta: string
 * }}
 */
export function resolverPrecio(opts = {}) {
  const override = numPos(opts.override)
  const histSku = opts.histSku || null
  const stockItem = opts.stockItem || opts.listaItem || null

  const precio_hist = precioDesdeHistSku(histSku)
  const precio_lista = precioDesdeLista(stockItem)
  const fecha_hist = histSku?.ultima || histSku?.fecha || histSku?.ultima_compra || null

  if (override != null) {
    return {
      precio: Math.round(override),
      origen: 'negociado',
      precio_lista,
      precio_hist,
      fecha_hist,
      etiqueta: 'Negociado',
    }
  }
  if (precio_hist != null) {
    return {
      precio: precio_hist,
      origen: 'historico',
      precio_lista,
      precio_hist,
      fecha_hist,
      etiqueta: fecha_hist ? 'Tu precio' : 'Promedio',
    }
  }
  if (precio_lista != null) {
    return {
      precio: precio_lista,
      origen: 'lista',
      precio_lista,
      precio_hist: null,
      fecha_hist: null,
      etiqueta: 'Lista',
    }
  }
  return {
    precio: null,
    origen: 'consultar',
    precio_lista: null,
    precio_hist: null,
    fecha_hist: null,
    etiqueta: 'Consultar',
  }
}

/**
 * Resuelve para un ítem de stock + cliente (sku_detalle).
 * precioClienteGuardado: precio_cliente ya persistido en oferta (NO es override).
 * Si difiere de hist y de lista → se trata como negociado.
 */
export function resolverPrecioCliente(stockItem, cliente, opts = {}) {
  const hist = parseSkuDetalle(cliente?.sku_detalle || '')
  const histSku =
    matchHistPorNombre(hist, stockItem?.producto_nombre || stockItem?.nombre) ||
    hist.find(h => String(h.sku || h.sku_canon || '') === String(stockItem?.sku_canon || '')) ||
    null

  const guardado = numPos(opts.precioClienteGuardado)
  const rBase = resolverPrecio({ histSku, stockItem })

  if (guardado != null) {
    // ¿es igual al histórico o a la lista? → no marcar negociado
    if (rBase.precio_hist != null && Math.abs(guardado - rBase.precio_hist) < 1) {
      return { ...rBase, precio: guardado }
    }
    if (rBase.precio_lista != null && Math.abs(guardado - rBase.precio_lista) < 1) {
      return {
        precio: guardado,
        origen: 'lista',
        precio_lista: rBase.precio_lista,
        precio_hist: rBase.precio_hist,
        fecha_hist: rBase.fecha_hist,
        etiqueta: 'Lista',
      }
    }
    // precio editado a mano por el ejecutivo para esta oferta
    return resolverPrecio({
      override: guardado,
      histSku,
      stockItem,
    })
  }

  return rBase
}

export function estiloOrigenPrecio(origen) {
  switch (origen) {
    case 'negociado':
      return { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' }
    case 'historico':
      return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' }
    case 'lista':
      return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' }
    default:
      return { bg: '#f5f5f4', color: '#78716c', border: '#e7e5e4' }
  }
}

export function formatPrecioClp(n) {
  const v = numPos(n)
  if (!v) return null
  return '$' + Math.round(v).toLocaleString('es-CL')
}

/** Precio que ve el cliente en catálogo público (nunca negociado interno sin sentido) */
export function precioPublicoItem(it) {
  const precioRpc = numPos(it?.precio)
  const precioCli = numPos(it?.precio_cliente)
  const precioLista = numPos(it?.precio_lista) || numPos(it?.precio_unidad)
  const origenRpc = String(it?.precio_origen || '').toLowerCase()

  // Preferir precio ya resuelto por RPC si es > 0
  if (precioRpc) {
    let origen = origenRpc
    if (!['negociado', 'historico', 'lista', 'consultar'].includes(origen)) {
      if (precioCli && Math.abs(precioRpc - precioCli) < 1) origen = 'historico'
      else if (precioLista && Math.abs(precioRpc - precioLista) < 1) origen = 'lista'
      else origen = 'lista'
    }
    const ahorro =
      precioLista != null && Math.abs(precioRpc - precioLista) >= 1
        ? Math.round(precioLista - precioRpc)
        : null
    return {
      precio: Math.round(precioRpc),
      origen,
      precio_lista: precioLista,
      precio_hist: precioCli,
      fecha_hist: it.ultima_compra || it.ultima || null,
      etiqueta:
        origen === 'historico'
          ? 'Tu precio'
          : origen === 'lista'
            ? 'Lista'
            : origen === 'negociado'
              ? 'Negociado'
              : 'Consultar',
      ahorro_vs_lista: ahorro,
    }
  }

  return resolverPrecio({
    histSku: precioCli ? { precio: precioCli, ultima: it?.ultima_compra || it?.ultima } : null,
    stockItem: {
      precio_unidad: precioLista,
      precio_caja: it?.precio_caja,
      precio_kilo: it?.precio_kilo,
    },
  })
}
