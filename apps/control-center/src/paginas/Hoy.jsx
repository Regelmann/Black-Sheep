import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { llamar } from '../../../../packages/datos/rpc.js'
import { clp, fechaHora, num } from '../../../../packages/datos/formato.js'
import { Titular, Kpi, Rejilla, Foco, Insignia, Salud, Panel, Vacio } from '../../../../packages/ui/Piezas.jsx'
import { saludEmpresa, focosPlataforma } from '../lib/salud.js'

/**
 * Platform Command Center · la pregunta que responde es
 * «¿está sana toda la plataforma y qué tengo que hacer hoy?».
 *
 * Orden deliberado: cuatro cifras, después LOS FOCOS, y recién después
 * la tabla. Los focos van antes que la tabla porque la tabla obliga a
 * leer diez filas para deducir lo que el foco ya dice en una línea.
 */
export default function Hoy() {
  const ir = useNavigate()
  const resumen = useQuery({ queryKey: ['admin_resumen'], queryFn: () => llamar('admin_resumen') })
  const lista = useQuery({ queryKey: ['admin_empresas'], queryFn: () => llamar('admin_empresas') })

  if (lista.isPending) return <p className="cargando">Cargando la plataforma…</p>
  if (lista.isError) return <p className="estado error">{lista.error.message}</p>

  const r = resumen.data?.[0]
  const empresas = (lista.data || []).map((e) => ({ ...e, salud: saludEmpresa(e) }))
  const focos = focosPlataforma(empresas)
  const enRiesgo = empresas.filter((e) => e.salud.puntaje < 60).length

  return (
    <>
      <Titular titulo="Hoy" bajada="Cómo está la plataforma y qué necesita atención."
               estado={`Actualizado ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`} />

      {r && (
        <Rejilla>
          <Kpi icono="empresas" etiqueta="Empresas"
               valor={`${r.operando}/${r.empresas}`} nota="operando"
               onClick={() => ir('/empresas')} />
          <Kpi icono="dinero" etiqueta="Ingreso mensual"
               valor={clp(r.ingreso_mensual)} nota="de las activas" />
          <Kpi icono="usuarios" etiqueta="Usuarios" valor={num(r.usuarios)} nota="con acceso" />
          <Kpi icono="alerta" etiqueta="Necesitan atención" valor={num(enRiesgo)}
               nota={enRiesgo ? 'salud bajo 60' : 'todo en orden'}
               tono={enRiesgo > 0 ? 'alerta' : ''} />
        </Rejilla>
      )}

      <Panel titulo="Focos" bajada="Lo que hay que resolver hoy, en orden de urgencia.">
        {focos.length ? (
          focos.map((f, i) => (
            <Foco key={i} severidad={f.severidad} titulo={f.titulo} detalle={f.detalle}
                  impacto={f.impacto} accion={f.accion} onAccion={() => ir(f.ruta)} />
          ))
        ) : (
          <Vacio titulo="Nada requiere atención"
                 detalle="Todas las empresas están al día, cargando datos y con usuarios activos." />
        )}
      </Panel>

      <Panel titulo="Salud de las empresas"
             bajada="Suscripción, datos al día, usuarios y actividad.">
        {empresas.length ? (
          <table>
            <thead>
              <tr>
                <th>Empresa</th><th>Salud</th><th>Estado</th>
                <th className="num">Usuarios</th><th className="num">Clientes</th>
                <th className="num">Venta del mes</th><th>Última carga</th><th></th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.tenant_id}>
                  <td>
                    <Link to={`/empresa/${e.tenant_id}`}><strong>{e.empresa}</strong></Link>
                    <div className="silencio">{e.slug}</div>
                  </td>
                  <td><Salud puntaje={e.salud.puntaje} /></td>
                  <td><Insignia estado={tono(e)} texto={e.estado || 'sin plan'} /></td>
                  <td className="num">{num(e.usuarios)}</td>
                  <td className="num">{num(e.clientes)}</td>
                  <td className="num">{clp(e.venta_mtd)}</td>
                  <td className="silencio">
                    {e.ultima_carga ? fechaHora(e.ultima_carga) : 'nunca'}
                  </td>
                  <td>
                    <button className="flecha" aria-label={`Abrir ${e.empresa}`}
                            onClick={() => ir(`/empresa/${e.tenant_id}`)}>→</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Vacio titulo="Todavía no hay empresas"
                 detalle="Da de alta la primera para empezar a operar."
                 accion="Dar de alta" onAccion={() => ir('/nueva')} />
        )}
      </Panel>
    </>
  )
}

const tono = (e) =>
  !e.habilitado ? 'mal'
    : e.estado === 'morosa' || e.estado === 'trial' || Number(e.dias_restantes) < 7 ? 'aviso'
    : 'ok'
