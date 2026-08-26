/**
 * VisitCheckIn — un solo CTA primario según estado de visita.
 * Elimina el bug de doble Check-in.
 *
 * status: 'pending' | 'checked-in' | 'completed' | 'skipped'
 */
export function VisitCheckIn({
  status = 'pending',
  address,
  isSubmitting = false,
  onCheckIn,
  onContinue,
  onSkip,
  onNoSale,
  onVisitOnly,
}) {
  const primary =
    status === 'pending'
      ? { label: isSubmitting ? 'GPS…' : 'Check-in', onClick: onCheckIn }
      : status === 'checked-in'
        ? { label: isSubmitting ? 'Guardando…' : 'Continuar visita', onClick: onContinue || onCheckIn }
        : null

  return (
    <section className="bs-visit-checkin" data-status={status}>
      {address && (
        <div className="bs-visit-address">
          <p className="bs-visit-address-label">DIRECCIÓN</p>
          <p className="bs-visit-address-value">{address}</p>
        </div>
      )}

      {primary && (
        <button
          type="button"
          className="bs-cta-primary bs-visit-cta"
          disabled={isSubmitting}
          onClick={primary.onClick}
        >
          {primary.label}
        </button>
      )}

      {(status === 'pending' || status === 'checked-in') && (
        <div className="bs-visit-outcomes">
          {onNoSale && (
            <button type="button" className="acc-btn" onClick={onNoSale} disabled={isSubmitting}>
              No compró
            </button>
          )}
          {onVisitOnly && (
            <button type="button" className="acc-btn" onClick={onVisitOnly} disabled={isSubmitting}>
              Solo visita
            </button>
          )}
        </div>
      )}

      {status === 'pending' && onSkip && (
        <button type="button" className="bs-visit-skip" onClick={onSkip} disabled={isSubmitting}>
          Omitir por hoy
        </button>
      )}

      {status === 'completed' && (
        <p className="bs-visit-done" role="status">Visita completada</p>
      )}
    </section>
  )
}

export default VisitCheckIn
