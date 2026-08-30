import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { safeSelect } from '../lib/query.js'
import { parseSkuDetalle } from '../lib/coach.js'
import { precioUnitarioDesdeSku } from '../lib/pedido.js'
import { resolverPrecio, resolverPrecioCliente, estiloOrigenPrecio, formatPrecioClp, precioDesdeLista } from '../lib/precios.js'

const money = n => {
  const v = Number(n)
  if (!v || v <= 0) return '—'
  return '$' + Math.round(v).toLocaleString('es-CL')
}

function token() {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function fmtFecha(f) {
  if (!f) return null
  const s = String(f).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Oferta = catálogo permanente del cliente.
 * UX: búsqueda primero → agregar → precios lista/histórico + última compra.
 */
export default function OfertaClienteSheet({ cliente, ejecutivoId, onClose }) {
  const [stock, setStock] = useState([])
  const [items, setItems] = useState([])
  const [offer, setOffer] = useState(null)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)

  const hist = useMemo(() => parseSkuDetalle(cliente?.sku_detalle || ''), [cliente?.sku_detalle])
  const histByName = useMemo(() => {
    const m = new Map()
    hist.forEach(h => {
      const k = String(h.nombre || '').toLowerCase().slice(0, 32)
      if (k) m.set(k, h)
    })
    return m
  }, [hist])

  function matchHist(nombre) {
    const name = String(nombre || '').toLowerCase()
    for (const [k, h] of histByName.entries()) {
      if (name.includes(k) || k.includes(name.slice(0, 28))) return h
    }
    return null
  }

  useEffect(() => {
    let dead = false
    ;(async () => {
      setLoading(true)
      // safeSelect: si la consulta FALLA, `rows` es el fallback (vacío) pero
      // `ok:false` lo dice — no se confunde "falló" con "no hay oferta".
      const [rs, ro] = await Promise.all([
        safeSelect(
          supabase.from('stock').select('*').order('producto_nombre').limit(800),
          { label: 'oferta_stock' }
        ),
        safeSelect(
          supabase
            .from('ofertas_cliente')
            .select('*')
            .eq('cliente_key', cliente?.cliente_key)
            .eq('activo', true)
            .maybeSingle(),
          { label: 'oferta_cabecera' }
        ),
      ])
      if (dead) return
      const s = rs.rows
      const o = ro.rows[0] || null
      setStock(s)
      setOffer(o)
      if (!rs.ok) console.error('[oferta] no se pudo leer el stock del catálogo', rs.error)
      if (!ro.ok) console.error('[oferta] no se pudo leer la oferta del cliente', ro.error)
      if (o?.id) {
        const ri = await safeSelect(
          supabase
            .from('oferta_cliente_items')
            .select('*')
            .eq('oferta_id', o.id)
            .order('prioridad'),
          { label: 'oferta_items' }
        )
        const oi = ri.rows
        if (!ri.ok) console.error('[oferta] no se pudieron leer los items de la oferta', ri.error)
        const stockMap = new Map(s.map(x => [String(x.sku_canon), x]))
        const enriched = oi.map(it => {
          const st = stockMap.get(String(it.sku_canon)) || {
            sku_canon: it.sku_canon,
            producto_nombre: it.producto_nombre,
          }
          if (!st.producto_nombre) st.producto_nombre = it.producto_nombre
          const applied = resolverPrecioCliente(st, cliente, {
            precioClienteGuardado: it.precio_cliente,
          })
          // precio_cliente en oferta = precio que ve el cliente (hist, lista o negociado)
          const precioCliente =
            Number(it.precio_cliente) > 0
              ? Math.round(Number(it.precio_cliente))
              : applied.precio_hist || (applied.origen === 'historico' ? applied.precio : null)
          return {
            ...it,
            precio_lista: applied.precio_lista,
            precio_cliente: precioCliente,
            precio_origen: applied.origen,
            precio_etiqueta: applied.etiqueta,
            ultima: applied.fecha_hist || null,
          }
        })
        setItems(enriched)
      } else {
        // Solo habituales del cliente (no inundar con todo el catálogo)
        const habituales = hist.map(x => String(x.nombre || '').toLowerCase()).filter(Boolean)
        const seed = (s || [])
          .filter(x => {
            const name = String(x.producto_nombre || '').toLowerCase()
            return habituales.some(h => h && (name.includes(h.slice(0, 28)) || h.includes(name.slice(0, 28))))
          })
          .slice(0, 20)
          .map((x, idx) => {
            const h = matchHist(x.producto_nombre)
            const r = resolverPrecio({ histSku: h, stockItem: x })
            return {
              sku_canon: String(x.sku_canon),
              producto_nombre: x.producto_nombre,
              precio_lista: r.precio_lista,
              precio_cliente: r.precio_hist,
              precio_origen: r.origen,
              precio_etiqueta: r.etiqueta,
              visible: true,
              destacado: true,
              prioridad: idx,
              ultima: r.fecha_hist || h?.ultima || null,
            }
          })
        setItems(seed)
      }
      setLoading(false)
    })()
    return () => {
      dead = true
    }
  }, [cliente?.cliente_key])

  const bySku = useMemo(() => new Map(stock.map(s => [String(s.sku_canon), s])), [stock])
  const selectedSkus = useMemo(() => new Set(items.map(i => String(i.sku_canon))), [items])

  // Búsqueda: solo resultados al escribir (mín 2 chars)
  const searchHits = useMemo(() => {
    const text = q.trim().toLowerCase()
    if (text.length < 2) return []
    return stock
      .filter(s => {
        const name = String(s.producto_nombre || '').toLowerCase()
        const sku = String(s.sku_canon || '').toLowerCase()
        return name.includes(text) || sku.includes(text)
      })
      .slice(0, 40)
  }, [stock, q])

  function basePrice(s) {
    return precioDesdeLista(s)
  }

  function resolveForStock(s, override = null) {
    const h = matchHist(s?.producto_nombre)
    return resolverPrecio({ override, histSku: h, stockItem: s })
  }

  function addProduct(s) {
    const sku = String(s.sku_canon)
    if (selectedSkus.has(sku)) return
    const h = matchHist(s.producto_nombre)
    const r = resolveForStock(s)
    setItems(prev => [
      ...prev,
      {
        sku_canon: sku,
        producto_nombre: s.producto_nombre || sku,
        precio_lista: r.precio_lista,
        precio_cliente: r.precio_hist || (r.origen === 'lista' ? r.precio : null),
        precio_origen: r.origen,
        precio_etiqueta: r.etiqueta,
        visible: true,
        destacado: Boolean(s.es_foco_mes) || Boolean(h),
        prioridad: prev.length,
        ultima: r.fecha_hist || h?.ultima || null,
      },
    ])
    setQ('')
  }

  function removeItem(sku) {
    setItems(prev => prev.filter(i => String(i.sku_canon) !== String(sku)))
  }

  function patchItem(sku, patch) {
    setItems(prev => prev.map(i => (String(i.sku_canon) === String(sku) ? { ...i, ...patch } : i)))
  }

  const publicLink = offer?.token
    ? `${window.location.origin}/catalogo/${offer.token}`
    : null

  async function guardar() {
    setSaving(true)
    setMsg('')
    try {
      let current = offer
      if (!current?.id) {
        const tok = token()
        const { data, error } = await supabase
          .from('ofertas_cliente')
          .insert({
            cliente_key: cliente.cliente_key,
            nombre_cliente: cliente.nombre_cliente || cliente.razon_social || cliente.cliente_key,
            ejecutivo_id: ejecutivoId,
            token: tok,
            activo: true,
          })
          .select('*')
          .single()
        if (error) throw error
        current = data
        setOffer(data)
      } else {
        await supabase
          .from('ofertas_cliente')
          .update({
            actualizado_en: new Date().toISOString(),
            nombre_cliente: cliente.nombre_cliente || cliente.razon_social || cliente.cliente_key,
            ejecutivo_id: ejecutivoId || current.ejecutivo_id,
          })
          .eq('id', current.id)
      }

      await supabase.from('oferta_cliente_items').delete().eq('oferta_id', current.id)
      if (items.length) {
        const rows = items.map((i, idx) => ({
          oferta_id: current.id,
          sku_canon: i.sku_canon,
          producto_nombre: i.producto_nombre,
          precio_lista: i.precio_lista != null ? Number(i.precio_lista) : null,
          precio_cliente: i.precio_cliente != null ? Number(i.precio_cliente) : null,
          visible: i.visible !== false,
          destacado: Boolean(i.destacado),
          prioridad: idx,
        }))
        const { error: e2 } = await supabase.from('oferta_cliente_items').insert(rows)
        if (e2) throw e2
      }
      setMsg('Oferta guardada · link listo para el cliente')
    } catch (e) {
      setMsg(e.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function copyLink() {
    if (!publicLink) return
    try {
      await navigator.clipboard.writeText(publicLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setMsg(publicLink)
    }
  }

  const ultimaCliente = cliente?.ultima_compra || cliente?.fecha_ultima_compra

  return (
    <div className="kf-sheet-backdrop" onClick={onClose}>
      <div className="kf-sheet kf-sheet-oferta" onClick={e => e.stopPropagation()}>
        <header className="kf-sheet-head">
          <div>
            <div className="kf-sheet-kicker">CATÁLOGO DEL CLIENTE</div>
            <h2>{cliente?.nombre_cliente || cliente?.razon_social || 'Cliente'}</h2>
            <p className="kf-sheet-sub">
              {ultimaCliente ? `Última compra: ${fmtFecha(ultimaCliente)}` : 'Sin fecha de última compra'}
              {cliente?.dias_sin_comprar != null ? ` · ${cliente.dias_sin_comprar}d sin comprar` : ''}
            </p>
          </div>
          <button type="button" className="kf-sheet-x" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        {loading ? (
          <div className="kf-sheet-body">Cargando productos…</div>
        ) : (
          <div className="kf-sheet-body">
            <div className="kf-offer-search-wrap">
              <input
                className="kf-offer-search"
                placeholder="Buscar por nombre o código SKU…"
                value={q}
                onChange={e => setQ(e.target.value)}
                autoFocus
              />
              <span className="kf-offer-count">{items.length} en catálogo</span>
            </div>

            {q.trim().length >= 2 && (
              <div className="kf-offer-hits">
                {searchHits.length === 0 && (
                  <div className="kf-muted">Sin resultados para “{q}”</div>
                )}
                {searchHits.map(s => {
                  const selected = selectedSkus.has(String(s.sku_canon))
                  const st = Number(s.stock_operativo || 0)
                  const estado = s.estado_stock || ''
                  const precio = basePrice(s)
                  const h = matchHist(s.producto_nombre)
                  return (
                    <button
                      key={s.sku_canon}
                      type="button"
                      className={'kf-offer-hit' + (selected ? ' is-on' : '')}
                      disabled={selected}
                      onClick={() => addProduct(s)}
                    >
                      <div className="kf-offer-hit-main">
                        <strong>{s.producto_nombre || s.sku_canon}</strong>
                        <span>
                          SKU {s.sku_canon}
                          {(() => { const r = resolveForStock(s); return r.precio ? ` · ${r.etiqueta} ${money(r.precio)}` : ' · Consultar' })()}
                          {h?.ultima ? ` · Últ. venta ${fmtFecha(h.ultima)}` : ''}
                        </span>
                      </div>
                      <div className="kf-offer-hit-meta">
                        <span className={st > 0 && estado !== 'SIN_STOCK' ? 'ok' : 'bad'}>
                          {st > 0 ? `${st.toLocaleString('es-CL')} kg` : 'Sin stock'}
                        </span>
                        <span className="add">{selected ? '✓' : '+'}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {q.trim().length < 2 && (
              <p className="kf-muted kf-offer-hint">
                Escribí al menos 2 letras o un código para agregar productos. El cliente solo ve lo que está en su
                catálogo abajo.
              </p>
            )}

            <h3 className="kf-offer-section">Productos del catálogo ({items.length})</h3>
            {items.length === 0 && (
              <p className="kf-muted">Todavía no hay productos. Buscá y agregá SKUs.</p>
            )}
            <div className="kf-offer-items">
              {items.map(i => {
                const s = bySku.get(String(i.sku_canon))
                const st = Number(s?.stock_operativo || 0)
                const h = matchHist(i.producto_nombre)
                const ultima = i.ultima || h?.ultima
                return (
                  <div key={i.sku_canon} className="kf-offer-item">
                    <div className="kf-offer-item-top">
                      <div>
                        <strong>{i.producto_nombre}</strong>
                        {(() => {
                          const r = resolverPrecioCliente(s || { producto_nombre: i.producto_nombre, sku_canon: i.sku_canon }, cliente, {
                            precioClienteGuardado: i.precio_cliente,
                          })
                          const stl = estiloOrigenPrecio(r.origen)
                          return (
                            <span style={{
                              display: 'inline-block', marginLeft: 6, fontSize: 10, fontWeight: 800,
                              padding: '2px 7px', borderRadius: 999,
                              background: stl.bg, color: stl.color, border: `1px solid ${stl.border}`,
                            }}>
                              {r.etiqueta}{r.precio ? ` ${formatPrecioClp(r.precio)}` : ''}
                            </span>
                          )
                        })()}
                        <div className="kf-muted">
                          SKU {i.sku_canon}
                          {s?.estado_stock ? ` · ${s.estado_stock}` : ''}
                          {st ? ` · ${st.toLocaleString('es-CL')} kg` : ''}
                          {ultima ? ` · Últ. venta ${fmtFecha(ultima)}` : ''}
                        </div>
                      </div>
                      <button type="button" className="kf-offer-remove" onClick={() => removeItem(i.sku_canon)}>
                        ×
                      </button>
                    </div>
                    <div className="kf-offer-prices">
                      <label>
                        Lista
                        <input
                          type="number"
                          inputMode="decimal"
                          value={i.precio_lista && Number(i.precio_lista) > 0 ? i.precio_lista : ''}
                          placeholder={basePrice(s) ? String(basePrice(s)) : (i.precio_cliente ? String(i.precio_cliente) : 'sin precio')}
                          onChange={e =>
                            patchItem(i.sku_canon, {
                              precio_lista: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Cliente
                        <input
                          type="number"
                          inputMode="decimal"
                          value={i.precio_cliente ?? ''}
                          placeholder="igual a lista"
                          onChange={e =>
                            patchItem(i.sku_canon, {
                              precio_cliente: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="kf-offer-flags">
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(i.destacado)}
                          onChange={e => patchItem(i.sku_canon, { destacado: e.target.checked })}
                        />{' '}
                        Recomendado
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={i.visible !== false}
                          onChange={e => patchItem(i.sku_canon, { visible: e.target.checked })}
                        />{' '}
                        Visible
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <footer className="kf-sheet-foot">
          {publicLink && (
            <div className="kf-offer-link">
              <span className="kf-offer-link-url">{publicLink}</span>
              <button type="button" onClick={copyLink}>
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              <a href={publicLink} target="_blank" rel="noreferrer">
                Ver
              </a>
            </div>
          )}
          {msg && <div className="kf-offer-msg">{msg}</div>}
          <div className="kf-sheet-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cerrar
            </button>
            <button type="button" className="btn-primary" disabled={saving} onClick={guardar}>
              {saving ? 'Guardando…' : publicLink ? 'Actualizar catálogo' : 'Guardar y crear link'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
