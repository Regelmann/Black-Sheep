import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const ACTIONS = [
  { id: 'home', label: 'Ir a Inicio', hint: 'Pulso diario', path: '/' },
  { id: 'clients', label: 'Abrir Clientes', hint: 'Cartera y Cliente 360', path: '/cartera' },
  { id: 'route', label: 'Abrir Ruta', hint: 'Visitas y mapa', path: '/mapa' },
  { id: 'stock', label: 'Abrir Stock', hint: 'Disponibilidad y quiebres', path: '/stock' },
  { id: 'management', label: 'Abrir Gerencia', hint: 'Indicadores y gestión', path: '/gerencia' },
  { id: 'control', label: 'Abrir Control Center', hint: 'Inteligencia comercial', path: '/control-center' },
]

function rank(action, query) {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const text = `${action.label} ${action.hint}`.toLowerCase()
  if (text === q) return 100
  if (text.startsWith(q)) return 80
  if (text.includes(q)) return 60
  return q.split(/\s+/).every(word => text.includes(word)) ? 40 : -1
}

export default function CommandLayer() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  const results = useMemo(() => ACTIONS
    .map(action => ({ action, score: rank(action, query) }))
    .filter(item => !query.trim() || item.score >= 0)
    .sort((a, b) => b.score - a.score), [query])

  useEffect(() => {
    const onKeyDown = event => {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(value => !value)
      }
      if (!open) return
      if (event.key === 'Escape') setOpen(false)
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(i + 1, Math.max(0, results.length - 1))) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(0, i - 1)) }
      if (event.key === 'Enter' && results[active]) {
        event.preventDefault()
        navigate(results[active].action.path)
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, navigate, open, results])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => setActive(0), [query])

  return <>
    <button className="bs-command-trigger" onClick={() => setOpen(true)} aria-label="Abrir comandos" title="Abrir comandos (⌘K / Ctrl K)">
      <span aria-hidden="true">⌕</span><span>Buscar o actuar…</span><kbd>⌘K</kbd>
    </button>
    {open && <div className="bs-command-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="bs-command" role="dialog" aria-modal="true" aria-label="Comandos Black Sheep">
        <div className="bs-command-search"><span aria-hidden="true">⌕</span><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="¿Qué quieres hacer?" aria-label="Buscar una acción" autoComplete="off" /><kbd>ESC</kbd></div>
        <div className="bs-command-body"><div className="bs-command-label">Acciones</div>{results.length ? results.map(({ action }, index) => <button key={action.id} className={`bs-command-item${index === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => { navigate(action.path); setOpen(false) }}><span className="bs-command-icon" aria-hidden="true">→</span><span><b>{action.label}</b><small>{action.hint}</small></span>{index === active && <kbd>↵</kbd>}</button>) : <div className="bs-command-empty">No encontré una acción para “{query}”.</div>}</div>
        <footer className="bs-command-foot"><span>↑↓ navegar</span><span>↵ abrir</span><span>Esc cerrar</span></footer>
      </section>
    </div>}
  </>
}
