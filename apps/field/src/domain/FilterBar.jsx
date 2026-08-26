/**
 * FilterBar — barra de filtros ÚNICA para todas las páginas.
 *
 * Reemplaza los filtros ad-hoc de Cartera / Stock / Hoy, que hoy tienen
 * cada uno su propio padding, tamaño y comportamiento de overflow.
 *
 * Reglas de campo:
 *  - Chips compactos: caben más en pantalla de teléfono.
 *  - Scroll horizontal con fade, NUNCA wrap descontrolado ni chips cortados.
 *  - Toque ≥ 40px de alto real (padding incluido).
 *  - El chip activo siempre se hace visible al montar (scrollIntoView).
 *  - Espaciado propio: no se pega al buscador ni a la línea de arriba.
 */
import { useEffect, useRef } from 'react'

/**
 * @param {{
 *   options: Array<{ value: string, label: string, count?: number, tone?: 'default'|'danger'|'warn'|'ok' }>,
 *   value: string,
 *   onChange: (v: string) => void,
 *   size?: 'sm'|'md',
 *   ariaLabel?: string,
 *   trailing?: React.ReactNode
 * }} props
 */
export function FilterBar({
  options = [],
  value,
  onChange,
  size = 'sm',
  ariaLabel = 'Filtros',
  trailing = null,
}) {
  const scrollerRef = useRef(null)
  const activeRef = useRef(null)

  useEffect(() => {
    const el = activeRef.current
    const box = scrollerRef.current
    if (!el || !box) return
    const elLeft = el.offsetLeft
    const elRight = elLeft + el.offsetWidth
    if (elLeft < box.scrollLeft || elRight > box.scrollLeft + box.clientWidth) {
      box.scrollTo({ left: Math.max(0, elLeft - 16), behavior: 'smooth' })
    }
  }, [value])

  if (!options.length) return null

  return (
    <div className={`bs-filterbar bs-filterbar--${size}`}>
      <div
        className="bs-filterbar-scroller"
        ref={scrollerRef}
        role="group"
        aria-label={ariaLabel}
      >
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              ref={active ? activeRef : null}
              type="button"
              className={
                'bs-chip' +
                (active ? ' is-active' : '') +
                (o.tone && o.tone !== 'default' ? ` is-${o.tone}` : '')
              }
              aria-pressed={active}
              onClick={() => onChange(o.value)}
            >
              <span className="bs-chip-label">{o.label}</span>
              {o.count != null && <span className="bs-chip-count">{o.count}</span>}
            </button>
          )
        })}
      </div>
      {trailing && <div className="bs-filterbar-trailing">{trailing}</div>}
    </div>
  )
}

/**
 * SearchField — buscador con separación propia.
 * Antes cada página lo pegaba a los filtros.
 */
export function SearchField({ value, onChange, placeholder = 'Buscar…', onClear }) {
  return (
    <div className="bs-search">
      <svg className="bs-search-icon" width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        className="bs-search-input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          className="bs-search-clear"
          onClick={() => (onClear ? onClear() : onChange(''))}
          aria-label="Limpiar búsqueda"
        >
          ×
        </button>
      )}
    </div>
  )
}

/**
 * StatGrid — las tarjetas de alerta/contador en filas ordenadas.
 * Resuelve: "reordenar las pestañas de alertas para que queden en 2 filas".
 *
 * @param {{ items: Array<{label:string, value:React.ReactNode, tone?:string, onClick?:()=>void, active?:boolean}>, cols?: number }} props
 */
export function StatGrid({ items = [], cols = 3 }) {
  if (!items.length) return null
  return (
    <div className="bs-statgrid" style={{ '--sg-cols': cols }} role="list">
      {items.map((it) => {
        const Tag = it.onClick ? 'button' : 'div'
        return (
          <Tag
            key={it.label}
            role="listitem"
            type={it.onClick ? 'button' : undefined}
            onClick={it.onClick}
            className={
              'bs-stat' +
              (it.tone ? ` is-${it.tone}` : '') +
              (it.active ? ' is-active' : '') +
              (it.onClick ? ' is-clickable' : '')
            }
          >
            <span className="bs-stat-value">{it.value}</span>
            <span className="bs-stat-label">{it.label}</span>
          </Tag>
        )
      })}
    </div>
  )
}

export default FilterBar
