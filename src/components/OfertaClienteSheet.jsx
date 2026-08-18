import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseSkuDetalle } from '../lib/coach'

const money = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')

function token() {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export default function OfertaClienteSheet({ cliente, ejecutivoId, onClose }) {
  const [stock, setStock] = useState([])
  const [items, setItems] = useState([])
  const [offer, setOffer] = useState(null)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let dead = false
    ;(async () => {
      setLoading(true)
      const [{ data: s }, { data: o }] = await Promise.all([
        supabase.from('stock').select('*').order('producto_nombre').limit(500),
        supabase.from('ofertas_cliente').select('*').eq('cliente_key', cliente?.cliente_key).eq('activo', true).maybeSingle(),
      ])
      if (dead) return
      setStock(s || [])
      setOffer(o || null)
      if (o?.id) {
        const { data: oi } = await supabase.from('oferta_cliente_items').select('*').eq('oferta_id', o.id).order('prioridad')
        setItems(oi || [])
      } else {
        // Primera propuesta: habituales del cliente + focos con stock.
        const habituales = parseSkuDetalle(cliente?.sku_detalle || '').map(x => String(x.nombre || '').toLowerCase())
        const seed = (s || []).filter(x => {
          const name = String(x.producto_nombre || '').toLowerCase()
          const disponible = Number(x.stock_operativo || 0) > 0 && !['SIN_STOCK','VENCIDO'].includes(x.estado_stock)
          const habitual = habituales.some(h => h && (name.includes(h.slice(0, 28)) || h.includes(name.slice(0, 28))))
          return disponible && (habitual || x.es_foco_mes)
        }).slice(0, 18)
        setItems(seed.map((x, idx) => ({
          sku_canon: String(x.sku_canon), producto_nombre: x.producto_nombre,
          precio_lista: Number(x.precio_unidad || x.precio_caja || 0) || null, precio_cliente: null,
          visible: true, destacado: Boolean(x.es_foco_mes), prioridad: idx,
        })))
      }
      setLoading(false)
    })()
    return () => { dead = true }
  }, [cliente?.cliente_key])

  const bySku = useMemo(() => new Map(stock.map(s => [String(s.sku_canon), s])), [stock])
  const itemBySku = useMemo(() => new Map(items.map(i => [String(i.sku_canon), i])), [items])
  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase()
    return stock.filter(s => {
      if (!text) return true
      return String(s.producto_nombre || '').toLowerCase().includes(text) || String(s.sku_canon || '').includes(text)
    }).slice(0, 60)
  }, [stock, q])

  function basePrice(s) {
    return Number(s.precio_unidad || s.precio_caja || 0)
  }

  function toggleProduct(s) {
    const sku = String(s.sku_canon)
    setItems(prev => {
      if (prev.some(i => String(i.sku_canon) === sku)) return prev.filter(i => String(i.sku_canon) !== sku)
      return [...prev, {
        sku_canon: sku,
        producto_nombre: s.producto_nombre || sku,
        precio_lista: basePrice(s) || null,
        precio_cliente: null,
        visible: true,
        destacado: Boolean(s.es_foco_mes),
        prioridad: prev.length,
      }]
    })
  }

  function patchItem(sku, patch) {
    setItems(prev => prev.map(i => String(i.sku_canon) === String(sku) ? { ...i, ...patch } : i))
  }

  async function guardar() {
    setSaving(true); setMsg('')
    try {
      let current = offer
      if (!current) {
        const { data, error } = await supabase.from('ofertas_cliente').insert({
          cliente_key: cliente.cliente_key,
          ejecutivo_id: ejecutivoId,
          nombre_cliente: cliente.nombre_cliente || cliente.razon_social || cliente.nombre,
          token: token(),
          activo: true,
        }).select('*').single()
        if (error) throw error
        current = data
        setOffer(data)
      }
      await supabase.from('oferta_cliente_items').delete().eq('oferta_id', current.id)
      const rows = items.map((i, idx) => ({
        oferta_id: current.id,
        sku_canon: String(i.sku_canon),
        producto_nombre: i.producto_nombre || bySku.get(String(i.sku_canon))?.producto_nombre || String(i.sku_canon),
        precio_lista: Number(i.precio_lista) || null,
        precio_cliente: Number(i.precio_cliente) || null,
        visible: i.visible !== false,
        destacado: Boolean(i.destacado),
        prioridad: idx,
      }))
      if (rows.length) {
        const { error } = await supabase.from('oferta_cliente_items').insert(rows)
        if (error) throw error
      }
      const { error: oe } = await supabase.from('ofertas_cliente').update({ actualizado_en: new Date().toISOString(), activo: true }).eq('id', current.id)
      if (oe) throw oe
      setMsg('Oferta guardada. El link es permanente.')
    } catch (e) {
      setMsg(e?.message || 'No se pudo guardar la oferta.')
    } finally { setSaving(false) }
  }

  const link = offer ? `${window.location.origin}/catalogo/${offer.token}` : ''

  async function copyLink() {
    if (!link) return
    await navigator.clipboard?.writeText(link)
    setMsg('Link copiado.')
  }

  return <div className="kf-sheet-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className="kf-offer-sheet">
      <header className="kf-sheet-head">
        <div><div className="kf-eyebrow">OFERTA PERMANENTE</div><h2>{cliente.nombre_cliente || cliente.razon_social || cliente.nombre}</h2><p>Configura qué ve, qué puede comprar y qué precio recibe.</p></div>
        <button className="kf-close" onClick={onClose}>×</button>
      </header>
      {loading ? <div className="kf-offer-loading">Cargando catálogo…</div> : <>
        <div className="kf-offer-toolbar">
          <input className="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto…" />
          <div className="kf-offer-count">{items.length} productos seleccionados</div>
        </div>
        <div className="kf-offer-grid">
          <div className="kf-product-picker">
            {filtered.map(s => {
              const sku = String(s.sku_canon), active = itemBySku.has(sku)
              const hasStock = Number(s.stock_operativo) > 0 && !['SIN_STOCK','VENCIDO'].includes(s.estado_stock)
              return <button key={sku} className={'kf-product-pick ' + (active ? 'selected' : '')} onClick={() => toggleProduct(s)}>
                <div><strong>{s.producto_nombre || sku}</strong><span>{s.subfamilia || 'Producto'} · SKU {sku}</span></div>
                <div className="kf-product-pick-right"><b>{hasStock ? '🟢' : '⚪'}</b><span>{active ? '✓' : '+'}</span></div>
              </button>
            })}
          </div>
          <div className="kf-offer-selected">
            <div className="kf-panel-title">OFERTA DEL CLIENTE</div>
            {!items.length && <div className="kf-empty">Selecciona productos del catálogo.</div>}
            {items.map(i => {
              const s = bySku.get(String(i.sku_canon)) || {}
              return <div className="kf-offer-item" key={i.sku_canon}>
                <div className="kf-offer-item-top"><div><strong>{i.producto_nombre}</strong><span>{s.estado_stock || 'stock'} · {Number(s.stock_operativo || 0).toLocaleString('es-CL')} kg</span></div><button onClick={() => toggleProduct(i)}>×</button></div>
                <div className="kf-price-row"><label>Lista<input type="number" value={i.precio_lista ?? ''} onChange={e => patchItem(i.sku_canon, { precio_lista: e.target.value })} /></label><label>Cliente<input type="number" placeholder="igual a lista" value={i.precio_cliente ?? ''} onChange={e => patchItem(i.sku_canon, { precio_cliente: e.target.value })} /></label></div>
                <div className="kf-item-options"><label><input type="checkbox" checked={Boolean(i.destacado)} onChange={e => patchItem(i.sku_canon, { destacado: e.target.checked })} /> Recomendado</label><label><input type="checkbox" checked={i.visible !== false} onChange={e => patchItem(i.sku_canon, { visible: e.target.checked })} /> Visible</label></div>
              </div>
            })}
          </div>
        </div>
        <footer className="kf-offer-footer">
          <div className="kf-link-box">{link ? <><span>🔗 {link}</span><button onClick={copyLink}>Copiar</button></> : <span>Guarda la oferta para generar el link permanente.</span>}</div>
          <div className="kf-footer-actions"><button className="btn btn-ghost" onClick={onClose}>Cancelar</button>{link && <a className="btn btn-ghost" href={link} target="_blank" rel="noreferrer">Ver como cliente</a>}<button className="btn btn-primary" disabled={saving} onClick={guardar}>{saving ? 'Guardando…' : 'Guardar oferta'}</button></div>
          {msg && <div className="kf-save-msg">{msg}</div>}
        </footer>
      </>}
    </section>
  </div>
}
