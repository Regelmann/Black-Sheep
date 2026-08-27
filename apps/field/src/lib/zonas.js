/**
 * Comunas por zona — fuente de verdad de RESPALDO.
 *
 * La fuente viva es la tabla `zonas_comunas` en Supabase, que Admin edita.
 * Este mapa se usa como semilla y como respaldo cuando la tabla no
 * responde, para que el mapa de Ruta nunca quede sin zonas.
 *
 * Cubre las 52 comunas de la Región Metropolitana. Antes cubría 33, y las
 * 19 faltantes desaparecían del mapa de Ruta aunque el prospecto tuviera
 * zona y ejecutivo asignados en la base: el filtro por comuna manda sobre
 * la zona, así que una comuna no mapeada equivalía a "no existe".
 */
export const ZONAS_COMUNAS = {
  'NOR-ORIENTE': [
    'LAS CONDES', 'VITACURA', 'LO BARNECHEA', 'LA REINA',
    'PENALOLEN', 'PEÑALOLEN', 'MACUL',
    // agregadas: cordillera y precordillera
    'SAN JOSE DE MAIPO',
  ],
  'NOR-PONIENTE': [
    'NUNOA', 'ÑUÑOA', 'PROVIDENCIA', 'RECOLETA', 'INDEPENDENCIA', 'HUECHURABA',
    'QUILICURA', 'RENCA', 'CONCHALI', 'COLINA', 'LAMPA', 'CERRO NAVIA',
    'QUINTA NORMAL', 'SANTIAGO', 'ESTACION CENTRAL', 'ESTACIÓN CENTRAL',
    // agregadas: poniente y norte rural
    'PUDAHUEL', 'LO PRADO', 'TILTIL', 'CURACAVI', 'MARIA PINTO',
  ],
  'ZONA SUR': [
    'LA FLORIDA', 'MAIPU', 'MAIPÚ', 'SAN MIGUEL', 'SAN JOAQUIN', 'SAN JOAQUÍN',
    'EL BOSQUE', 'LA CISTERNA', 'PAINE', 'PIRQUE', 'SAN BERNARDO', 'PUENTE ALTO',
    'LA PINTANA', 'SAN RAMON', 'SAN RAMÓN', 'PEDRO AGUIRRE CERDA',
    // agregadas: sur urbano
    'CERRILLOS', 'LA GRANJA', 'LO ESPEJO',
    // agregadas: sur y surponiente rural (Maipo / Talagante / Melipilla)
    'BUIN', 'CALERA DE TANGO', 'MELIPILLA', 'ALHUE', 'SAN PEDRO',
    'TALAGANTE', 'EL MONTE', 'ISLA DE MAIPO', 'PADRE HURTADO',
    'PENAFLOR', 'PEÑAFLOR',
  ],
}

export const ZONAS = Object.keys(ZONAS_COMUNAS)

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
 * ¿Este prospecto se muestra en el mapa de la zona `zonaNom`?
 *
 * Antes vivía inline en Ruta.jsx como FILTER_BY_COMUNA_ZONE:
 *
 *     if (cz) return comunaSet.has(cz)
 *     return String(p.zona || '') === zonaNom
 *
 * El problema: la comuna mandaba sobre TODO. Un prospecto con
 * `ejecutivo_id` tuyo y `zona` explícita desaparecía si su comuna no
 * estaba en el mapa — y faltaban 19 de las 52 de la RM. Peor: uno SIN
 * comuna sí pasaba, o sea el dato incompleto se veía y el completo no.
 *
 * Ahora la asignación explícita manda, y la comuna solo decide cuando no
 * hay asignación. Si la comuna no está mapeada se muestra igual, marcado
 * con `motivo: 'sin_mapear'` para poder avisarlo en pantalla.
 *
 * @returns {{visible:boolean, motivo:'asignado'|'comuna'|'zona'|'sin_mapear'|'otra_zona'|'sin_datos'}}
 */
export function prospectoVisible(prospecto, zonaNom, uid = null, indice = null) {
  const p = prospecto || {}
  const zona = String(zonaNom || '').toUpperCase().trim()
  const zonaP = String(p.zona || '').toUpperCase().trim()
  const cz = normComuna(p.comuna)

  // 1. Asignación explícita al ejecutivo: manda sobre la geografía.
  if (uid && p.ejecutivo_id && String(p.ejecutivo_id) === String(uid)) {
    return { visible: true, motivo: 'asignado' }
  }

  // Sin zona de referencia no hay nada que filtrar.
  if (!zona) return { visible: true, motivo: 'sin_datos' }

  // 2. La comuna decide, cuando la conocemos.
  const zonaDeComuna = cz ? (indice ? indice[cz] || null : zonaFromComuna(cz)) : null
  if (zonaDeComuna) {
    return zonaDeComuna === zona
      ? { visible: true, motivo: 'comuna' }
      : { visible: false, motivo: 'otra_zona' }
  }

  // 3. Comuna desconocida o vacía: vale la zona que traiga la fila.
  if (zonaP) {
    return zonaP === zona
      ? { visible: true, motivo: cz ? 'sin_mapear' : 'zona' }
      : { visible: false, motivo: 'otra_zona' }
  }

  // 4. Ni comuna mapeada ni zona: se muestra marcado, no se pierde.
  return { visible: true, motivo: cz ? 'sin_mapear' : 'sin_datos' }
}

/**
 * Construye el índice comuna→zona a partir de las filas de `zonas_comunas`.
 * Devuelve null si no hay filas utilizables, para poder caer al respaldo.
 */
export function indiceDesdeFilas(filas) {
  if (!Array.isArray(filas) || !filas.length) return null
  const m = {}
  let n = 0
  for (const f of filas) {
    const c = normComuna(f?.comuna)
    const z = String(f?.zona || '').toUpperCase().trim()
    if (!c || !z) continue
    m[c] = z
    n++
  }
  return n ? m : null
}

/**
 * Índice comuna→zona vivo, leído de Supabase.
 *
 * Admin edita la tabla `zonas_comunas`, pero Ruta usaba una copia
 * hardcodeada: reasignar una comuna en Admin no tenía ningún efecto sobre
 * el mapa. Esto conecta las dos puntas.
 *
 * Nunca lanza y nunca devuelve vacío: ante error de red, RLS o tabla
 * ausente cae al mapa del código. supabase-js no lanza, devuelve
 * `{ data, error }`, así que hay que mirar `error` explícitamente.
 *
 * @returns {Promise<{indice:Object, fuente:'db'|'codigo'}>}
 */
export async function cargarIndiceZonas(supabase) {
  const respaldo = { indice: { ...COMUNA_TO_ZONA }, fuente: 'codigo' }
  try {
    if (!supabase?.from) return respaldo
    const { data, error } = await supabase.from('zonas_comunas').select('comuna,zona').limit(5000)
    if (error) return respaldo
    const idx = indiceDesdeFilas(data)
    return idx ? { indice: idx, fuente: 'db' } : respaldo
  } catch {
    return respaldo
  }
}
