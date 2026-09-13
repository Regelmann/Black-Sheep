import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { llamar } from '../../../../packages/datos/rpc.js'
import { clp, fechaHora, num } from '../../../../packages/datos/formato.js'
import { Titular, Kpi, Rejilla, Panel, Insignia, Salud, Vacio } from '../../../../packages/ui/Piezas.jsx'
import { saludEmpresa } from '../lib/salud.js'

const FILTROS = [
  { id: 'todas', texto: 'Todas' },
  { id: 'operando', texto: 'Operando' },
  { id: 'prueba', texto: 'En prueba' },
  { id: 'problema', texto: 'Con problema' },
]

/**
 * La lista completa. Misma estructura que Hoy: titular, cuatro cifras,
 * un panel con la tabla. Lo que cambia es la pregunta: Hoy responde
 * «qué hago», Empresas responde «quién es quién».
 *
 * Todo entra en una pantalla: con un filtro arriba no hace falta
 * apilar cuatro paneles y bajar con la rueda.
 */
export default function Empresas() {
  const ir = useNavigate()
  const [filtro, setFiltro] = useState('todas')
  const resumen = useQuery({ queryKey: ['admin_resumen'], queryFn: () => llamar('admin_resumen') })
  const lista = useQuery({ queryKey: ['admin_empresas'], queryFn: () => llamar('admin_empresas') })

  if (lista.isPending) return <p className="cargando">Cargando empresas…</p>
  if (lista.isError) return <p className="estado error">{lista.error.message}</p>

  const r = resumen.data?.[0]
  const todas = (lista.data || []).map((e) => ({ ...e, salud: saludEmpresa(e) }))
  const visibles = todas.filter((e) =>
    filtro === 'operando' ? e.habilitado && e.estado !== 'trial'
      : filtro === 'prueba' ? e.estado === 'trial'
      : filtro === 'problema' ? !e.habilitado || e.estado === 'morosa' || e.salud.puntaje < 60
      : true)

  return (
    <>
      <Titular titulo="Empresas" bajada="Quién está operando, quién debe y quién necesita atención." />

      {r && (
        <Rejilla>
          <Kpi icono="empresas" etiqueta="Total" valor={num(r.empresas)} nota="dadas de alta" />
          <Kpi icono="venta" etiqueta="Operando" valor={num(r.operando)} nota="con acceso hoy" />
          <Kpi icono="carga" etiqueta="En prueba" valor={num(r.en_prueba)}
               nota={Number(r.en_prueba) ? 'hay que decidir' : 'ninguna abierta'}
               tono={Number(r.en_prueba) > 0 ? 'atencion' : ''} />
          <Kpi icono="dinero" etiqueta="Deben" valor={num(Number(r.morosas) + Number(r.suspendidas))}
               nota="morosas o cortadas"
               tono={Number(r.morosas) + Number(r.suspendidas) > 0 ? 'alerta' : ''}
               onClick={() => ir('/cobranza')} />
        </Rejilla>
      )}

      <Panel
        titulo={`${visibles.length} ${visibles.length === 1 ? 'empresa' : 'empresas'}`}
        accion={
          <div className="segmentado">
            {FILTROS.map((f) => (
              <button key={f.id} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
                {f.texto}
              </button>
            ))}
          </div>
        }>
        {visibles.length ? (
          <table>
            <thead>
              <tr>
                <th>Empresa</th><th>Salud</th><th>Estado</th><th className="num">Días</th>
                <th className="num">Usuarios</th><th className="num">Clientes</th>
                <th className="num">Venta del mes</th><th>Última carga</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((e) => (
                <tr key={e.tenant_id}>
                  <td>
                    <Link to={`/empresa/${e.tenant_id}`}><strong>{e.empresa}</strong></Link>
                    <div className="silencio">{e.slug}.app.black-sheep.cl</div>
                  </td>
                  <td><Salud puntaje={e.salud.puntaje} /></td>
                  <td><Insignia estado={tono(e)} texto={e.estado || 'sin plan'} /></td>
                  <td className="num">{e.dias_restantes === null ? '—' : num(e.dias_restantes)}</td>
                  <td className="num">{num(e.usuarios)}</td>
                  <td className="num">{num(e.clientes)}</td>
                  <td className="num">{clp(e.venta_mtd)}</td>
                  <td className="silencio">{e.ultima_carga ? fechaHora(e.ultima_carga) : 'nunca'}</td>
                  <td>
                    <button className="flecha" aria-label={`Abrir ${e.empresa}`}
                            onClick={() => ir(`/empresa/${e.tenant_id}`)}>→</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Vacio titulo={todas.length ? 'Ninguna coincide con el filtro' : 'Todavía no hay empresas'}
                 detalle={todas.length ? 'Prueba con «Todas».' : 'Da de alta la primera para empezar.'}
                 accion={todas.length ? null : 'Dar de alta'}
                 onAccion={() => ir('/nueva')} />
        )}
      </Panel>
    </>
  )
}

const tono = (e) =>
  !e.habilitado ? 'mal'
    : e.estado === 'morosa' || e.estado === 'trial' || Number(e.dias_restantes) < 7 ? 'aviso'
    : 'ok'
