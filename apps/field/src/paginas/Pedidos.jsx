import { supabase } from '../lib/supabase.js'
import { useDatos } from '../hooks/useDatos.js'
import { Bloque } from '../componentes/Estado.jsx'
import { loadActionQueue } from '../lib/offline.js'
import { clp, fechaHora } from '../lib/formato.js'

/**
 * Lo que el vendedor registró. Primero lo que todavía está en el
 * teléfono, después lo que ya subió: el orden importa, porque lo que
 * angustia es lo que no se sabe si se guardó.
 */
export default function Pedidos() {
  const enCola = loadActionQueue().filter((i) => i.type === 'pedido')

  const pedidos = useDatos({
    clave: ['mis_pedidos'],
    label: 'tus pedidos',
    construir: () => supabase.from('mis_pedidos')
      .select('id,cliente_key,cliente,estado,origen,total_estimado,nota,creado_en')
      .order('creado_en', { ascending: false }).limit(40),
  })

  return (
    <div className="hoja">
      {enCola.length > 0 && (
        <>
          <h2 className="titulo">En el teléfono, esperando señal</h2>
          {enCola.map((i) => (
            <article className="cliente" key={i.id}>
              <div style={{ flex: 1 }}>
                <p className="nombre">{i.payload?.cliente_key}</p>
                <p className="detalle">
                  {i.payload?.lineas?.length || 0} productos · {fechaHora(i.enqueuedAt)}
                </p>
                {i.agotado && <span className="pastilla roja">no pudo subir</span>}
              </div>
              <div className="derecha">
                <span className="pastilla ambar">por subir</span>
              </div>
            </article>
          ))}
        </>
      )}

      <h2 className="titulo">Pedidos enviados</h2>
      <Bloque datos={pedidos} que="tus pedidos" vacio="Todavía no has tomado pedidos.">
        {pedidos.rows?.map((p) => (
          <article className="cliente" key={p.id}>
            <div style={{ flex: 1 }}>
              <p className="nombre">{p.cliente || p.cliente_key}</p>
              <p className="detalle">{fechaHora(p.creado_en)}</p>
              {p.nota && <p className="detalle">{p.nota}</p>}
            </div>
            <div className="derecha">
              <p className="cifra">{clp(p.total_estimado)}</p>
              <span className={`pastilla ${p.estado === 'anulado' ? 'roja' : p.estado === 'despachado' ? 'verde' : ''}`}>
                {p.estado}
              </span>
            </div>
          </article>
        ))}
      </Bloque>
    </div>
  )
}
