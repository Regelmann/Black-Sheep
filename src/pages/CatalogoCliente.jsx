import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { resolverPrecio, precioPublicoItem, estiloOrigenPrecio, formatPrecioClp } from '../lib/precios'

const money = n => {
  const v = Number(n)
  if (!v || v <= 0) return 'Consultar'
  return '$' + Math.round(v).toLocaleString('es-CL')
}

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <rect fill="#f3efe8" width="400" height="400"/>
      <text x="200" y="198" text-anchor="middle" fill="#c2410c" font-family="system-ui,sans-serif" font-size="16" font-weight="700">KEYFOODS</text>
      <text x="200" y="222" text-anchor="middle" fill="#a8a29e" font-family="system-ui,sans-serif" font-size="12">producto</text>
    </svg>`
  )

export default function CatalogoCliente() {
  const { token } = useParams()
  const [catalogo, setCatalogo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState('Todos')
  const [sectionFilter, setSectionFilter] = useState('Todos') // Todos|Habituales|Ofertas|Liquidacion|Repetir
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [nota, setNota] = useState('')
  const [ficha, setFicha] = useState(null)
  const [pedidoId, setPedidoId] = useState(null)

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
        } else {
          const itemsNorm = (data.items || []).map(it => {
            const r = precioPublicoItem(it)
            return {
              ...it,
              precio: r.precio != null ? r.precio : it.precio,
              precio_origen: r.origen,
              precio_lista: it.precio_lista || r.precio_lista,
              precio_cliente: it.precio_cliente || r.precio_hist,
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
        String(i.marca || '').toLowerCase().includes(x)
      const matchCat = catFilter === 'Todos' || (i.subfamilia || 'General') === catFilter
      if (!matchQ || !matchCat) return false
      if (sectionFilter === 'Habituales') return Boolean(i.es_habitual) || Number(i.pedidos_previos) > 0
      if (sectionFilter === 'Ofertas') return Boolean(i.es_oferta) || Boolean(i.destacado)
      if (sectionFilter === 'Liquidacion') return Boolean(i.es_liquidacion)
      if (sectionFilter === 'Repetir') return Number(i.cantidad_sugerida) > 0 && Number(i.pedidos_previos) > 0
      return true
    })
  }, [items, q, catFilter, sectionFilter])

  const liquidacion = filtered.filter(i => i.es_liquidacion)
  const ofertas = filtered.filter(i => (i.es_oferta || i.destacado) && !i.es_liquidacion)
  const habituales = filtered.filter(
    i => (i.es_habitual || Number(i.pedidos_previos) > 0) && !i.es_liquidacion && !(i.es_oferta || i.destacado)
  )
  const smartRepeat = filtered.filter(i => Number(i.cantidad_sugerida) > 0 && Number(i.pedidos_previos) > 0)
  const rest = filtered.filter(i => {
    if (i.es_liquidacion) return false
    if (i.es_oferta || i.destacado) return false
    if (i.es_habitual || Number(i.pedidos_previos) > 0) return false
    return true
  })
  const cartCount = cart.reduce((a, i) => a + Number(i.cantidad || 0), 0)
  const total = cart.reduce((a, i) => a + Number(i.precio || 0) * Number(i.cantidad || 0), 0)

  function add(i) {
    if (!i.stock_disponible && i.stock_disponible !== undefined) {
      // still allow if precio exists - soft gate
    }
    setCart(prev => {
      const hit = prev.find(x => x.sku_canon === i.sku_canon)
      if (hit) {
        return prev.map(x =>
          x.sku_canon === i.sku_canon ? { ...x, cantidad: x.cantidad + 1 } : x
        )
      }
      return [
        ...prev,
        {
          sku_canon: i.sku_canon,
          producto_nombre: i.producto_nombre,
          precio: Number(i.precio) > 0 ? Number(i.precio) : 0,
          cantidad: Number(i.cantidad_sugerida) > 0 ? Math.max(1, Math.round(Number(i.cantidad_sugerida))) : 1,
          unidad_venta: i.unidad_venta,
        },
      ]
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

  function buildWhatsAppText() {
    const lines = cart.map(
      i =>
        `• ${i.producto_nombre} × ${i.cantidad}` +
        (i.precio > 0 ? ` · ${money(i.precio)}` : '')
    )
    return [
      `Pedido catálogo — ${catalogo?.nombre_cliente || ''}`,
      '',
      ...lines,
      '',
      total > 0 ? `Total estimado: ${money(total)}` : '',
      nota ? `Nota: ${nota}` : '',
    ]
      .filter(Boolean)
      .join('\n')
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
      })
      if (error) throw error
      setPedidoId(data || null)
      setSent(true)
      setCartOpen(false)
    } catch (e) {
      // Fallback: WhatsApp con texto listo
      setErr(
        (e.message || 'No se pudo enviar') +
          ' · Podés copiar el pedido o enviarlo por WhatsApp.'
      )
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="kf-pub">
        <div className="kf-pub-loading">
          <div className="kf-pub-brand">KEYFOODS</div>
          <p>Cargando tu lista de precios…</p>
        </div>
      </div>
    )
  }

  if (!catalogo) {
    return (
      <div className="kf-pub">
        <div className="kf-pub-empty">
          <div className="kf-pub-brand">KEYFOODS</div>
          <h1>Catálogo no disponible</h1>
          <p>{err || 'El enlace puede estar inactivo o haber vencido. Pedile uno nuevo a tu ejecutivo.'}</p>
        </div>
      </div>
    )
  }

  if (sent) {
    return (
      <div className="kf-pub">
        <div className="kf-pub-empty">
          <div className="kf-pub-brand">KEYFOODS</div>
          <div className="kf-pub-ok">✓</div>
          <h1>¡Pedido recibido!</h1>
          <p>
            Tu pedido quedó registrado
            {pedidoId ? ` (#${String(pedidoId).slice(0, 8)})` : ''}.
            Tu ejecutivo KeyFoods lo va a confirmar.
          </p>
          <button
            type="button"
            className="kf-pub-btn"
            onClick={() => {
              setSent(false)
              setCart([])
              setNota('')
              setPedidoId(null)
            }}
          >
            Seguir viendo productos
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="kf-pub">
      <header className="kf-pub-head">
        <div>
          <div className="kf-pub-brand">KEYFOODS · LISTA DE PRECIOS</div>
          <h1>{catalogo.nombre_cliente}</h1>
          <p>
            {items.length} productos · lista completa + tus precios
            {catalogo.actualizado_en
              ? ` · act. ${String(catalogo.actualizado_en).slice(0, 10)}`
              : ''}
          </p>
        </div>
        <button
          type="button"
          className="kf-pub-cart-badge"
          onClick={() => setCartOpen(o => !o)}
          aria-label="Abrir carrito"
        >
          🛒 {cartCount}
        </button>
      </header>

      <div className="kf-pub-search-wrap">
        <input
          className="kf-pub-search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar producto, marca o código…"
          inputMode="search"
        />
      </div>

      <div className="kf-pub-cats" role="tablist" style={{ marginBottom: 8 }}>
        {[
          { id: 'Todos', label: 'Todos' },
          { id: 'Habituales', label: 'Para vos' },
          { id: 'Ofertas', label: 'Ofertas' },
          { id: 'Liquidacion', label: 'Liquidación' },
          { id: 'Repetir', label: '↻ Repetir' },
        ].map(s => (
          <button
            key={s.id}
            type="button"
            role="tab"
            className={'kf-pub-cat' + (sectionFilter === s.id ? ' is-on' : '')}
            onClick={() => setSectionFilter(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="kf-pub-cats" role="tablist">
        {categories.map(c => (
          <button
            key={c}
            type="button"
            role="tab"
            className={'kf-pub-cat' + (catFilter === c ? ' is-on' : '')}
            onClick={() => setCatFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {!items.length && (
        <div className="kf-pub-empty" style={{ padding: '24px 12px' }}>
          <p>Tu ejecutivo todavía no cargó productos en este catálogo.</p>
        </div>
      )}

      {sectionFilter === 'Todos' && liquidacion.length > 0 && (
        <section className="kf-pub-section">
          <h2>🔥 Liquidación / empujar</h2>
          <div className="kf-pub-grid">
            {liquidacion.map(i => (
              <ProductCard key={i.sku_canon} item={i} onAdd={add} onFicha={setFicha} />
            ))}
          </div>
        </section>
      )}

      {sectionFilter === 'Todos' && ofertas.length > 0 && (
        <section className="kf-pub-section">
          <h2>✨ Ofertas y focos</h2>
          <div className="kf-pub-grid">
            {ofertas.map(i => (
              <ProductCard key={'o-'+i.sku_canon} item={i} onAdd={add} onFicha={setFicha} />
            ))}
          </div>
        </section>
      )}

      {sectionFilter === 'Todos' && smartRepeat.length > 0 && (
        <section className="kf-pub-section">
          <h2>↻ Para repetir hoy</h2>
          <div className="kf-pub-grid">
            {smartRepeat.slice(0, 8).map(i => (
              <ProductCard key={'r-'+i.sku_canon} item={i} onAdd={add} onFicha={setFicha} />
            ))}
          </div>
        </section>
      )}

      {sectionFilter === 'Todos' && habituales.length > 0 && (
        <section className="kf-pub-section">
          <h2>Para vos</h2>
          <div className="kf-pub-grid">
            {habituales.map(i => (
              <ProductCard key={'h-'+i.sku_canon} item={i} onAdd={add} onFicha={setFicha} />
            ))}
          </div>
        </section>
      )}

      <section className="kf-pub-section">
        {sectionFilter === 'Todos' && <h2>Catálogo completo</h2>}
        <div className="kf-pub-grid">
          {(sectionFilter === 'Todos' ? rest : filtered).map(i => (
            <ProductCard key={i.sku_canon} item={i} onAdd={add} onFicha={setFicha} />
          ))}
        </div>
      </section>

      {filtered.length === 0 && items.length > 0 && (
        <p className="kf-pub-muted" style={{ textAlign: 'center', padding: 20 }}>
          No hay resultados para “{q}”.
        </p>
      )}

      {/* Checkout sticky */}
      <div className={'kf-pub-checkout' + (cartOpen || cartCount > 0 ? ' is-open' : '')}>
        <button
          type="button"
          className="kf-pub-checkout-toggle"
          onClick={() => setCartOpen(o => !o)}
        >
          <span>
            {cartCount > 0 ? `${cartCount} ítem${cartCount === 1 ? '' : 's'}` : 'Carrito vacío'}
          </span>
          <strong>{total > 0 ? money(total) : '—'}</strong>
        </button>

        {cartOpen && (
          <div className="kf-pub-checkout-body">
            {cart.length === 0 && <p className="kf-pub-muted">Agregá productos con + Agregar</p>}
            {cart.map(i => (
              <div key={i.sku_canon} className="kf-pub-line">
                <div className="kf-pub-line-name">
                  <div>{i.producto_nombre}</div>
                  <small>{i.precio > 0 ? money(i.precio) + ' c/u' : 'precio a confirmar'}</small>
                </div>
                <div className="kf-pub-qty">
                  <button type="button" onClick={() => change(i.sku_canon, -1)} aria-label="Menos">
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={i.cantidad}
                    onChange={e => setQty(i.sku_canon, e.target.value)}
                    aria-label="Cantidad"
                  />
                  <button type="button" onClick={() => change(i.sku_canon, 1)} aria-label="Más">
                    +
                  </button>
                </div>
              </div>
            ))}

            {cart.length > 0 && (
              <>
                <textarea
                  className="kf-pub-nota"
                  rows={2}
                  placeholder="Nota para tu ejecutivo (opcional)"
                  value={nota}
                  onChange={e => setNota(e.target.value)}
                />
                {err && <div className="kf-pub-err">{err}</div>}
                <div className="kf-pub-checkout-actions">
                  <button
                    type="button"
                    className="kf-pub-btn"
                    disabled={sending || !cart.length}
                    onClick={enviar}
                  >
                    {sending ? 'Enviando…' : 'Enviar pedido'}
                  </button>
                  <a
                    className="kf-pub-btn-ghost"
                    href={`https://wa.me/?text=${encodeURIComponent(buildWhatsAppText())}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>
                </div>
                <p className="kf-pub-muted" style={{ marginTop: 8, fontSize: 11 }}>
                  Al enviar, tu ejecutivo recibe el pedido en la app Black Sheep Field.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal ficha */}
      {ficha && (
        <div className="kf-pub-modal" onClick={() => setFicha(null)}>
          <div className="kf-pub-modal-card" onClick={e => e.stopPropagation()}>
            <img
              className="kf-pub-modal-img"
              src={ficha.imagen_url || PLACEHOLDER}
              alt=""
              onError={e => {
                e.currentTarget.src = PLACEHOLDER
              }}
            />
            <div className="kf-pub-status">
              {ficha.stock_disponible ? '🟢 Disponible' : '⚪ Consultar disponibilidad'}
            </div>
            <h2>{ficha.producto_nombre}</h2>
            <p className="kf-pub-meta">
              {ficha.subfamilia || 'Producto'}
              {ficha.marca ? ` · ${ficha.marca}` : ''}
              {ficha.unidad_venta ? ` · ${ficha.unidad_venta}` : ''}
            </p>
            {ficha.resena && <p className="kf-pub-resena">{ficha.resena}</p>}
            <div className="kf-pub-price-lg">
              {Number(ficha.precio) > 0 ? money(ficha.precio) : 'Consultar precio'}
              {Number(ficha.precio_lista) > 0 &&
                Number(ficha.precio) > 0 &&
                Number(ficha.precio) !== Number(ficha.precio_lista) && (
                  <small style={{ display: 'block', fontSize: 12, color: '#78716c', fontWeight: 500 }}>
                    Lista: {money(ficha.precio_lista)}
                  </small>
                )}
            </div>
            <div className="kf-pub-modal-actions">
              {ficha.ficha_url && (
                <a className="kf-pub-btn-ghost" href={ficha.ficha_url} target="_blank" rel="noreferrer">
                  Ficha técnica
                </a>
              )}
              <button
                type="button"
                className="kf-pub-btn"
                onClick={() => {
                  add(ficha)
                  setFicha(null)
                }}
              >
                Agregar al pedido
              </button>
            </div>
            <button type="button" className="kf-pub-close" onClick={() => setFicha(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProductCard({ item, onAdd, onFicha }) {
  const hasPrice = Number(item.precio) > 0
  return (
    <article className="kf-pub-card">
      <button type="button" className="kf-pub-img" onClick={() => onFicha(item)}>
        <img
          src={item.imagen_url || PLACEHOLDER}
          alt=""
          loading="lazy"
          onError={e => {
            e.currentTarget.src = PLACEHOLDER
          }}
        />
        {item.es_liquidacion && <span className="kf-pub-badge-hot" style={{ background: '#dc2626' }}>Liquidación</span>}
        {!item.es_liquidacion && (item.es_oferta || item.destacado) && (
          <span className="kf-pub-badge-hot" style={{ background: '#d97706' }}>Oferta</span>
        )}
        {!item.es_liquidacion && !item.es_oferta && !item.destacado && item.es_habitual && (
          <span className="kf-pub-badge-hot">Para vos</span>
        )}
      </button>
      <div className="kf-pub-card-body">
        <div className="kf-pub-status">
          {item.stock_disponible ? '🟢 Disponible' : '⚪ Consultar'}
        </div>
        <h3>{item.producto_nombre}</h3>
        <p className="kf-pub-meta">
          {item.subfamilia || 'Producto'}
          {item.marca ? ` · ${item.marca}` : ''}
        </p>
        {item.resena && (
          <p className="kf-pub-resena-sm">
            {String(item.resena).slice(0, 80)}
            {String(item.resena).length > 80 ? '…' : ''}
          </p>
        )}
        <div className="kf-pub-price">{hasPrice ? money(item.precio) : 'Consultar'}</div>
        {Number(item.cantidad_sugerida) > 0 && (
          <div style={{ fontSize: 11, color: '#0f766e', fontWeight: 700, marginTop: 4 }}>
            ↻ Sugerimos {Math.round(Number(item.cantidad_sugerida))}
            {item.motivo_sugerencia ? ` · ${item.motivo_sugerencia}` : ''}
          </div>
        )}
        {(item.precio_origen || item.origen || (Number(item.precio_cliente) > 0 ? 'historico' : Number(item.precio_lista) > 0 ? 'lista' : '')) && (
          <div style={{ marginTop: 4 }}>
            {(() => {
              const origen = item.precio_origen || item.origen || (Number(item.precio) > 0 && Number(item.precio_cliente) > 0 && Number(item.precio) === Number(item.precio_cliente) ? 'historico' : 'lista')
              const stl = estiloOrigenPrecio(origen)
              const label = origen === 'historico' ? 'Tu precio' : origen === 'lista' ? 'Lista' : origen === 'negociado' ? 'Negociado' : 'Consultar'
              return (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                  background: stl.bg, color: stl.color, border: `1px solid ${stl.border}`,
                }}>{label}</span>
              )
            })()}
          </div>
        )}
        <div className="kf-pub-card-actions">
          <button type="button" className="kf-pub-link" onClick={() => onFicha(item)}>
            Detalle
          </button>
          <button type="button" className="kf-pub-add" onClick={() => onAdd(item)}>
            + Agregar
          </button>
        </div>
      </div>
    </article>
  )
}
