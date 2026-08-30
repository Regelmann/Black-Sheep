/**
 * "¿Dónde me conviene ir ahora?"
 *
 * EL PROBLEMA QUE RESUELVE
 * El bloque "Cerca de mí" de Ruta ordenaba por distancia y nada más:
 * `out.sort((a, b) => a._distM - b._distM)`. El almacén de la esquina que
 * compra $30.000 al mes le ganaba siempre al cliente de $800.000 que está
 * a seis cuadras y lleva tres ciclos sin comprar. Ordenar por cercanía es
 * ordenar por lo más fácil, no por lo que más rinde.
 *
 * Un mapa con 300 pines tampoco decide nada: le pasa el problema al
 * vendedor. Acá el orden ES la recomendación.
 *
 * CÓMO PUNTÚA
 *   puntaje = valor en pesos × urgencia ÷ costo de llegar
 *
 * Los tres factores son necesarios y ninguno alcanza solo:
 *   · valor sin urgencia   → el cliente grande que compró ayer;
 *   · urgencia sin valor   → el chico que se fugó y da lo mismo;
 *   · cercanía sin lo otro → la esquina, que es lo que pasaba antes.
 *
 * EL ROL MANDA SOBRE LA DISTANCIA
 * Un KAM o un televendedor no se mueven: mandarles el punto "más cerca"
 * es ruido, porque su costo de contactar a alguien es el mismo esté a 200
 * metros o a 20 kilómetros. Para ellos el divisor de distancia es 1 y el
 * orden queda por valor × urgencia puro.
 */

const num = v => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Metros → texto corto. 850 m / 1,2 km */
export function textoDistancia(m) {
  if (m == null || !Number.isFinite(Number(m))) return ''
  const v = Number(m)
  if (v < 1000) return `${Math.round(v)} m`
  return `${(v / 1000).toFixed(1).replace('.', ',')} km`
}

/** Pesos → "$1.240.000" */
export function textoPesos(clp) {
  const v = Math.round(num(clp))
  if (v <= 0) return ''
  return `$${v.toLocaleString('es-CL')}`
}

/**
 * Cuánta plata hay en juego en este punto, y de dónde sale.
 *
 * Para un cliente la referencia es su venta mensual (o el MTD si no hay
 * histórico). Para un prospecto sólo existe `potencial`, que es una
 * estimación: se descuenta al 30% para no dejar que una promesa le gane a
 * una venta real. Un prospecto de "$1.000.000 potencial" no vale lo mismo
 * que un cliente que efectivamente factura ese millón.
 */
export function valorPunto(item = {}) {
  if (item._tipo === 'prospecto') {
    const pot = num(item.potencial)
    if (pot > 0) return { clp: Math.round(pot * 0.3), base: 'potencial' }
    // Sin potencial cargado, el score (0..100) es lo único que hay.
    const sc = num(item.score)
    if (sc > 0) return { clp: Math.round(sc * 1000), base: 'score' }
    return { clp: 0, base: 'sin_dato' }
  }
  const mensual = num(item.venta_mensual)
  if (mensual > 0) return { clp: Math.round(mensual), base: 'venta_mensual' }
  const mtd = num(item.venta_mtd)
  if (mtd > 0) return { clp: Math.round(mtd), base: 'venta_mtd' }
  return { clp: 0, base: 'sin_dato' }
}

/**
 * Qué tan urgente es pasar hoy, de 0 a 1.
 *
 * El atraso se mide contra el ciclo PROPIO del cliente, no contra un
 * umbral fijo: 20 días sin comprar es normal para el que compra mensual y
 * es una fuga para el que compra cada semana. Sin ciclo cargado se usa 15
 * días, que es la mediana del padrón.
 */
export function urgenciaPunto(item = {}) {
  const estado = String(item.estado_fuga || item.estado || '').toUpperCase()

  if (item._tipo === 'prospecto') {
    // Un prospecto nunca es urgente: no hay nada que se esté perdiendo.
    // Entra al orden por valor, no por tiempo.
    return { u: 0.45, motivo: 'prospecto' }
  }

  const dias = item.dias_sin_comprar == null ? null : num(item.dias_sin_comprar)
  const ciclo = num(item.ciclo_dias) > 0 ? num(item.ciclo_dias) : 15

  if (/FUGADO|DORMIDO|NUNCA/.test(estado)) return { u: 1, motivo: 'fugado' }
  if (dias == null) {
    if (/RIESGO|ENFRI/.test(estado)) return { u: 0.8, motivo: 'en riesgo' }
    return { u: 0.4, motivo: 'sin dato de compra' }
  }

  const razon = dias / ciclo
  if (razon >= 2) return { u: 1, motivo: `${dias} días · compra cada ${ciclo}` }
  if (razon >= 1) {
    // Entre 1 y 2 ciclos: sube linealmente de 0.6 a 1.
    return { u: 0.6 + 0.4 * (razon - 1), motivo: `${dias} días · compra cada ${ciclo}` }
  }
  if (/RIESGO|ENFRI/.test(estado)) return { u: 0.7, motivo: 'en riesgo' }
  // Todavía dentro de su ciclo: baja prioridad, pero no cero.
  return { u: 0.2 * razon, motivo: `al día · compra cada ${ciclo}` }
}

/**
 * Cuánto "cuesta" llegar. Divisor, nunca menor a 1.
 *
 * No es lineal a propósito: la raíz de los kilómetros hace que ir a 4 km
 * cueste el doble que ir a 1 km, no cuatro veces más. Con penalización
 * lineal ningún punto lejano sobrevivía y el resultado volvía a ser una
 * lista por cercanía con pasos extra.
 */
export function costoDistancia(metros, perfil = {}) {
  if (perfil.usaDistancia === false) return 1
  if (metros == null || !Number.isFinite(Number(metros))) return 1
  const km = Math.max(0, Number(metros)) / 1000
  return 1 + Math.sqrt(km)
}

/**
 * Ordena los puntos por conveniencia y explica cada uno.
 *
 * @param {object[]} items    territorio ya cargado (clientes + prospectos)
 * @param {{lat:number,lng:number}|null} myPos  posición del vendedor
 * @param {object} perfil     salida de perfilRol() — decide si pesa la distancia
 * @param {(a:number,b:number,c:number,d:number)=>number} distancia  haversine inyectada
 * @param {number} limite
 * @param {number} radioM     descarta lo que esté más lejos que esto (0 = sin tope)
 * @returns {{lista:object[], sinGps:boolean, total:number}}
 */
export function dondeIr({
  items = [],
  myPos = null,
  perfil = {},
  distancia = null,
  limite = 5,
  radioM = 0,
} = {}) {
  const usaDist = perfil.usaDistancia !== false
  const hayGps = !!(usaDist && myPos && myPos.lat != null && myPos.lng != null && distancia)

  const califica = []
  for (const item of items) {
    // Lo que ya está en la ruta no se vuelve a recomendar: ya se decidió.
    if (item._enRuta || item._tipo === 'ruta') continue

    let distM = null
    if (hayGps) {
      const lat = Number(item.lat)
      const lng = Number(item.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      distM = distancia(myPos.lat, myPos.lng, lat, lng)
      if (radioM > 0 && distM > radioM) continue
    }

    const valor = valorPunto(item)
    const urg = urgenciaPunto(item)
    if (valor.clp <= 0 && urg.u <= 0) continue

    const costo = costoDistancia(distM, perfil)
    const puntaje = (valor.clp * urg.u) / costo

    califica.push({
      ...item,
      _distM: distM,
      _valorClp: valor.clp,
      _valorBase: valor.base,
      _urgencia: urg.u,
      _motivoUrgencia: urg.motivo,
      _puntaje: puntaje,
      _porque: explicar({ valor, urg, distM, perfil }),
    })
  }

  /* Desempate estable: el puntaje puede empatar entre dos puntos con los
     mismos datos, y sin criterio secundario el orden dependía del orden de
     llegada de la consulta — la misma pantalla mostraba distinto en dos
     cargas. Se desempata por valor y después por nombre. */
  califica.sort((a, b) => {
    if (b._puntaje !== a._puntaje) return b._puntaje - a._puntaje
    if (b._valorClp !== a._valorClp) return b._valorClp - a._valorClp
    return String(a.nombre_cliente || '').localeCompare(String(b.nombre_cliente || ''))
  })

  return {
    lista: limite > 0 ? califica.slice(0, limite) : califica,
    sinGps: usaDist && !hayGps,
    total: califica.length,
  }
}

/**
 * La frase que justifica la recomendación.
 *
 * Sin esto la lista es un oráculo: un orden que el vendedor tiene que
 * creer porque sí. La razón es lo que le permite estar en desacuerdo.
 */
function explicar({ valor, urg, distM, perfil }) {
  const partes = []
  if (valor.clp > 0) {
    partes.push(valor.base === 'potencial' ? `${textoPesos(valor.clp)} potencial` : `${textoPesos(valor.clp)}/mes`)
  }
  if (urg.motivo && urg.motivo !== 'prospecto') partes.push(urg.motivo)
  else if (urg.motivo === 'prospecto') partes.push('prospecto sin comprar')
  if (perfil.usaDistancia !== false && distM != null) partes.push(`a ${textoDistancia(distM)}`)
  return partes.join(' · ')
}

/** Titular honesto del bloque: cambia según haya GPS y según el rol. */
export function tituloDondeIr(perfil = {}, sinGps = false) {
  if (perfil.usaDistancia === false) return 'A quién contactar ahora'
  if (sinGps) return 'Dónde conviene ir (activá GPS para ordenar por cercanía)'
  return 'Dónde te conviene ir ahora'
}