/**
 * Resolución canónica de precios — KEYFOODS Field V56.15
 *
 * Jerarquía de negocio (inmutable):
 *  P0 override      → origen 'negociado'   (ejecutivo fuerza precio en la oferta)
 *  P1 histórico     → origen 'historico'   (precio del cliente si existe y > 0)
 *  P2 lista Excel   → origen 'lista'       (stock.precio_unidad desde lista de precios)
 *  P3 sin precio    → origen 'consultar'   (nunca mostrar 0)
 *
 * Regla comercial:
 *  - La lista de precios del mes (Excel → stock) es la base.
 *  - Si el cliente tiene precio histórico distinto, se muestra ese (reposición).
 *  - El ejecutivo puede negociar por encima/debajo → se marca 'negociado'.
 *  - Solo se ofrece producto con stock operativo (gate en catálogo/SQL).
 */

import { parseSkuDetalle } from './coach'

export function numPos(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Precio de lista desde fila stock / Excel.
 * Prioriza unidad; caja/kilo solo si no hay unidad (evita tomar caja como unitario).
 */
export function precioDesdeLista(stockOrLista) {
  if (!stockOrLista) return null
  for (const k of ['precio_unidad', 'precio_lista', 'precio']) {
    const v = numPos(stockOrLista[k])
    if (v) return Math.round(v)
  }
  for (const k of ['precio_caja', 'precio_kilo']) {
    const v = numPos(stockOrLista[k])
    if (v) return Math.round(v)
  }
  return null
}

/**
 * Precio unitario desde histórico del cliente (sku_detalle, RPC, etc.)
 */
export function precioDesdeHistSku(s) {
  if (!s) return null
  for (const k of ['precio', 'precio_unitario', 'ultimo_precio', 'precio_cliente', 'p']) {
    const v = numPos(s[k])
    if (v) return Math.round(v)
  }
  const promUd = Number(s.promUd) || 0
  const promClp = Number(s.promClp) || 0
  if (promUd > 0 && promClp > 0) {
    const unit = promClp / promUd
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

  for (const h of histList) {
    const k = String(h.nombre || '')
      .toLowerCase()
      .trim()
    if (k && k === name) return h
  }
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
 *   etiqueta: string,
 *   ahorro_vs_lista: number|null
 * }}
 */
export function resolverPrecio(opts = {}) {
  const override = numPos(opts.override)
  const histSku = opts.histSku || null
  const stockItem = opts.stockItem || opts.listaItem || null

  const precio_hist = precioDesdeHistSku(histSku)
  const precio_lista = precioDesdeLista(stockItem)
  const fecha_hist = histSku?.ultima || histSku?.fecha || histSku?.ultima_compra || null

  const ahorro = (shown) => {
    if (shown == null || precio_lista == null) return null
    const d = Math.round(precio_lista - shown)
    return d !== 0 ? d : null
  }

  if (override != null) {
    return {
      precio: Math.round(override),
      origen: 'negociado',
      precio_lista,
      precio_hist,
      fecha_hist,
      etiqueta: 'Negociado',
      ahorro_vs_lista: ahorro(override),
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
      ahorro_vs_lista: ahorro(precio_hist),
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
      ahorro_vs_lista: null,
    }
  }
  return {
    precio: null,
    origen: 'consultar',
    precio_lista: null,
    precio_hist: null,
    fecha_hist: null,
    etiqueta: 'Consultar',
    ahorro_vs_lista: null,
  }
}

/**
 * Resuelve para un ítem de stock + cliente (sku_detalle).
 * precioClienteGuardado: precio ya persistido en oferta (no es override automático).
 * Si difiere de hist y de lista → negociado.
 */
export function resolverPrecioCliente(stockItem, cliente, opts = {}) {
  const hist = parseSkuDetalle(cliente?.sku_detalle || '')
  const histSku =
    matchHistPorNombre(hist, stockItem?.producto_nombre || stockItem?.nombre) ||
    hist.find(
      (h) => String(h.sku || h.sku_canon || '') === String(stockItem?.sku_canon || '')
    ) ||
    null

  const guardado = numPos(opts.precioClienteGuardado)
  const rBase = resolverPrecio({ histSku, stockItem })

  if (guardado != null) {
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
        ahorro_vs_lista: null,
      }
    }
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

/**
 * Precio que ve el cliente en catálogo público.
 * Preferencia: histórico del cliente > lista Excel > consultar.
 */
export function precioPublicoItem(it) {
  const precioRpc = numPos(it?.precio)
  const precioCli = numPos(it?.precio_cliente)
  const precioLista = numPos(it?.precio_lista) || numPos(it?.precio_unidad)

  if (precioRpc) {
    let origen = it.precio_origen || 'lista'
    if (precioCli && Math.abs(precioRpc - precioCli) < 1) origen = 'historico'
    else if (precioLista && Math.abs(precioRpc - precioLista) < 1) origen = 'lista'
    else if (it.precio_origen === 'negociado') origen = 'negociado'

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
    histSku: precioCli
      ? { precio: precioCli, ultima: it?.ultima_compra || it?.ultima }
      : null,
    stockItem: {
      precio_unidad: precioLista,
      precio_caja: it?.precio_caja,
      precio_kilo: it?.precio_kilo,
    },
  })
}

/** Texto corto para badge de origen */
export function labelOrigen(origen) {
  switch (origen) {
    case 'historico':
      return 'Tu precio'
    case 'negociado':
      return 'Negociado'
    case 'lista':
      return 'Lista'
    default:
      return 'Consultar'
  }
}
