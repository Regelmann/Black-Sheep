import { precioDesdeHistSku } from './precios'
/**
 * Pedido en terreno → Supabase.pedidos + WhatsApp.
 * Precio dinámico: último / promedio del cliente (sku_detalle o ventas_lineas).
 */

import { supabase } from './supabase'
import { parseSkuDetalle, cantidadSugerida as cantidadSugeridaCoach } from './coach'

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
  estado = 'borrador',
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
    estado: estado || 'borrador',
    fuente,
    creado_en: new Date().toISOString(),
  }

  // total_estimado si la columna existe (ignore error)
  try {
    row.total_estimado = total > 0 ? Math.round(total) : null
  } catch (_) { void _ }

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
        estado: estado || 'borrador',
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
    .select('id,cliente_key,nombre_cliente,lineas,nota,estado,creado_en,fuente,total_estimado')
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

/** Historial de pedidos del ejecutivo (o de un cliente).
 *  @param {{ ejecutivoId?: string, clienteKey?: string, dias?: number, limit?: number, estado?: string }} opts
 */
export async function listarPedidosHistorial(opts = {}) {
  const { ejecutivoId, clienteKey, dias = 30, limit = 80, estado } = opts
  let q = supabase
    .from('pedidos')
    .select('id,cliente_key,nombre_cliente,lineas,nota,estado,creado_en,fuente,total_estimado,ejecutivo_id')
    .order('creado_en', { ascending: false })
    .limit(limit)

  if (ejecutivoId) q = q.eq('ejecutivo_id', ejecutivoId)
  if (clienteKey) q = q.eq('cliente_key', clienteKey)
  if (estado) q = q.eq('estado', estado)
  if (dias && dias > 0) {
    const desde = new Date()
    desde.setDate(desde.getDate() - dias)
    desde.setHours(0, 0, 0, 0)
    q = q.gte('creado_en', desde.toISOString())
  }

  const { data, error } = await q
  return { data: data || [], error }
}

export async function getPedidoById(id) {
  if (!id) return { data: null, error: null }
  const { data, error } = await supabase
    .from('pedidos')
    .select('id,cliente_key,nombre_cliente,lineas,nota,estado,creado_en,fuente,total_estimado,ejecutivo_id')
    .eq('id', id)
    .maybeSingle()
  return { data, error }
}

export function totalPedido(p) {
  if (!p) return 0
  if (Number(p.total_estimado) > 0) return Number(p.total_estimado)
  const lineas = Array.isArray(p.lineas) ? p.lineas : []
  return lineas.reduce((a, l) => a + (Number(l.precio) || 0) * (Number(l.cantidad) || 0), 0)
}

export function formatFechaPedido(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16)
  const hoy = new Date()
  const ayer = new Date()
  ayer.setDate(hoy.getDate() - 1)
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  if (sameDay(d, hoy)) return `Hoy ${hora}`
  if (sameDay(d, ayer)) return `Ayer ${hora}`
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) + ' ' + hora
}

export function etiquetaEstadoPedido(estado, fuente) {
  // Estado real (no mezclar con fuente — el badge de origen va aparte)
  const e = String(estado || '').toLowerCase().trim()
  const map = {
    borrador: { label: 'Borrador', color: '#78716c' },
    recibido: { label: 'Recibido', color: '#c2410c' },
    confirmado: { label: 'Confirmado', color: '#0369a1' },
    preparado: { label: 'Preparado', color: '#7c3aed' },
    enviado: { label: 'Enviado', color: '#0f766e' },
    entregado: { label: 'Entregado', color: '#15803d' },
    cancelado: { label: 'Cancelado', color: '#b91c1c' },
    pendiente_carga: { label: 'Recibido', color: '#c2410c' },
  }
  if (!e && fuente === 'catalogo_publico') return map.recibido
  if (map[e]) return map[e]
  // aliases
  if (e === 'enviado_bodega') return map.enviado
  if (e === 'cargado' || e === 'ok') return map.entregado
  return { label: e || 'Borrador', color: '#a8a29e' }
}

export function precioUnitarioDesdeSku(s) {
  return precioDesdeHistSku(s)
}

export function cantidadSugeridaDesdeSku(s) {
  // Single source: coach.cantidadSugerida (prom − MTD)
  if (typeof cantidadSugeridaCoach === 'function') return cantidadSugeridaCoach(s)
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
    // Merge con sku_detalle completo si aReponer viene truncado
    const full = byName[String(s.nombre || '').toLowerCase()] || s
    const line = build({ ...full, ...s }, s.recompra?.label || s.label || 'reponer')
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
      .select('producto_nombre,sku_canon,venta_neta_clp,cantidad_unidad,cantidad,fecha')
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
      const cant = Number(r.cantidad_unidad) || Number(r.cantidad) || 0
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

/**
 * Documento formal del pedido (HTML listo para imprimir / guardar PDF).
 */
export function buildPedidoFormalHtml({
  cliente,
  lineas,
  ejecutivoNombre,
  nota,
  pedidoId,
  total,
}) {
  const nom   = cliente?.nombre_cliente || cliente?.nombre || 'Cliente'
  const folio = folioPedido(pedidoId)
  const fecha = new Date().toLocaleString('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const rows = (lineas || [])
    .filter(l => Number(l.cantidad) > 0 && (l.nombre || l.sku))
    .map(l => {
      const cant = Number(l.cantidad) || 0
      const precio = Number(l.precio) || 0
      const sub = precio > 0 ? cant * precio : null
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e7e5e4">${escapeHtml(l.nombre || l.sku)}</td>
        <td style="padding:8px;border-bottom:1px solid #e7e5e4;text-align:right">${cant} ${escapeHtml(l.unidad || 'ud')}</td>
        <td style="padding:8px;border-bottom:1px solid #e7e5e4;text-align:right">${precio > 0 ? '$' + Math.round(precio).toLocaleString('es-CL') : '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #e7e5e4;text-align:right">${sub != null ? '$' + Math.round(sub).toLocaleString('es-CL') : '—'}</td>
      </tr>`
    })
    .join('')
  const tot = total != null ? total : (lineas || []).reduce((a, l) => a + (Number(l.precio) || 0) * (Number(l.cantidad) || 0), 0)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Pedido KeyFoods — ${escapeHtml(nom)}</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;color:#1c1917;padding:24px;max-width:720px;margin:0 auto}
    h1{font-size:20px;margin:0 0 4px}
    .muted{color:#78716c;font-size:13px}
    table{width:100%;border-collapse:collapse;margin-top:16px;font-size:14px}
    th{text-align:left;padding:8px;border-bottom:2px solid #1c1917;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
    .total{font-size:18px;font-weight:800;margin-top:16px;text-align:right}
    .badge{display:inline-block;background:#fef3c7;color:#92400e;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700}
    @media print{body{padding:0} .no-print{display:none}}
  </style></head><body>
  <div class="no-print" style="margin-bottom:16px">
    <button onclick="window.print()" style="padding:10px 18px;border:none;background:#c2410c;color:#fff;border-radius:10px;font-weight:700;cursor:pointer">Imprimir / Guardar PDF</button>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <h1>Pedido KeyFoods</h1>
      <div class="muted">${escapeHtml(fecha)} · <strong>${escapeHtml(folio)}</strong></div>
    </div>
    <span class="badge">TERRENO</span>
  </div>
  <div style="margin-top:16px;padding:12px;background:#fafaf9;border-radius:12px">
    <div style="font-weight:800;font-size:16px">${escapeHtml(nom)}</div>
    <div class="muted">${escapeHtml([cliente?.comuna, cliente?.direccion].filter(Boolean).join(' · ') || '')}</div>
    ${cliente?.telefono ? `<div class="muted">Tel: ${escapeHtml(String(cliente.telefono))}</div>` : ''}
  </div>
  <table>
    <thead><tr><th>Producto</th><th style="text-align:right">Cant.</th><th style="text-align:right">P. unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" class="muted">Sin líneas</td></tr>'}</tbody>
  </table>
  <div class="total">Total estimado: $${Math.round(tot).toLocaleString('es-CL')}</div>
  ${nota ? `<div style="margin-top:12px"><div class="muted">Nota</div><div>${escapeHtml(nota)}</div></div>` : ''}
  ${ejecutivoNombre ? `<div class="muted" style="margin-top:24px">Ejecutivo: ${escapeHtml(ejecutivoNombre)}</div>` : ''}
  <div class="muted" style="margin-top:8px">Documento generado en app de terreno. Confirmar recepción en bodega.</div>
  </body></html>`
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Número de pedido legible: P-YYYYMM-XXXX desde UUID */
export function folioPedido(uuid) {
  if (!uuid) return 'P-????'
  const ym = new Date().toISOString().slice(0, 7).replace('-', '')
  const short = String(uuid).replace(/-/g, '').slice(-4).toUpperCase()
  return `P-${ym}-${short}`
}

/** Abre ventana de impresión (en móvil: Compartir → Guardar PDF).
 *  Fix móvil: usa blob URL en lugar de window.open('','_blank')
 *  para evitar el bloqueo de popups en Chrome Android. */
export function imprimirPedidoPdf(opts) {
  const html = buildPedidoFormalHtml(opts)
  try {
    // Método 1: blob URL — funciona en Chrome Android sin popup blocker
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.target   = '_blank'
    a.rel      = 'noopener'
    // En móvil: abre en nueva pestaña → menú compartir → Guardar PDF
    // En desktop: abre y el usuario imprime con Ctrl+P
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    return { ok: true }
  } catch (e1) {
    // Fallback: data URI
    try {
      const dataUri = 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
      const w = window.open(dataUri, '_blank')
      if (!w) throw new Error('popup bloqueado')
      return { ok: true }
    } catch (e2) {
      return { ok: false, error: 'No se pudo abrir el PDF. Intentá desde Chrome.' }
    }
  }
}

/** Texto formal para WhatsApp bodega (sin depender del teléfono del cliente). */
export function buildWhatsAppBodega({ cliente, lineas, ejecutivoNombre, nota }) {
  const nom = cliente?.nombre_cliente || cliente?.nombre || 'Cliente'
  const lines = (lineas || [])
    .filter(l => Number(l.cantidad) > 0 && (l.nombre || l.sku))
    .map(l => {
      const cant = Number(l.cantidad)
      return `• ${l.nombre || l.sku}: ${cant} ${l.unidad || 'ud'}`
    })
  const total = (lineas || []).reduce((a, l) => a + (Number(l.precio) || 0) * (Number(l.cantidad) || 0), 0)
  const body = [
    `*PEDIDO TERRENO — BODEGA*`,
    `Cliente: *${nom}*`,
    cliente?.comuna ? `Comuna: ${cliente.comuna}` : null,
    cliente?.direccion ? `Dir: ${cliente.direccion}` : null,
    '',
    ...lines,
    total > 0 ? `
Total est.: $${Math.round(total).toLocaleString('es-CL')}` : null,
    nota ? `Nota: ${nota}` : null,
    ejecutivoNombre ? `Ejecutivo: ${ejecutivoNombre}` : null,
    '',
    'Por favor preparar / confirmar stock.',
  ]
    .filter(Boolean)
    .join('\n')
  return body
}

export async function marcarPedidoEstado(pedidoId, estado) {
  if (!pedidoId) return { error: null }
  try {
    const { error } = await supabase.from('pedidos').update({ estado }).eq('id', pedidoId)
    return { error }
  } catch (e) {
    return { error: e }
  }
}


/** Alias Order Inbox */
export const actualizarEstadoPedido = marcarPedidoEstado
