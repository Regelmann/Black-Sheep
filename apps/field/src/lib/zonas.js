/** Comunas por zona — fuente de verdad operativa (KeyFoods terreno). */
export const ZONAS_COMUNAS = {
  'NOR-ORIENTE': [
    'LAS CONDES', 'VITACURA', 'LO BARNECHEA', 'LA REINA',
    'PENALOLEN', 'PEÑALOLEN', 'MACUL',
  ],
  'NOR-PONIENTE': [
    'NUNOA', 'ÑUÑOA', 'PROVIDENCIA', 'RECOLETA', 'INDEPENDENCIA', 'HUECHURABA',
    'QUILICURA', 'RENCA', 'CONCHALI', 'COLINA', 'LAMPA', 'CERRO NAVIA',
    'QUINTA NORMAL', 'SANTIAGO', 'ESTACION CENTRAL', 'ESTACIÓN CENTRAL',
  ],
  'ZONA SUR': [
    'LA FLORIDA', 'MAIPU', 'MAIPÚ', 'SAN MIGUEL', 'SAN JOAQUIN', 'SAN JOAQUÍN',
    'EL BOSQUE', 'LA CISTERNA', 'PAINE', 'PIRQUE', 'SAN BERNARDO', 'PUENTE ALTO',
    'LA PINTANA', 'SAN RAMON', 'SAN RAMÓN', 'PEDRO AGUIRRE CERDA',
  ],
}

export function normComuna(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Mapa comuna normalizada → zona */
const COMUNA_TO_ZONA = (() => {
  const m = {}
  for (const [zona, comunas] of Object.entries(ZONAS_COMUNAS)) {
    for (const c of comunas) {
      m[normComuna(c)] = zona
    }
  }
  return m
})()

export function zonaFromComuna(comuna) {
  const k = normComuna(comuna)
  if (!k) return null
  if (COMUNA_TO_ZONA[k]) return COMUNA_TO_ZONA[k]
  // fuzzy contains
  for (const [c, z] of Object.entries(COMUNA_TO_ZONA)) {
    if (k.includes(c) || c.includes(k)) return z
  }
  return null
}

export function comunasDeZona(zona) {
  const z = String(zona || '').toUpperCase().trim()
  return ZONAS_COMUNAS[z] || []
}

/**
 * ¿Este prospecto le corresponde a esta zona?
 *
 * REGLA: manda la COMUNA. La zona que asigna Google Places a veces es
 * incorrecta, y la comuna es un dato de la maestra.
 *
 * 🔴 EL HUECO QUE ESTO DOCUMENTA
 * Los prospectos se traen con `.eq('zona', zonaActiva)` y después se
 * filtran por comuna. Cuando los dos campos se contradicen, el
 * prospecto DESAPARECE PARA TODOS:
 *
 *   fila: zona='NOR-ORIENTE', comuna='MAIPU' (→ ZONA SUR)
 *   · el vendedor de NOR-ORIENTE: la consulta lo trae, el filtro lo tira
 *   · el vendedor de ZONA SUR:    el filtro lo aceptaría, pero la
 *                                 consulta nunca lo trae
 *
 * Nadie lo ve. Por eso `Ruta.jsx` ahora registra un console.warn con
 * los nombres: el dato de origen hay que corregirlo en la maestra.
 *
 * Devuelve { visible, motivo } y NO un booleano: cuando un prospecto se
 * descarta hay que poder decir POR QUÉ. Un `false` suelto es
 * indistinguible de "sin datos", y así fue como 1.886 prospectos
 * desaparecían sin que nadie lo notara.
 *
 * @param {{comuna?: string, zona?: string}} prospecto
 * @param {string} zonaActiva
 * @param {string} [uid]  ejecutivo en sesión
 * @param {Record<string,string>} [indice]  mapa comuna → zona (para tests)
 * @returns {{visible: boolean, motivo: string}}
 */
export function prospectoVisible(prospecto, zonaActiva, uid, indice) {
  if (!prospecto) return { visible: false, motivo: 'sin_prospecto' }
  if (!zonaActiva) return { visible: false, motivo: 'sin_zona_activa' }

  const zona = String(zonaActiva).toUpperCase().trim()
  const c = normComuna(prospecto.comuna)
  const zFila = String(prospecto.zona || '').toUpperCase().trim()

  // 0) ASIGNACIÓN EXPLÍCITA gana sobre todo.
  // Es la única salida para un prospecto con zona y comuna
  // contradictorias: si alguien se lo asignó a mano, lo ve.
  if (uid && prospecto.ejecutivo_id && String(prospecto.ejecutivo_id) === String(uid)) {
    return { visible: true, motivo: 'asignado' }
  }

  // 1) La comuna manda, si está cargada Y mapeada.
  if (c) {
    const porComuna = indice ? indice[c] : zonaFromComuna(c)
    if (!porComuna) {
      // Comuna sin mapear: NO se oculta. Se muestra marcado, que es la
      // regla del proyecto — ocultar en silencio es lo que hizo
      // desaparecer prospectos enteros.
      return { visible: true, motivo: 'sin_mapear' }
    }
    return porComuna === zona
      ? { visible: true, motivo: 'comuna' }
      : { visible: false, motivo: 'otra_zona' }
  }

  // 2) Sin comuna pero con zona en la fila.
  if (zFila) {
    return zFila === zona
      ? { visible: true, motivo: 'zona_fila' }
      : { visible: false, motivo: 'otra_zona' }
  }

  // 3) Sin comuna NI zona: tampoco desaparece. Se muestra para que
  // alguien complete el dato, en vez de perderlo.
  return { visible: true, motivo: 'sin_datos' }
}

/**
 * ¿La zona declarada y la comuna dicen cosas distintas?
 * Un `true` acá significa que el prospecto no lo ve ningún vendedor.
 */
export function zonaContradiceComuna(prospecto) {
  if (!prospecto) return false
  const c = normComuna(prospecto.comuna)
  const z = String(prospecto.zona || '').toUpperCase().trim()
  if (!c || !z) return false
  const porComuna = zonaFromComuna(c)
  return Boolean(porComuna) && porComuna !== z
}
