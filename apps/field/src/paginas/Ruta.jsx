import { Link } from 'react-router-dom'
import { supabase } from '../../../../packages/datos/supabase.js'
import { useDatos } from '../hooks/useDatos.js'
import { Bloque } from '../componentes/Estado.jsx'
import { clp } from '../../../../packages/datos/formato.js'

/**
 * Las paradas de hoy. Sólo aparecen clientes con coordenadas; los que
 * no las tienen NO se esconden: se cuentan al pie para que alguien los
 * corrija en la maestra. Ocultar un cliente sin avisar es cómo se
 * pierde una cartera.
 */
export default function Ruta() {
  const ruta = useDatos({
    clave: ['ruta_dia'],
    label: 'tu ruta',
    construir: () => supabase.from('ruta_dia').select(
      'visita_id,orden,estado_visita,cliente_key,nombre,comuna,direccion,lat,lng,estado_cliente,promedio_3m,oferta_skus',
    ).order('orden', { ascending: true, nullsFirst: false }),
  })

  return (
    <div className="hoja">
      <h2 className="titulo">Tu ruta de hoy</h2>
      <Bloque datos={ruta} que="tu ruta"
              vacio="No hay visitas planificadas para hoy.">
        {ruta.rows?.map((p, i) => (
          <article key={p.visita_id} className={`cliente ${p.estado_cliente}`}>
            <div style={{ flex: 1 }}>
              <p className="nombre">{p.orden || i + 1}. {p.nombre || p.cliente_key}</p>
              <p className="detalle">{p.direccion || p.comuna || 'Sin dirección'}</p>
              {p.oferta_skus?.length > 0 && (
                <p className="detalle">Ofrecerle: {p.oferta_skus.slice(0, 3).join(' · ')}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Link className="boton" style={{ minHeight: 40 }}
                      to={`/cliente/${encodeURIComponent(p.cliente_key)}`}>
                  Abrir
                </Link>
                {p.lat && p.lng && (
                  <a className="boton" style={{ minHeight: 40 }}
                     href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                     target="_blank" rel="noopener noreferrer">
                    Cómo llegar
                  </a>
                )}
              </div>
            </div>
            <div className="derecha">
              <span className={`pastilla ${p.estado_visita === 'visitada' ? 'verde' : ''}`}>
                {p.estado_visita}
              </span>
              <p className="detalle" style={{ marginTop: 6 }}>{clp(p.promedio_3m)}/mes</p>
            </div>
          </article>
        ))}
      </Bloque>
    </div>
  )
}
