import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const statusLabels = { active: 'Activo', past_due: 'Vencido', canceled: 'Cancelado', trialing: 'Prueba' }
const statusClass = { active: 'is-paid', past_due: 'is-due', canceled: 'is-off', trialing: 'is-trial' }

export default function PlatformAdmin() {
  const [tenants, setTenants] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    const [{ data: tenantRows, error: tenantError }, { data: subRows, error: subError }, { data: memberRows, error: memberError }] = await Promise.all([
      supabase.schema('platform').from('tenants').select('id,nombre,slug,activo,creado_en').order('nombre'),
      supabase.schema('platform').from('suscripciones').select('tenant_id,plan,estado,vence_en,importe_mensual').order('vence_en'),
      supabase.schema('platform').from('membresias').select('tenant_id,rol,activo'),
    ])
    if (tenantError || subError || memberError) setError('No se pudo cargar el control global. Verifica el acceso del administrador de plataforma.')
    setTenants(tenantRows || [])
    setSubscriptions(subRows || [])
    setMemberships(memberRows || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const rows = useMemo(() => tenants.map((tenant) => {
    const subscription = subscriptions.find((item) => item.tenant_id === tenant.id)
    const members = memberships.filter((item) => item.tenant_id === tenant.id)
    return { ...tenant, subscription, memberCount: members.length }
  }).filter((tenant) => {
    const matchesQuery = !query || `${tenant.nombre} ${tenant.slug}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'all' || (tenant.subscription?.estado || 'missing') === filter
    return matchesQuery && matchesFilter
  }), [tenants, subscriptions, memberships, query, filter])

  const stats = useMemo(() => ({
    total: tenants.length,
    active: tenants.filter((tenant) => tenant.activo).length,
    paid: tenants.filter((tenant) => tenant.subscription?.estado === 'active').length,
    due: tenants.filter((tenant) => ['past_due', 'canceled'].includes(tenant.subscription?.estado)).length,
  }), [tenants])

  return (
    <main className="platform-admin-page">
      <header className="platform-admin-hero">
        <div>
          <p className="platform-kicker">BLACK SHEEP CONTROL CENTER</p>
          <h1>Empresas y suscripciones</h1>
          <p className="platform-muted">Administra todos los tenants desde una sola vista.</p>
        </div>
        <button type="button" className="platform-refresh" onClick={loadData} disabled={loading}>{loading ? 'Cargando…' : 'Actualizar'}</button>
      </header>

      {error && <div className="platform-error" role="alert">{error}</div>}

      <section className="platform-stats" aria-label="Resumen de plataforma">
        <article><span>Empresas</span><strong>{stats.total}</strong><small>{stats.active} activas</small></article>
        <article><span>Suscripciones activas</span><strong>{stats.paid}</strong><small>pagos al día</small></article>
        <article><span>Revisión requerida</span><strong>{stats.due}</strong><small>vencidas o canceladas</small></article>
      </section>

      <section className="platform-toolbar">
        <label><span className="sr-only">Buscar empresa</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar empresa o slug…" /></label>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrar suscripciones">
          <option value="all">Todos los estados</option><option value="active">Activas</option><option value="past_due">Vencidas</option><option value="canceled">Canceladas</option><option value="trialing">En prueba</option><option value="missing">Sin suscripción</option>
        </select>
      </section>

      <section className="platform-table-wrap" aria-label="Empresas">
        {loading ? <p className="platform-empty">Cargando empresas…</p> : rows.length === 0 ? <p className="platform-empty">No hay empresas que coincidan.</p> : (
          <div className="platform-table-scroll"><table><thead><tr><th>Empresa</th><th>Estado</th><th>Plan</th><th>Vencimiento</th><th>Equipo</th></tr></thead><tbody>
            {rows.map((row) => { const status = row.subscription?.estado || 'missing'; return <tr key={row.id}><td><strong>{row.nombre}</strong><small>{row.slug}</small></td><td><span className={`platform-status ${statusClass[status] || 'is-off'}`}>{statusLabels[status] || 'Sin suscripción'}</span></td><td>{row.subscription?.plan || '—'}{row.subscription?.importe_mensual ? <small>${Number(row.subscription.importe_mensual).toLocaleString('es-CL')} / mes</small> : null}</td><td>{row.subscription?.vence_en ? new Date(row.subscription.vence_en).toLocaleDateString('es-CL') : '—'}</td><td>{row.memberCount} miembros</td></tr> })}
          </tbody></table></div>
        )}
      </section>
    </main>
  )
}

export { statusLabels }
