import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase.js'
import { llamar } from '../lib/rpc.js'
import { useDatos } from '../hooks/useDatos.js'
import { Bloque } from '../componentes/Estado.jsx'
import { fechaHora } from '../lib/formato.js'

const CAMPOS = {
  zona_id: 'Zona', ejecutivo_id: 'Ejecutivo', comuna: 'Comuna',
  nombre: 'Nombre', direccion: 'Dirección', es_bloqueado: 'Bloqueado',
}

/**
 * El archivo dice una cosa y alguien editó otra. No se resuelve solo:
 * se muestra. Resolver en silencio a favor de cualquiera de los dos es
 * como se pierde la confianza en el sistema.
 */
export default function Conflictos() {
  const qc = useQueryClient()
  const datos = useDatos({
    clave: ['conflictos'],
    construir: () => supabase.from('conflictos')
      .select('id,archivo,objeto,llave,campo,valor_archivo,valor_manual,creado_en')
      .order('creado_en', { ascending: false }),
    label: 'conflictos',
  })

  async function resolver(id, resolucion) {
    await llamar('resolver_conflicto', { p_conflicto: id, p_resolucion: resolucion })
    qc.invalidateQueries()
  }

  return (
    <>
      <header className="encabezado">
        <h1>Conflictos</h1>
        <p>Cambios hechos aquí que el último archivo contradice. El cambio manual se mantuvo; decide si sigue así.</p>
      </header>

      <section className="bloque">
        <Bloque datos={datos} que="los conflictos"
                vacio="No hay conflictos. Lo que editaste y lo que trae el archivo coinciden.">
          <table>
            <thead>
              <tr>
                <th>Cliente</th><th>Campo</th>
                <th>Dice el archivo</th><th>Lo cambiaste a</th>
                <th>Archivo</th><th></th>
              </tr>
            </thead>
            <tbody>
              {datos.rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.llave}</td>
                  <td>{CAMPOS[c.campo] || c.campo}</td>
                  <td className="tenue">{c.valor_archivo || '—'}</td>
                  <td><strong>{c.valor_manual || '—'}</strong></td>
                  <td className="tenue">
                    {c.archivo}
                    <div className="sub">{fechaHora(c.creado_en)}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn chico" onClick={() => resolver(c.id, 'mantener_manual')}>
                      Mantener mi cambio
                    </button>{' '}
                    <button className="btn chico" onClick={() => resolver(c.id, 'aceptar_archivo')}>
                      Usar el archivo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloque>
      </section>
    </>
  )
}
