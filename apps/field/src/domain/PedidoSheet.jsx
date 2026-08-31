import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { safeSelect } from '../lib/query.js'
import { productTitle, productLabel } from '../lib/productDisplay.js'
import {
  buildWhatsAppPedido,
  buildWhatsAppBodega,
  guardarPedido,
  sugerirLineasDesdeCliente,
  enriquecerPreciosDesdeVentas,
  unidadDesdeNombre,
  sanitizeNombreProducto,
  imprimirPedidoPdf,
  marcarPedidoEstado,
} from '../lib/pedido.js'
import { precioDesdeLista, resolverPrecio } from '../lib/precios.js'
import { mensajeDeError } from '../lib/erroresUsuario.js'

const money = n => {
  const v = Number(n)
  if (!v || isNaN(v)) return null
  return '$' + Math.round(v).toLocaleString('es-CL')
}

/**
 * Bottom sheet pedido en terreno.
 * Precio y cantidad desde historial del cliente; stock real.
 */
export default function PedidoSheet({ initialPedido, 
  cliente,
  aReponer = [],
  ejecutivoId,
  ejecutivoNombre,
  onClose,
  onSaved,
}) {
  const sugeridas = useMemo(
    () => sugerirLineasDesdeCliente(cliente, aReponer).filter(l => l.nombre && l.nombre.trim().length > 1),
    [cliente, aReponer]
  )
  const [lineas, setLineas] = useState(() => {
    if (initialPedido?.lineas?.length) {
      return initialPedido.lineas.map(l => ({
        sku_canon: l.sku || l.sku_canon,
        nombre: l.nombre || l.producto_nombre,
        producto_nombre: l.nombre || l.producto_nombre,
        cantidad: Number(l.cantidad) || 1,
        precio: Number(l.precio) || 0,
      }))
    }
    return sugeridas.map(l => ({ ...l, cantidad: l.cantidad || 1 }))
  })
  const [nota, setNota] = useState(initialPedido?.nota || '')
  const [pedidoExistenteId, setPedidoExistenteId] = useState(initialPedido?.id || null)
  useEffect(() => {
    if (!initialPedido?.id) return
    if (initialPedido?.lineas?.length) {
      setLineas(initialPedido.lineas.map(l => ({
        sku_canon: l.sku || l.sku_canon,
        nombre: l.nombre || l.producto_nombre,
        producto_nombre: l.nombre || l.producto_nombre,
        cantidad: Number(l.cantidad) || 1,
        precio: Number(l.precio) || 0,
      })))
    }
    setPedidoExistenteId(initialPedido.id || null)
    if (initialPedido.nota) setNota(initialPedido.nota)
  }, [initialPedido?.id])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [stock, setStock] = useState([])
  const [q, setQ] = useState('')
  const [showCatalog, setShowCatalog] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // safeSelect: si el stock no se lee, `rows` es [] pero `ok:false` lo dice.
      const rStock = await safeSelect(
        supabase
          .from('stock')
          .select('sku_canon,producto_nombre,stock_operativo,cobertura_dias,estado_stock,es_foco_mes,foco,precio_unidad,precio_lista,precio,precio_caja,precio_kilo')
          .order('producto_nombre')
          .limit(500),
        { label: 'pedido_stock' }
      )
      const data = rStock.rows
      if (!rStock.ok) console.error('[pedido] no se pudo leer el stock', rStock.error)
      if (!cancelled) setStock(data)

      // Precio dinámico desde ventas si faltaba
      const enriched = await enriquecerPreciosDesdeVentas(
        cliente?.cliente_key,
        sugeridas.map(l => ({ ...l, cantidad: l.cantidad || 1 }))
      )
      if (!cancelled && enriched?.length) {
        setLineas(prev => {
          return prev.map(l => {
            const e = enriched.find(
              x => String(x.nombre).toLowerCase() === String(l.nombre).toLowerCase()
            )
            if (e && !(Number(l.precio) > 0) && Number(e.precio) > 0) {
              return { ...l, precio: e.precio, motivo: 'histórico' }
            }
            return l
          })
        })
      }
      // Fallback lista de precios desde stock
      if (!cancelled && data?.length) {
        setLineas(prev =>
          prev.map(l => {
            if (Number(l.precio) > 0) return l
            const s =
              data.find(x => String(x.sku_canon) === String(l.sku)) ||
              data.find(
                x =>
                  String(x.producto_nombre || '').toLowerCase() ===
                  String(l.nombre || '').toLowerCase()
              )
            const pl = precioDesdeLista(s)
            return pl ? { ...l, precio: pl, motivo: 'lista' } : l
          })
        )
      }
    })()
    return (
    // sheet: espacio sobre nav
    ) => {
      cancelled = true
    }
  }, [cliente?.cliente_key])

  const stockByKey = useMemo(() => {
    const m = {}
    for (const s of stock) {
      const k1 = String(s.sku_canon || '').toLowerCase()
      const k2 = String(s.producto_nombre || '').toLowerCase()
      if (k1) m[k1] = s
      if (k2) m[k2] = s
    }
    return m
  }, [stock])

  function stockInfo(linea) {
    const a = stockByKey[String(linea.sku || '').toLowerCase()]
    const b = stockByKey[String(linea.nombre || '').toLowerCase()]
    return a || b || null
  }

  function setCant(i, v) {
    const n = Math.max(0, Number(v) || 0)
    setLineas(prev => prev.map((l, j) => (j === i ? { ...l, cantidad: n } : l)))
  }

  function setPrecio(i, v) {
    const n = Math.max(0, Number(v) || 0)
    setLineas(prev => prev.map((l, j) => (j === i ? { ...l, precio: n || null } : l)))
  }

  function removeLine(i) {
    setLineas(prev => prev.filter((_, j) => j !== i))
  }

  function addFromStock(s) {
    const sku = s.sku_canon
    const nombre = productLabel(s) || sku
    if (!nombre) return
    const precioLista = precioDesdeLista(s)
    setLineas(prev => {
      const i = prev.findIndex(
        l =>
          String(l.sku) === String(sku) ||
          String(l.nombre).toLowerCase() === String(nombre).toLowerCase()
      )
      if (i >= 0) {
        return prev.map((l, j) => (j === i ? { ...l, cantidad: Number(l.cantidad) + 1 } : l))
      }
      return [
        ...prev,
        {
          sku,
          nombre,
          cantidad: 1,
          unidad: unidadDesdeNombre(nombre),
          precio: precioLista || null,
          motivo: precioLista ? 'lista' : 'catálogo',
        },
      ]
    })
    setShowCatalog(false)
    setQ('')
  }

  const catalogFiltered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (!qq) return stock.slice(0, 40)
    return stock
      .filter(
        s =>
          String(s.producto_nombre || '').toLowerCase().includes(qq) ||
          String(s.sku_canon || '').toLowerCase().includes(qq)
      )
      .slice(0, 40)
  }, [stock, q])

  const total = useMemo(
    () =>
      lineas.reduce((a, l) => a + (Number(l.precio) || 0) * (Number(l.cantidad) || 0), 0),
    [lineas]
  )

  async function confirmar({ waCliente = false, waBodega = false, pdf = false } = {}) {
    setBusy(true)
    setMsg('')
    const estado = waCliente || waBodega || pdf ? 'enviado' : 'borrador'
    const { data, error, encolado } = await guardarPedido({
      ejecutivoId,
      clienteKey: cliente?.cliente_key,
      nombreCliente: cliente?.nombre_cliente || cliente?.nombre,
      lineas,
      nota,
      estado,
    })
    if (error) {
      setMsg(mensajeDeError(error, { encolado: !!encolado }))
      setBusy(false)
      return
    }
    // Si quedó en la cola, data.id es el client_op_id, NO un id de
    // pedidos. No se puede marcar estado contra esa clave.
    const pedidoId = encolado ? null : data?.id
    if (encolado) {
      setMsg('Sin señal · guardado en el teléfono, se envía solo cuando vuelva la conexión')
    }
    if (pdf) {
      const r = imprimirPedidoPdf({
        cliente,
        lineas,
        ejecutivoNombre,
        nota,
        pedidoId,
        total,
      })
      if (!r.ok) setMsg(r.error || 'No se pudo abrir el PDF')
    }
    if (waCliente) {
      const { url } = buildWhatsAppPedido({ cliente, lineas, ejecutivoNombre })
      if (url) window.open(url, '_blank')
      else setMsg('Sin teléfono del cliente para WhatsApp')
    }
    if (waBodega) {
      const text = buildWhatsAppBodega({ cliente, lineas, ejecutivoNombre, nota })
      // Abre WhatsApp genérico con texto listo (el usuario elige contacto bodega)
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`
      window.open(url, '_blank')
    }
    if (pedidoId && estado === 'enviado' && !encolado) {
      await marcarPedidoEstado(pedidoId, 'enviado')
    }
    setBusy(false)
    onSaved?.({ pedidoId, estado, encolado: !!encolado })
    if (!pdf) onClose?.()
  }

  const nombreCli = cliente?.nombre_cliente || cliente?.nombre || 'Cliente'
  const comuna = cliente?.comuna || ''

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '92dvh',
          overflow: 'auto',
          background: 'var(--bg-soft)',
          borderRadius: '20px 20px 0 0',
          padding: '12px 16px calc(var(--nav-h, 68px) + 16px)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 4,
            background: 'var(--line-3)',
            margin: '0 auto 12px',
          }}
        />

        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--brand)' }}>
          PEDIDO EN TERRENO
        </div>
        <div style={{ fontWeight: 900, fontSize: 20, color: 'var(--ink)', marginTop: 2 }}>{nombreCli}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>
          {[comuna, aReponer?.length ? `${aReponer.length} a reponer` : null, stock.length ? `${stock.length} SKU stock` : null]
            .filter(Boolean)
            .join(' · ')}
        </div>

        <input
          value={q}
          onChange={e => {
            setQ(e.target.value)
            setShowCatalog(true)
          }}
          onFocus={() => setShowCatalog(true)}
          placeholder="Buscar producto en stock…"
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 12,
            border: '1.5px solid #e7e5e4',
            fontSize: 15,
            marginBottom: 10,
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            background: '#fff',
          }}
        />

        {showCatalog && q.trim() && (
          <div
            style={{
              maxHeight: 160,
              overflow: 'auto',
              border: '1px solid #e7e5e4',
              borderRadius: 12,
              marginBottom: 12,
              background: '#fff',
            }}
          >
            {catalogFiltered.map(s => {
              const kg = Number(s.stock_operativo)
              const crit =
                (s.estado_stock || '').toUpperCase().includes('CRIT') || kg <= 0
              return (
                <button
                  key={s.sku_canon || s.producto_nombre}
                  type="button"
                  onClick={() => addFromStock(s)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    border: 'none',
                    borderBottom: '1px solid #f5f5f4',
                    background: '#fff',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
                    {s.producto_nombre}
                  </div>
                  <div style={{ fontSize: 11, color: crit ? 'var(--danger)' : 'var(--ink-3)' }}>
                    stock {kg.toLocaleString('es-CL')} · {s.estado_stock || 'OK'}
                    {s.es_foco_mes ? ' · FOCO' : ''}
                  </div>
                </button>
              )
            })}
            {!catalogFiltered.length && (
              <div style={{ padding: 12, fontSize: 13, color: 'var(--muted)' }}>Sin resultados</div>
            )}
          </div>
        )}

        {lineas.length === 0 && (
          <div
            style={{
              padding: 20,
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 14,
              background: '#fff',
              borderRadius: 14,
              marginBottom: 12,
            }}
          >
            Sin líneas. Buscá un producto o abrí un cliente con historial.
          </div>
        )}

        {lineas.map((l, i) => {
          const st = stockInfo(l)
          const kg = st ? Number(st.stock_operativo) : null
          const sub =
            Number(l.precio) > 0 && Number(l.cantidad) > 0
              ? Number(l.precio) * Number(l.cantidad)
              : null
          if (!l.nombre && !l.sku) return null
          return (
            <div
              key={i}
              style={{
                background: '#fff',
                borderRadius: 14,
                padding: '12px 12px 10px',
                marginBottom: 8,
                border: '1px solid #f5f5f4',
                boxShadow: '0 1px 2px rgba(28,25,23,0.04)',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 14,
                      color: 'var(--ink)',
                      lineHeight: 1.25,
                    }}
                  >
                    {sanitizeNombreProducto(l.nombre) || l.sku || l.nombre}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                    {l.motivo || 'línea'}
                    {kg != null
                      ? ` · stock ${kg.toLocaleString('es-CL')} ${l.unidad || 'kg'}`
                      : ''}
                    {l.motivo ? ` · ${l.motivo}` : (l._promUd ? ` · prom ${Number(l._promUd).toLocaleString('es-CL')} ud/mes` : '')}
                  </div>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  value={l.cantidad}
                  onChange={e => setCant(i, e.target.value)}
                  style={{
                    width: 56,
                    padding: '8px 6px',
                    borderRadius: 10,
                    border: '1.5px solid #e7e5e4',
                    textAlign: 'center',
                    fontWeight: 800,
                    fontSize: 15,
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border: 'none',
                    background: 'var(--danger-lt)',
                    color: 'var(--danger)',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  marginTop: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>Precio</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="—"
                  value={l.precio != null ? l.precio : ''}
                  onChange={e => setPrecio(i, e.target.value)}
                  style={{
                    width: 100,
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: '1.5px solid #fed7aa',
                    background: 'var(--brand-lt2)',
                    fontWeight: 700,
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 700, color: sub != null ? 'var(--brand)' : l.precio > 0 ? 'var(--ok)' : 'var(--muted)' }}>
                  {sub != null ? money(sub) : l.precio > 0 ? `Lista: ${money(l.precio)}` : 'Sin precio — ingresá manualmente'}
                </span>
              </div>
            </div>
          )
        })}

        {total > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 14px',
              background: 'linear-gradient(135deg,#fff7ed,#ffedd5)',
              borderRadius: 14,
              marginBottom: 10,
              border: '1.5px solid #fdba74',
            }}
          >
            <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--brand-dk)' }}>Total estimado</span>
            <span style={{ fontWeight: 900, fontSize: 18, color: 'var(--brand)' }}>{money(total)}</span>
          </div>
        )}

        <textarea
          value={nota}
          onChange={e => setNota(e.target.value)}
          placeholder="Nota interna (opcional)"
          rows={2}
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 12,
            border: '1.5px solid #e7e5e4',
            fontSize: 14,
            marginBottom: 12,
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            resize: 'none',
            background: '#fff',
          }}
        />

        {msg && (
          <div
            style={{
              background: 'var(--danger-lt)',
              color: 'var(--danger-dk)',
              padding: 10,
              borderRadius: 10,
              fontSize: 12,
              marginBottom: 10,
              fontWeight: 600,
            }}
          >
            {msg}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: 14,
              borderRadius: 12,
              border: '1.5px solid #e7e5e4',
              background: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => confirmar({ waBodega: true })}
            className="bs-cta-primary"
            style={{
              flex: 1.4,
              minHeight: 48,
              borderRadius: 14,
              fontSize: 14,
            }}
          >
            {busy ? 'Enviando…' : 'Enviar a bodega'}
          </button>
        </div>
        <div className="bs-pedido-secondary">
          <button type="button" disabled={busy} onClick={() => confirmar({})}>Guardar</button>
          <button type="button" disabled={busy} onClick={() => confirmar({ pdf: true })}>PDF</button>
          <button type="button" disabled={busy} onClick={() => confirmar({ waCliente: true })}>WhatsApp cliente</button>
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 8, textAlign: 'center' }}>
          Primario: despacho · secundario: guardar / PDF / cliente
        </p>
      </div>
    </div>
  )
}
