/**
 * DataState — un bloque de datos nunca miente sobre por qué está vacío.
 *
 * "0 clientes" y "no pude leer la cartera" son cosas distintas y el
 * vendedor tiene que poder distinguirlas de un vistazo.
 */

export function DataError({ error, onRetry, compact = false }) {
  const user = error?.user || 'No se pudieron cargar los datos.'
  return (
    <div className={'bs-data-error' + (compact ? ' is-compact' : '')} role="alert">
      <div className="bs-data-error-body">
        <span className="bs-data-error-icon" aria-hidden="true">!</span>
        <div>
          <p className="bs-data-error-msg">{user}</p>
          {error?.kind === 'schema' && (
            <p className="bs-data-error-hint">No es tu culpa — es un problema de configuración.</p>
          )}
        </div>
      </div>
      {onRetry && (
        <button type="button" className="bs-data-error-retry" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  )
}

export function DataSkeleton({ rows = 3, compact = false }) {
  return (
    <div className={'bs-skel-group' + (compact ? ' is-compact' : '')} aria-busy="true" aria-live="polite">
      <span className="bs-sr-only">Cargando…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bs-skel-row" />
      ))}
    </div>
  )
}

export function DataEmpty({ title = 'Sin resultados', desc, action, onAction }) {
  return (
    <div className="bs-data-empty">
      <p className="bs-data-empty-title">{title}</p>
      {desc && <p className="bs-data-empty-desc">{desc}</p>}
      {action && onAction && (
        <button type="button" className="bs-data-empty-cta" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  )
}

/**
 * Envoltorio declarativo.
 *
 * @param {{
 *   loading?: boolean,
 *   error?: object|null,
 *   isEmpty?: boolean,
 *   onRetry?: () => void,
 *   emptyTitle?: string,
 *   emptyDesc?: string,
 *   skeletonRows?: number,
 *   compact?: boolean,
 *   children: React.ReactNode
 * }} props
 */
export function DataState({
  loading = false,
  error = null,
  isEmpty = false,
  onRetry,
  emptyTitle,
  emptyDesc,
  skeletonRows = 3,
  compact = false,
  children,
}) {
  if (loading) return <DataSkeleton rows={skeletonRows} compact={compact} />
  if (error) return <DataError error={error} onRetry={onRetry} compact={compact} />
  if (isEmpty) return <DataEmpty title={emptyTitle} desc={emptyDesc} />
  return children
}

export default DataState
