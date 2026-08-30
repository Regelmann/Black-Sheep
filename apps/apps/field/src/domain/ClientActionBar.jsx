/**
 * ClientActionBar — Llamar / WhatsApp / Navegar / Nota
 * Grid 4 cols, touch ≥ 44px, sin overflow.
 * Usa SVG inline (consistente entre Android/iOS; sin emojis de sistema).
 */

function IconPhone() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}
function IconWa() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  )
}
function IconMap() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}
function IconNote() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

export function ClientActionBar({
  phone,
  whatsappUrl,
  mapsUrl,
  onNote,
  disabled = false,
}) {
  const tel = phone ? `tel:${String(phone).replace(/\s+/g, '')}` : null
  const wsp =
    whatsappUrl ||
    (phone ? `https://wa.me/${String(phone).replace(/\D/g, '')}` : null)

  return (
    <div className="bs-action-bar" role="group" aria-label="Acciones del cliente">
      {tel ? (
        <a href={tel} className="bs-action-btn bs-action-call" aria-label="Llamar">
          <span className="bs-action-icon"><IconPhone /></span>
          <span className="bs-action-label">Llamar</span>
        </a>
      ) : (
        <button type="button" className="bs-action-btn is-disabled" disabled aria-label="Sin teléfono">
          <span className="bs-action-icon"><IconPhone /></span>
          <span className="bs-action-label">Llamar</span>
        </button>
      )}

      {wsp ? (
        <a href={wsp} target="_blank" rel="noreferrer" className="bs-action-btn bs-action-wsp" aria-label="WhatsApp">
          <span className="bs-action-icon"><IconWa /></span>
          <span className="bs-action-label">WhatsApp</span>
        </a>
      ) : (
        <button type="button" className="bs-action-btn is-disabled" disabled>
          <span className="bs-action-icon"><IconWa /></span>
          <span className="bs-action-label">WhatsApp</span>
        </button>
      )}

      {mapsUrl ? (
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="bs-action-btn bs-action-nav" aria-label="Navegar">
          <span className="bs-action-icon"><IconMap /></span>
          <span className="bs-action-label">Navegar</span>
        </a>
      ) : (
        <button type="button" className="bs-action-btn is-disabled" disabled>
          <span className="bs-action-icon"><IconMap /></span>
          <span className="bs-action-label">Navegar</span>
        </button>
      )}

      <button
        type="button"
        className="bs-action-btn bs-action-note"
        onClick={onNote}
        disabled={disabled}
        aria-label="Nota"
      >
        <span className="bs-action-icon"><IconNote /></span>
        <span className="bs-action-label">Nota</span>
      </button>
    </div>
  )
}

export default ClientActionBar
