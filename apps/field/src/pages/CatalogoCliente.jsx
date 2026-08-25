import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { resolverPrecio, precioPublicoItem, estiloOrigenPrecio, formatPrecioClp } from '../lib/precios'
import { productTitle } from '../lib/productDisplay'

const money = n => {
  const v = Number(n)
  if (!v || v <= 0) return 'Consultar'
  return '$' + Math.round(v).toLocaleString('es-CL')
}

const PUBLIC_BRAND = (import.meta.env.VITE_PUBLIC_BRAND || 'Black Sheep').toString()

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="var(--ink)"/>
          <stop offset="100%" stop-color="var(--bs-shell-2)"/>
        </linearGradient>
      </defs>
      <rect fill="url(#g)" width="800" height="800"/>
      <text x="400" y="390" text-anchor="middle" fill="var(--brand-soft)" font-family="system-ui,sans-serif" font-size="28" font-weight="700">${PUBLIC_BRAND}</text>
      <text x="400" y="430" text-anchor="middle" fill="var(--muted)" font-family="system-ui,sans-serif" font-size="16">producto</text>
    </svg>`
  )

function origenLabel(origen) {
  const o = String(origen || '').toLowerCase()
  if (o === 'negociado') return 'Negociado'
  if (o === 'historico') return 'Tu precio'
  if (o === 'lista') return 'Lista'
  return 'Consultar'
}

export default function CatalogoCliente() {
  const { token } = useParams()
  const [catalogo, setCatalogo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState('Todos')
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [nota, setNota] = useState('')
  const [ficha, setFicha] = useState(null)
  const [pedidoId, setPedidoId] = useState(null)
  const [view, setView] = useState('grid') // grid | list

  useEffect(() => {
    let dead = false
    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const { data, error } = await supabase.rpc('get_public_catalogo', { p_token: token })
        if (dead) return
        if (error) {
          setCatalogo(null)
          setErr(error.message || 'No se pudo cargar el catálogo')
        } else if (!data || !data.nombre_cliente) {
          setCatalogo(null)
          setErr('Link inválido o catálogo no disponible')
        } else {
          const itemsNorm = (data.items || []).map(it => {
            const r = precioPublicoItem(it)
            const origen = it.precio_origen || r.origen || 'consultar'
            return {
              ...it,
              precio: r.precio != null ? r.precio : Number(it.precio) || 0,
              precio_origen: origen,
              precio_lista: Number(it.precio_lista) || r.precio_lista || 0,
              precio_cliente: Number(it.precio_cliente) || r.precio_hist || 0,
              etiqueta_precio: r.etiqueta || origenLabel(origen),
              ahorro_vs_lista: r.ahorro_vs_lista,
            }
          })
          setCatalogo({ ...data, items: itemsNorm })
        }
      } catch (e) {
        if (!dead) {
          setCatalogo(null)
          setErr(e.message || 'Error de red')
        }
      } finally {
        if (!dead) setLoading(false)
      }
    })()
    return () => { dead = true }
  }, [token])

  const items = catalogo?.items || []
  const categories = useMemo(() => {
    const set = new Set(items.map(i => i.subfamilia || 'General'))
    return ['Todos', ...Array.from(set).sort()]
  }, [items])

  const filtered = useMemo(() => {
    const x = q.toLowerCase().trim()
    return items.filter(i => {
      const matchQ =
        !x ||
        String(i.producto_nombre || '').toLowerCase().includes(x) ||
        String(i.sku_canon || '').includes(x) ||
        String(i.marca || '').toLowerCase().includes(x) ||
        String(i.resena || '').toLowerCase().includes(x)
      const matchCat = catFilter === 'Todos' || (i.subfamilia || 'General') === catFilter
      return matchQ && matchCat
    })
  }, [items, q, catFilter])

  const available = filtered.filter(i => i.stock_disponible !== false)
  const habituales = available.filter(i => i.es_habitual)
  const reposicion = available.filter(i => (i.es_reposicion || Number(i.cantidad_sugerida) > 0) && !i.es_habitual)
  const ofertas = available.filter(i => i.es_oferta && !i.es_habitual && !(i.es_reposicion || Number(i.cantidad_sugerida) > 0))
  const liquidacion = available.filter(i => i.es_liquidacion && !i.es_habitual && !i.es_oferta)
  const used = new Set([...habituales, ...reposicion, ...ofertas, ...liquidacion].map(i => i.sku_canon))
  const rest = available.filter(i => !used.has(i.sku_canon))
  const cartCount = cart.reduce((a, i) => a + Number(i.cantidad || 0), 0)
  const total = cart.reduce((a, i) => a + Number(i.precio || 0) * Number(i.cantidad || 0), 0)

  function add(i) {
    if (i.stock_disponible === false) {
      setErr(`${productTitle(i).title}: sin stock disponible.`)
      return
    }
    const suggested = Number(i.cantidad_sugerida) > 0 ? Math.max(1, Math.round(i.cantidad_sugerida)) : 1
    setErr('')
    setCart(prev => {
      const hit = prev.find(x => x.sku_canon === i.sku_canon)
      if (hit) {
        return prev.map(x =>
          x.sku_canon === i.sku_canon ? { ...x, cantidad: x.cantidad + 1 } : x
        )
      }
      return [{
        sku_canon: i.sku_canon,
        producto_nombre: i.producto_nombre,
        precio: Number(i.precio) > 0 ? Number(i.precio) : 0,
        cantidad: suggested,
        unidad_venta: i.unidad_venta,
        precio_origen: i.precio_origen,
        imagen_url: i.imagen_url,
      }, ...prev]
    })
    setCartOpen(true)
  }

  function change(sku, delta) {
    setCart(prev =>
      prev
        .map(x => (x.sku_canon === sku ? { ...x, cantidad: Math.max(0, x.cantidad + delta) } : x))
        .filter(x => x.cantidad > 0)
    )
  }

  function setQty(sku, qty) {
    const n = Math.max(0, Math.floor(Number(qty) || 0))
    setCart(prev =>
      prev
        .map(x => (x.sku_canon === sku ? { ...x, cantidad: n } : x))
        .filter(x => x.cantidad > 0)
    )
  }

  async function enviar() {
    if (!cart.length || sending) return
    setSending(true)
    setErr('')
    try {
      const { data, error } = await supabase.rpc('crear_pedido_publico', {
        p_token: token,
        p_lineas: cart.map(i => ({
          sku: i.sku_canon,
          nombre: i.producto_nombre,
          cantidad: i.cantidad,
          precio: i.precio,
        })),
        p_nota: nota || null,
      })
      if (error) throw error
      setPedidoId(data?.id || data?.pedido_id || null)
      setSent(true)
      setCart([])
    } catch (e) {
      setErr(e.message || 'No se pudo enviar el pedido')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="bs-shop">
        <div className="bs-shop-boot">
          <div className="bs-shop-boot-mark">{PUBLIC_BRAND.slice(0, 1)}</div>
          <div className="bs-shop-boot-bar"><span /></div>
          <p>Preparando tu catálogo…</p>
        </div>
      </div>
    )
  }

  if (!catalogo) {
    return (
      <div className="bs-shop">
        <div className="bs-shop-empty-page">
          <h1>Catálogo no disponible</h1>
          <p>{err || 'Este link no es válido o expiró. Pedile uno nuevo a tu ejecutivo.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bs-page bs-shop">
      {/* Hero editorial */}
      <header className="bs-shop-hero">
        <div className="bs-shop-hero-inner">
          <div className="bs-shop-brand">{PUBLIC_BRAND}</div>
          <p className="bs-shop-kicker">Catálogo personalizado</p>
          <h1>{catalogo.nombre_cliente}</h1>
          <p className="bs-shop-sub">
            Precios para vos · {items.length} productos
            {catalogo.actualizado_en ? ` · act. ${String(catalogo.actualizado_en).slice(0, 10)}` : ''}
          </p>
        </div>
      </header>

      {/* Sticky toolbar */}
      <div className="bs-shop-toolbar">
        <div className="bs-shop-search-wrap">
          <input
            className="bs-shop-search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar producto, marca o código…"
            aria-label="Buscar"
          />
        </div>
        <div className="bs-shop-cats" role="tablist">
          {categories.map(c => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={catFilter === c}
              className={'bs-shop-chip' + (catFilter === c ? ' is-on' : '')}
              onClick={() => setCatFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="bs-shop-toolbar-meta">
          <span>{filtered.length} resultados</span>
          <div className="bs-shop-view-toggle">
            <button type="button" className={view === 'grid' ? 'is-on' : ''} onClick={() => setView('grid')} aria-label="Grilla">▣</button>
            <button type="button" className={view === 'list' ? 'is-on' : ''} onClick={() => setView('list')} aria-label="Lista">☰</button>
          </div>
        </div>
      </div>

      {err && <div className="bs-shop-banner-err">{err}</div>}

      <main className="bs-shop-main">
        {habituales.length > 0 && (
          <ShopSection title="Tus habituales" subtitle="Lo que ya comprás — con tu precio" items={habituales} view={view} onAdd={add} onFicha={setFicha} featured />
        )}
        {reposicion.length > 0 && (
          <ShopSection title="Para reponer" subtitle="Según tu ritmo de compra" items={reposicion} view={view} onAdd={add} onFicha={setFicha} />
        )}
        {ofertas.length > 0 && (
          <ShopSection title="Destacados" subtitle="Selección del mes" items={ofertas} view={view} onAdd={add} onFicha={setFicha} />
        )}
        {liquidacion.length > 0 && (
          <ShopSection title="Oportunidad" subtitle="Stock especial" items={liquidacion} view={view} onAdd={add} onFicha={setFicha} />
        )}
        {rest.length > 0 && (
          <ShopSection title={habituales.length || ofertas.length ? 'Todo el catálogo' : 'Productos'} subtitle="Lista completa disponible" items={rest} view={view} onAdd={add} onFicha={setFicha} />
        )}
        {!filtered.length && (
          <div className="bs-shop-empty">
            <h3>Sin resultados</h3>
            <p>Probá otra búsqueda o categoría.</p>
          </div>
        )}
      </main>

      {/* Floating cart pill */}
      {cartCount > 0 && !cartOpen && (
        <button type="button" className="bs-shop-fab" onClick={() => setCartOpen(true)}>
          <span className="bs-shop-fab-count">{cartCount}</span>
          <span>Ver pedido</span>
          {total > 0 && <strong>{money(total)}</strong>}
        </button>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="bs-shop-drawer-bg" onClick={() => setCartOpen(false)}>
          <aside className="bs-shop-drawer" onClick={e => e.stopPropagation()}>
            <div className="bs-shop-drawer-head">
              <h2>Tu pedido</h2>
              <button type="button" className="bs-shop-x" onClick={() => setCartOpen(false)}>×</button>
            </div>
            {sent ? (
              <div className="bs-shop-success">
                <div className="bs-shop-success-icon">✓</div>
                <h3>Pedido enviado</h3>
                <p>Tu ejecutivo lo recibe al instante{pedidoId ? ` · #${String(pedidoId).slice(0, 8)}` : ''}.</p>
                <button type="button" className="bs-shop-btn-primary" onClick={() => { setSent(false); setCartOpen(false) }}>
                  Seguir comprando
                </button>
              </div>
            ) : (
              <>
                <div className="bs-shop-drawer-lines">
                  {cart.map(i => (
                    <div key={i.sku_canon} className="bs-shop-line">
                      <div className="bs-shop-line-img">
                        <img src={i.imagen_url || PLACEHOLDER} alt="" onError={e => { e.currentTarget.src = PLACEHOLDER }} />
                      </div>
                      <div className="bs-shop-line-body">
                        <strong>{i.producto_nombre}</strong>
                        <span>{i.precio > 0 ? money(i.precio) : 'Consultar'}{i.unidad_venta ? ` / ${i.unidad_venta}` : ''}</span>
                        <div className="bs-shop-qty">
                          <button type="button" onClick={() => change(i.sku_canon, -1)}>−</button>
                          <input
                            value={i.cantidad}
                            onChange={e => setQty(i.sku_canon, e.target.value)}
                            inputMode="numeric"
                          />
                          <button type="button" onClick={() => change(i.sku_canon, 1)}>+</button>
                        </div>
                      </div>
                      <div className="bs-shop-line-sub">
                        {i.precio > 0 ? money(i.precio * i.cantidad) : '—'}
                      </div>
                    </div>
                  ))}
                </div>
                <textarea
                  className="bs-shop-nota"
                  placeholder="Nota para tu ejecutivo (opcional)"
                  value={nota}
                  onChange={e => setNota(e.target.value)}
                  rows={2}
                />
                <div className="bs-shop-drawer-foot">
                  <div className="bs-shop-total">
                    <span>Total estimado</span>
                    <strong>{total > 0 ? money(total) : 'A cotizar'}</strong>
                  </div>
                  <button
                    type="button"
                    className="bs-shop-btn-primary"
                    disabled={!cart.length || sending}
                    onClick={enviar}
                  >
                    {sending ? 'Enviando…' : 'Enviar pedido'}
                  </button>
                  <p className="bs-shop-fine">Sin compromiso de pago online · tu ejecutivo confirma stock y entrega.</p>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {/* Product detail modal — página de producto */}
      {ficha && (
        <div className="bs-shop-modal-bg" onClick={() => setFicha(null)}>
          <div className="bs-shop-modal" onClick={e => e.stopPropagation()}>
            <button type="button" className="bs-shop-x bs-shop-modal-x" onClick={() => setFicha(null)}>×</button>
            <div className="bs-shop-modal-grid">
              <div className="bs-shop-modal-media">
                <img
                  src={ficha.imagen_url || PLACEHOLDER}
                  alt=""
                  onError={e => { e.currentTarget.src = PLACEHOLDER }}
                />
              </div>
              <div className="bs-shop-modal-info">
                <div className="bs-shop-status">
                  {ficha.stock_disponible ? 'Disponible' : 'Consultar stock'}
                </div>
                <h2>{productTitle(ficha).title}</h2>
                <p className="bs-shop-meta">
                  {[ficha.subfamilia || 'Producto', ficha.marca, ficha.unidad_venta, ficha.sku_canon]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {ficha.resena && <p className="bs-shop-resena">{ficha.resena}</p>}
                <div className="bs-shop-modal-price">
                  <span className="bs-shop-price-lg">
                    {Number(ficha.precio) > 0 ? money(ficha.precio) : 'Consultar'}
                  </span>
                  {Number(ficha.precio_lista) > 0 &&
                    Number(ficha.precio) > 0 &&
                    Number(ficha.precio) !== Number(ficha.precio_lista) && (
                      <span className="bs-shop-price-strike">Lista {money(ficha.precio_lista)}</span>
                    )}
                </div>
                {(() => {
                  const origen = ficha.precio_origen || 'consultar'
                  const stl = estiloOrigenPrecio(origen)
                  return (
                    <span className="bs-shop-origen" style={{ background: stl.bg, color: stl.color, borderColor: stl.border }}>
                      {origenLabel(origen)}
                      {ficha.ultima_compra && origen === 'historico'
                        ? ` · últ. ${String(ficha.ultima_compra).slice(0, 10)}`
                        : ''}
                    </span>
                  )
                })()}
                <div className="bs-shop-modal-cta">
                  {ficha.ficha_url && (
                    <a className="bs-shop-btn-ghost" href={ficha.ficha_url} target="_blank" rel="noreferrer">
                      Ficha técnica
                    </a>
                  )}
                  <button
                    type="button"
                    className="bs-shop-btn-primary"
                    onClick={() => { add(ficha); setFicha(null) }}
                  >
                    Agregar al pedido
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="bs-shop-foot">
        <span>Powered by Black Sheep</span>
      </footer>
    </div>
  )
}

function ShopSection({ title, subtitle, items, view, onAdd, onFicha, featured }) {
  return (
    <section className={'bs-shop-section' + (featured ? ' is-featured' : '')}>
      <div className="bs-shop-section-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <span>{items.length}</span>
      </div>
      <div className={view === 'list' ? 'bs-shop-list' : 'bs-shop-grid'}>
        {items.map(i => (
          <ProductCard key={i.sku_canon} item={i} view={view} onAdd={onAdd} onFicha={onFicha} />
        ))}
      </div>
    </section>
  )
}

function ProductCard({ item, view, onAdd, onFicha }) {
  const hasPrice = Number(item.precio) > 0
  const d = productTitle(item)
  const origen = item.precio_origen || 'consultar'
  const stl = estiloOrigenPrecio(origen)

  if (view === 'list') {
    return (
      <article className="bs-shop-row">
        <button type="button" className="bs-shop-row-img" onClick={() => onFicha(item)}>
          <img src={item.imagen_url || PLACEHOLDER} alt="" loading="lazy" onError={e => { e.currentTarget.src = PLACEHOLDER }} />
        </button>
        <div className="bs-shop-row-body">
          <h3>{d.title}</h3>
          <p>{[item.subfamilia, item.marca].filter(Boolean).join(' · ')}</p>
          {item.resena && <p className="bs-shop-row-resena">{String(item.resena).slice(0, 100)}{String(item.resena).length > 100 ? '…' : ''}</p>}
        </div>
        <div className="bs-shop-row-price">
          <strong>{hasPrice ? money(item.precio) : 'Consultar'}</strong>
          <span className="bs-shop-origen-sm" style={{ background: stl.bg, color: stl.color }}>{origenLabel(origen)}</span>
          <button type="button" className="bs-shop-add-sm" onClick={() => onAdd(item)}>+ Agregar</button>
        </div>
      </article>
    )
  }

  return (
    <article className="bs-shop-card">
      <button type="button" className="bs-shop-card-media" onClick={() => onFicha(item)}>
        <img
          src={item.imagen_url || PLACEHOLDER}
          alt=""
          loading="lazy"
          onError={e => { e.currentTarget.src = PLACEHOLDER }}
        />
        {item.es_habitual && <span className="bs-shop-tag">Habitual</span>}
        {!item.es_habitual && item.es_oferta && <span className="bs-shop-tag is-hot">Destacado</span>}
        {!item.es_habitual && item.es_liquidacion && <span className="bs-shop-tag is-deal">Oportunidad</span>}
      </button>
      <div className="bs-shop-card-body">
        <div className="bs-shop-card-top">
          <span className={'bs-shop-dot' + (item.stock_disponible ? ' is-ok' : '')}>
            {item.stock_disponible ? 'En stock' : 'Consultar'}
          </span>
        </div>
        <h3>{d.title}</h3>
        <p className="bs-shop-card-meta">
          {[item.subfamilia || 'Producto', item.marca].filter(Boolean).join(' · ')}
        </p>
        {item.resena && (
          <p className="bs-shop-card-resena">
            {String(item.resena).slice(0, 72)}
            {String(item.resena).length > 72 ? '…' : ''}
          </p>
        )}
        <div className="bs-shop-card-price">
          <strong>{hasPrice ? money(item.precio) : 'Consultar'}</strong>
          {hasPrice && Number(item.precio_lista) > 0 && Number(item.precio_lista) !== Number(item.precio) && (
            <s>{money(item.precio_lista)}</s>
          )}
        </div>
        <span className="bs-shop-origen-sm" style={{ background: stl.bg, color: stl.color, borderColor: stl.border }}>
          {origenLabel(origen)}
        </span>
        <div className="bs-shop-card-actions">
          <button type="button" className="bs-shop-link" onClick={() => onFicha(item)}>
            {item.ficha_url ? 'Ficha' : 'Ver'}
          </button>
          <button type="button" className="bs-shop-add" onClick={() => onAdd(item)}>
            {Number(item.cantidad_sugerida) > 0 ? `+ ${Math.round(item.cantidad_sugerida)}` : '+ Agregar'}
          </button>
        </div>
      </div>
    </article>
  )
}
