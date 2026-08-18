import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const money = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')

export default function CatalogoCliente() {
  const { token } = useParams()
  const [catalogo, setCatalogo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [cart, setCart] = useState([])
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let dead = false
    ;(async () => {
      const { data, error } = await supabase.rpc('get_public_catalogo', { p_token: token })
      if (!dead) { setCatalogo(error ? null : data); setLoading(false) }
    })()
    return () => { dead = true }
  }, [token])

  const items = catalogo?.items || []
  const filtered = useMemo(() => {
    const x = q.toLowerCase().trim()
    return items.filter(i => !x || String(i.producto_nombre).toLowerCase().includes(x) || String(i.sku_canon).includes(x))
  }, [items, q])
  const recommended = filtered.filter(i => i.destacado)
  const total = cart.reduce((a, i) => a + Number(i.precio || 0) * Number(i.cantidad || 0), 0)

  function add(i) { setCart(prev => { const hit = prev.find(x => x.sku_canon === i.sku_canon); return hit ? prev.map(x => x.sku_canon === i.sku_canon ? { ...x, cantidad: x.cantidad + 1 } : x) : [...prev, { ...i, cantidad: 1 }] }) }
  function change(sku, delta) { setCart(prev => prev.map(x => x.sku_canon === sku ? { ...x, cantidad: Math.max(0, x.cantidad + delta) } : x).filter(x => x.cantidad > 0)) }
  async function enviar() {
    if (!cart.length) return
    const { error } = await supabase.rpc('crear_pedido_publico', { p_token: token, p_lineas: cart.map(i => ({ sku: i.sku_canon, nombre: i.producto_nombre, cantidad: i.cantidad, precio: i.precio })) })
    if (!error) setSent(true)
  }

  if (loading) return <div className="kf-public-page"><div className="kf-public-loading">Cargando tu catálogo…</div></div>
  if (!catalogo) return <div className="kf-public-page"><div className="kf-public-card"><div className="kf-public-brand">KEYFOODS</div><h1>Catálogo no disponible</h1><p>El enlace puede estar inactivo o haber cambiado.</p></div></div>
  if (sent) return <div className="kf-public-page"><div className="kf-public-card"><div className="kf-public-brand">KEYFOODS</div><div className="kf-success-icon">✓</div><h1>Pedido recibido</h1><p>Tu pedido fue enviado correctamente a KeyFoods.</p><button className="kf-public-btn" onClick={() => { setSent(false); setCart([]) }}>Seguir comprando</button></div></div>

  return <div className="kf-public-page"><div className="kf-public-wrap">
    <header className="kf-public-head"><div><div className="kf-public-brand">KEYFOODS</div><h1>Hola, {catalogo.nombre_cliente}</h1><p>Tu catálogo personalizado · precios vigentes · productos disponibles</p></div><div className="kf-public-cart">🛒 {cart.reduce((a, i) => a + i.cantidad, 0)}</div></header>
    <input className="kf-public-search" placeholder="Buscar productos…" value={q} onChange={e => setQ(e.target.value)} />
    {recommended.length > 0 && <section><div className="kf-public-section-title">🔥 RECOMENDADOS PARA TI</div><div className="kf-public-products">{recommended.map(i => <Product key={i.sku_canon} item={i} add={add} />)}</div></section>}
    <section><div className="kf-public-section-title">CATÁLOGO DISPONIBLE</div><div className="kf-public-products">{filtered.map(i => <Product key={i.sku_canon} item={i} add={add} />)}</div></section>
    {cart.length > 0 && <div className="kf-public-checkout"><div><strong>{cart.reduce((a, i) => a + i.cantidad, 0)} productos</strong><span>{money(total)}</span></div><div className="kf-cart-lines">{cart.map(i => <div key={i.sku_canon}><span>{i.producto_nombre}</span><b><button onClick={() => change(i.sku_canon, -1)}>−</button>{i.cantidad}<button onClick={() => change(i.sku_canon, 1)}>+</button></b></div>)}</div><button className="kf-public-btn" onClick={enviar}>Enviar pedido · {money(total)}</button></div>}
  </div></div>
}

function Product({ item, add }) { return <article className="kf-public-product"><div className="kf-product-status">{item.stock_disponible ? '🟢 Disponible' : '⚪ Consultar'}</div><h3>{item.producto_nombre}</h3><p>{item.subfamilia || 'Producto'} · SKU {item.sku_canon}</p><div className="kf-product-price">{Number(item.precio) > 0 ? money(item.precio) : 'Consultar'}</div>{item.destacado && <span className="kf-recommended">RECOMENDADO</span>}<button disabled={!item.stock_disponible} onClick={() => add(item)}>{item.stock_disponible ? '+ Agregar' : 'Sin stock'}</button></article> }
