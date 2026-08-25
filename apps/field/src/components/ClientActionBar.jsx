/**
 * Barra de acciones del cliente — 4 columnas fijas (thumb-friendly).
 * Llamar | WhatsApp | Nota | Visita/Ver
 */
export default function ClientActionBar({
  telefono,
  whatsappUrl,
  onNota,
  onVisita,
  visitaLabel = 'Visita',
}) {
  const tel = telefono ? String(telefono).replace(/\D/g, '') : ''
  const wsp =
    whatsappUrl ||
    (tel
      ? `https://wa.me/${tel.startsWith('56') ? tel : '56' + tel.replace(/^0/, '')}`
      : null)

  return (
    <div className="cli-action-bar" onClick={e => e.stopPropagation()}>
      {tel ? (
        <a href={'tel:' + telefono} className="cli-ab-btn call">
          Llamar
        </a>
      ) : (
        <span className="cli-ab-btn muted">Llamar</span>
      )}
      {wsp ? (
        <a href={wsp} target="_blank" rel="noreferrer" className="cli-ab-btn wsp">
          WhatsApp
        </a>
      ) : (
        <span className="cli-ab-btn muted">WhatsApp</span>
      )}
      <button type="button" className="cli-ab-btn note" onClick={onNota}>
        Nota
      </button>
      {onVisita ? (
        <button type="button" className="cli-ab-btn visit" onClick={onVisita}>
          {visitaLabel}
        </button>
      ) : (
        <span className="cli-ab-btn muted">{visitaLabel}</span>
      )}
    </div>
  )
}
