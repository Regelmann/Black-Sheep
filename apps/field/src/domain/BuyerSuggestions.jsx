/**
 * BuyerSuggestions — posibles compradores de un SKU.
 * Nunca empty genérico: loading / empty+CTA / lista.
 */
export function BuyerSuggestions({
  buyers = [],
  isLoading = false,
  onFind,
  emptyMessage = 'Sin match en cartera con este SKU en historial.',
  onSelectBuyer,
}) {
  if (isLoading) {
    return (
      <div className="bs-buyers" aria-busy="true">
        <div className="bs-buyers-skel" />
        <div className="bs-buyers-skel" />
      </div>
    )
  }

  if (!buyers.length) {
    return (
      <div className="bs-buyers is-empty">
        <p className="bs-buyers-empty-title">Sin compradores detectados</p>
        <p className="bs-buyers-empty-desc">{emptyMessage}</p>
        {onFind && (
          <button type="button" className="bs-buyers-find" onClick={onFind}>
            Encontrar compradores
          </button>
        )}
      </div>
    )
  }

  return (
    <ul className="bs-buyers-list" role="list">
      {buyers.slice(0, 8).map((b) => (
        <li key={b.id || b.cliente_key || b.name} className="bs-buyer-row">
          <button type="button" className="bs-buyer-btn" onClick={() => onSelectBuyer?.(b)}>
            <span className="bs-buyer-name">{b.name || b.nombre}</span>
            {b.score != null && (
              <span className="bs-buyer-score">{Math.round(b.score)}% match</span>
            )}
            {b.lastPurchase && (
              <span className="bs-buyer-last">Últ. {b.lastPurchase}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

export default BuyerSuggestions
