import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { llamar } from '../lib/rpc.js'
import { clp, fechaHora, num } from '../lib/formato.js'

export default function Empresas() {
  const resumen = useQuery({ queryKey: ['admin_resumen'], queryFn: () => llamar('admin_resumen') })
  const lista = useQuery({ queryKey: ['admin_empresas'], queryFn: () => llamar('admin_empresas') })

  if (lista.isPending) return <p className="estado">Cargando empresas…</p>
  if (lista.isError) return <p className="estado error">{lista.error.message}</p>

  const r = resumen.data?.[0]
  const empresas = lista.data || []

  return (
    <>
      <header className="encabezado">
        <h1>Empresas</h1>
        <p>Quién está operando, quién debe y quién está por vencer.</p>
      </header>

      {r && (
        <div className="tablero">
          <Ficha n={r.operando} r={`de ${r.empresas} operando`} />
          <Ficha n={clp(r.ingreso_mensual)} r="al mes, de las activas" />
          <Ficha n={r.en_prueba} r="en prueba" tono={r.en_prueba > 0 ? 'atencion' : ''} />
          <Ficha n={r.por_vencer} r="vencen en 7 días" tono={r.por_vencer > 0 ? 'atencion' : ''} />
          <Ficha n={Number(r.morosas) + Number(r.suspendidas)} r="morosas o cortadas"
                 tono={Number(r.morosas) + Number(r.suspendidas) > 0 ? 'alerta' : ''} />
          <Ficha n={num(r.usuarios)} r="usuarios activos" />
        </div>
      )}

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Empresa</th><th>Estado</th><th className="num">Días</th>
              <th className="num">Usuarios</th><th className="num">Clientes</th>
              <th className="num">Venta del mes</th><th>Última carga</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => (
              <tr key={e.tenant_id}>
                <td>
                  <Link to={`/empresa/${e.tenant_id}`}><strong>{e.empresa}</strong></Link>
                  <div className="silencio">{e.slug}.app.black-sheep.cl</div>
                </td>
                <td><span className={`insignia${tono(e)}`}>{e.estado || 'sin plan'}</span></td>
                <td className="num">{e.dias_restantes === null ? '—' : num(e.dias_restantes)}</td>
                <td className="num">{num(e.usuarios)}</td>
                <td className="num">{num(e.clientes)}</td>
                <td className="num">{clp(e.venta_mtd)}</td>
                <td className="silencio">
                  {e.ultima_carga ? fechaHora(e.ultima_carga) : 'nunca cargó datos'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!empresas.length && (
          <p className="silencio">Todavía no hay empresas. Empieza por «Dar de alta».</p>
        )}
      </section>
    </>
  )
}

const Ficha = ({ n, r, tono }) => (
  <div className={`ficha${tono || ''}`}>
    <p className="n">{n}</p>
    <p className="r">{r}</p>
  </div>
)

const tono = (e) =>
  !e.habilitado ? 'mal' : e.estado === 'trial' || Number(e.dias_restantes) < 7 ? 'aviso' : 'ok'
