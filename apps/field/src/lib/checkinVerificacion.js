/**
 * ¿Este check-in prueba que el vendedor estuvo en el local?
 *
 * EL PROBLEMA
 * `verificado = dist <= 150` sin mirar la precisión del GPS. El dato de
 * accuracy se pedía, se guardaba en la fila (`accuracy_m`) y no se usaba
 * para nada en la decisión.
 *
 *   accuracy ±20 m,   dist 140 m  → verificado ✓  (correcto)
 *   accuracy ±2000 m, dist 140 m  → verificado ✓  (no prueba nada)
 *
 * Con dos kilómetros de margen de error, "estar a 140 m" es ruido: el
 * vendedor podría estar en su casa. Y `verificado` no es cosmético —
 * queda en la base como evidencia de la visita.
 *
 * EL CRITERIO
 * La medición sirve si el margen de error es menor que la distancia que
 * se quiere descartar. Si el círculo de incertidumbre desborda el radio
 * del local, el resultado es "no se pudo verificar", que es distinto de
 * "no estuvo ahí".
 *
 * No bloquea el check-in: en terreno hay locales en subterráneos y calles
 * con sombra de GPS. Sólo deja de afirmar algo que no puede sostener.
 */

/** Radio dentro del cual se considera que está en el local. */
export const RADIO_LOCAL_M = 150

/** Por encima de este margen de error, la posición no sirve para verificar. */
export const ACCURACY_MAXIMA_M = 150

/**
 * @param {{distancia:number|null, accuracy:number|null|undefined, radio?:number}} args
 * @returns {{verificado:boolean, motivo:'ok'|'lejos'|'sin_posicion'|'impreciso', texto:string}}
 */
export function evaluarCheckin({ distancia, accuracy, radio = RADIO_LOCAL_M }) {
  /* Number(null) es 0, así que un `distancia: null` se leía como "a 0 m
     del local" y salía VERIFICADO — el peor resultado posible para un
     check-in sin ubicación. La ausencia se descarta antes de convertir. */
  const d = distancia === null || distancia === undefined || distancia === ''
    ? NaN
    : Number(distancia)
  const acc = accuracy === null || accuracy === undefined || accuracy === ''
    ? NaN
    : Number(accuracy)

  if (!Number.isFinite(d)) {
    return {
      verificado: false,
      motivo: 'sin_posicion',
      texto: 'Check-in sin ubicación',
    }
  }

  /* Sin accuracy no se puede juzgar la medición. Antes se asumía buena. */
  if (!Number.isFinite(acc) || acc <= 0) {
    return {
      verificado: false,
      motivo: 'impreciso',
      texto: 'Check-in registrado · sin precisión de GPS',
    }
  }

  if (acc > ACCURACY_MAXIMA_M) {
    return {
      verificado: false,
      motivo: 'impreciso',
      texto: `Check-in registrado · GPS impreciso (±${Math.round(acc)} m)`,
    }
  }

  if (d > radio) {
    return {
      verificado: false,
      motivo: 'lejos',
      texto: `Check-in registrado · a ${Math.round(d)} m del local`,
    }
  }

  return {
    verificado: true,
    motivo: 'ok',
    texto: `Check-in verificado · a ${Math.round(d)} m del local (±${Math.round(acc)} m)`,
  }
}