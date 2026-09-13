import { useState } from 'react'
import { llamarFuncion } from '../lib/funciones.js'
import { llamar } from '../../../../packages/datos/rpc.js'
import { Panel, Insignia, Vacio } from '../../../../packages/ui/Piezas.jsx'

const ROLES = [
  { id: 'tenant_admin', texto: 'Administrador', que: 'Todo: usuarios, carga, precios, metas.' },
  { id: 'gerencia',     texto: 'Gerencia',      que: 'Resumen, carga, precios y metas. Ve costos.' },
  { id: 'ejecutivo',    texto: 'Ejecutivo',     que: 'Su cartera en terreno. No ve costos.' },
  { id: 'solo_lectura', texto: 'Solo lectura',  que: 'Mira el resumen y nada más.' },
]

/**
 * Usuarios de una empresa.
 *
 * La contraseña se genera en el servidor y se muestra UNA vez. No se
 * guarda en ninguna parte: guardarla para poder mostrarla después sería
 * tener las contraseñas de tus clientes en texto plano. Si se pierde,
 * se genera otra.
 */
export default function Usuarios({ empresa, onCambio }) {
  const [form, setForm] = useState({ email: '', nombre: '', rol: 'ejecutivo' })
  const [credencial, setCredencial] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  async function operar(fn, correo) {
    setError(null); setOcupado(true)
    try {
      const r = await fn()
      if (r?.clave) setCredencial({ email: correo, clave: r.clave })
      onCambio?.()
      return r
    } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }

  const rol = ROLES.find((r) => r.id === form.rol)

  return (
    <>
      <Panel titulo="Con acceso"
             bajada="Los roles cambian lo que cada persona ve, no sólo lo que puede tocar.">
        {empresa.usuarios?.length ? (
          <table>
            <thead>
              <tr><th>Persona</th><th>Rol</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {empresa.usuarios.map((u) => (
                <tr key={u.usuario_id}>
                  <td>
                    <strong>{u.nombre || u.email}</strong>
                    {u.nombre && <div className="silencio">{u.email}</div>}
                  </td>
                  <td>
                    <select value={u.rol} disabled={ocupado}
                            onChange={(e) => operar(() => llamar('admin_asignar_usuario', {
                              p_tenant: empresa.tenant_id, p_email: u.email, p_rol: e.target.value,
                            }))}>
                      {ROLES.map((r) => <option key={r.id} value={r.id}>{r.texto}</option>)}
                    </select>
                  </td>
                  <td>
                    <Insignia estado={u.activo ? 'ok' : 'mal'}
                              texto={u.activo ? 'activo' : 'sin acceso'} />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="boton chico" disabled={ocupado}
                            onClick={() => operar(
                              () => llamarFuncion('admin-usuarios',
                                { accion: 'resetear', usuario_id: u.usuario_id }), u.email)}>
                      Contraseña nueva
                    </button>{' '}
                    <button className={`boton chico ${u.activo ? 'peligro' : ''}`} disabled={ocupado}
                            onClick={() => {
                              const accion = u.activo ? 'bloquear' : 'desbloquear'
                              if (accion === 'desbloquear' ||
                                  confirm(`Bloquear a ${u.email}. No podrá entrar; su historial se conserva.`))
                                operar(() => llamarFuncion('admin-usuarios',
                                  { accion, usuario_id: u.usuario_id }), u.email)
                            }}>
                      {u.activo ? 'Bloquear' : 'Desbloquear'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Vacio titulo="Nadie tiene acceso todavía"
                 detalle="Sus vendedores no pueden entrar hasta que crees su cuenta." />
        )}
      </Panel>

      <Panel titulo="Crear cuenta" bajada={rol?.que}>
        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="ue">Correo</label>
            <input id="ue" type="email" value={form.email} placeholder="persona@empresa.cl"
                   onChange={(e) => setForm({ ...form, email: e.target.value.trim() })} />
          </div>
          <div className="campo">
            <label htmlFor="un">Nombre</label>
            <input id="un" value={form.nombre}
                   onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="ur">Rol</label>
            <select id="ur" value={form.rol}
                    onChange={(e) => setForm({ ...form, rol: e.target.value })}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.texto}</option>)}
            </select>
          </div>
          <button className="boton primario" disabled={!form.email.includes('@') || ocupado}
                  onClick={async () => {
                    const correo = form.email
                    const r = await operar(() => llamarFuncion('admin-usuarios', {
                      accion: 'crear', email: correo, nombre: form.nombre || null,
                      rol: form.rol, tenant_id: empresa.tenant_id,
                    }), correo)
                    if (r?.clave) setForm({ email: '', nombre: '', rol: form.rol })
                  }}>
            {ocupado ? 'Creando…' : 'Crear cuenta'}
          </button>
        </div>

        {error && <p className="estado error" style={{ marginTop: 12 }}>{error}</p>}

        {credencial && (
          <div className="credencial">
            <p><b>Contraseña de {credencial.email}</b></p>
            <code>{credencial.clave}</code>
            <p className="silencio">
              Se muestra una sola vez y no queda guardada en ninguna parte. Entrégala
              por un canal seguro. Si se pierde, generas otra.
            </p>
            <div className="acciones-panel">
              <button className="boton chico"
                      onClick={() => navigator.clipboard?.writeText(credencial.clave)}>Copiar</button>
              <button className="boton chico" onClick={() => setCredencial(null)}>Listo</button>
            </div>
          </div>
        )}
      </Panel>
    </>
  )
}
