import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../packages/datos/supabase.js'
import { clp } from '../../../packages/datos/formato.js'

/**
 * EL CATÁLOGO DEL CLIENTE FINAL
 *
 * Quién lo abre: el chef o el encargado de compras de un restaurante,
 * en el teléfono, desde un enlace que le llegó por WhatsApp. No tiene
 * cuenta, no va a crear una, y muchas veces está entre dos servicios.
 *
 * Eso descarta el catálogo de tienda con fotos grandes y navegación por
 * categorías: este señor no está descubriendo productos, está
 * REPONIENDO. Casi todo lo que va a pedir ya lo compró antes.
 *
 * De ahí las tres decisiones que mandan sobre todo lo demás:
 *   1. Lo que compra siempre va PRIMERO, sin que tenga que buscarlo.
 *   2. Su precio, no el de lista, y cuando hay diferencia se muestra.
 *   3. El total del pedido siempre visible, porque compra con presupuesto.
 */
export default function Catalogo() {
  const token = useMemo(() => {
    const p = new URLSearchParams(window.location.search).get('t')
    if (p) return p
    const ruta = window.location.pathname.split('/').filter(Boolean)
    return ruta[ruta.length - 1] || null
  }, [])

  const [cabecera, setCabecera] = useState(null)
  const [productos, setProductos] = useState(null)
  const [error, setError] = useState(null)
  const [carro, setCarro] = useState({})
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todo')
  const [revisando, setRevisando] = useState(false)
  const [enviado, setEnviado] = useState(null)

  useEffect(() => {
    if (!token) { setError('sin-enlace'); return }
    let vivo = true
    ;(async () => {
      const [cab, cat] = await Promise.all([
        supabase.rpc('get_catalogo_cabecera', { p_token: token }),
        supabase.rpc('get_catalogo', { p_token: token }),
      ])
      if (!vivo) return
      if (cab.error || cat.error) {
        setError((cab.error || cat.error).message.includes('token_invalido')
          ? 'vencido' : 'falla')
        return
      }
      setCabecera(cab.data?.[0] || null)
      setProductos(cat.data || [])
    })()
    return () => { vivo = false }
  }, [token])

  // El color de la empresa pinta los acentos. El texto encima se elige
  // por luminancia: un acento claro con letras blancas no se lee.
  useEffect(() => {
    if (!cabecera?.color) return
    const c = cabecera.color
    document.documentElement.style.setProperty('--acento', c)
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
    const luz = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    document.documentElement.style.setProperty('--acento-tinta', luz > 0.6 ? '#16130f' : '#ffffff')
    document.title = `Catálogo · ${cabecera.empresa}`
  }, [cabecera])

  const lineas = Object.entries(carro).filter(([, n]) => n > 0)
  const total = lineas.reduce((t, [sku, n]) => {
    const p = productos?.find((x) => x.sku === sku)
    return t + n * Number(p?.precio || 0)
  }, 0)

  function poner(sku, n) {
    setCarro((c) => ({ ...c, [sku]: Math.max(0, Math.min(9999, n)) }))
  }

  if (error) return <Aviso tipo={error} />
  if (!productos) return <Cargando />
  if (enviado) return <Enviado pedido={enviado} empresa={cabecera?.empresa} />

  const texto = busca.trim().toLowerCase()
  const visibles = productos.filter((p) => {
    if (filtro === 'habitual' && !p.habitual) return false
    if (filtro === 'oferta' && !p.sugerido) return false
    if (filtro !== 'todo' && filtro !== 'habitual' && filtro !== 'oferta'
        && p.categoria !== filtro) return false
    if (!texto) return true
    return (p.nombre + ' ' + (p.marca || '') + ' ' + p.sku).toLowerCase().includes(texto)
  })

  const habituales = visibles.filter((p) => p.habitual)
  const resto = visibles.filter((p) => !p.habitual)
  const categorias = [...new Set(productos.map((p) => p.categoria).filter(Boolean))]

  return (
    <>
      <header className="tope">
        <div className="tope-fila">
          {cabecera?.logo_url && <img src={cabecera.logo_url} alt="" />}
          <div>
            <h1>{cabecera?.empresa || 'Catálogo'}</h1>
            {cabecera?.cliente && <p className="para">Precios para {cabecera.cliente}</p>}
          </div>
        </div>

        <div className="buscador">
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
                 placeholder="Buscar producto" inputMode="search" aria-label="Buscar producto" />
          {busca && <button className="limpiar" onClick={() => setBusca('')} aria-label="Limpiar">×</button>}
        </div>

        <div className="filtros">
          <Filtro id="todo"     actual={filtro} set={setFiltro}>Todo</Filtro>
          {productos.some((p) => p.habitual) &&
            <Filtro id="habitual" actual={filtro} set={setFiltro}>Lo que compras</Filtro>}
          {productos.some((p) => p.sugerido) &&
            <Filtro id="oferta" actual={filtro} set={setFiltro}>Recomendados</Filtro>}
          {categorias.map((c) => (
            <Filtro key={c} id={c} actual={filtro} set={setFiltro}>{c}</Filtro>
          ))}
        </div>
      </header>

      <main className="lista">
        {!visibles.length && (
          <p className="pantalla">No encontramos nada con «{busca}».</p>
        )}

        {habituales.length > 0 && filtro !== 'oferta' && (
          <>
            <h2 className="grupo-titulo">Lo que compras siempre</h2>
            <div className="productos">
              {habituales.map((p) => (
                <Producto key={p.sku} p={p} n={carro[p.sku] || 0} poner={poner} />
              ))}
            </div>
          </>
        )}

        {resto.length > 0 && (
          <>
            {habituales.length > 0 && <h2 className="grupo-titulo">Todo el catálogo</h2>}
            <div className="productos">
              {resto.map((p) => (
                <Producto key={p.sku} p={p} n={carro[p.sku] || 0} poner={poner} />
              ))}
            </div>
          </>
        )}
      </main>

      {lineas.length > 0 && (
        <div className="barra-pedido">
          <div className="dentro">
            <div className="cuenta">
              <p className="total">{clp(total)}</p>
              <p className="detalle">
                {lineas.length} {lineas.length === 1 ? 'producto' : 'productos'} ·
                {' '}{lineas.reduce((t, [, n]) => t + n, 0)} unidades
              </p>
            </div>
            <button className="enviar" onClick={() => setRevisando(true)}>Revisar pedido</button>
          </div>
        </div>
      )}

      {revisando && (
        <Revision
          lineas={lineas} productos={productos} total={total} token={token}
          onCerrar={() => setRevisando(false)}
          onEnviado={(r) => { setEnviado(r); setCarro({}) }}
        />
      )}
    </>
  )
}

const Filtro = ({ id, actual, set, children }) => (
  <button aria-pressed={actual === id} onClick={() => set(id)}>{children}</button>
)

function Producto({ p, n, poner }) {
  const ahorro = p.precio_lista > 0 && p.precio < p.precio_lista
  return (
    <article className={`producto${n > 0 ? ' en-carro' : ''}${p.hay_stock ? '' : ' agotado'}`}>
      <div>
        <p>
          {/* Las señales van ANTES del nombre: se leen de reojo mientras
              se desliza, que es como se usa esto de verdad. */}
          {ahorro && <span className="senal tuyo">tu precio</span>}
          {p.habitual && !ahorro && <span className="senal repone">lo pides seguido</span>}
          {!p.hay_stock && <span className="senal falta">sin stock hoy</span>}
        </p>
        <p className="nombre">{p.nombre}</p>
        <p className="meta">
          {[p.marca, p.unidad_venta].filter(Boolean).join(' · ')}
          {p.compras_6m > 0 && ` · lo pediste ${p.compras_6m} ${p.compras_6m === 1 ? 'vez' : 'veces'}`}
        </p>
        <p className="precio">
          {clp(p.precio)}
          {p.unidad_venta && <span className="unidad"> /{p.unidad_venta.toLowerCase()}</span>}
          {ahorro && <span className="antes">{clp(p.precio_lista)}</span>}
        </p>
      </div>

      <div className="cantidad">
        {n > 0 ? (
          <div className="fila">
            <button onClick={() => poner(p.sku, n - 1)} aria-label="Quitar uno">−</button>
            <input value={n} inputMode="numeric" aria-label={`Cantidad de ${p.nombre}`}
                   onChange={(e) => poner(p.sku, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)} />
            <button onClick={() => poner(p.sku, n + 1)} aria-label="Agregar uno">+</button>
          </div>
        ) : (
          <button className="agregar" onClick={() => poner(p.sku, 1)}>Agregar</button>
        )}
      </div>
    </article>
  )
}

/**
 * Revisión antes de enviar.
 *
 * El total que se muestra es una REFERENCIA y la pantalla lo dice: el
 * servidor recalcula con el precio vigente al recibir el pedido. Si la
 * app quedó abierta desde ayer y cambió un precio, el cliente no puede
 * enterarse por la factura.
 */
function Revision({ lineas, productos, total, token, onCerrar, onEnviado }) {
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  // El identificador se calcula UNA vez y se conserva entre reintentos:
  // así, si el envío falla por señal y se vuelve a tocar, se registra un
  // pedido y no dos.
  const [opId] = useState(() => crypto.randomUUID())

  async function enviar() {
    setEnviando(true); setError(null)
    const { data, error: e } = await supabase.rpc('crear_pedido_publico', {
      p_token: token,
      p_lineas: lineas.map(([sku, cantidad]) => ({ sku, cantidad })),
      p_nota: nota.trim() || null,
      p_client_op_id: opId,
    })
    if (e) {
      setError(e.message.includes('demasiados')
        ? 'Demasiados intentos seguidos. Espera un minuto.'
        : 'No se pudo enviar. Revisa la señal y vuelve a intentar.')
      setEnviando(false)
      return
    }
    onEnviado({ id: data, total, lineas: lineas.length })
  }

  return (
    <div className="sobre" onClick={onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <h2>Tu pedido</h2>
        <p className="sub" style={{ color: 'var(--tinta-media)', fontSize: '.875rem' }}>
          Revisa las cantidades antes de enviarlo.
        </p>

        <div style={{ marginTop: 14 }}>
          {lineas.map(([sku, n]) => {
            const p = productos.find((x) => x.sku === sku)
            return (
              <div className="linea" key={sku}>
                <span>
                  {p?.nombre}
                  <span className="sub"><br />{n} × {clp(p?.precio)}</span>
                </span>
                <b>{clp(n * Number(p?.precio || 0))}</b>
              </div>
            )
          })}
        </div>

        <div className="total-final">
          <span>Total estimado</span>
          <span>{clp(total)}</span>
        </div>
        <p style={{ fontSize: '.75rem', color: 'var(--tinta-suave)' }}>
          Es una referencia: tu proveedor confirma el total con el precio vigente y
          la disponibilidad del día.
        </p>

        <div style={{ marginTop: 14 }}>
          <label htmlFor="nota" style={{ fontSize: '.875rem', color: 'var(--tinta-media)' }}>
            ¿Algo que avisar? (opcional)
          </label>
          <textarea id="nota" value={nota} onChange={(e) => setNota(e.target.value)}
                    placeholder="Entregar antes de las 11, preguntar por Karen…"
                    style={{ marginTop: 6 }} />
        </div>

        {error && <p style={{ color: 'var(--agotado)', marginTop: 10, fontSize: '.875rem' }}>{error}</p>}

        <button className="boton-hoja" disabled={enviando} onClick={enviar}>
          {enviando ? 'Enviando…' : 'Enviar pedido'}
        </button>
        <button className="boton-hoja secundario" onClick={onCerrar}>Seguir agregando</button>
      </div>
    </div>
  )
}

function Enviado({ pedido, empresa }) {
  return (
    <div className="pantalla">
      <div className="listo-marca">✓</div>
      <h2>Pedido enviado</h2>
      <p>
        {empresa || 'Tu proveedor'} lo recibió y va a confirmarte el total y la
        entrega. {pedido.lineas} {pedido.lineas === 1 ? 'producto' : 'productos'} por
        aproximadamente {clp(pedido.total)}.
      </p>
      <p style={{ marginTop: 16, fontSize: '.8125rem', color: 'var(--tinta-suave)' }}>
        Puedes cerrar esta página. Si necesitas pedir algo más, vuelve a abrir el enlace.
      </p>
    </div>
  )
}

function Cargando() {
  return (
    <main className="lista" style={{ paddingTop: 24 }}>
      <div className="productos">
        {[0, 1, 2, 3, 4, 5].map((i) => <div className="esqueleto" key={i} />)}
      </div>
    </main>
  )
}

function Aviso({ tipo }) {
  const textos = {
    'sin-enlace': ['Falta el enlace',
      'Abre el catálogo desde el enlace que te mandó tu proveedor.'],
    vencido: ['Este enlace ya no sirve',
      'Los catálogos vencen por seguridad. Pídele uno nuevo a tu proveedor: se genera al instante.'],
    falla: ['No pudimos abrir el catálogo',
      'Puede ser la señal. Espera un momento y vuelve a intentar.'],
  }
  const [titulo, detalle] = textos[tipo] || textos.falla
  return (
    <div className="pantalla">
      <h2>{titulo}</h2>
      <p>{detalle}</p>
    </div>
  )
}
