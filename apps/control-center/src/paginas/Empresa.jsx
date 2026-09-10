import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { llamar } from '../lib/rpc.js'
import { clp, fecha, fechaHora, num } from '../lib/formato.js'

const ROLES = ['tenant_admin', 'gerencia', 'ejecutivo', 'solo_lectura']

export default function Empresa() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  const { data, isPending, isError, error: err } = useQuery({
    queryKey: ['admin_empresa', id],
    queryFn: () => llamar('admin_empresa', { p_tenant: id }),
  })

  async function accion(fn, args, mensaje) {
    setError(null); setAviso(null)
    try {
      const r = await llamar(fn, args)
      setAviso(mensaje || (typeof r === 'string' ? r : 'Listo'))
      qc.invalidateQueries()
    } catch (e) { setError(e.message) }
  }

  if (isPending) return <p className="estado">Cargando…</p>
  if (isError) return <p className="estado error">{err.message}</p>

  const e = data
  const s = e.suscripcion || {}
  const listo = {
    documentos: (e.documentos || []).length > 0,
    usuarios: (e.usuarios || []).length > 0,
    datos: e.datos?.clientes > 0,
    ventas: e.datos?.ventas > 0,
  }

  return (
    <>
      <header className="encabezado">
        <h1>{e.nombre}</h1>
        <p>
          {e.slug}.app.black-sheep.cl · creada el {fecha(e.creado_en)} ·{' '}
          <span className={`insignia${e.habilitado ? 'ok' : 'mal'}`}>
            {e.habilitado ? 'operando' : 'sin acceso'}
          </span>
        </p>
      </header>

      {error && <p className="estado error" style={{ marginBottom: 'var(--e4)' }}>{error}</p>}
      {aviso && <p className="estado" style={{ marginBottom: 'var(--e4)' }}>{aviso}</p>}

      <section className="panel">
        <h2>Puesta en marcha</h2>
        <p className="silencio">Los cuatro pasos para que esta empresa opere.</p>
        <Paso n="1" hecho={listo.documentos}
              titulo="Tipos de documento configurados"
              detalle={listo.documentos
                ? `${e.documentos.length} configurados: ${e.documentos.map((d) => d.codigo).join(', ')}`
                : 'SIN ESTO LA VENTA QUEDA EN CERO. Mira la columna de tipo en su Excel de ventas y decide qué suma, qué resta y qué no cuenta.'} />
        <Paso n="2" hecho={listo.usuarios}
              titulo="Usuarios con acceso"
              detalle={listo.usuarios ? `${e.usuarios.length} usuarios` : 'Nadie puede entrar todavía.'} />
        <Paso n="3" hecho={listo.datos}
              titulo="Maestra y precios cargados"
              detalle={listo.datos
                ? `${num(e.datos.clientes)} clientes · ${num(e.datos.productos)} productos`
                : 'Todavía no cargan sus archivos.'} />
        <Paso n="4" hecho={listo.ventas}
              titulo="Histórico de ventas"
              detalle={listo.ventas
                ? `${num(e.datos.ventas)} líneas · ${clp(e.datos.venta_mtd)} este mes`
                : 'Sin histórico no hay ciclos ni promedios: todos los clientes salen como nuevos.'} />
      </section>

      <div className="rejilla">
        <section className="panel">
          <h2>Suscripción</h2>
          <table>
            <tbody>
              <tr><td>Plan</td><td className="num">{s.plan || '—'}</td></tr>
              <tr><td>Estado</td><td className="num">{s.estado || 'sin plan'}</td></tr>
              <tr><td>Vence</td><td className="num">{fecha(s.vigente_hasta)}</td></tr>
              <tr><td>Mensual</td><td className="num">{clp(s.monto_mensual)}</td></tr>
              <tr><td>Días de gracia</td><td className="num">{s.dias_gracia ?? '—'}</td></tr>
            </tbody>
          </table>
          <p style={{ marginTop: 'var(--e4)', display: 'flex', gap: 'var(--e2)', flexWrap: 'wrap' }}>
            <button className="boton"
                    onClick={() => {
                      const monto = prompt('Monto del pago:', s.monto_mensual || '')
                      if (monto) accion('admin_registrar_pago', {
                        p_tenant: id, p_periodo: new Date().toISOString().slice(0, 10),
                        p_monto: Number(monto), p_meses: 1,
                      }, 'Pago registrado. La empresa queda activa un mes más.')
                    }}>
              Registrar pago
            </button>
            {e.habilitado ? (
              <button className="boton peligro"
                      onClick={() => {
                        const nota = prompt(`Suspender ${e.nombre}. Motivo:`)
                        if (nota !== null) accion('admin_set_suscripcion',
                          { p_tenant: id, p_estado: 'suspendida', p_nota: nota },
                          'Suspendida. Sus usuarios dejan de ver datos ahora mismo; nada se borró.')
                      }}>
                Suspender
              </button>
            ) : (
              <button className="boton"
                      onClick={() => accion('admin_set_suscripcion',
                        { p_tenant: id, p_estado: 'activa' }, 'Reactivada.')}>
                Reactivar
              </button>
            )}
            <button className="boton"
                    onClick={() => accion('admin_set_suscripcion',
                      { p_tenant: id, p_estado: 'morosa' },
                      `Marcada como morosa. Sigue operando ${s.dias_gracia ?? 5} días.`)}>
              Marcar morosa
            </button>
          </p>

          {e.pagos?.length > 0 && (
            <>
              <h2 style={{ marginTop: 'var(--e5)' }}>Pagos</h2>
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
            </>
          )}
        </section>

        <section className="panel">
          <div className="panel-titulo">
            <h2>Qué tiene contratado</h2>
            <CambiarPlan actual={s.plan} onCambiar={(plan) =>
              accion('admin_cambiar_plan', { p_tenant: id, p_plan: plan },
                     `Ahora está en el plan ${plan}.`)} />
          </div>
          <p className="silencio">
            Lo que trae el plan viene marcado como tal. Si prendes o apagas algo,
            queda como excepción de esta empresa y sobrevive a un cambio de plan.
          </p>
          <div className="lista-cap" style={{ marginTop: 'var(--e4)' }}>
            {e.capacidades?.map((c) => (
              <label key={c.codigo}>
                <input type="checkbox" checked={c.activa}
                       onChange={(ev) => accion('admin_set_capacidad', {
                         p_tenant: id, p_capacidad: c.codigo, p_activa: ev.target.checked,
                       }, `${c.nombre}: ${ev.target.checked ? 'activada' : 'desactivada'}`)} />
                <span>
                  <b>{c.nombre}</b>
                  {c.activa && <span className="insignia ok" style={{ marginLeft: 6 }}>activa</span>}
                  <span className="d"> · {c.descripcion}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>Usuarios</h2>
        <p className="silencio">
          Primero invítalos desde Supabase (Authentication → Invite user). Cuando acepten,
          asígnalos acá.
        </p>
        {e.usuarios?.length ? (
        <table style={{ marginTop: 'var(--e4)' }}>
          <thead><tr><th>Correo</th><th>Nombre</th><th>Rol</th><th></th></tr></thead>
          <tbody>
            {e.usuarios.map((u) => (
              <tr key={u.usuario_id}>
                <td>{u.email}</td>
                <td className="silencio">{u.nombre || '—'}</td>
                <td>
                  <select value={u.rol}
                          onChange={(ev) => accion('admin_asignar_usuario', {
                            p_tenant: id, p_email: u.email, p_rol: ev.target.value,
                          })}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td>
                  {u.activo
                    ? <button className="boton chico peligro"
                              onClick={() => accion('admin_quitar_usuario',
                                { p_tenant: id, p_usuario: u.usuario_id })}>Quitar acceso</button>
                    : <span className="insignia mal">sin acceso</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        ) : (
          <p className="tabla-vacia">
            Nadie tiene acceso todavía. Sus vendedores no pueden entrar hasta que
            los invites en Supabase y los asignes acá.
          </p>
        )}
        <AgregarUsuario onAgregar={(email, rol) =>
          accion('admin_asignar_usuario', { p_tenant: id, p_email: email, p_rol: rol })} />
      </section>

      <Documentos empresa={e} onGuardar={(docs) =>
        accion('admin_configurar_documentos', { p_tenant: id, p_documentos: docs },
               'Tipos de documento configurados. Ya pueden cargar ventas.')} />

      <section className="panel">
        <h2>Últimas cargas</h2>
        {e.cargas?.length ? (
          <table>
            <thead><tr><th>Archivo</th><th>Tipo</th><th>Estado</th><th>Cuándo</th></tr></thead>
            <tbody>
              {e.cargas.map((c, i) => (
                <tr key={i}>
                  <td>{c.archivo}</td>
                  <td className="silencio">{c.tipo}</td>
                  <td><span className="insignia">{c.estado}</span></td>
                  <td className="silencio">{fechaHora(c.cuando)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="silencio">Todavía no han cargado ningún archivo.</p>}
      </section>

      <p><Link className="boton" to="/">Volver a empresas</Link></p>
    </>
  )
}

function CambiarPlan({ actual, onCambiar }) {
  const { data: planes = [] } = useQuery({
    queryKey: ['admin_planes'],
    queryFn: () => llamar('admin_planes'),
  })
  if (!planes.length) return null
  return (
    <select value={actual || ''} onChange={(e) => onCambiar(e.target.value)}>
      {planes.map((p) => (
        <option key={p.codigo} value={p.codigo}>{p.nombre}</option>
      ))}
    </select>
  )
}

function Paso({ n, hecho, titulo, detalle }) {
  return (
    <div className={`paso-alta${hecho ? 'hecho' : 'pendiente'}`}>
      <span className="marcador">{hecho ? '✓' : n}</span>
      <span className="t"><b>{titulo}</b><br /><span className="silencio">{detalle}</span></span>
    </div>
  )
}

function AgregarUsuario({ onAgregar }) {
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState('gerencia')
  return (
    <div className="fila-campos" style={{ marginTop: 'var(--e4)' }}>
      <div className="campo">
        <label htmlFor="ue">Correo</label>
        <input id="ue" value={email} onChange={(e) => setEmail(e.target.value)}
               placeholder="persona@empresa.cl" />
      </div>
      <div className="campo">
        <label htmlFor="ur">Rol</label>
        <select id="ur" value={rol} onChange={(e) => setRol(e.target.value)}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <button className="boton primario" disabled={!email.includes('@')}
              onClick={() => { onAgregar(email, rol); setEmail('') }}>
        Dar acceso
      </button>
    </div>
  )
}

/**
 * El paso que bloquea el onboarding. Se parte de los códigos habituales
 * en Chile y se ajusta con los que traiga el ERP del cliente.
 */
function Documentos({ empresa, onGuardar }) {
  const inicial = empresa.documentos?.length
    ? empresa.documentos.map((d) => ({
        codigo: d.codigo, descripcion: d.descripcion, cuenta: d.cuenta, signo: d.signo,
      }))
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
    <section className="panel">
      <h2>Tipos de documento</h2>
      <p className="silencio">
        Qué cuenta como venta y con qué signo. Una nota de crédito lleva signo −1:
        si suma como venta positiva, el reporte queda inflado.
      </p>
      <table style={{ marginTop: 'var(--e4)' }}>
        <thead>
          <tr><th>Código</th><th>Descripción</th><th>¿Cuenta?</th><th>Signo</th></tr>
        </thead>
        <tbody>
          {docs.map((d, i) => (
            <tr key={i}>
              <td><input value={d.codigo} style={{ width: 70 }}
                         onChange={(e) => cambiar(i, 'codigo', e.target.value.toUpperCase())} /></td>
              <td><input value={d.descripcion || ''}
                         onChange={(e) => cambiar(i, 'descripcion', e.target.value)} /></td>
              <td>
                <input type="checkbox" checked={d.cuenta}
                       onChange={(e) => cambiar(i, 'cuenta', e.target.checked)} />
              </td>
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
      <p style={{ marginTop: 'var(--e4)' }}>
        <button className="boton"
                onClick={() => setDocs([...docs, { codigo: '', descripcion: '', cuenta: true, signo: 1 }])}>
          Agregar tipo
        </button>{' '}
        <button className="boton primario"
                onClick={() => onGuardar(docs.filter((d) => d.codigo.trim()))}>
          Guardar tipos
        </button>
      </p>
    </section>
  )
}
