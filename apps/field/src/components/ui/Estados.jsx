/**
 * Estados de carga, vacío y error.
 *
 * POR QUÉ NO ALCANZA CON "Cargando…"
 * Un texto plano no dice cuánto falta ni qué va a aparecer, y cuando llegan
 * los datos la pantalla salta: el contenido empuja todo hacia abajo y el
 * usuario pierde el punto donde estaba mirando. Ese salto es una de las
 * cosas que más delatan a una app improvisada.
 *
 * Un esqueleto con la MISMA forma que el contenido real reserva el espacio,
 * así que la llegada de datos no mueve nada. Además comunica la estructura
 * antes de tener los datos, que es lo que hace que la espera se sienta corta.
 *
 * Los tres estados están juntos a propósito: una pantalla que trata bien la
 * carga pero deja el vacío y el error como una página en blanco sigue
 * sintiéndose rota justo cuando el usuario más necesita orientación.
 */

/** Bloque gris con el pulso de carga. `alto` en px o cualquier medida CSS. */
export function Bloque({ alto = 16, ancho = '100%', radio = 8, style }) {
  return (
    <div
      className="skeleton"
      aria-hidden="true"
      style={{ height: alto, width: ancho, borderRadius: radio, ...style }}
    />
  )
}

/**
 * Esqueleto de una lista de tarjetas: la forma más común de la app.
 * @param {{filas?: number, altoFila?: number}} props
 */
export function ListaCargando({ filas = 5, altoFila = 76 }) {
  return (
    // aria-busy + aria-live: un lector de pantalla anuncia que está cargando
    // en vez de leer una sucesión de divs vacíos.
    <div aria-busy="true" aria-live="polite" aria-label="Cargando contenido">
      {Array.from({ length: filas }, (_, i) => (
        <div
          key={i}
          className="card"
          style={{
            padding: 12,
            marginBottom: 10,
            // Las filas se desvanecen hacia abajo: sugiere que la lista
            // continúa, en vez de cortarse de golpe en un borde duro.
            opacity: 1 - i * (0.5 / Math.max(filas, 1)),
          }}
        >
          <Bloque alto={14} ancho="55%" />
          <div style={{ height: 8 }} />
          <Bloque alto={12} ancho="35%" />
          {altoFila > 60 && (
            <>
              <div style={{ height: 8 }} />
              <Bloque alto={12} ancho="70%" />
            </>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Estado vacío. `accion` es opcional pero muy recomendable: un vacío sin
 * salida deja al usuario sin saber qué hacer.
 */
export function Vacio({ titulo = 'No hay nada por acá', detalle, icono = '·', accion }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '40px 20px',
        color: 'var(--ink-3)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          fontSize: 'var(--glifo-xl)',
          lineHeight: 1,
          marginBottom: 12,
          opacity: 0.35,
        }}
      >
        {icono}
      </div>
      <p style={{ margin: 0, fontWeight: 700, color: 'var(--ink-2)', fontSize: 15 }}>{titulo}</p>
      {detalle && (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--text-base)', maxWidth: 280, marginInline: 'auto' }}>
          {detalle}
        </p>
      )}
      {accion && <div style={{ marginTop: 16 }}>{accion}</div>}
    </div>
  )
}

/**
 * Error con reintento. El texto viene de `explainError`, así que ya está en
 * castellano y sin jerga de PostgREST.
 */
export function ErrorCarga({ mensaje, onReintentar }) {
  return (
    // role=alert: se anuncia solo, sin que el usuario tenga que descubrirlo.
    <div
      role="alert"
      style={{
        background: 'var(--danger-lt)',
        color: 'var(--danger-dk)',
        borderRadius: 'var(--r-md)',
        padding: '14px 16px',
        fontSize: 'var(--text-base)',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ flex: 1, minWidth: 160 }}>
        {mensaje || 'No se pudieron cargar los datos.'}
      </span>
      {onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          style={{
            background: 'var(--danger-dk)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            // 44px es el mínimo táctil: menos que eso se falla el toque con
            // el pulgar, y esta es justo la acción que el usuario necesita
            // acertar cuando algo ya salió mal.
            minHeight: 'var(--touch)',
            padding: '0 18px',
            fontWeight: 700,
            fontSize: 'var(--text-base)',
            cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  )
}

/**
 * Resuelve los tres estados de una consulta de `useDatos` en un solo lugar.
 * Devuelve `null` cuando hay datos, para que la pantalla renderice lo suyo.
 */
export function EstadoConsulta({ consulta, vacio, filas = 5 }) {
  if (consulta.loading) return <ListaCargando filas={filas} />
  if (consulta.error) {
    return <ErrorCarga mensaje={consulta.error.user} onReintentar={consulta.refrescar} />
  }
  if (!consulta.rows?.length) return vacio || <Vacio />
  return null
}