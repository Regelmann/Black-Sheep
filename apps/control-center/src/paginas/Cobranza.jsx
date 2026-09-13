import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { llamar } from '../../../../packages/datos/rpc.js'
import { clp, num } from '../../../../packages/datos/formato.js'
import { Titular, Kpi, Rejilla, Panel, Insignia, Vacio } from '../../../../packages/ui/Piezas.jsx'

/**
 * Cobranza en UNA pantalla.
 *
 * Antes eran cuatro paneles apilados y había que bajar con la rueda
 * para ver si alguien estaba cortado. Ahora es una sola tabla ordenada
 * por urgencia, con una columna que dice en qué grupo cae cada una: la
 * información es la misma y se lee de un vistazo.
 */
export default function Cobranza() {
  const ir = useNavigate()
  const { data = [], isPending, isError, error } = useQuery({
    queryKey: ['admin_empresas'], queryFn: () => llamar('admin_empresas'),
  })

  if (isPending) return <p className="cargando">Cargando…</p>
  if (isError) return <p className="estado error">{error.message}</p>

  // Un solo criterio de orden: primero lo que ya dejó a gente sin
  // trabajar, después lo que está por hacerlo.
  const grupo = (e) =>
    !e.habilitado && e.estado ? { orden: 1, id: 'cortada', texto: 'Cortada', tono: 'mal' }
      : e.estado === 'morosa' ? { orden: 2, id: 'morosa', texto: 'Morosa', tono: 'mal' }
      : Number(e.dias_restantes) <= 7 && e.estado !== 'trial'
        ? { orden: 3, id: 'vence', texto: 'Vence', tono: 'aviso' }
      : e.estado === 'trial' ? { orden: 4, id: 'prueba', texto: 'En prueba', tono: 'aviso' }
      : null

  const filas = data.map((e) => ({ ...e, g: grupo(e) }))
    .filter((e) => e.g)
    .sort((a, b) => a.g.orden - b.g.orden || Number(a.dias_restantes) - Number(b.dias_restantes))

  const enRiesgo = filas.filter((e) => ['cortada', 'morosa'].includes(e.g.id))
  const mrr = data.filter((e) => e.estado === 'activa')
    .reduce((t, e) => t + Number(e.venta_mtd ? 0 : 0), 0)

  return (
    <>
      <Titular titulo="Cobranza" bajada="A quién llamar hoy, en orden de urgencia." />

      <Rejilla>
        <Kpi icono="alerta" etiqueta="Sin acceso" valor={num(filas.filter((e) => e.g.id === 'cortada').length)}
             nota="sus vendedores no ven datos"
             tono={filas.some((e) => e.g.id === 'cortada') ? 'alerta' : ''} />
        <Kpi icono="dinero" etiqueta="Morosas" valor={num(filas.filter((e) => e.g.id === 'morosa').length)}
             nota="en período de gracia"
             tono={filas.some((e) => e.g.id === 'morosa') ? 'atencion' : ''} />
        <Kpi icono="hoy" etiqueta="Vencen pronto" valor={num(filas.filter((e) => e.g.id === 'vence').length)}
             nota="en 7 días o menos" />
        <Kpi icono="carga" etiqueta="En prueba" valor={num(filas.filter((e) => e.g.id === 'prueba').length)}
             nota="decidir si compran" />
      </Rejilla>

      <Panel titulo="Requieren una llamada"
             bajada="Ordenadas por urgencia: primero quien ya está sin poder trabajar.">
        {filas.length ? (
          <table>
            <thead>
              <tr>
                <th>Empresa</th><th>Situación</th><th className="num">Días</th>
                <th className="num">Usuarios</th><th className="num">Clientes</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((e) => (
                <tr key={e.tenant_id}>
                  <td>
                    <Link to={`/empresa/${e.tenant_id}`}><strong>{e.empresa}</strong></Link>
                    <div className="silencio">{e.plan || 'sin plan'}</div>
                  </td>
                  <td><Insignia estado={e.g.tono} texto={e.g.texto} /></td>
                  <td className="num">{e.dias_restantes === null ? '—' : num(e.dias_restantes)}</td>
                  <td className="num">{num(e.usuarios)}</td>
                  <td className="num">{num(e.clientes)}</td>
                  <td>
                    <button className="flecha" aria-label={`Abrir ${e.empresa}`}
                            onClick={() => ir(`/empresa/${e.tenant_id}`)}>→</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Vacio titulo="Nadie debe nada"
                 detalle="Ninguna empresa está cortada, morosa ni por vencer." />
        )}
      </Panel>
    </>
  )
}
