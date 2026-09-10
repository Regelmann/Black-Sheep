/**
 * Lectura del Excel EN EL NAVEGADOR.
 *
 * El archivo NO se interpreta acá: se convierte a filas tal cual y se
 * mandan al servidor, que las guarda como evidencia inmutable y las
 * normaliza contra el contrato. Si el front interpretara, cada versión
 * del front produciría datos distintos con el mismo archivo.
 */

/** Hash del archivo original. Es lo que detecta una recarga repetida. */
export async function sha256(file) {
  const buf = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Devuelve { hojas, filas } de la primera hoja con datos. */
export async function leerExcel(file) {
  // Carga diferida: xlsx pesa ~400 kB y sólo hace falta cuando alguien
  // abre un archivo. Meterlo en el bundle inicial castiga a todas las
  // pantallas por una que se usa una vez al día.
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const libro = XLSX.read(buf, { cellDates: true })
  const hojas = libro.SheetNames

  // La plantilla trae "Instrucciones" primero; los datos están en "Datos".
  const nombre = hojas.includes('Datos') ? 'Datos' : hojas[0]
  const hoja = libro.Sheets[nombre]
  const crudas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false })

  const filas = crudas
    .map(limpiarFila)
    .filter((f) => Object.values(f).some((v) => String(v).trim() !== ''))

  return { hojas, hojaUsada: nombre, filas }
}

function limpiarFila(fila) {
  const salida = {}
  for (const [k, v] of Object.entries(fila)) {
    const clave = String(k).trim()
    // Columnas sin nombre de encabezado: las genera Excel al leer celdas
    // sueltas fuera de la tabla. No aportan y ensucian el mapeo.
    if (!clave || clave.startsWith('__EMPTY')) continue
    salida[clave] = typeof v === 'string' ? v.trim() : v
  }
  return salida
}

/** El servidor recibe de a tandas: un archivo de 80.000 líneas no cabe en un POST. */
export function enTandas(filas, tamano = 500) {
  const tandas = []
  for (let i = 0; i < filas.length; i += tamano) tandas.push(filas.slice(i, i + tamano))
  return tandas
}
