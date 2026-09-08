import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './styles.css'

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { db: { schema: 'platform' } })
const statusLabels = { active: 'Activo', trialing: 'Prueba', past_due: 'Vencido', canceled: 'Cancelado' }
const statusClasses = { active: 'is-active', trialing: 'is-trial', past_due: 'is-due', canceled: 'is-canceled' }

function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault(); setError('')
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(signInError.message); else onLogin(data.session)
  }
  return <main className="auth-shell"><div className="auth-card"><div className="brand-mark">BS<span>•</span></div><p className="eyebrow">BLACK SHEEP / CONTROL CENTER</p><h1>La operación,<br /><em>bajo control.</em></h1><p className="muted">Administra empresas, planes y suscripciones desde un espacio independiente.</p><form onSubmit={submit}><label>Correo<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Contraseña<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button" type="submit">Entrar al Control Center</button></form></div></main>
}

function TenantModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ nombre: '', slug: '', plan: 'starter', estado: 'trialing', importe_mensual: '0' })
  const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('')
    const { data: tenant, error: tenantError } = await supabase.from('tenants').insert({ nombre: form.nombre, slug: form.slug || form.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), activo: true }).select('id').single()
    if (tenantError) { setError(tenantError.message); setSaving(false); return }
    const { error: subscriptionError } = await supabase.from('suscripciones').insert({ tenant_id: tenant.id, plan: form.plan, estado: form.estado, importe_mensual: Number(form.importe_mensual) || 0 })
    if (subscriptionError) { setError(subscriptionError.message); setSaving(false); return }
    onSaved(); onClose()
  }
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-tenant-title"><div className="modal-heading"><div><p className="eyebrow">NUEVA EMPRESA</p><h2 id="new-tenant-title">Agregar tenant</h2></div><button className="close-button" onClick={onClose} aria-label="Cerrar">×</button></div><form onSubmit={submit} className="modal-form"><label>Nombre<input value={form.nombre} onChange={e => update('nombre', e.target.value)} required autoFocus /></label><label>Slug<input value={form.slug} onChange={e => update('slug', e.target.value)} placeholder="empresa-demo" /></label><div className="form-grid"><label>Plan<select value={form.plan} onChange={e => update('plan', e.target.value)}><option>starter</option><option>growth</option><option>enterprise</option></select></label><label>Estado<select value={form.estado} onChange={e => update('estado', e.target.value)}><option value="trialing">Prueba</option><option value="active">Activo</option><option value="past_due">Vencido</option><option value="canceled">Cancelado</option></select></label></div><label>Importe mensual<input type="number" min="0" value={form.importe_mensual} onChange={e => update('importe_mensual', e.target.value)} /></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? 'Guardando…' : 'Crear empresa'}</button></div></form></section></div>
}

function App() {
  const [session, setSession] = useState(null); const [loading, setLoading] = useState(true); const [authorized, setAuthorized] = useState(false); const [tenants, setTenants] = useState([]); const [auditLog, setAuditLog] = useState([]); const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all'); const [error, setError] = useState(''); const [showModal, setShowModal] = useState(false)
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) }); const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next)); return () => listener.subscription.unsubscribe() }, [])
  async function startCheckout(tenantId, plan = 'starter') {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return setError('Tu sesión expiró. Vuelve a iniciar sesión.')
    const response = await fetch('/api/create-mercadopago-subscription', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ tenantId, plan }) })
    const payload = await response.json()
    if (!response.ok) return setError(payload.error || 'No se pudo iniciar el checkout.')
    window.location.assign(payload.url)
  }

  async function loadTenants() {
    if (!session) return
    const { data: admin, error: adminError } = await supabase.from('platform_admins').select('usuario_id').eq('usuario_id', session.user.id).eq('activo', true).maybeSingle()
    if (adminError || !admin) { setAuthorized(false); setError('Esta cuenta no tiene permisos de plataforma.'); return }
    const { data, error: loadError } = await supabase.from('tenants').select('id, nombre, slug, activo, suscripciones(plan, estado, importe_mensual, vence_en), membresias(count)').order('nombre')
    if (loadError) { setError(loadError.message); return }; const { data: audit } = await supabase.from('audit_log').select('id, action, resource_type, details, created_at, tenant_id').order('created_at', { ascending: false }).limit(8); setAuthorized(true); setTenants(data || []); setAuditLog(audit || [])
  }
  useEffect(() => { loadTenants() }, [session])
  const visible = useMemo(() => tenants.filter(t => { const sub = t.suscripciones?.[0]; return `${t.nombre} ${t.slug}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || sub?.estado === filter) }), [tenants, query, filter])
  const stats = useMemo(() => ({ total: tenants.length, active: tenants.filter(t => t.suscripciones?.[0]?.estado === 'active').length, trial: tenants.filter(t => t.suscripciones?.[0]?.estado === 'trialing').length, revenue: tenants.reduce((sum, t) => sum + Number(t.suscripciones?.[0]?.importe_mensual || 0), 0) }), [tenants])
  if (loading) return <div className="loading-screen">Cargando Control Center…</div>
  if (!session) return <Login onLogin={setSession} />
  if (!authorized) return <main className="auth-shell"><div className="auth-card"><div className="brand-mark">BS<span>•</span></div><h1>Acceso restringido</h1><p className="muted">{error || 'No tienes permisos para entrar a esta consola.'}</p><button className="secondary-button" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button></div></main>
  return <div className="app-shell"><aside className="sidebar"><div className="brand-mark">BS<span>•</span></div><div><p className="eyebrow">BLACK SHEEP</p><p className="sidebar-title">Control Center</p></div><nav><a className="nav-item active" href="#overview">Overview</a><a className="nav-item" href="#companies">Empresas</a><a className="nav-item" href="#billing">Pagos y planes</a></nav><div className="sidebar-footer"><span className="avatar">{session.user.email?.slice(0, 1).toUpperCase()}</span><div><strong>{session.user.email}</strong><small>Administrador global</small></div><button className="icon-button" aria-label="Cerrar sesión" onClick={() => supabase.auth.signOut()}>↗</button></div></aside><main className="content"><header className="topbar"><div><p className="eyebrow">CONTROL CENTER</p><h1>Buen día, Sebastián.</h1></div><button className="mobile-logout" onClick={() => supabase.auth.signOut()}>Salir</button></header><section id="overview" className="hero"><div><p className="eyebrow">PANORAMA GLOBAL</p><h2>Tu red,<br /><em>en movimiento.</em></h2><p className="muted">Una vista completa del estado comercial de Black Sheep.</p></div><div className="hero-signal"><span className="signal-dot" /> Datos actualizados<br /><strong>Ahora mismo</strong></div></section><section className="stats-grid"><article><span>EMPRESAS</span><strong>{stats.total}</strong><small>Total registradas</small></article><article><span>ACTIVAS</span><strong>{stats.active}</strong><small>Suscripciones al día</small></article><article><span>EN PRUEBA</span><strong>{stats.trial}</strong><small>Requieren seguimiento</small></article><article className="accent-card"><span>MRR ESTIMADO</span><strong>${stats.revenue.toLocaleString('es-CL')}</strong><small>Ingresos mensuales</small></article></section><section id="companies" className="panel"><div className="panel-heading"><div><p className="eyebrow">CARTERA DE EMPRESAS</p><h2>Todos los tenants</h2></div><button className="primary-button compact" onClick={() => setShowModal(true)}>Nueva empresa</button></div><div className="toolbar"><input aria-label="Buscar empresas" placeholder="Buscar empresa o slug…" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filtrar estado" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos los estados</option><option value="active">Activas</option><option value="trialing">En prueba</option><option value="past_due">Vencidas</option><option value="canceled">Canceladas</option></select></div><div className="tenant-list">{visible.map(tenant => { const sub = tenant.suscripciones?.[0]; return <article className="tenant-row" key={tenant.id}><div><strong>{tenant.nombre}</strong><small>{tenant.slug}</small></div><div className="tenant-plan"><span>{sub?.plan || 'Sin plan'}</span><small>{tenant.membresias?.[0]?.count || 0} usuarios</small></div><span className={`status ${statusClasses[sub?.estado] || ''}`}>{statusLabels[sub?.estado] || 'Sin suscripción'}</span><strong className="tenant-revenue">${Number(sub?.importe_mensual || 0).toLocaleString('es-CL')}</strong><button className="row-action" aria-label={`Ver ${tenant.nombre}`}>Ver detalle →</button></article> })}{visible.length === 0 && <p className="empty-state">No hay empresas que coincidan con la búsqueda.</p>}</div></section>{showModal && <TenantModal onClose={() => setShowModal(false)} onSaved={loadTenants} />}</main></div>
}
createRoot(document.getElementById('root')).render(<App />)
