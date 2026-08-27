/**
 * ErrorBoundary — un crash no puede dejar al vendedor con pantalla blanca.
 *
 * EL ESCENARIO
 * Un `undefined.map()` en Visita.jsx a las 10 de la mañana, en la calle.
 * Sin boundary, React desmonta el árbol entero: pantalla en blanco, sin
 * botones, sin forma de volver. El vendedor cierra la app y vuelve al
 * cuaderno — y de ese viaje no se regresa.
 *
 * LO QUE HACE
 *  · Muestra una pantalla útil con salida ("Reintentar" / "Ir a Hoy")
 *  · NO pierde la cola offline: vive en localStorage, no en el estado de
 *    React. Se muestra cuántas acciones están pendientes para que el
 *    vendedor sepa que su trabajo NO se perdió.
 *  · Registra el error con el BUILD_STAMP para poder rastrearlo
 *
 * Va por ruta, no una sola global: si Gerencia explota, Hoy sigue viva.
 */
import { Component } from 'react'
import { loadActionQueue } from '../lib/offline'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, pendientes: 0 }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    let pendientes = 0
    try { pendientes = loadActionQueue().length } catch { /* la cola no debe romper el boundary */ }
    this.setState({ pendientes })

    const stamp = this.props.stamp || 'desconocido'
    console.error(`[crash:${this.props.zona || 'app'}] ${stamp}`, error, info?.componentStack)

    // Gancho para el tracker de errores (Sentry u otro) cuando exista.
    if (typeof window !== 'undefined' && window.__bsReportError) {
      window.__bsReportError(error, {
        zona: this.props.zona,
        stamp,
        componentStack: info?.componentStack,
        pendientes,
      })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    const { pendientes } = this.state

    return (
      <div className="bs-crash" role="alert">
        <div className="bs-crash-box">
          <h1 className="bs-crash-title">Algo se rompió en esta pantalla</h1>
          <p className="bs-crash-desc">
            No es tu culpa. El resto de la app sigue funcionando.
          </p>

          {/* Lo primero que un vendedor necesita saber: si perdió trabajo. */}
          {pendientes > 0 ? (
            <p className="bs-crash-safe">
              Tenés <strong>{pendientes}</strong>{' '}
              {pendientes === 1 ? 'acción guardada' : 'acciones guardadas'} en el
              teléfono. <strong>No se perdieron</strong> — se suben solas al
              volver la señal.
            </p>
          ) : (
            <p className="bs-crash-safe">No hay nada sin guardar.</p>
          )}

          <button
            type="button"
            className="bs-crash-cta"
            onClick={() => this.setState({ error: null })}
          >
            Reintentar
          </button>
          <button
            type="button"
            className="bs-crash-alt"
            onClick={() => { window.location.href = '/' }}
          >
            Ir a Hoy
          </button>

          {import.meta.env?.DEV && (
            <pre className="bs-crash-dev">{String(this.state.error?.stack || this.state.error)}</pre>
          )}
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
