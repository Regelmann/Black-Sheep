import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../packages/datos/supabase.js'
import { clp } from '../../../packages/datos/formato.js'

/**
 * Catálogo del cliente.
 *
 * QUIÉN LO ABRE: el encargado de compras de un restaurante, en su
 * teléfono, con el enlace que le mandó su vendedor por WhatsApp. No
 * explora: REPONE. Ya sabe qué pide.
 *
 * De ahí las tres decisiones que mandan sobre todo lo demás:
 *   1. Lo primero es LO QUE COMPRA SIEMPRE, con la cantidad que suele
 *      pedir ya cargada. Un toque y está.
 *   2. El precio que ve es SU precio, con el ahorro contra lista a la
 *      vista: es la razón por la que este enlace vale algo.
 *   3. El total no se esconde en un carrito: vive abajo, siempre.
 *
 * Sin sesión, sin registro, sin instalar nada.
 */
export default function App() {
  const token = useMemo(() => {
    const url = new URL(window.location.href)
    return url.searchParams.get('t') || url.pathname.replace(/^\//, '') || ''
  }, [])

  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [pedido, setPedido] = useState({})     // sku → cantidad
  const [busca, setBusca] = useState('')
  const [pestana, setPestana] = useState('habituales')
  const [revisando, setRevisando] = useState(false)
  const [enviado, setEnviado] = useState(null)

  useEffect(() => {
    if (!token) { setError('El enlace está incompleto.'); setCargando(false); return }
    supabase.rpc('catalogo', { p_token: token })
      .then(({ data, error }) => {
        if (error) throw error
        setDatos(data)
        // El color de la empresa se pinta apenas llega: el cliente ve
        // la marca de SU proveedor, no la nuestra.
        if (data?.empresa?.color) {
          document.documentElement.style.setProperty('--tenant', data.empresa.color)
        }
        document.title = `Catálogo · ${data?.empresa?.nombre || ''}`
        if (!data?.habituales?.length) setPestana('todo')
      })
      .catch((e) => {
        setError(e.message?.includes('token_invalido')
          ? 'Este enlace ya no está disponible. Pídele uno nuevo a tu vendedor.'
          : 'No pudimos abrir el catálogo. Intenta de nuevo en un momento.')
      })
      .finally(() => setCargando(false))
  }, [token])

  const productos = datos?.productos || []
  const porSku = useMemo(
    () => Object.fromEntries(productos.map((p) => [p.sku, p])), [productos])

  const habituales = useMemo(() => (datos?.habituales || [])
    .map((h) => ({ ...h, producto: porSku[h.sku] }))
    .filter((h) => h.producto), [datos, porSku])

  // Las ofertas se muestran DESPUÉS de lo suyo. El comprador viene a
  // reponer; descubrir es lo segundo. Poner el remate primero se lee
  // como que le quieren vender, no como que lo están atendiendo.
  const ofertas = useMemo(() => (datos?.ofertas || [])
    .map((o) => ({ ...o, producto: porSku[o.sku] }))
    .filter((o) => o.producto), [datos, porSku])

  const sugerencias = useMemo(() => (datos?.sugerencias || [])
    .map((x) => ({ ...x, producto: porSku[x.sku] }))
    .filter((x) => x.producto), [datos, porSku])

  const categorias = useMemo(() => {
    const c = [...new Set(productos.map((p) => p.categoria).filter(Boolean))]
    return c.sort()
  }, [productos])

  const visibles = useMemo(() => {
    const t = busca.trim().toLowerCase()
    let lista = productos
    if (pestana !== 'todo' && pestana !== 'habituales') {
      lista = lista.filter((p) => p.categoria === pestana)
    }
    if (t) lista = lista.filter((p) => p.nombre.toLowerCase().includes(t) || p.sku.includes(t))
    return lista
  }, [productos, pestana, busca])

  const lineas = Object.entries(pedido)
    .filter(([, c]) => Number(c) > 0)
    .map(([sku, cantidad]) => ({ sku, cantidad: Number(cantidad), producto: porSku[sku] }))
    .filter((l) => l.producto)

  const total = lineas.reduce((t, l) => t + l.cantidad * Number(l.producto.precio || 0), 0)
  const ahorro = lineas.reduce((t, l) => {
    const lista = Number(l.producto.precio_lista || 0)
    const suyo = Number(l.producto.precio || 0)
    return t + (lista > suyo ? (lista - suyo) * l.cantidad : 0)
  }, 0)

  const poner = (sku, cantidad) =>
    setPedido((p) => ({ ...p, [sku]: Math.max(0, Number(cantidad) || 0) }))

  if (cargando) return <p className="aviso-cat">Abriendo tu catálogo…</p>
  if (error) return <p className="aviso-cat error">{error}</p>
  if (enviado) return <Listo numero={enviado} empresa={datos?.empresa?.nombre} />

  return (
    <div className="pagina">
      <header className="encabezado-cat">
        {datos?.empresa?.logo_url && <img src={datos.empresa.logo_url} alt={datos.empresa.nombre} />}
        <h1>{datos?.empresa?.nombre}</h1>
        <p>
          {datos?.cliente?.nombre
            ? `Pedido para ${datos.cliente.nombre}`
            : 'Tu catálogo con tus precios'}
        </p>
      </header>

      <div className="barra-busqueda">
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
               placeholder="Buscar producto" inputMode="search" aria-label="Buscar producto" />
      </div>

      <div className="pestanas-cat">
        {habituales.length > 0 && (
          <button aria-pressed={pestana === 'habituales'} onClick={() => setPestana('habituales')}>
            Lo que pides siempre
          </button>
        )}
        {ofertas.length > 0 && (
          <button aria-pressed={pestana === 'ofertas'} onClick={() => setPestana('ofertas')}>
            Ofertas · {ofertas.length}
          </button>
        )}
        <button aria-pressed={pestana === 'todo'} onClick={() => setPestana('todo')}>
          Todo el catálogo
        </button>
        {categorias.map((c) => (
          <button key={c} aria-pressed={pestana === c} onClick={() => setPestana(c)}>{c}</button>
        ))}
      </div>

      {pestana === 'habituales' && !busca ? (
        <>
          <div className="grupo">
            <h2>Lo que pides siempre</h2>
            <p>Con la cantidad que sueles pedir. Ajústala si necesitas otra.</p>
          </div>
          <div className="lista-prod">
            {habituales.map((h) => (
              <Producto key={h.sku} p={h.producto} cantidad={pedido[h.sku]}
                        sugerida={h.cantidad_habitual} onCambiar={poner} />
            ))}
          </div>

          {ofertas.length > 0 && (
            <>
              <div className="grupo">
                <h2>Ofertas de esta semana</h2>
                <p>Por tiempo limitado o hasta agotar stock.</p>
              </div>
              <div className="lista-prod">
                {ofertas.slice(0, 4).map((o) => (
                  <Producto key={o.sku} p={o.producto} cantidad={pedido[o.sku]}
                            oferta={o} onCambiar={poner} />
                ))}
              </div>
            </>
          )}

          {sugerencias.length > 0 && (
            <>
              <div className="grupo">
                <h2>Otros como tú también piden</h2>
                <p>Productos que compran los locales de tu rubro.</p>
              </div>
              <div className="lista-prod">
                {sugerencias.slice(0, 4).map((x) => (
                  <Producto key={x.sku} p={x.producto} cantidad={pedido[x.sku]}
                            rubro={x} onCambiar={poner} />
                ))}
              </div>
            </>
          )}
        </>
      ) : pestana === 'ofertas' && !busca ? (
        <>
          <div className="grupo">
            <h2>Ofertas</h2>
            <p>{ofertas.length} {ofertas.length === 1 ? 'producto' : 'productos'} con precio especial.</p>
          </div>
          <div className="lista-prod">
            {ofertas.map((o) => (
              <Producto key={o.sku} p={o.producto} cantidad={pedido[o.sku]}
                        oferta={o} onCambiar={poner} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grupo">
            <h2>{busca ? 'Resultados' : pestana === 'todo' ? 'Todo el catálogo' : pestana}</h2>
            <p>{visibles.length} {visibles.length === 1 ? 'producto' : 'productos'}</p>
          </div>
          <div className="lista-prod">
            {visibles.map((p) => (
              <Producto key={p.sku} p={p} cantidad={pedido[p.sku]} onCambiar={poner} />
            ))}
            {!visibles.length && <p className="aviso-cat">No encontramos ese producto.</p>}
          </div>
        </>
      )}

      <p className="pie-cat">
        Precios con IVA según tu acuerdo comercial. Confirmamos stock al despachar.
      </p>

      {lineas.length > 0 && (
        <div className="barra-pedido">
          <div className="resumen">
            <div className="total">{clp(total)}</div>
            <div className="detalle">
              {lineas.length} {lineas.length === 1 ? 'producto' : 'productos'}
              {ahorro > 0 && ` · ahorras ${clp(ahorro)}`}
            </div>
          </div>
          <button className="enviar" onClick={() => setRevisando(true)}>Revisar pedido</button>
        </div>
      )}

      {revisando && (
        <Revision lineas={lineas} total={total} ahorro={ahorro} token={token}
                  cliente={datos?.cliente?.nombre}
                  onCerrar={() => setRevisando(false)}
                  onEnviado={(id) => { setEnviado(id); setPedido({}) }} />
      )}
    </div>
  )
}

const MOTIVO = {
  precio: 'Oferta',
  stock: 'Últimas unidades',
  vencimiento: 'Por vencer',
  lanzamiento: 'Nuevo',
}

function Producto({ p, cantidad, sugerida, oferta, rubro, onCambiar }) {
  const enPedido = Number(cantidad) > 0
  const lista = Number(p.precio_lista || 0)
  const suyo = Number(p.precio || 0)
  const descuento = lista > suyo && lista > 0 ? Math.round(100 * (lista - suyo) / lista) : 0

  // El motivo se dice con todas las letras. Un descuento sin explicación
  // hace que el comprador desconfíe: piensa que el precio normal estaba
  // inflado. "Vence el 30" es una razón que entiende y que lo apura.
  const dias = oferta?.fecha_venc
    ? Math.ceil((new Date(oferta.fecha_venc) - new Date()) / 86400000)
    : null

  return (
    <article className={`prod${enPedido ? ' en-pedido' : ''}${p.hay_stock ? '' : ' agotado'}`}>
      <div>
        <p className="nombre">{p.nombre}</p>
        <p className="meta">
          {p.unidad || 'unidad'}{p.marca ? ` · ${p.marca}` : ''}
        </p>
        {oferta && (
          <p className="motivo">
            <span className={`sello ${oferta.motivo}`}>{MOTIVO[oferta.motivo] || 'Oferta'}</span>
            {oferta.detalle && <span> {oferta.detalle}</span>}
            {dias !== null && dias >= 0 && <span> · vence en {dias} {dias === 1 ? 'día' : 'días'}</span>}
          </p>
        )}
        {rubro && (
          <p className="motivo">
            <span className="sello rubro">{rubro.penetracion}% de tu rubro lo pide</span>
          </p>
        )}
        <div className="precio">
          <b>{clp(suyo)}</b>
          {descuento > 0 && (
            <>
              <s>{clp(lista)}</s>
              <span className="etiqueta-ahorro">−{descuento}%</span>
            </>
          )}
          {!p.hay_stock && <span className="etiqueta-agotado">sin stock</span>}
        </div>
      </div>

      {enPedido ? (
        <div className="contador">
          <button aria-label="Quitar uno"
                  onClick={() => onCambiar(p.sku, Number(cantidad) - 1)}>−</button>
          <input type="number" inputMode="numeric" min="0" value={cantidad}
                 aria-label={`Cantidad de ${p.nombre}`}
                 onChange={(e) => onCambiar(p.sku, e.target.value)} />
          <button aria-label="Agregar uno"
                  onClick={() => onCambiar(p.sku, Number(cantidad) + 1)}>+</button>
        </div>
      ) : (
        // La cantidad sugerida sale de lo que este cliente suele pedir:
        // un toque y el pedido está listo. Es la diferencia entre
        // reponer en un minuto o llenar veinte campos.
        <button className="agregar" onClick={() => onCambiar(p.sku, sugerida || 1)}>
          {sugerida ? `Pedir ${sugerida}` : 'Agregar'}
        </button>
      )}
    </article>
  )
}

function Revision({ lineas, total, ahorro, token, cliente, onCerrar, onEnviado }) {
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  // Se genera acá y no cambia entre reintentos: si el envío se corta a
  // mitad de camino y el comprador vuelve a tocar, el servidor reconoce
  // la misma operación y NO duplica el pedido.
  const [opId] = useState(() => crypto.randomUUID())

  async function enviar() {
    setEnviando(true); setError(null)
    try {
      const { data, error } = await supabase.rpc('crear_pedido_publico', {
        p_token: token,
        p_lineas: lineas.map((l) => ({ sku: l.sku, cantidad: l.cantidad })),
        p_nota: nota || null,
        p_client_op_id: opId,
      })
      if (error) throw error
      onEnviado(data)
    } catch (e) {
      setError(e.message?.includes('token_invalido')
        ? 'El enlace expiró mientras armabas el pedido. Pídele uno nuevo a tu vendedor.'
        : 'No pudimos enviar el pedido. Revisa tu conexión e intenta otra vez.')
      setEnviando(false)
    }
  }

  return (
    <div className="sobre-cat" onClick={onCerrar}>
      <div className="hoja-cat" onClick={(e) => e.stopPropagation()}>
        <h2>Tu pedido{cliente ? ` · ${cliente}` : ''}</h2>
        {lineas.map((l) => (
          <div className="linea-rev" key={l.sku}>
            <span>{l.cantidad} × {l.producto.nombre}</span>
            <span className="imp">{clp(l.cantidad * Number(l.producto.precio))}</span>
          </div>
        ))}
        <div className="total-rev">
          <span>Total</span><span>{clp(total)}</span>
        </div>
        {ahorro > 0 && (
          <p style={{ color: 'var(--ahorro)', fontSize: '.875rem', marginTop: -8 }}>
            Ahorras {clp(ahorro)} respecto del precio de lista.
          </p>
        )}

        <div className="campo-cat">
          <label htmlFor="nota">¿Algo que debamos saber?</label>
          <input id="nota" value={nota} onChange={(e) => setNota(e.target.value)}
                 placeholder="Entregar el jueves por la mañana" />
        </div>

        {error && <p className="aviso-cat error">{error}</p>}

        <button className="enviar" style={{ width: '100%', marginTop: 8 }}
                disabled={enviando} onClick={enviar}>
          {enviando ? 'Enviando…' : `Enviar pedido · ${clp(total)}`}
        </button>
        <button className="agregar"
                style={{ width: '100%', marginTop: 8, background: 'transparent', color: 'var(--tinta)' }}
                onClick={onCerrar}>
          Seguir agregando
        </button>
      </div>
    </div>
  )
}

function Listo({ numero, empresa }) {
  return (
    <div className="listo">
      <div className="tic">✓</div>
      <h1>Pedido enviado</h1>
      <p>
        {empresa} lo recibió y te va a confirmar la entrega.
        Puedes cerrar esta página.
      </p>
      {numero && (
        <p style={{ marginTop: 16, fontSize: '.75rem', color: 'var(--tinta-suave)' }}>
          Referencia: {String(numero).slice(0, 8)}
        </p>
      )}
    </div>
  )
}
