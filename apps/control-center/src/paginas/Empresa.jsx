import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { llamar } from '../../../../packages/datos/rpc.js'
import { clp, fecha, fechaHora, num } from '../../../../packages/datos/formato.js'
import { Titular, Kpi, Rejilla, Insignia, Salud, Panel, Vacio } from '../../../../packages/ui/Piezas.jsx'
import { saludEmpresa } from '../lib/salud.js'
import Usuarios from '../componentes/Usuarios.jsx'

const SOLAPAS = [
  { id: 'estado', texto: 'Estado' },
  { id: 'usuarios', texto: 'Usuarios' },
  { id: 'config', texto: 'Configuración' },
]

/**
 * Ficha de empresa.
 *
 * En SOLAPAS y no en una sola columna de cuatro metros. Antes había que
 * bajar la pantalla completa para llegar a los tipos de documento, que
 * es justamente el paso que bloquea la puesta en marcha.
 */
export default function Empresa() {
  const { id } = useParams()
  const ir = useNavigate()
  const qc = useQueryClient()
  const [solapa, setSolapa] = useState('estado')
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  const { data: e, isPending, isError, error: err } = useQuery({
    queryKey: ['admin_empresa', id],
    queryFn: () => llamar('admin_empresa', { p_tenant: id }),
  })

  async function accion(fn, args, mensaje) {
    setError(null); setAviso(null)
    try {
      const r = await llamar(fn, args)
      setAviso(mensaje || (typeof r === 'string' ? r : 'Listo'))
      qc.invalidateQueries()
    } catch (x) { setError(x.message) }
  }

  if (isPending) return <p className="cargando">Cargando…</p>
  if (isError) return <p className="estado error">{err.message}</p>

  const s = e.suscripcion || {}
  const salud = saludEmpresa({
    habilitado: e.habilitado, estado: s.estado, dias_restantes:
      s.vigente_hasta ? Math.ceil((new Date(s.vigente_hasta) - new Date()) / 86400000) : null,
    usuarios: e.usuarios?.length || 0, clientes: e.datos?.clientes || 0,
    venta_mtd: e.datos?.venta_mtd || 0,
    ultima_carga: e.cargas?.[0]?.cuando || null,
  })

  const pasos = [
    { n: 1, titulo: 'Tipos de documento', hecho: (e.documentos || []).length > 0,
      detalle: e.documentos?.length
        ? `${e.documentos.length} configurados: ${e.documentos.map((d) => d.codigo).join(', ')}`
        : 'Sin esto la venta queda en cero. Mira la columna de tipo en su Excel de ventas.' },
    { n: 2, titulo: 'Usuarios con acceso', hecho: (e.usuarios || []).length > 0,
      detalle: e.usuarios?.length ? `${e.usuarios.length} con acceso` : 'Nadie puede entrar todavía.' },
    { n: 3, titulo: 'Maestra y precios', hecho: e.datos?.clientes > 0,
      detalle: e.datos?.clientes
        ? `${num(e.datos.clientes)} clientes · ${num(e.datos.productos)} productos`
        : 'Todavía no cargan sus archivos.' },
    { n: 4, titulo: 'Histórico de ventas', hecho: e.datos?.ventas > 0,
      detalle: e.datos?.ventas
        ? `${num(e.datos.ventas)} líneas · ${clp(e.datos.venta_mtd)} este mes`
        : 'Sin histórico, todos los clientes salen como nuevos.' },
  ]
  const faltan = pasos.filter((p) => !p.hecho).length

  return (
    <>
      <Titular titulo={e.nombre}
               bajada={`${e.slug}.app.black-sheep.cl · creada el ${fecha(e.creado_en)}`}
               estado={e.habilitado ? 'Operando' : 'Sin acceso'} />

      <Rejilla>
        <Kpi icono="hoy" etiqueta="Salud" valor={salud.puntaje}
             nota={salud.puntaje >= 80 ? 'buena' : salud.puntaje >= 60 ? 'atención' : 'crítica'}
             tono={salud.puntaje < 60 ? 'alerta' : salud.puntaje < 80 ? 'atencion' : ''} />
        <Kpi icono="dinero" etiqueta="Plan" valor={s.plan || '—'}
             nota={`${s.estado || 'sin plan'} · vence ${fecha(s.vigente_hasta)}`} />
        <Kpi icono="usuarios" etiqueta="Usuarios" valor={num(e.usuarios?.length || 0)} nota="con acceso" />
        <Kpi icono="venta" etiqueta="Venta del mes" valor={clp(e.datos?.venta_mtd)}
             nota={`${num(e.datos?.clientes || 0)} clientes`} />
      </Rejilla>

      {error && <p className="estado error">{error}</p>}
      {aviso && <p className="aviso">{aviso}</p>}

      <div className="pestanas pestanas-pagina">
        {SOLAPAS.map((t) => (
          <button key={t.id} aria-pressed={solapa === t.id} onClick={() => setSolapa(t.id)}>
            {t.texto}
            {t.id === 'estado' && faltan > 0 && <span className="pin">{faltan}</span>}
          </button>
        ))}
      </div>

      {solapa === 'estado' && (
        <div className="dos-columnas">
          <Panel titulo="Puesta en marcha"
                 bajada={faltan ? `Faltan ${faltan} de 4 pasos.` : 'Los cuatro pasos están listos.'}>
            <ol className="pasos-alta">
              {pasos.map((p) => (
                <li key={p.n} className={p.hecho ? 'hecho' : 'pendiente'}>
                  <span className="marcador">{p.hecho ? '✓' : p.n}</span>
                  <span className="t">
                    <b>{p.titulo}</b>
                    <span className="silencio">{p.detalle}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel titulo="Suscripción">
            <table>
              <tbody>
                <tr><td>Estado</td><td className="num">
                  <Insignia estado={e.habilitado ? 'ok' : 'mal'} texto={s.estado || 'sin plan'} /></td></tr>
                <tr><td>Vence</td><td className="num">{fecha(s.vigente_hasta)}</td></tr>
                <tr><td>Mensual</td><td className="num">{s.monto_mensual ? clp(s.monto_mensual) : '—'}</td></tr>
                <tr><td>Días de gracia</td><td className="num">{s.dias_gracia ?? '—'}</td></tr>
              </tbody>
            </table>
            <div className="acciones-panel">
              <button className="boton"
                      onClick={() => {
                        const monto = prompt('Monto del pago:', s.monto_mensual || '')
                        if (monto) accion('admin_registrar_pago', {
                          p_tenant: id, p_periodo: new Date().toISOString().slice(0, 10),
                          p_monto: Number(monto), p_meses: 1,
                        }, 'Pago registrado. Queda activa un mes más.')
                      }}>Registrar pago</button>
              {e.habilitado ? (
                <button className="boton peligro"
                        onClick={() => {
                          const nota = prompt(`Suspender ${e.nombre}. Motivo:`)
                          if (nota !== null) accion('admin_set_suscripcion',
                            { p_tenant: id, p_estado: 'suspendida', p_nota: nota },
                            'Suspendida. Deja de ver datos ahora; nada se borró.')
                        }}>Suspender</button>
              ) : (
                <button className="boton"
                        onClick={() => accion('admin_set_suscripcion',
                          { p_tenant: id, p_estado: 'activa' }, 'Reactivada.')}>Reactivar</button>
              )}
              <button className="boton"
                      onClick={() => accion('admin_set_suscripcion',
                        { p_tenant: id, p_estado: 'morosa' },
                        `Marcada morosa. Opera ${s.dias_gracia ?? 5} días más.`)}>Marcar morosa</button>
            </div>
          </Panel>

          <Panel titulo="Últimas cargas">
            {e.cargas?.length ? (
              <table>
                <thead><tr><th>Archivo</th><th>Tipo</th><th>Estado</th><th>Cuándo</th></tr></thead>
                <tbody>
                  {e.cargas.map((c, i) => (
                    <tr key={i}>
                      <td>{c.archivo}</td>
                      <td className="silencio">{c.tipo}</td>
                      <td><Insignia estado={c.estado === 'publicado' ? 'ok' : 'aviso'} texto={c.estado} /></td>
                      <td className="silencio">{fechaHora(c.cuando)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="tabla-vacia">Todavía no han cargado ningún archivo.</p>}
          </Panel>

          <Panel titulo="Pagos">
            {e.pagos?.length ? (
              <table>
                <thead><tr><th>Periodo</th><th className="num">Monto</th><th>Referencia</th></tr></thead>
                <tbody>
                  {e.pagos.map((p) => (
                    <tr key={p.periodo}>
                      <td>{fecha(p.periodo)}</td>
                      <td className="num">{clp(p.monto)}</td>
                      <td className="silencio">{p.referencia || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="tabla-vacia">Sin pagos registrados.</p>}
          </Panel>
        </div>
      )}

      {solapa === 'usuarios' && (
        <Usuarios empresa={{ ...e, tenant_id: id }} tenantId={id}
                  onCambio={() => qc.invalidateQueries()} />
      )}

      {solapa === 'config' && (
        <div className="dos-columnas">
          <Panel titulo="Qué tiene contratado"
                 bajada="Lo que trae el plan viene marcado. Si cambias algo, queda como excepción."
                 accion={<CambiarPlan actual={s.plan} onCambiar={(plan) =>
                   accion('admin_cambiar_plan', { p_tenant: id, p_plan: plan },
                          `Ahora está en el plan ${plan}.`)} />}>
            <div className="capacidades">
              {e.capacidades?.map((c) => (
                <label key={c.codigo} className={c.activa ? 'activa' : undefined}>
                  <input type="checkbox" checked={c.activa}
                         onChange={(ev) => accion('admin_set_capacidad', {
                           p_tenant: id, p_capacidad: c.codigo, p_activa: ev.target.checked,
                         }, `${c.nombre}: ${ev.target.checked ? 'activada' : 'desactivada'}`)} />
                  <span>
                    <b>{c.nombre}</b>
                    <span className="d">{c.descripcion}</span>
                  </span>
                </label>
              ))}
            </div>
          </Panel>

          <Documentos empresa={e} onGuardar={(docs) =>
            accion('admin_configurar_documentos', { p_tenant: id, p_documentos: docs },
                   'Tipos configurados. Ya pueden cargar ventas.')} />
        </div>
      )}

      <p className="volver">
        <button className="boton" onClick={() => ir('/empresas')}>← Volver a empresas</button>
      </p>
    </>
  )
}

function CambiarPlan({ actual, onCambiar }) {
  const { data: planes = [] } = useQuery({
    queryKey: ['admin_planes'], queryFn: () => llamar('admin_planes'),
  })
  if (!planes.length) return null
  return (
    <select value={actual || ''} onChange={(e) => onCambiar(e.target.value)} aria-label="Plan">
      {planes.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
    </select>
  )
}

/**
 * Tipos de documento. Compacto: son cuatro campos chicos, no un
 * formulario de página completa. Este es el paso que bloquea el
 * onboarding, así que tiene que poder resolverse sin desplazarse.
 */
function Documentos({ empresa, onGuardar }) {
  const inicial = empresa.documentos?.length
    ? empresa.documentos.map((d) => ({ ...d, cuenta: d.cuenta, signo: d.signo }))
    : [
        { codigo: 'FA', descripcion: 'Factura', cuenta: true, signo: 1 },
        { codigo: 'BE', descripcion: 'Boleta', cuenta: true, signo: 1 },
        { codigo: 'NC', descripcion: 'Nota de crédito', cuenta: true, signo: -1 },
        { codigo: 'GD', descripcion: 'Guía de despacho', cuenta: false, signo: 1 },
      ]
  const [docs, setDocs] = useState(inicial)
  const cambiar = (i, campo, valor) =>
    setDocs(docs.map((d, j) => (j === i ? { ...d, [campo]: valor } : d)))

  return (
    <Panel titulo="Tipos de documento"
           bajada="Qué cuenta como venta y con qué signo. Una nota de crédito resta.">
      <table className="tabla-docs">
        <thead>
          <tr><th>Código</th><th>Descripción</th><th>¿Cuenta?</th><th>Signo</th></tr>
        </thead>
        <tbody>
          {docs.map((d, i) => (
            <tr key={i}>
              <td><input value={d.codigo} className="campo-codigo"
                         onChange={(e) => cambiar(i, 'codigo', e.target.value.toUpperCase())} /></td>
              <td><input value={d.descripcion || ''}
                         onChange={(e) => cambiar(i, 'descripcion', e.target.value)} /></td>
              <td><input type="checkbox" checked={d.cuenta}
                         onChange={(e) => cambiar(i, 'cuenta', e.target.checked)} /></td>
              <td>
                <select value={d.signo} onChange={(e) => cambiar(i, 'signo', Number(e.target.value))}>
                  <option value={1}>suma</option>
                  <option value={-1}>resta</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="acciones-panel">
        <button className="boton"
                onClick={() => setDocs([...docs, { codigo: '', descripcion: '', cuenta: true, signo: 1 }])}>
          Agregar tipo
        </button>
        <button className="boton primario"
                onClick={() => onGuardar(docs.filter((d) => d.codigo.trim()))}>
          Guardar tipos
        </button>
      </div>
    </Panel>
  )
}
