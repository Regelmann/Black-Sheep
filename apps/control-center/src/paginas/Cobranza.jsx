import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { llamar } from '../lib/rpc.js'
import { clp, num } from '../lib/formato.js'

/**
 * A quién hay que llamar por plata. Ordenado por urgencia real: primero
 * las cortadas, después las morosas, después las que vencen esta semana.
 */
export default function Cobranza() {
  const { data = [], isPending, isError, error } = useQuery({
    queryKey: ['admin_empresas'],
    queryFn: () => llamar('admin_empresas'),
  })

  if (isPending) return <p className="cargando">Cargando…</p>
  if (isError) return <p className="aviso-error">{error.message}</p>

  const cortadas = data.filter((e) => !e.habilitado && e.estado)
  const morosas = data.filter((e) => e.estado === 'morosa' && e.habilitado)
  const porVencer = data.filter((e) =>
    e.habilitado && e.estado !== 'morosa' && Number(e.dias_restantes) <= 7)
  const prueba = data.filter((e) => e.estado === 'trial')

  return (
    <>
      <header className="encabezado">
        <h1>Cobranza</h1>
        <p>A quién llamar hoy, en orden de urgencia.</p>
      </header>

      <Grupo titulo="Cortadas" glosa="Sin acceso. Sus vendedores no ven datos."
             empresas={cortadas} tono="mal"
             vacio="Ninguna empresa está cortada." />
      <Grupo titulo="Morosas, en período de gracia" glosa="Siguen operando, pero el reloj corre."
             empresas={morosas} tono="aviso"
             vacio="Ninguna morosa." />
      <Grupo titulo="Vencen esta semana" glosa="Llamar antes de que haya que cortar."
             empresas={porVencer} tono="aviso"
             vacio="Nada vence en los próximos siete días." />
      <Grupo titulo="En prueba" glosa="Decidir si compran o se cierra."
             empresas={prueba} tono=""
             vacio="No hay pruebas abiertas." />
    </>
  )
}

function Grupo({ titulo, glosa, empresas, tono, vacio }) {
  return (
    <section className="bloque">
      <h2>{titulo}</h2>
      <p className="sub">{glosa}</p>
      {empresas.length ? (
        <table style={{ marginTop: 'var(--e4)' }}>
          <thead>
            <tr>
              <th>Empresa</th><th>Estado</th><th className="num">Días</th>
              <th className="num">Usuarios</th><th className="num">Venta del mes</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => (
              <tr key={e.tenant_id}>
                <td><Link to={`/empresa/${e.tenant_id}`}>{e.empresa}</Link></td>
                <td><span className={`marca-estado ${tono}`}>{e.estado}</span></td>
                <td className="num">{e.dias_restantes === null ? '—' : num(e.dias_restantes)}</td>
                <td className="num">{num(e.usuarios)}</td>
                <td className="num">{clp(e.venta_mtd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="sub" style={{ marginTop: 'var(--e3)' }}>{vacio}</p>}
    </section>
  )
}
