/**
 * Pedido en terreno → Supabase.pedidos + WhatsApp.
 * Precio dinámico: último / promedio del cliente (sku_detalle o ventas_lineas).
 */

import { supabase } from './supabase'
import { parseSkuDetalle } from './coach'

/** Quita pipes/basura de nombres de producto (sku_detalle crudo) */
export function sanitizeNombreProducto(n) {
  if (!n) return ''
  let s = String(n).trim()
  if (s.includes('|') || s.includes('｜')) s = s.split(/[|｜]/)[0].trim()
  if (s.length < 3) return ''
  if (/^\d+([.,]\d+)?\s*(kg|lt|l|un|ud|mm)?$/i.test(s)) return ''
  if (/^(OK|HOY|MIX|null|undefined)$/i.test(s)) return ''
  return s
}

export function buildWhatsAppPedido({ cliente, lineas, ejecutivoNombre }) {
  const nom = cliente?.nombre_cliente || cliente?.nombre || 'Cliente'
  const lines = (lineas || [])
    .filter(l => Number(l.cantidad) > 0 && (l.nombre || l.sku))
    .map(l => {
      const p = Number(l.precio)
      const cant = Number(l.cantidad)
      const sub = p > 0 ? cant * p : null
      const precioTxt = p > 0 ? ` @ $${Math.round(p).toLocaleString('es-CL')}` : ''
      const subTxt = sub != null ? ` = $${Math.round(sub).toLocaleString('es-CL')}` : ''
      return `• ${l.nombre || l.sku}: ${cant} ${l.unidad || 'ud'}${precioTxt}${subTxt}`
    })
  const total = (lineas || []).reduce((a, l) => {
    const p = Number(l.precio) || 0
    const c = Number(l.cantidad) || 0
    return a + p * c
  }, 0)
  const body = [
    `Hola${cliente?.persona_contacto ? ' ' + cliente.persona_contacto : ''},`,
    `pedido KeyFoods para *${nom}*:`,
    '',
    ...lines,
    total > 0 ? `\n*Total estimado: $${Math.round(total).toLocaleString('es-CL')}*` : null,
    '',
    ejecutivoNombre ? `Ejecutivo: ${ejecutivoNombre}` : null,
    'Confirmame recepción, por favor.',
  ]
    .filter(Boolean)
    .join('\n')
  const phone = String(cliente?.telefono || '')
    .replace(/\D/g, '')
    .replace(/^0/, '')
  const wa = cliente?.link_whatsapp
    ? cliente.link_whatsapp
    : phone
      ? `https://wa.me/${phone.startsWith('56') ? phone : '56' + phone}`
      : null
  if (!wa) return { url: null, text: body }
  const sep = wa.includes('?') ? '&' : '?'
  return { url: `${wa}${sep}text=${encodeURIComponent(body)}`, text: body }
}

export async function guardarPedido({
  ejecutivoId,
  clienteKey,
  nombreCliente,
  lineas,
  nota,
  fuente = 'field_app',
}) {
  const items = (lineas || [])
    .filter(l => Number(l.cantidad) > 0 && (l.nombre || l.sku))
    .map(l => ({
      sku: l.sku || null,
      nombre: l.nombre || l.sku,
      cantidad: Number(l.cantidad),
      unidad: l.unidad || 'ud',
      precio: Number(l.precio) > 0 ? Number(l.precio) : null,
      motivo: l.motivo || null,
    }))
  if (!items.length) return { error: 'Sin líneas' }

  const total = items.reduce((a, l) => a + (Number(l.precio) || 0) * Number(l.cantidad), 0)

  const row = {
    ejecutivo_id: ejecutivoId,
    cliente_key: clienteKey || null,
    nombre_cliente: nombreCliente || null,
    lineas: items,
    nota: nota || null,
    estado: 'borrador',
    fuente,
    creado_en: new Date().toISOString(),
  }

  // total_estimado si la columna existe (ignore error)
  try {
    row.total_estimado = total > 0 ? Math.round(total) : null
  } catch (_) {}

  const { data, error } = await supabase.from('pedidos').insert(row).select().maybeSingle()
  if (error) {
    const msg = error.message || String(error)
    if (/cliente_key|schema cache|column|creado_en/i.test(msg)) {
      // reintento mínimo sin campos opcionales
      const minimal = {
        ejecutivo_id: ejecutivoId,
        cliente_key: clienteKey || null,
        nombre_cliente: nombreCliente || null,
        lineas: items,
        nota: nota || null,
        estado: 'borrador',
        fuente,
      }
      const r2 = await supabase.from('pedidos').insert(minimal).select().maybeSingle()
      if (!r2.error) return r2
      return {
        data: null,
        error: {
          ...error,
          message:
            'Tabla pedidos incompleta. Corré SUPABASE_FIX_GERENCIA_Y_PEDIDOS.sql en Supabase y hard refresh.',
        },
      }
    }
  }
  return { data, error }
}

export async function listarPedidosHoy(ejecutivoId) {
  if (!ejecutivoId) return { data: [], error: null }
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('pedidos')
    .select('id,cliente_key,nombre_cliente,lineas,nota,estado,creado_en')
    .eq('ejecutivo_id', ejecutivoId)
    .gte('creado_en', start.toISOString())
    .order('creado_en', { ascending: false })
    .limit(50)
  return { data: data || [], error }
}

/**
 * Precio unitario del cliente para un SKU:
 * 1) promClp / promUd (promedio histórico)
 * 2) clpMtd / udMtd (mes en curso)
 * 3) null → se completa después con lista/stock
 */
export function precioUnitarioDesdeSku(s) {
  if (!s) return null
  const promUd = Number(s.promUd) || 0
  const promClp = Number(s.promClp) || 0
  if (promUd > 0 && promClp > 0) return promClp / promUd
  const udMtd = Number(s.udMtd) || 0
  const clpMtd = Number(s.clpMtd) || 0
  if (udMtd > 0 && clpMtd > 0) return clpMtd / udMtd
  return null
}

export function cantidadSugeridaDesdeSku(s) {
  if (!s) return 1
  const prom = Number(s.promUd) || 0
  const mtd = Number(s.udMtd) || 0
  const falta = Math.max(0, prom - mtd)
  if (falta > 0) return Math.max(1, Math.round(falta))
  if (prom > 0) return Math.max(1, Math.round(prom))
  return 1
}

/** Unidad legible según nombre del producto */
export function unidadDesdeNombre(nombre) {
  const n = String(nombre || '').toUpperCase()
  if (/\b(LT|L\b|ML|LITRO)/.test(n)) return 'lt'
  if (/\b(UN|UD|PACK|CAJA)\b/.test(n) && !/\bKG\b/.test(n)) return 'ud'
  return 'kg'
}

/**
 * Líneas sugeridas con precio + cantidad del cliente.
 * Prioridad: a reponer (ciclo) → top sku_detalle por venta → productos_top texto.
 */
export function sugerirLineasDesdeCliente(cliente, aReponer = []) {
  const fromDetalle = parseSkuDetalle(cliente?.sku_detalle || '')
  const byName = {}
  for (const s of fromDetalle) {
    if (s.nombre) byName[String(s.nombre).toLowerCase()] = s
  }

  const build = (s, motivo) => {
    const nombre = sanitizeNombreProducto(s.nombre)
    if (!nombre) return null
    const precio = precioUnitarioDesdeSku(s)
    const cantidad = cantidadSugeridaDesdeSku(s)
    return {
      sku: s.sku || nombre,
      nombre,
      cantidad,
      unidad: unidadDesdeNombre(nombre),
      precio: precio != null ? Math.round(precio) : null,
      motivo,
      _promUd: s.promUd,
      _udMtd: s.udMtd,
    }
  }

  const out = []
  const seen = new Set()

  for (const s of (aReponer || []).slice(0, 8)) {
    const line = build(s, s.recompra?.label || 'reponer')
    if (!line) continue
    const k = line.nombre.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(line)
  }

  // Completar con top del mix (mayor clpMtd)
  const ranked = fromDetalle
    .slice()
    .sort((a, b) => (Number(b.clpMtd) || Number(b.promClp) || 0) - (Number(a.clpMtd) || Number(a.promClp) || 0))
  for (const s of ranked) {
    if (out.length >= 6) break
    const line = build(s, 'mix')
    if (!line) continue
    const k = line.nombre.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(line)
  }

  if (out.length) return out

  // fallback texto
  const top = String(cliente?.productos_top || '')
    .split(/\s*[·|]\s*/)
    .map(x => x.trim())
    .filter(x => x.length > 2 && !/^\d+([.,]\d+)?\s*(kg|lt)?$/i.test(x))
    .slice(0, 4)
  return top.map(nombre => ({
    sku: nombre,
    nombre,
    cantidad: 1,
    unidad: unidadDesdeNombre(nombre),
    precio: null,
    motivo: 'historial',
  }))
}

/**
 * Enriquece precios faltantes desde ventas_lineas (último precio del cliente).
 */
export async function enriquecerPreciosDesdeVentas(clienteKey, lineas) {
  if (!clienteKey || !lineas?.length) return lineas
  const need = lineas.filter(l => !(Number(l.precio) > 0))
  if (!need.length) return lineas
  try {
    const { data, error } = await supabase
      .from('ventas_lineas')
      .select('producto_nombre,sku_canon,venta_neta_clp,cantidad_unidad,fecha')
      .eq('cliente_key', clienteKey)
      .order('fecha', { ascending: false })
      .limit(400)
    if (error || !data?.length) return lineas

    const lastPrice = {}
    for (const r of data) {
      const keys = [
        String(r.producto_nombre || '').toLowerCase(),
        String(r.sku_canon || '').toLowerCase(),
      ]
      const cant = Number(r.cantidad_unidad) || 0
      const neto = Number(r.venta_neta_clp) || 0
      if (cant <= 0 || neto <= 0) continue
      const pu = neto / cant
      for (const k of keys) {
        if (k && lastPrice[k] == null) lastPrice[k] = pu
      }
    }

    return lineas.map(l => {
      if (Number(l.precio) > 0) return l
      const k1 = String(l.nombre || '').toLowerCase()
      const k2 = String(l.sku || '').toLowerCase()
      const p = lastPrice[k1] ?? lastPrice[k2]
      if (p == null) return l
      return { ...l, precio: Math.round(p) }
    })
  } catch {
    return lineas
  }
}
