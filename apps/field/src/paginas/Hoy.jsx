import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useDatos } from '../hooks/useDatos.js'
import { Bloque } from '../componentes/Estado.jsx'
import { ClienteFila } from '../componentes/Piezas.jsx'
import { clp, pct } from '../lib/formato.js'

/**
 * Lo primero que ve el vendedor antes de salir. Una sola cifra grande:
 * cuánto lleva vendido. Debajo, a quién llamar hoy.
 *
 * Todo sale de read models del servidor (D-07). La app no calcula
 * "cliente cayendo": lo pregunta. Así significa lo mismo acá, en el
 * dashboard de gerencia y en el reporte del lunes.
 */
export default function Hoy() {
  const dia = useDatos({
    clave: ['mi_dia'],
    label: 'mi día',
    construir: () => supabase.from('mi_dia').select(
      'ejecutivo_id,venta_mtd,meta_mes,avance_pct,clientes_activos,clientes_cartera,clientes_cayendo,brecha_cartera',
    ),
  })

  const llamar = useDatos({
    clave: ['llamar_hoy'],
    label: 'a quién llamar',
    construir: () => supabase.from('llamar_hoy').select(
      'cliente_key,nombre,dias_sin_comprar,promedio_3m,venta_mtd,brecha,estado',
    ).limit(12),
  })

  const d = dia.rows?.[0]

  return (
    <div className="hoja">
      {d && (
        <section className="hero">
          <p className="valor cifra">{clp(d.venta_mtd)}</p>
          <p className="glosa">
            {d.meta_mes
              ? `${pct(d.avance_pct, 0)} de tu meta de ${clp(d.meta_mes)}`
              : 'Vendido este mes'}
          </p>
          {d.meta_mes > 0 && (
            <div className="barra-meta">
              <i style={{ width: `${Math.min(100, Number(d.avance_pct) || 0)}%` }} />
            </div>
          )}
          <p className="glosa" style={{ marginTop: 12 }}>
            {d.clientes_activos} de {d.clientes_cartera} compraron este mes
            {d.clientes_cayendo > 0 && ` · ${d.clientes_cayendo} están comprando menos`}
          </p>
        </section>
      )}

      <h2 className="titulo">A quién llamar hoy</h2>
      <Bloque datos={llamar} que="tus clientes"
              vacio="Nadie está atrasado. Buen momento para abrir un cliente nuevo.">
        {llamar.rows?.map((c) => (
          <Link key={c.cliente_key} to={`/cliente/${encodeURIComponent(c.cliente_key)}`}>
            <ClienteFila c={c} pie={`${c.dias_sin_comprar} días sin comprar`} />
          </Link>
        ))}
      </Bloque>
    </div>
  )
}
