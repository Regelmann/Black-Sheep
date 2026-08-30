/**
 * ProyeccionMes — a dónde llega el mes si el ritmo no cambia.
 *
 * POR QUÉ EXISTE
 * "Vendiste $41M de una meta de $74M" dice dónde estás. No dice si
 * llegás. Un vendedor al 56% el día 24 y otro al 56% el día 8 tienen
 * el mismo número y problemas opuestos.
 *
 * La proyección responde la pregunta que sí genera acción:
 *   ¿cuánto voy a cerrar si sigo a este ritmo, y cuánto me falta
 *   por día para dar vuelta la diferencia?
 *
 * Usa proyeccionCierre() de calculations/habiles.js, que ya tiene
 * tests y devuelve null con menos de 3 días hábiles transcurridos:
 * proyectar el día 2 del mes es ruido, no información.
 */
import { useMemo } from 'react'
import { proyeccionCierre, diasHabilesDelMes } from '../lib/calculations/habiles.js'

const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')

export function ProyeccionMes({ ventaMtd = 0, meta = 0, onActuar }) {
  const datos = useMemo(() => {
    const proy = proyeccionCierre(ventaMtd)
    if (proy === null || !meta) return null

    const { transcurridos, totales } = diasHabilesDelMes()
    const restantes = Math.max(0, totales - transcurridos)
    const dif = proy - meta
    const sobre = dif >= 0

    // Lo que hay que vender POR DÍA para cerrar la brecha real,
    // no el promedio del mes completo.
    const faltaTotal = Math.max(0, meta - ventaMtd)
    const porDia = restantes > 0 ? faltaTotal / restantes : faltaTotal

    return { proy, dif: Math.abs(dif), sobre, restantes, porDia, faltaTotal }
  }, [ventaMtd, meta])

  if (!datos) return null

  const { proy, dif, sobre, restantes, porDia } = datos

  return (
    <button
      type="button"
      className={'bs-proy' + (sobre ? ' is-sobre' : ' is-bajo')}
      onClick={onActuar}
      // Sin onActuar sigue siendo legible, pero no invita a tocar.
      disabled={!onActuar}
    >
      <div className="bs-proy-head">
        <span className="bs-proy-label">
          Proyección del mes{onActuar ? ' · tocá para actuar' : ''}
        </span>
        <span className="bs-proy-dif">
          {sobre ? '↑' : '↓'} {clp(dif)}
          <em>{sobre ? 'sobre meta' : 'bajo meta'}</em>
        </span>
      </div>

      <p className="bs-proy-monto">{clp(proy)}</p>

      <p className="bs-proy-pie">
        {sobre
          ? <>Al ritmo actual cerrás por encima. Quedan {restantes} días hábiles.</>
          : <>Necesitás <strong>{clp(porDia)}/día</strong> en los {restantes} días
             que quedan para llegar.</>}
      </p>
    </button>
  )
}

/**
 * HoyEnTerreno — lo que hiciste HOY, no en el mes.
 *
 * El resto de la pantalla habla del mes. Este bloque responde
 * "¿cómo viene mi día?" a las 3 de la tarde, que es cuando todavía
 * se puede corregir.
 *
 * Tres ceros a media tarde son una señal más útil que cualquier
 * porcentaje mensual.
 */
export function HoyEnTerreno({ checkins = 0, pedidos = 0, capturado = 0, onHistorial }) {
  const sinActividad = checkins === 0 && pedidos === 0

  return (
    <section className="bs-hoy-terreno">
      <header className="bs-hoy-terreno-head">
        <h3 className="bs-hoy-terreno-title">Hoy en terreno</h3>
        {onHistorial && (
          <button type="button" className="bs-hoy-terreno-link" onClick={onHistorial}>
            Ver historial
          </button>
        )}
      </header>

      <div className="bs-hoy-terreno-nums">
        <div className="bs-hoy-terreno-num">
          <span className="bs-htn-valor">{checkins}</span>
          <span className="bs-htn-label">Check-ins</span>
        </div>
        <div className="bs-hoy-terreno-num">
          <span className={'bs-htn-valor' + (pedidos > 0 ? ' is-ok' : ' is-cero')}>{pedidos}</span>
          <span className="bs-htn-label">Pedidos</span>
        </div>
        <div className="bs-hoy-terreno-num">
          <span className="bs-htn-valor is-money">{clp(capturado)}</span>
          <span className="bs-htn-label">Capturado</span>
        </div>
      </div>

      {sinActividad && (
        <p className="bs-hoy-terreno-vacio">
          Todavía no registraste actividad hoy.
        </p>
      )}
    </section>
  )
}

export default ProyeccionMes
