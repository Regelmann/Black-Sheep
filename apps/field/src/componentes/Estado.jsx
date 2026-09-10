/**
 * Estados de datos, en un solo lugar.
 * Un vacío y un error NO se ven igual: confundirlos es exactamente el
 * bug que safeSelect existe para evitar.
 */
export function Cargando({ que = 'los datos' }) {
  return <div className="estado" role="status">Cargando {que}…</div>
}

export function Error({ error, reintentar }) {
  return (
    <div className="estado error" role="alert">
      <strong>{error?.user || 'No se pudieron cargar los datos.'}</strong>
      {error?.code ? <code>código {error.code}</code> : null}
      {reintentar ? (
        <div style={{ marginTop: 'var(--e3)' }}>
          <button className="boton" onClick={reintentar}>Reintentar</button>
        </div>
      ) : null}
    </div>
  )
}

/** Un vacío es una invitación a hacer algo, no un mensaje de luto. */
export function Vacio({ children }) {
  return <div className="estado">{children}</div>
}

/** Envuelve una tabla: decide entre cargando, error, vacío y contenido. */
export function Bloque({ datos, que, vacio, children }) {
  if (datos.loading) return <Cargando que={que} />
  if (datos.error) return <Error error={datos.error} reintentar={datos.refrescar} />
  if (!datos.rows.length) return <Vacio>{vacio}</Vacio>
  return children
}
