import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const ACTIONS = [
  { id: 'home', label: 'Ir a Inicio', hint: 'Pulso diario', path: '/' },
  { id: 'clients', label: 'Abrir Clientes', hint: 'Cartera y Cliente 360', path: '/cartera' },
  { id: 'route', label: 'Abrir Ruta', hint: 'Visitas y mapa', path: '/mapa' },
  { id: 'stock', label: 'Abrir Stock', hint: 'Disponibilidad y quiebres', path: '/stock' },
  { id: 'management', label: 'Abrir Gerencia', hint: 'Indicadores y gestión', path: '/gerencia' },
  { id: 'control', label: 'Abrir Control Center', hint: 'Solo perfiles con acceso', path: '/control-center' },
]

function scoreAction(action, query) {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const hay = `${action.label} ${action.hint}`.toLowerCase()
  if (hay === q) return 100
  if (hay.startsWith(q)) return 80
  if (hay.includes(q)) return 60
  return q.split(/\s+/).every(word => hay.includes(word)) ? 40 : -1
}

export default function CommandPalette({ onClose }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const results = useMemo(() => ACTIONS
    .map(action => ({ action, score: scoreAction(action, query) }))
    .filter(x => !query.trim() || x.score >= 0)
    .sort((a, b) => b.score - a.score), [query])

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = event => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(i + 1, Math.max(0, results.length - 1))) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(0, i - 1)) }
      if (event.key === 'Enter' && results[active]) {
        event.preventDefault()
        navigate(results[active].action.path)
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, navigate, onClose, results])

  useEffect(() => setActive(0), [query])

  return <div className="bs-command-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="bs-command" role="dialog" aria-modal="true" aria-label="Comando Black Sheep">
      <div className="bs-command-search">
        <span aria-hidden="true">⌘</span>
        <input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="¿Qué quieres hacer?" aria-label="Buscar una acción" autoComplete="off" />
        <kbd>ESC</kbd>
      </div>
      <div className="bs-command-body">
        <div className="bs-command-label">Acciones</div>
        {results.length ? results.map(({ action }, index) => <button key={action.id} className={`bs-command-item${index === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => { navigate(action.path); onClose() }}>
          <span className="bs-command-icon" aria-hidden="true">→</span>
          <span><b>{action.label}</b><small>{action.hint}</small></span>
          {index === active && <kbd>↵</kbd>}
        </button>) : <div className="bs-command-empty">No encontré una acción para “{query}”.</div>}
      </div>
      <footer className="bs-command-foot"><span>↑↓ navegar</span><span>↵ abrir</span><span>Esc cerrar</span></footer>
    </section>
  </div>
}
