import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './styles.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey, { db: { schema: 'platform' } })

const statusLabels = { active: 'Activo', trialing: 'Prueba', past_due: 'Vencido', canceled: 'Cancelado' }
const statusClasses = { active: 'is-active', trialing: 'is-trial', past_due: 'is-due', canceled: 'is-canceled' }

function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    setError('')
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(signInError.message)
    else onLogin(data.session)
  }
  return <main className="auth-shell"><div className="auth-card"><div className="brand-mark">BS<span>•</span></div><p className="eyebrow">BLACK SHEEP / CONTROL CENTER</p><h1>La operación,<br /><em>bajo control.</em></h1><p className="muted">Administra tus empresas, planes y suscripciones desde un espacio independiente.</p><form onSubmit={submit}><label>Correo<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Contraseña<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button" type="submit">Entrar al Control Center</button></form></div></main>
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [tenants, setTenants] = useState([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    async function load() {
      const { data: admin, error: adminError } = await supabase.from('platform_admins').select('usuario_id, activo').eq('usuario_id', session.user.id).eq('activo', true).maybeSingle()
      if (adminError || !admin) { setAuthorized(false); setError('Esta cuenta no tiene permisos de plataforma.'); return }
      const { data, error: tenantsError } = await supabase.from('tenants').select('id, nombre, slug, activo, suscripciones(plan, estado, importe_mensual, vence_en), membresias(count)').order('nombre')
      if (tenantsError) { setError(tenantsError.message); return }
      if (!cancelled) { setAuthorized(true); setTenants(data || []) }
    }
    load()
    return () => { cancelled = true }
  }, [session])

  const visibleTenants = useMemo(() => tenants.filter(tenant => {
    const subscription = tenant.suscripciones?.[0]
    const matchesQuery = `${tenant.nombre} ${tenant.slug}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (filter === 'all' || subscription?.estado === filter)
  }), [tenants, query, filter])
  const stats = useMemo(() => ({ total: tenants.length, active: tenants.filter(t => t.suscripciones?.[0]?.estado === 'active').length, trial: tenants.filter(t => t.suscripciones?.[0]?.estado === 'trialing').length, revenue: tenants.reduce((sum, t) => sum + Number(t.suscripciones?.[0]?.importe_mensual || 0), 0) }), [tenants])

  if (loading) return <div className="loading-screen">Cargando Control Center…</div>
  if (!session) return <Login onLogin={setSession} />
  if (!authorized) return <main className="auth-shell"><div className="auth-card"><div className="brand-mark">BS<span>•</span></div><h1>Acceso restringido</h1><p className="muted">{error || 'No tienes permisos para entrar a esta consola.'}</p><button className="secondary-button" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button></div></main>

  return <div className="app-shell"><aside className="sidebar"><div className="brand-mark">BS<span>•</span></div><div><p className="eyebrow">BLACK SHEEP</p><p className="sidebar-title">Control Center</p></div><nav><a className="nav-item active" href="#overview">Overview</a><a className="nav-item" href="#companies">Empresas</a><a className="nav-item" href="#billing">Pagos y planes</a></nav><div className="sidebar-footer"><span className="avatar">{session.user.email?.slice(0, 1).toUpperCase()}</span><div><strong>{session.user.email}</strong><small>Administrador global</small></div><button className="icon-button" aria-label="Cerrar sesión" onClick={() => supabase.auth.signOut()}>↗</button></div></aside><main className="content"><header className="topbar"><div><p className="eyebrow">MARTES, 8 SEPTIEMBRE 2026</p><h1>Buen día, Sebastián.</h1></div><button className="mobile-logout" onClick={() => supabase.auth.signOut()}>Salir</button></header><section id="overview" className="hero"><div><p className="eyebrow">PANORAMA GLOBAL</p><h2>Tu red,<br /><em>en movimiento.</em></h2><p className="muted">Una vista completa del estado comercial de Black Sheep.</p></div><div className="hero-signal"><span className="signal-dot" /> Datos actualizados<br /><strong>Ahora mismo</strong></div></section><section className="stats-grid"><article><span>EMPRESAS</span><strong>{stats.total}</strong><small>Total registradas</small></article><article><span>ACTIVAS</span><strong>{stats.active}</strong><small>Suscripciones al día</small></article><article><span>EN PRUEBA</span><strong>{stats.trial}</strong><small>Requieren seguimiento</small></article><article className="accent-card"><span>MRR ESTIMADO</span><strong>${stats.revenue.toLocaleString('es-CL')}</strong><small>Ingresos mensuales</small></article></section><section id="companies" className="panel"><div className="panel-heading"><div><p className="eyebrow">CARTERA DE EMPRESAS</p><h2>Todos los tenants</h2></div><button className="primary-button compact">+ Nueva empresa</button></div><div className="toolbar"><input aria-label="Buscar empresa" placeholder="Buscar por empresa o slug" value={query} onChange={e => setQuery(e.target.value)} /><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos los estados</option><option value="active">Activos</option><option value="trialing">En prueba</option><option value="past_due">Vencidos</option><option value="canceled">Cancelados</option></select></div><div className="tenant-list">{visibleTenants.map(tenant => { const subscription = tenant.suscripciones?.[0] || {}; return <article className="tenant-row" key={tenant.id}><div className="tenant-identity"><span className="tenant-avatar">{tenant.nombre?.slice(0, 1).toUpperCase()}</span><div><strong>{tenant.nombre}</strong><small>{tenant.slug} · {tenant.membresias?.[0]?.count || 0} usuarios</small></div></div><div className="tenant-plan"><span>{subscription.plan || 'Sin plan'}</span><small>{subscription.vence_en ? `Vence ${new Date(subscription.vence_en).toLocaleDateString('es-CL')}` : 'Sin vencimiento'}</small></div><span className={`status ${statusClasses[subscription.estado] || ''}`}>{statusLabels[subscription.estado] || 'Sin estado'}</span><button className="row-action" aria-label={`Abrir ${tenant.nombre}`}>→</button></article> })}{visibleTenants.length === 0 && <p className="empty-state">No hay empresas que coincidan con tu búsqueda.</p>}</div></section></main></div>
}

createRoot(document.getElementById('root')).render(<App />)
