import { supabase } from '../../../../packages/datos/supabase.js'
import { useDatos } from '../hooks/useDatos.js'
import { useCapacidades } from '../hooks/useCapacidades.js'
import { Bloque } from '../componentes/Estado.jsx'
import { Dato, Panel, Insignia, Moneda } from '../componentes/Piezas.jsx'
import { corto, num, pct, fechaHora } from '../../../../packages/datos/formato.js'
import { Link } from 'react-router-dom'

export default function Resumen() {
  const { tiene } = useCapacidades()

  const zonas = useDatos({
    clave: ['gerencia_zona'], label: 'zonas',
    construir: () => supabase.from('gerencia_zona')
      .select('zona_id,venta_mtd,clientes,activos,dormidos,cayendo,cobertura_pct')
      .order('venta_mtd', { ascending: false }),
  })

  const ejecutivos = useDatos({
    clave: ['gerencia_ejecutivo'], label: 'ejecutivos',
    construir: () => supabase.from('gerencia_ejecutivo')
      .select('ejecutivo_id,ejecutivo,zona_id,venta_mtd,meta_mes,activos,cayendo,dormidos')
      .order('venta_mtd', { ascending: false }),
  })

  const hallazgos = useDatos({
    clave: ['integridad'], label: 'integridad',
    construir: () => supabase.from('integridad').select('hallazgo,ref,detalle').limit(500),
  })

  const cargas = useDatos({
    clave: ['cargas', 'ultimas'], label: 'cargas',
    construir: () => supabase.from('cargas')
      .select('lote_id,tipo,nombre_original,estado,filas_validas,filas_excluidas,subido_en,publicado_en')
      .order('subido_en', { ascending: false }).limit(5),
  })

  const total = zonas.rows.reduce((a, z) => a + Number(z.venta_mtd || 0), 0)
  const clientes = zonas.rows.reduce((a, z) => a + Number(z.clientes || 0), 0)
  const activos = zonas.rows.reduce((a, z) => a + Number(z.activos || 0), 0)
  const cayendo = zonas.rows.reduce((a, z) => a + Number(z.cayendo || 0), 0)

  const porHallazgo = hallazgos.rows.reduce((m, h) => {
    m[h.hallazgo] = (m[h.hallazgo] || 0) + 1
    return m
  }, {})

  return (
    <div className="pila">
      <header className="encabezado">
        <h1>Cómo va el mes</h1>
        <p>Venta acumulada, salud de la cartera y lo que hay que corregir en los datos.</p>
      </header>

      <div className="rejilla rejilla-4">
        <Dato etiqueta="Venta del mes" valor={corto(total)} pie={`${zonas.rows.length} zonas`} />
        <Dato etiqueta="Clientes activos" valor={num(activos)} pie={`de ${num(clientes)} en cartera`} />
        <Dato etiqueta="Cobertura" valor={clientes ? pct((activos / clientes) * 100, 0) : null}
              pie="compraron este mes" />
        <Dato etiqueta="Cayendo" valor={num(cayendo)} tono={cayendo ? 'neg' : ''}
              pie="compran menos que su promedio" />
      </div>

      <Panel titulo="Venta por zona">
        <Bloque datos={zonas} que="las zonas" vacio="Todavía no hay ventas cargadas. Empieza por Cargas.">
          <table>
            <thead>
              <tr>
                <th>Zona</th><th className="derecha">Venta</th><th className="derecha">Clientes</th>
                <th className="derecha">Activos</th><th className="derecha">Cayendo</th>
                <th className="derecha">Dormidos</th><th className="derecha">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {zonas.rows.map((z) => (
                <tr key={z.zona_id}>
                  <td>{z.zona_id || <span className="silencio">Sin zona</span>}</td>
                  <td className="derecha"><Moneda n={z.venta_mtd} /></td>
                  <td className="derecha">{num(z.clientes)}</td>
                  <td className="derecha">{num(z.activos)}</td>
                  <td className="derecha">{num(z.cayendo)}</td>
                  <td className="derecha">{num(z.dormidos)}</td>
                  <td className="derecha">{pct(z.cobertura_pct, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloque>
      </Panel>

      <div className="rejilla rejilla-2">
        <Panel titulo="Ejecutivos">
          <Bloque datos={ejecutivos} que="los ejecutivos" vacio="Aún no hay ejecutivos con cartera asignada.">
            <table>
              <thead>
                <tr>
                  <th>Ejecutivo</th><th className="derecha">Venta</th>
                  {tiene('metas_ejecutivo') ? <th className="derecha">Avance</th> : null}
                  <th className="derecha">Cayendo</th>
                </tr>
              </thead>
              <tbody>
                {ejecutivos.rows.map((e) => {
                  const avance = e.meta_mes > 0 ? (Number(e.venta_mtd) / Number(e.meta_mes)) * 100 : null
                  return (
                    <tr key={e.ejecutivo_id}>
                      <td>{e.ejecutivo}<br /><span className="silencio">{e.zona_id}</span></td>
                      <td className="derecha"><Moneda n={e.venta_mtd} /></td>
                      {tiene('metas_ejecutivo') ? (
                        <td className="derecha">
                          {avance === null
                            ? <span className="silencio">Sin meta</span>
                            : <Insignia tono={avance >= 100 ? 'ok' : avance >= 70 ? 'ojo' : 'mal'}>{pct(avance, 0)}</Insignia>}
                        </td>
                      ) : null}
                      <td className="derecha">{num(e.cayendo)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Bloque>
        </Panel>

        <Panel titulo="Datos por corregir"
               accion={<Link className="boton chico" to="/datos">Ir a corregir</Link>}>
          <Bloque datos={hallazgos} que="los hallazgos"
                  vacio="Nada pendiente. Los archivos están limpios.">
            <table>
              <thead><tr><th>Qué pasa</th><th className="derecha">Casos</th></tr></thead>
              <tbody>
                {Object.entries(porHallazgo).map(([h, n]) => (
                  <tr key={h}>
                    <td>{TEXTO_HALLAZGO[h] || h}</td>
                    <td className="derecha"><Insignia tono="ojo">{n}</Insignia></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Bloque>
        </Panel>
      </div>

      <Panel titulo="Últimas cargas" accion={<Link className="boton chico" to="/cargas">Cargar archivos</Link>}>
        <Bloque datos={cargas} que="las cargas" vacio="Todavía no se ha cargado ningún archivo.">
          <table>
            <thead><tr><th>Archivo</th><th>Tipo</th><th>Estado</th><th className="derecha">Filas</th><th>Cuándo</th></tr></thead>
            <tbody>
              {cargas.rows.map((c) => (
                <tr key={c.lote_id}>
                  <td><Link to={`/cargas/${c.lote_id}`}>{c.nombre_original}</Link></td>
                  <td>{c.tipo}</td>
                  <td><EstadoLote estado={c.estado} /></td>
                  <td className="derecha">{num(c.filas_validas)}
                    {c.filas_excluidas > 0 ? <span className="silencio"> · {num(c.filas_excluidas)} fuera</span> : null}</td>
                  <td className="silencio">{fechaHora(c.subido_en)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloque>
      </Panel>
    </div>
  )
}

const TEXTO_HALLAZGO = {
  ZONA_COMUNA_CONTRADICTORIA: 'Zona y comuna no coinciden (nadie ve a ese cliente)',
  CLIENTE_SIN_UBICACION: 'Clientes sin comuna ni coordenadas (no salen en el mapa)',
  SKU_SIN_PRECIO: 'Productos con stock y sin precio (no se pueden vender)',
  VENTA_SIN_CLIENTE_EN_MAESTRA: 'Ventas de clientes que no están en la maestra',
  ZONA_SIN_VENTAS: 'Zonas sin ninguna venta registrada',
}

export function EstadoLote({ estado }) {
  const tono = { publicado: 'ok', rechazado: 'mal', validado: 'ojo' }[estado] || 'neutra'
  const texto = { recibido: 'Recibido', normalizado: 'Normalizado', validado: 'Listo para publicar',
                  publicado: 'Publicado', rechazado: 'Rechazado' }[estado] || estado
  return <Insignia tono={tono}>{texto}</Insignia>
}
