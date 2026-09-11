import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../../../packages/datos/supabase.js'
import { useDatos } from '../hooks/useDatos.js'
import { registrar } from '../lib/sync.js'
import { Bloque } from '../componentes/Estado.jsx'
import { clp, fecha } from '../../../../packages/datos/formato.js'

/**
 * La pantalla donde el vendedor está parado frente al local.
 *
 * TODO lo que se escribe acá pasa por la cola: se guarda en el teléfono
 * primero y sube cuando hay señal. El vendedor nunca espera a la red
 * para seguir trabajando, y nunca pierde lo que registró.
 */
export default function Cliente() {
  const { clave } = useParams()
  const clienteKey = decodeURIComponent(clave)
  const [hoja, setHoja] = useState(null)   // 'pedido' | 'nota'
  const [hecho, setHecho] = useState(null)

  const cliente = useDatos({
    clave: ['cliente', clienteKey],
    label: 'el cliente',
    construir: () => supabase.from('mi_cartera').select(
      'cliente_key,nombre,comuna,direccion,lat,lng,estado,dias_sin_comprar,venta_mtd,promedio_3m,brecha,es_bloqueado,ultima_compra',
    ).eq('cliente_key', clienteKey),
  })

  const c = cliente.rows?.[0]

  function anotar(tipo, payload, mensaje) {
    registrar(tipo, { cliente_key: clienteKey, ...payload })
    setHecho(mensaje)
    setHoja(null)
    setTimeout(() => setHecho(null), 4000)
  }

  async function marcarLlegada() {
    // El GPS es opcional: si el vendedor lo tiene apagado, el check-in
    // se registra igual sin coordenadas. Bloquear la visita por falta
    // de permiso de ubicación es castigar al que sí está trabajando.
    const pos = await new Promise((res) => {
      if (!navigator.geolocation) return res(null)
      navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 6000 })
    })
    anotar('checkin', {
      lat: pos?.coords.latitude ?? null,
      lng: pos?.coords.longitude ?? null,
      precision_m: pos?.coords.accuracy ?? null,
    }, 'Llegada registrada')
  }

  if (cliente.loading) return <p className="cargando">Cargando…</p>
  if (cliente.error) return <p className="aviso-error">{cliente.error.user}</p>
  if (!c) return <p className="aviso-vacio">Este cliente no está en tu cartera.</p>

  return (
    <div className="hoja">
      <section className="tarjeta">
        <h2>{c.nombre || c.cliente_key}</h2>
        <p className="detalle">{c.direccion || c.comuna || 'Sin dirección'}</p>
        {c.es_bloqueado && (
          <p className="pastilla roja" style={{ marginTop: 8 }}>
            Bloqueado en la maestra · no se puede tomar pedido
          </p>
        )}
        <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
          <div>
            <p className="cifra" style={{ fontSize: 22, fontWeight: 600 }}>{clp(c.venta_mtd)}</p>
            <p className="detalle">este mes</p>
          </div>
          <div>
            <p className="cifra" style={{ fontSize: 22, fontWeight: 600 }}>{clp(c.promedio_3m)}</p>
            <p className="detalle">promedio</p>
          </div>
          <div>
            <p className="cifra" style={{ fontSize: 22, fontWeight: 600 }}>{c.dias_sin_comprar ?? '—'}</p>
            <p className="detalle">días sin comprar</p>
          </div>
        </div>
        <p className="detalle" style={{ marginTop: 8 }}>Última compra: {fecha(c.ultima_compra)}</p>
      </section>

      {hecho && <p className="franja pendiente" style={{ borderRadius: 8 }}>{hecho}</p>}

      <div className="acciones">
        <button className="boton" onClick={marcarLlegada}>Marcar llegada</button>
        <button className="boton" onClick={() => setHoja('nota')}>Dejar nota</button>
        <button className="boton principal" disabled={c.es_bloqueado}
                onClick={() => setHoja('pedido')}>Tomar pedido</button>
        <button className="boton"
                onClick={() => anotar('visita', { estado: 'visitada', resultado: 'no_compro' }, 'Visita sin venta registrada')}>
          Visitado, no compró
        </button>
      </div>

      {hoja === 'nota' && <HojaNota onCerrar={() => setHoja(null)} onGuardar={(t) => anotar('nota', { texto: t }, 'Nota guardada')} />}
      {hoja === 'pedido' && <HojaPedido onCerrar={() => setHoja(null)} onGuardar={(l, n) => anotar('pedido', { lineas: l, nota: n }, 'Pedido guardado')} />}
    </div>
  )
}

function HojaNota({ onCerrar, onGuardar }) {
  const [texto, setTexto] = useState('')
  return (
    <div className="sobre" onClick={onCerrar}>
      <div className="hoja-abajo" onClick={(e) => e.stopPropagation()}>
        <h2>Nota de la visita</h2>
        <div className="campo">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
                    placeholder="Qué pasó, qué pidió, cuándo volver…" autoFocus />
        </div>
        <button className="boton principal ancho" disabled={!texto.trim()}
                onClick={() => onGuardar(texto.trim())}>Guardar nota</button>
        <button className="boton ancho" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  )
}

function HojaPedido({ onCerrar, onGuardar }) {
  const [lineas, setLineas] = useState({})
  const [nota, setNota] = useState('')

  const productos = useDatos({
    clave: ['stock_vendible'],
    label: 'los productos',
    frescura: 30 * 60_000,
    construir: () => supabase.from('stock_vendible')
      .select('sku,nombre,precio_unidad,precio_caja,stock_total,es_vendible')
      .eq('es_vendible', true).order('nombre').limit(300),
  })

  const items = Object.entries(lineas)
    .filter(([, cant]) => Number(cant) > 0)
    .map(([sku, cantidad]) => ({ sku, cantidad: Number(cantidad) }))

  // El total es una referencia para conversar con el cliente. El precio
  // que vale es el que calcula el servidor al recibir el pedido: la app
  // pudo haberse cargado hace tres horas.
  const referencia = items.reduce((t, i) => {
    const p = productos.rows?.find((x) => x.sku === i.sku)
    return t + i.cantidad * Number(p?.precio_unidad || p?.precio_caja || 0)
  }, 0)

  return (
    <div className="sobre" onClick={onCerrar}>
      <div className="hoja-abajo" onClick={(e) => e.stopPropagation()}>
        <h2>Tomar pedido</h2>
        <Bloque datos={productos} que="los productos"
                vacio="No hay productos vendibles. Avisa a la oficina.">
          {productos.rows?.slice(0, 60).map((p) => (
            <div className="linea-pedido" key={p.sku}>
              <span className="nom">{p.nombre}</span>
              <input type="number" inputMode="numeric" min="0" placeholder="0"
                     value={lineas[p.sku] || ''}
                     onChange={(e) => setLineas({ ...lineas, [p.sku]: e.target.value })} />
              <span className="detalle">{clp(p.precio_unidad || p.precio_caja)}</span>
            </div>
          ))}
        </Bloque>

        <div className="campo">
          <label htmlFor="np">Nota del pedido</label>
          <input id="np" value={nota} onChange={(e) => setNota(e.target.value)}
                 placeholder="Entregar el jueves, preguntar por Karen…" />
        </div>

        <p className="detalle">
          {items.length} {items.length === 1 ? 'producto' : 'productos'} · referencia {clp(referencia)}
          <br />El total final lo confirma la oficina con el precio vigente.
        </p>
        <button className="boton principal ancho" disabled={!items.length}
                onClick={() => onGuardar(items, nota || null)}>
          Guardar pedido
        </button>
        <button className="boton ancho" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  )
}
