/**
 * Reasignar todos los prospectos de una comuna a otra zona.
 *
 * POR QUÉ EXISTE
 * Cambiar una comuna en Admin › Zonas escribe `zonas_comunas`, pero eso
 * NO mueve a los prospectos que ya tienen zona: Ruta.jsx los filtra por
 * `prospectos.zona`, y la maestra comuna→zona sólo decide para los que
 * no la tienen. Con lo que había, marcar "Macul → Zona Sur" dejaba a sus
 * 387 prospectos exactamente donde estaban, sin ningún aviso.
 *
 * El administrador tiene que poder mover una comuna entera y ver cuánto
 * mueve ANTES de aplicarlo.
 */

/** Normaliza igual que la base: mayúsculas y sin espacios sobrantes. */
function limpiaZona(z) {
  return String(z || '').toUpperCase().trim()
}

/**
 * Cuenta qué pasaría, sin escribir nada.
 *
 * Devuelve `{ ok, total, aMover, porZona, error }`:
 *   total   → prospectos en esa comuna
 *   aMover  → los que hoy tienen otra zona (los que van a cambiar)
 *   porZona → de dónde salen, para poder mostrarlo
 */
export async function simularReasignacion(supabase, comuna, zonaDestino) {
  const destino = limpiaZona(zonaDestino)
  const nombre = String(comuna || '').trim()
  if (!nombre || !destino) {
    return { ok: false, error: 'Falta la comuna o la zona', total: 0, aMover: 0, porZona: {} }
  }

  const { data, error } = await supabase
    .from('prospectos')
    .select('zona')
    .ilike('comuna', nombre)

  if (error) return { ok: false, error: error.message, total: 0, aMover: 0, porZona: {} }

  const filas = data || []
  const porZona = {}
  let aMover = 0
  for (const f of filas) {
    const z = limpiaZona(f.zona) || '(sin zona)'
    porZona[z] = (porZona[z] || 0) + 1
    if (z !== destino) aMover += 1
  }
  return { ok: true, total: filas.length, aMover, porZona, error: null }
}

/**
 * Aplica el cambio: mueve los prospectos y actualiza el mapa de comunas.
 *
 * El orden importa. Primero los prospectos: si falla, `zonas_comunas`
 * queda como estaba y el estado sigue siendo coherente. Al revés
 * tendríamos el mapa diciendo una cosa y las filas otra, que es
 * justamente el desajuste que originó todo esto.
 */
export async function aplicarReasignacion(supabase, comuna, zonaDestino) {
  const destino = limpiaZona(zonaDestino)
  const nombre = String(comuna || '').trim()
  if (!nombre || !destino) {
    return { ok: false, error: 'Falta la comuna o la zona', movidos: 0 }
  }

  const sim = await simularReasignacion(supabase, nombre, destino)
  if (!sim.ok) return { ok: false, error: sim.error, movidos: 0 }
  if (sim.aMover === 0) {
    return { ok: true, movidos: 0, error: null, sinCambios: true }
  }

  const rp = await supabase
    .from('prospectos')
    .update({ zona: destino })
    .ilike('comuna', nombre)
    .neq('zona', destino)

  if (rp.error) return { ok: false, error: rp.error.message, movidos: 0 }

  // El mapa de comunas queda alineado con lo que acabamos de escribir.
  const rz = await supabase
    .from('zonas_comunas')
    .upsert({ comuna: normalizaComuna(nombre), zona: destino }, { onConflict: 'comuna' })

  if (rz.error) {
    // Los prospectos ya se movieron: no es un fallo total, pero hay que
    // decirlo, porque el mapa quedó sin actualizar.
    return {
      ok: true,
      movidos: sim.aMover,
      error: null,
      avisoMapa: `Se movieron ${sim.aMover}, pero el mapa de comunas no se actualizó: ${rz.error.message}`,
    }
  }

  return { ok: true, movidos: sim.aMover, error: null }
}

/** Igual que normComuna de zonas.js: mayúsculas sin tildes. */
function normalizaComuna(c) {
  return String(c || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Texto para el diálogo de confirmación. Explícito sobre lo que hace. */
export function textoConfirmacion(comuna, zonaDestino, sim) {
  if (!sim?.ok) return 'No se pudo calcular el impacto.'
  if (sim.total === 0) return `No hay prospectos en ${comuna}.`
  if (sim.aMover === 0) {
    return `Los ${sim.total} prospectos de ${comuna} ya están en ${zonaDestino}.`
  }
  const origen = Object.entries(sim.porZona)
    .filter(([z]) => z !== limpiaZona(zonaDestino))
    .sort((a, b) => b[1] - a[1])
    .map(([z, n]) => `${n} de ${z}`)
    .join(', ')
  return `Vas a mover ${sim.aMover} prospectos de ${comuna} a ${zonaDestino} (${origen}). ` +
    'Dejan de verse en la zona anterior.'
}

/* ───────────────────────────────────────────────────────────────
   TRASPASO ENTRE EJECUTIVOS

   Distinto de mover una comuna: acá no cambia la geografía, cambia
   quién atiende. Pasa cuando alguien renuncia, entra un vendedor
   nuevo o se reparte una zona entre dos.

   Los clientes viven en DOS tablas -`cartera` y `prospectos`- y las
   dos tienen `ejecutivo_id`. Tocar una sola deja al vendedor viendo
   media cartera, que es la clase de desajuste silencioso que ya nos
   costó semanas.
   ─────────────────────────────────────────────────────────────── */

/**
 * Cuenta qué se traspasaría, sin escribir.
 *
 * Devuelve `{ ok, cartera, prospectos, total, error }`.
 */
export async function simularTraspaso(supabase, desdeId, hastaId) {
  const desde = String(desdeId || '').trim()
  const hasta = String(hastaId || '').trim()
  if (!desde || !hasta) {
    return { ok: false, error: 'Falta el ejecutivo de origen o destino', total: 0, cartera: 0, prospectos: 0 }
  }
  if (desde === hasta) {
    return { ok: false, error: 'Son el mismo ejecutivo', total: 0, cartera: 0, prospectos: 0 }
  }

  const conteos = {}
  for (const tabla of ['cartera', 'prospectos']) {
    const { data, error } = await supabase
      .from(tabla)
      .select('cliente_key')
      .eq('ejecutivo_id', desde)
    if (error) {
      return { ok: false, error: error.message, total: 0, cartera: 0, prospectos: 0 }
    }
    conteos[tabla] = (data || []).length
  }

  return {
    ok: true,
    cartera: conteos.cartera,
    prospectos: conteos.prospectos,
    total: conteos.cartera + conteos.prospectos,
    error: null,
  }
}

/**
 * Traspasa la cartera completa de un ejecutivo a otro.
 *
 * Si la segunda tabla falla, la primera ya quedó escrita. No hay
 * transacción posible desde el cliente, así que en vez de fingir que
 * fue todo o nada, se informa exactamente qué se movió y qué no.
 */
export async function aplicarTraspaso(supabase, desdeId, hastaId) {
  const desde = String(desdeId || '').trim()
  const hasta = String(hastaId || '').trim()
  const sim = await simularTraspaso(supabase, desde, hasta)
  if (!sim.ok) return { ok: false, error: sim.error, movidos: 0 }
  if (sim.total === 0) return { ok: true, movidos: 0, sinCambios: true, error: null }

  const movidos = { cartera: 0, prospectos: 0 }
  for (const tabla of ['cartera', 'prospectos']) {
    if (sim[tabla] === 0) continue
    const { error } = await supabase
      .from(tabla)
      .update({ ejecutivo_id: hasta })
      .eq('ejecutivo_id', desde)
    if (error) {
      const hechos = movidos.cartera + movidos.prospectos
      return {
        ok: false,
        movidos: hechos,
        error: hechos > 0
          ? `Se traspasaron ${hechos} de ${tabla === 'prospectos' ? 'cartera' : ''} pero falló ${tabla}: ${error.message}`
          : error.message,
      }
    }
    movidos[tabla] = sim[tabla]
  }

  return { ok: true, movidos: movidos.cartera + movidos.prospectos, detalle: movidos, error: null }
}

/** Texto del diálogo de traspaso. */
export function textoTraspaso(nombreDesde, nombreHasta, sim) {
  if (!sim?.ok) return sim?.error || 'No se pudo calcular el impacto.'
  if (sim.total === 0) return `${nombreDesde} no tiene clientes asignados.`
  const partes = []
  if (sim.cartera) partes.push(`${sim.cartera} de cartera`)
  if (sim.prospectos) partes.push(`${sim.prospectos} prospectos`)
  return `Vas a pasar ${partes.join(' y ')} de ${nombreDesde} a ${nombreHasta}. ` +
    `${nombreDesde} deja de verlos.`
}