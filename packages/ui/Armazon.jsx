import { NavLink } from 'react-router-dom'

/**
 * El armazón de las aplicaciones de escritorio.
 *
 * La navegación llega como CONFIGURACIÓN, no copiada en cada app: un
 * arreglo de secciones con sus enlaces. Así Control Center y Gerencia
 * usan el mismo componente con distintos módulos, y no divergen a los
 * dos sprints.
 */
export function Armazon({ marca, sello, secciones, usuario, onSalir, children, tono }) {
  return (
    <div className={`armazon${tono ? ' ' + tono : ''}`}>
      <aside className="rail">
        <div className="rail-marca">
          <img src="/logo.png" alt="" width="36" height="36" />
          <span className="rail-marca-texto">
            <b>Black Sheep</b>
            <span>{marca}</span>
          </span>
        </div>

        <nav className="nav-rail">
          {secciones.map((s, i) =>
            s.grupo ? (
              <div key={i}>
                <p className="rail-seccion">{s.grupo}</p>
                {s.items.map((it) => <Enlace key={it.to} {...it} />)}
              </div>
            ) : (
              <Enlace key={s.to} {...s} />
            ),
          )}
        </nav>

        <div className="rail-pie">
          <p>{usuario}</p>
          <button onClick={onSalir}>Cerrar sesión</button>
          {sello && <p className="sello">{sello}</p>}
        </div>
      </aside>

      <main className="lienzo">{children}</main>
    </div>
  )
}

const Enlace = ({ to, texto, icono, pin, fin }) => (
  <NavLink to={to} end={fin}>
    <span className="enlace-cuerpo">
      {icono && <Icono nombre={icono} />}
      {texto}
    </span>
    {pin > 0 && <span className="pin">{pin}</span>}
  </NavLink>
)

/**
 * Íconos como SVG en línea, no una librería de 400 kB para usar ocho.
 * `currentColor` a propósito: heredan el color del estado activo.
 */
export function Icono({ nombre, size = 17 }) {
  const d = TRAZOS[nombre]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  )
}

const TRAZOS = {
  hoy: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  empresas: <><rect x="3" y="3" width="8" height="18" rx="1" /><rect x="13" y="8" width="8" height="13" rx="1" /><path d="M6 7h2M6 11h2M6 15h2M16 12h2M16 16h2" /></>,
  usuarios: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0112 0" /><path d="M16 6a3 3 0 010 6" /><path d="M18 20a5 5 0 00-2-4" /></>,
  dinero: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 010 3.5h-3a1.8 1.8 0 000 3.5h4" /></>,
  datos: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  alerta: <><path d="M12 3l9 16H3z" /><path d="M12 9v5M12 17h.01" /></>,
  venta: <><path d="M3 17l6-6 4 4 7-8" /><path d="M14 7h6v6" /></>,
  clientes: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0114 0" /></>,
  producto: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>,
  carga: <><path d="M12 16V4" /><path d="M8 8l4-4 4 4" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></>,
  ajustes: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></>,
}
