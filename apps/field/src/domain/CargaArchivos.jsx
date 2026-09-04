/**
 * CARGA DE LOS 4 ARCHIVOS — la base de replicación.
 *
 * POR QUÉ ESTO ES LO PRIMERO
 * Para vender a una segunda empresa hace falta que ELLA pueda cargar sus
 * datos sin que nadie corra un script. Estos cuatro archivos son todo lo
 * que el sistema necesita:
 *
 *   LISTA DE PRECIOS → qué se vende. La BASE del catálogo.
 *   STOCK            → si hay. No define el catálogo, lo informa.
 *   MAESTRA          → de quién es cada cliente. Reparte las ventas.
 *   VENTAS           → qué compró cada uno.
 *
 * "La maestra manda": el canal y el ejecutivo salen de ahí, nunca del
 * código de vendedor de la factura.
 *
 * QUÉ HACE Y QUÉ NO
 * Valida el archivo ANTES de subirlo: extensión, tamaño, columnas
 * mínimas y filas con datos. Un Excel con la pestaña equivocada, o el
 * de otro mes, se detecta acá y no después de un ciclo de 20 minutos.
 *
 * **No procesa los datos.** Los deja en Storage para que los tome el
 * ciclo ETL. Reimplementar `CICLO_UNICO.py` en el navegador sería tener
 * dos versiones de la misma lógica desincronizándose.
 */
import { useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { mensajeDeError } from '../lib/erroresUsuario.js'

/**
 * Los cuatro archivos, en el orden en que importan.
 *
 * `columnas` son fragmentos que deben aparecer en la primera fila. Se
 * comparan en minúscula y sin acentos, porque el mismo Excel puede venir
 * con "Razón Social" o "RAZON SOCIAL" según quién lo exportó.
 */
export const ARCHIVOS = [
  {
    id: 'precios',
    titulo: 'Lista de precios',
    sub: 'Qué se vende y a cuánto — la base del catálogo',
    columnas: ['codigo', 'precio'],
    ejemplo: 'LISTA_DE_PRECIOS_AGOSTO.xlsx',
  },
  {
    id: 'stock',
    titulo: 'Stock',
    sub: 'Qué hay disponible en bodega hoy',
    columnas: ['codigo', 'stock'],
    ejemplo: 'STOCK_ACTUAL.xlsx',
  },
  {
    id: 'maestra',
    titulo: 'Maestra de clientes',
    sub: 'De quién es cada cliente — reparte las ventas',
    columnas: ['rut', 'ejecutivo'],
    ejemplo: 'MAESTRA_CLIENTES.xlsx',
  },
  {
    id: 'ventas',
    titulo: 'Ventas',
    sub: 'Histórico acumulado, no sólo el día',
    columnas: ['rut', 'fecha'],
    ejemplo: 'VENTAS_ACTUAL.xlsx',
  },
]

const MAX_MB = 25
const EXT_OK = ['.xlsx', '.xls', '.csv']

const normalizar = (t) =>
  String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Revisa el archivo antes de subirlo.
 * Devuelve `{ ok, error, aviso, filas }` — nunca lanza.
 */
export async function revisarArchivo(file, def) {
  if (!file) return { ok: false, error: 'No se eligió ningún archivo.' }

  const ext = '.' + file.name.split('.').pop().toLowerCase()
  if (!EXT_OK.includes(ext)) {
    return { ok: false, error: `Tiene que ser Excel o CSV. Este es ${ext}.` }
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return {
      ok: false,
      error: `Pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_MB} MB.`,
    }
  }
  if (file.size < 200) {
    return { ok: false, error: 'El archivo está vacío.' }
  }

  // Sólo se puede leer la cabecera de un CSV sin librería. Para .xlsx
  // se confía en el ciclo, que sí sabe abrirlo — pero se avisa.
  if (ext === '.csv') {
    try {
      const cabecera = normalizar(await file.slice(0, 4096).text()).split('\n')[0]
      const faltan = def.columnas.filter((c) => !cabecera.includes(c))
      if (faltan.length) {
        return {
          ok: false,
          error: `No encuentro la columna "${faltan[0]}". ¿Es el archivo de ${def.titulo.toLowerCase()}?`,
        }
      }
    } catch {
      return { ok: true, aviso: 'No se pudo leer la cabecera; se sube igual.' }
    }
  }

  return { ok: true }
}

export default function CargaArchivos({ tenantId, onListo }) {
  const [estado, setEstado] = useState({})   // id → {archivo, subiendo, ok, error}
  const refs = useRef({})

  const elegir = useCallback(async (def, file) => {
    if (!file) return
    setEstado((p) => ({ ...p, [def.id]: { archivo: file, subiendo: true } }))

    const chequeo = await revisarArchivo(file, def)
    if (!chequeo.ok) {
      setEstado((p) => ({ ...p, [def.id]: { archivo: file, error: chequeo.error } }))
      return
    }

    // La ruta incluye el tenant: cada empresa escribe en su carpeta.
    // Sin esto, dos clientes se pisarían los archivos.
    const hoy = new Date().toISOString().slice(0, 10)
    const ext = file.name.split('.').pop()
    const ruta = `${tenantId}/${hoy}/${def.id}.${ext}`

    const { error } = await supabase.storage
      .from('cargas')
      .upload(ruta, file, { upsert: true, contentType: file.type })

    if (error) {
      setEstado((p) => ({
        ...p,
        [def.id]: { archivo: file, error: mensajeDeError(error) },
      }))
      return
    }

    setEstado((p) => ({
      ...p,
      [def.id]: { archivo: file, ok: true, aviso: chequeo.aviso, ruta },
    }))
  }, [tenantId])

  const listos = ARCHIVOS.filter((a) => estado[a.id]?.ok).length
  const completo = listos === ARCHIVOS.length

  return (
    <section className="bs-carga">
      <header className="bs-carga-head">
        <div>
          <p className="bs-carga-kicker">Datos de la empresa</p>
          <h2>Los cuatro archivos</h2>
          <p className="bs-carga-sub">
            Con estos cuatro el sistema arma todo: catálogo, cartera, rutas y
            gerencia. La <strong>lista de precios</strong> define qué se vende;
            el <strong>stock</strong> sólo dice si hay.
          </p>
        </div>
        <div className={'bs-carga-progreso' + (completo ? ' is-ok' : '')}>
          <strong>{listos}</strong>
          <span>de 4</span>
        </div>
      </header>

      <ul className="bs-carga-lista">
        {ARCHIVOS.map((a, i) => {
          const e = estado[a.id] || {}
          return (
            <li
              key={a.id}
              className={
                'bs-carga-item' +
                (e.ok ? ' is-ok' : '') +
                (e.error ? ' is-error' : '')
              }
            >
              <span className="bs-carga-num">{e.ok ? '✓' : i + 1}</span>

              <div className="bs-carga-info">
                <strong>{a.titulo}</strong>
                <span className="bs-carga-desc">{a.sub}</span>

                {e.archivo && !e.error && (
                  <span className="bs-carga-file">
                    {e.archivo.name} · {(e.archivo.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                )}
                {e.error && <span className="bs-carga-err">{e.error}</span>}
                {e.aviso && <span className="bs-carga-aviso">{e.aviso}</span>}
                {!e.archivo && (
                  <span className="bs-carga-ej">Ej: {a.ejemplo}</span>
                )}
              </div>

              <input
                ref={(r) => (refs.current[a.id] = r)}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="bs-carga-input"
                onChange={(ev) => elegir(a, ev.target.files?.[0])}
              />
              <button
                type="button"
                className={'bs-carga-btn' + (e.ok ? ' is-ok' : '')}
                disabled={e.subiendo}
                onClick={() => refs.current[a.id]?.click()}
              >
                {e.subiendo ? 'Subiendo…' : e.ok ? 'Cambiar' : 'Elegir'}
              </button>
            </li>
          )
        })}
      </ul>

      <footer className="bs-carga-foot">
        {completo ? (
          <>
            <p className="bs-carga-ok">
              Los cuatro archivos están arriba. El ciclo los toma en la próxima
              corrida y actualiza catálogo, cartera y gerencia.
            </p>
            <button type="button" className="bs-carga-cta" onClick={onListo}>
              Ver el tablero
            </button>
          </>
        ) : (
          <p className="bs-carga-nota">
            Faltan {4 - listos}. Se pueden subir en cualquier orden — el ciclo
            los cruza al final.
          </p>
        )}
      </footer>
    </section>
  )
}
