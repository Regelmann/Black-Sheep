import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const money = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <rect fill="#f3efe8" width="400" height="400"/>
      <text x="200" y="205" text-anchor="middle" fill="#a8a29e" font-family="system-ui" font-size="18">KeyFoods</text>
    </svg>`
  )

export default function CatalogoCliente() {
  const { token } = useParams()
  const [catalogo, setCatalogo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState('Todos')
  const [cart, setCart] = useState([])
  const [sent, setSent] = useState(false)
  const [ficha, setFicha] = useState(null)

  useEffect(() => {
    let dead = false
    ;(async () => {
      const { data, error } = await supabase.rpc('get_public_catalogo', { p_token: token })
      if (!dead) {
        setCatalogo(error ? null : data)
        setLoading(false)
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
      return matchQ && matchCat
    })
  }, [items, q, catFilter])

  const recommended = filtered.filter(i => i.destacado)
  const rest = filtered.filter(i => !i.destacado)
  const total = cart.reduce((a, i) => a + Number(i.precio || 0) * Number(i.cantidad || 0), 0)

  function add(i) {
    setCart(prev => {
      const hit = prev.find(x => x.sku_canon === i.sku_canon)
      return hit
        ? prev.map(x => (x.sku_canon === i.sku_canon ? { ...x, cantidad: x.cantidad + 1 } : x))
        : [...prev, { ...i, cantidad: 1 }]
    })
  }
  function change(sku, delta) {
    setCart(prev =>
      prev
        .map(x => (x.sku_canon === sku ? { ...x, cantidad: Math.max(0, x.cantidad + delta) } : x))
        .filter(x => x.cantidad > 0)
    )
  }
  async function enviar() {
    if (!cart.length) return
    const { error } = await supabase.rpc('crear_pedido_publico', {
      p_token: token,
      p_lineas: cart.map(i => ({
        sku: i.sku_canon,
        nombre: i.producto_nombre,
        cantidad: i.cantidad,
        precio: i.precio,
      })),
    })
    if (!error) setSent(true)
  }

  if (loading) {
    return (
      <div className="kf-pub">
        <div className="kf-pub-loading">Cargando tu catálogo…</div>
      </div>
    )
  }
  if (!catalogo) {
    return (
      <div className="kf-pub">
        <div className="kf-pub-empty">
          <div className="kf-pub-brand">KEYFOODS</div>
          <h1>Catálogo no disponible</h1>
          <p>El enlace puede estar inactivo o haber cambiado.</p>
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
          <h1>Pedido recibido</h1>
          <p>Tu pedido fue enviado a tu ejecutivo KeyFoods.</p>
          <button type="button" className="kf-pub-btn" onClick={() => { setSent(false); setCart([]) }}>
            Seguir comprando
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="kf-pub">
      <header className="kf-pub-head">
        <div>
          <div className="kf-pub-brand">KEYFOODS</div>
          <h1>Hola, {catalogo.nombre_cliente}</h1>
          <p>Precios vigentes · productos disponibles para vos</p>
        </div>
        <div className="kf-pub-cart-badge">🛒 {cart.reduce((a, i) => a + i.cantidad, 0)}</div>
      </header>

      <div className="kf-pub-cats">
        {categories.map(c => (
          <button
            key={c}
            type="button"
            className={'kf-pub-cat' + (catFilter === c ? ' is-on' : '')}
            onClick={() => setCatFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <input
        className="kf-pub-search"
        placeholder="Buscar producto, marca o SKU…"
        value={q}
        onChange={e => setQ(e.target.value)}
      />

      {recommended.length > 0 && (
        <section className="kf-pub-section">
          <h2>🔥 Recomendados para vos</h2>
          <div className="kf-pub-grid">
            {recommended.map(i => (
              <ProductCard key={i.sku_canon} item={i} onAdd={add} onFicha={setFicha} />
            ))}
          </div>
        </section>
      )}

      <section className="kf-pub-section">
        <h2>Catálogo</h2>
        <div className="kf-pub-grid">
          {rest.map(i => (
            <ProductCard key={i.sku_canon} item={i} onAdd={add} onFicha={setFicha} />
          ))}
        </div>
        {!filtered.length && <p className="kf-pub-muted">No hay productos en este filtro.</p>}
      </section>

      {cart.length > 0 && (
        <div className="kf-pub-checkout">
          <div className="kf-pub-checkout-top">
            <strong>{cart.reduce((a, i) => a + i.cantidad, 0)} productos</strong>
            <span>{money(total)}</span>
          </div>
          <div className="kf-pub-checkout-lines">
            {cart.map(i => (
              <div key={i.sku_canon} className="kf-pub-line">
                <span className="kf-pub-line-name">{i.producto_nombre}</span>
                <div className="kf-pub-qty">
                  <button type="button" onClick={() => change(i.sku_canon, -1)}>−</button>
                  <b>{i.cantidad}</b>
                  <button type="button" onClick={() => change(i.sku_canon, 1)}>+</button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="kf-pub-btn" onClick={enviar}>
            Enviar pedido · {money(total)}
          </button>
        </div>
      )}

      {ficha && (
        <div className="kf-pub-modal" onClick={() => setFicha(null)}>
          <div className="kf-pub-modal-card" onClick={e => e.stopPropagation()}>
            <div className="kf-pub-img-lg">
              <img src={ficha.imagen_url || PLACEHOLDER} alt="" />
            </div>
            <h3>{ficha.producto_nombre}</h3>
            <p className="kf-pub-muted">
              {ficha.subfamilia || 'Producto'}
              {ficha.marca ? ` · ${ficha.marca}` : ''}
              {ficha.unidad_venta ? ` · ${ficha.unidad_venta}` : ''}
            </p>
            {ficha.resena && <p className="kf-pub-resena">{ficha.resena}</p>}
            <div className="kf-pub-price-lg">
              {Number(ficha.precio) > 0 ? money(ficha.precio) : 'Consultar precio'}
            </div>
            <div className="kf-pub-modal-actions">
              {ficha.ficha_url && (
                <a className="kf-pub-btn-ghost" href={ficha.ficha_url} target="_blank" rel="noreferrer">
                  Ver ficha técnica
                </a>
              )}
              <button
                type="button"
                className="kf-pub-btn"
                disabled={!ficha.stock_disponible}
                onClick={() => { add(ficha); setFicha(null) }}
              >
                {ficha.stock_disponible ? 'Agregar al pedido' : 'Sin stock'}
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
      </button>
      <div className="kf-pub-card-body">
        <div className="kf-pub-status">
          {item.stock_disponible ? '🟢 Disponible' : '⚪ Consultar'}
          {item.destacado ? ' · 🔥' : ''}
        </div>
        <h3>{item.producto_nombre}</h3>
        <p className="kf-pub-meta">
          {item.subfamilia || 'Producto'}
          {item.marca ? ` · ${item.marca}` : ''}
        </p>
        {item.resena && <p className="kf-pub-resena-sm">{String(item.resena).slice(0, 90)}{String(item.resena).length > 90 ? '…' : ''}</p>}
        <div className="kf-pub-price">{Number(item.precio) > 0 ? money(item.precio) : 'Consultar'}</div>
        <div className="kf-pub-card-actions">
          <button type="button" className="kf-pub-link" onClick={() => onFicha(item)}>
            Detalle
          </button>
          <button
            type="button"
            className="kf-pub-add"
            disabled={!item.stock_disponible}
            onClick={() => onAdd(item)}
          >
            {item.stock_disponible ? '+ Agregar' : 'Sin stock'}
          </button>
        </div>
      </div>
    </article>
  )
}
