import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase.js'
import { llamar } from '../lib/rpc.js'
import { leerExcel, sha256 } from '../lib/excel.js'
import { useDatos } from '../hooks/useDatos.js'
import { Bloque } from '../componentes/Estado.jsx'
import { clp, fechaHora, num } from '../lib/formato.js'

const TIPOS = [
  { id: 'precios', nombre: 'Lista de precios', define: 'qué se vende' },
  { id: 'stock',   nombre: 'Stock',            define: 'si hay' },
  { id: 'maestra', nombre: 'Maestra de clientes', define: 'de quién es cada cliente' },
  { id: 'ventas',  nombre: 'Ventas',           define: 'qué compró cada uno' },
  { id: 'costos',  nombre: 'Costos (opcional)', define: 'cuánto deja' },
]

const LOTE = 500   // el servidor recibe las filas por tandas

export default function Carga() {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState('ventas')
  const [archivo, setArchivo] = useState(null)
  const [oficial, setOficial] = useState('')
  const [arrastrando, setArrastrando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [progreso, setProgreso] = useState(null)
  const [pasos, setPasos] = useState(null)
  const [lote, setLote] = useState(null)
  const [error, setError] = useState(null)
  const [publicado, setPublicado] = useState(null)

  const cargas = useDatos({
    clave: ['cargas'],
    construir: () => supabase.from('cargas').select(
      'lote_id,tipo,nombre_original,estado,filas_leidas,filas_validas,filas_excluidas,motivo_rechazo,subido_en,publicado_en',
    ).order('subido_en', { ascending: false }).limit(12),
    label: 'cargas',
  })

  const exclusiones = useDatos({
    clave: ['exclusiones', lote],
    construir: () => supabase.from('carga_exclusiones').select('regla,filas,primera_fila').eq('lote_id', lote),
    label: 'exclusiones',
    activa: !!lote,
  })

  const recon = useDatos({
    clave: ['reconciliacion', lote],
    construir: () => supabase.from('cargas').select('lote_id,estado,filas_validas,filas_excluidas').eq('lote_id', lote),
    label: 'reconciliacion',
    activa: !!lote,
  })

  function reiniciar() {
    setArchivo(null); setLote(null); setPasos(null)
    setError(null); setPublicado(null); setProgreso(null); setOficial('')
  }

  async function procesar() {
    if (!archivo) return
    setTrabajando(true); setError(null); setPasos(null); setPublicado(null)
    try {
      setProgreso('Leyendo el archivo…')
      const { filas, hoja } = await leerExcel(archivo)
      if (!filas.length) throw new Error('El archivo no tiene filas con datos.')

      setProgreso('Registrando la carga…')
      const hash = await sha256(archivo)
      const nuevoLote = await llamar('registrar_carga', {
        p_tipo: tipo, p_nombre: archivo.name, p_sha256: hash,
        p_bytes: archivo.size, p_storage_path: null,
      })
      setLote(nuevoLote)

      for (let i = 0; i < filas.length; i += LOTE) {
        setProgreso(`Enviando filas ${i + 1}–${Math.min(i + LOTE, filas.length)} de ${filas.length}…`)
        await llamar('agregar_filas', { p_lote: nuevoLote, p_filas: filas.slice(i, i + LOTE) })
      }

      setProgreso('Ejecutando el ciclo…')
      const resultado = await llamar('ejecutar_ciclo', {
        p_lote: nuevoLote,
        p_venta_oficial: tipo === 'ventas' && oficial ? Number(oficial) : null,
      })
      setPasos(resultado)
      setProgreso(`Hoja leída: ${hoja} · ${filas.length} filas`)
      qc.invalidateQueries({ queryKey: ['cargas'] })
    } catch (e) {
      setError(e.message)
    } finally {
      setTrabajando(false)
    }
  }

  async function publicar(aprobarCaida = false) {
    setTrabajando(true); setError(null)
    try {
      const r = await llamar('publicar_lote', {
        p_lote: lote, p_umbral_pct: 1.0, p_aprobar_caida: aprobarCaida,
      })
      setPublicado(r?.[0] || null)
      qc.invalidateQueries()
    } catch (e) {
      setError(e.message)
    } finally {
      setTrabajando(false)
    }
  }

  async function revertir(loteId) {
    if (!confirm('Se va a deshacer esta publicación. Los datos vuelven a como estaban antes de ella. ¿Seguir?')) return
    try {
      await llamar('revertir_lote', { p_lote: loteId })
      qc.invalidateQueries()
    } catch (e) {
      setError(e.message)
    }
  }

  const t = TIPOS.find((x) => x.id === tipo)
  const ventaNeta = pasos?.find((p) => p.paso.includes('reconciliar'))?.resultado || ''
  const validacion = pasos?.find((p) => p.paso.includes('validar'))?.resultado || ''

  return (
    <>
      <header className="encabezado">
        <h1>Cargar datos</h1>
        <p>Sube el archivo, revisa qué cuadra y publica. Nada llega a la app hasta que publiques.</p>
      </header>

      <section className="panel">
        <h2>1 · Elige el archivo</h2>
        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="tipo">Tipo de archivo</label>
            <select id="tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); reiniciar() }}>
              {TIPOS.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </div>
          {tipo === 'ventas' && (
            <div className="campo">
              <label htmlFor="oficial">Venta neta oficial del período (opcional)</label>
              <input id="oficial" type="number" inputMode="numeric" value={oficial}
                     placeholder="Ej: 88200000"
                     onChange={(e) => setOficial(e.target.value)} />
            </div>
          )}
        </div>
        <p className="silencio">Define {t.define}.</p>

        <div
          className={`zona-suelta${arrastrando ? ' activa' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault(); setArrastrando(false)
            const f = e.dataTransfer.files?.[0]; if (f) { reiniciar(); setArchivo(f) }
          }}
          style={{ marginTop: 'var(--e4)' }}
        >
          {archivo ? (
            <>
              <p><strong>{archivo.name}</strong></p>
              <p className="silencio">{(archivo.size / 1024).toFixed(0)} KB</p>
            </>
          ) : (
            <p className="silencio">Arrastra el Excel acá, o elige uno.</p>
          )}
          <p style={{ marginTop: 'var(--e3)' }}>
            <label className="boton" style={{ cursor: 'pointer' }}>
              Elegir archivo
              <input type="file" accept=".xlsx,.xls,.csv" hidden
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) { reiniciar(); setArchivo(f) } }} />
            </label>
          </p>
        </div>

        <p style={{ marginTop: 'var(--e4)' }}>
          <button className="boton primario" disabled={!archivo || trabajando} onClick={procesar}>
            {trabajando ? 'Procesando…' : 'Procesar archivo'}
          </button>
          {archivo && !trabajando && (
            <button className="boton" style={{ marginLeft: 'var(--e2)' }} onClick={reiniciar}>Cancelar</button>
          )}
        </p>
        {progreso && <p className="silencio" style={{ marginTop: 'var(--e2)' }}>{progreso}</p>}
        {error && <p className="estado error" style={{ marginTop: 'var(--e3)' }}>{error}</p>}
      </section>

      {pasos && (
        <section className="panel">
          <h2>2 · Revisa antes de publicar</h2>

          <Veredicto pasos={pasos} tipo={tipo} oficial={oficial} />

          <ul className="pasos">
            {pasos.map((p) => (
              <li key={p.paso}>
                <span className="paso-nombre">{p.paso}</span>
                <span>{p.resultado}</span>
              </li>
            ))}
          </ul>

          {exclusiones.rows?.length > 0 && (
            <>
              <h2 style={{ marginTop: 'var(--e5)' }}>Filas que quedaron fuera</h2>
              <p className="silencio">Ninguna se borró. Están guardadas con su motivo.</p>
              <table>
                <thead><tr><th>Motivo</th><th className="num">Filas</th><th className="num">Primera</th></tr></thead>
                <tbody>
                  {exclusiones.rows.map((e) => (
                    <tr key={e.regla}>
                      <td>{explicarRegla(e.regla)}</td>
                      <td className="num">{num(e.filas)}</td>
                      <td className="num silencio">{num(e.primera_fila)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <p style={{ marginTop: 'var(--e5)' }}>
            <button className="boton primario" disabled={trabajando} onClick={() => publicar(false)}>
              Publicar
            </button>
            <button className="boton" style={{ marginLeft: 'var(--e2)' }} onClick={reiniciar}>
              Descartar esta carga
            </button>
          </p>

          {publicado && (
            <div className={`aviso-${publicado.resultado === 'PUBLICADO' ? 'vacio' : 'error'}`}
                 style={{ marginTop: 'var(--e3)' }}>
              <strong>{publicado.resultado}</strong> · {publicado.detalle}
              {publicado.resultado === 'REQUIERE_APROBACION' && (
                <p style={{ marginTop: 'var(--e2)' }}>
                  <button className="boton peligro" onClick={() => publicar(true)}>
                    El archivo está completo, publicar igual
                  </button>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <h2>Cargas recientes</h2>
        <Bloque datos={cargas} que="las cargas" vacio="Todavía no se ha cargado ningún archivo.">
          <table>
            <thead>
              <tr>
                <th>Archivo</th><th>Tipo</th><th>Estado</th>
                <th className="num">Válidas</th><th className="num">Fuera</th>
                <th>Cuándo</th><th></th>
              </tr>
            </thead>
            <tbody>
              {cargas.rows.map((c) => (
                <tr key={c.lote_id}>
                  <td>
                    {c.nombre_original}
                    {c.motivo_rechazo && <div className="silencio">{c.motivo_rechazo}</div>}
                  </td>
                  <td>{c.tipo}</td>
                  <td><span className={`insignia${tonoEstado(c.estado)}`}>{c.estado}</span></td>
                  <td className="num">{num(c.filas_validas)}</td>
                  <td className="num">{num(c.filas_excluidas)}</td>
                  <td className="silencio">{fechaHora(c.subido_en)}</td>
                  <td>
                    {c.estado === 'publicado' && (
                      <button className="boton chico peligro" onClick={() => revertir(c.lote_id)}>Revertir</button>
                    )}
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

/** La pieza con carácter: el momento de decidir si esto se publica. */
function Veredicto({ pasos, tipo, oficial }) {
  const recon = pasos.find((p) => p.paso.includes('reconciliar'))?.resultado || ''
  const m = recon.match(/difiere (-?[\d.,]+)% del oficial/)
  const variacion = recon.match(/variación (-?[\d.,]+)%/)

  if (m) {
    const dif = Number(m[1])
    const cuadra = Math.abs(dif) <= 1
    return (
      <div className={`compuerta${cuadra ? 'cuadra' : 'no-cuadra'}`}>
        <div>
          <p className="cifra">{dif > 0 ? '+' : ''}{dif}%</p>
          <p className="glosa">{cuadra ? 'La venta cuadra con tu total oficial' : 'La venta NO cuadra'}</p>
        </div>
        <dl>
          <dt>Calculado del archivo</dt>
          <dd>{recon.replace(/ ·.*/, '').replace('venta neta ', '')}</dd>
          <dt>Tu total oficial</dt>
          <dd>{clp(Number(oficial))}</dd>
        </dl>
      </div>
    )
  }

  if (variacion) {
    const v = Number(variacion[1])
    const riesgo = v < -30
    return (
      <div className={`compuerta${riesgo ? 'no-cuadra' : 'cuadra'}`}>
        <div>
          <p className="cifra">{v > 0 ? '+' : ''}{v}%</p>
          <p className="glosa">
            {riesgo ? 'Trae muchas menos filas que lo vigente' : 'Cantidad de filas coherente con lo vigente'}
          </p>
        </div>
        <dl>
          <dt>En este archivo</dt>
          <dd>{recon.split(' filas')[0]}</dd>
          <dt>Vigente hoy</dt>
          <dd>{(recon.match(/vs (\d+) actuales/) || [])[1] || '—'}</dd>
        </dl>
      </div>
    )
  }

  return (
    <div className="compuerta pendiente">
      <div>
        <p className="cifra">—</p>
        <p className="glosa">Sin total oficial declarado</p>
      </div>
      <dl>
        <dt>Resultado</dt><dd>{recon}</dd>
        <dt>Recomendación</dt>
        <dd>{tipo === 'ventas' ? 'Declara el total del período para poder comparar' : 'Revisa las filas excluidas'}</dd>
      </dl>
    </div>
  )
}

function explicarRegla(regla) {
  const mapa = {
    FALTA_OBLIGATORIA: 'Le falta una columna obligatoria',
    SIN_PRECIO: 'No trae ningún precio',
    FECHA_INVALIDA: 'La fecha no se entiende o es futura',
    TIPO_DOC_DESCONOCIDO: 'Tipo de documento no configurado como venta',
    ESTADO_EXCLUIDO: 'El documento está anulado',
    AVISO_CLIENTE_SIN_MAESTRA: 'Aviso: cliente que no está en la maestra (la venta sí cuenta)',
  }
  return mapa[regla] || regla
}

const tonoEstado = (e) =>
  e === 'publicado' ? 'ok' : e === 'rechazado' ? 'mal' : e === 'validado' ? 'aviso' : ''
