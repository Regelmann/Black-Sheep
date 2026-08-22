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
