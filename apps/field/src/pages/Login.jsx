import { useMemo, useState } from 'react'
import { supabase, initSupabase, getActiveTenant, availableTenants } from '../lib/supabase'
import { resolveTenantFromEmail, resolveTenant, saveTenantId, applyTenantBrand } from '../lib/tenants'

export default function Login() {
  const tenants = useMemo(() => availableTenants(), [])
  const initial = resolveTenant()
  const [email, setEmail] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('email') || ''
    } catch {
      return ''
    }
  })
  const [password, setPassword] = useState('')
  const [tenantId, setTenantId] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('tenant')
      if (q && tenants.some(x => x.id === q || x.slug === q)) return q
    } catch { /* ignorado a propósito */ void 0 }
    return initial?.id || tenants[0]?.id || 'keyfoods'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function pickTenant(nextEmail) {
    const auto = resolveTenantFromEmail(nextEmail)
    if (auto) setTenantId(auto.id)
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const em = email.trim()
      // Prioridad: selección manual → auto por email → default
      let tenant = tenants.find(t => t.id === tenantId) || resolveTenantFromEmail(em) || resolveTenant({ email: em })
      if (!tenant) throw new Error('No hay empresa configurada para este usuario')
      if (!tenant.supabaseUrl || !tenant.supabaseAnon) {
        throw new Error(`Faltan credenciales Supabase del tenant "${tenant.name}"`)
      }
      initSupabase(tenant)
      saveTenantId(tenant.id)
      applyTenantBrand(tenant)  // colores de la empresa al instante

      const { error: err } = await supabase.auth.signInWithPassword({
        email: em,
        password,
      })
      if (err) throw err
    } catch (err) {
      setError(err.message || 'No se pudo ingresar')
    } finally {
      setLoading(false)
    }
  }

  const active = getActiveTenant()

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '24px 20px 40px',
        background: `
          radial-gradient(ellipse 70% 40% at 50% -5%, rgba(57,255,20,0.12) 0%, transparent 70%),
          #0a0a0a
        `,
      }}
    >
      <div className="bs-login-brand" style={{ textAlign: 'center', marginBottom: 28 }}>
        <img
          src="/brand/logo-mark-192.png"
          alt="Black Sheep"
          width={80}
          height={80}
          style={{
            margin: '0 auto 14px',
            display: 'block',
            borderRadius: 20,
            boxShadow: '0 0 40px rgba(57,255,20,0.25)',
          }}
        />
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--bg-raised)' }}>
          Black Sheep <span style={{ color: 'var(--lime)' }}>Field</span>
        </h1>
        <p style={{ margin: '8px 0 0', color: 'var(--neutral-3)', fontSize: 14, fontWeight: 500 }}>
          Una plataforma · muchas empresas
        </p>
      </div>

      <div
        style={{
          background: 'var(--bs-dark-2)',
          borderRadius: 20,
          padding: '22px 18px',
          border: '1px solid #27272a',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          maxWidth: 420,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <form onSubmit={onSubmit}>
          {tenants.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--neutral-3)', marginBottom: 6 }}>
                Empresa
              </label>
              <select
                value={tenantId}
                onChange={e => setTenantId(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: 48,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid #3f3f46',
                  background: 'var(--bs-dark-3)',
                  color: 'var(--bg-raised)',
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--neutral-3)', marginBottom: 6 }}>
              Correo
            </label>
            <input
              type="email"
              autoComplete="username"
              placeholder="tu@empresa.cl"
              value={email}
              onChange={e => {
                setEmail(e.target.value)
                pickTenant(e.target.value)
              }}
              required
              style={{
                width: '100%',
                minHeight: 50,
                padding: '13px 14px',
                border: '1.5px solid #3f3f46',
                borderRadius: 12,
                background: 'var(--bs-dark-3)',
                color: 'var(--bg-raised)',
                fontSize: 15,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--neutral-3)', marginBottom: 6 }}>
              Contraseña
            </label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                minHeight: 50,
                padding: '13px 14px',
                border: '1.5px solid #3f3f46',
                borderRadius: 12,
                background: 'var(--bs-dark-3)',
                color: 'var(--bg-raised)',
                fontSize: 15,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div
              style={{
                marginBottom: 14,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(239,68,68,0.12)',
                color: 'var(--danger-lt4)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              minHeight: 52,
              border: 'none',
              borderRadius: 12,
              background: 'var(--lime)',
              color: 'var(--bs-dark-3)',
              fontWeight: 900,
              fontSize: 15,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Ingresando…' : 'Entrar al sistema'}
          </button>
        </form>

        <p style={{ margin: '16px 0 0', fontSize: 12, color: 'var(--neutral)', lineHeight: 1.45, textAlign: 'center' }}>
          {active ? (
            <>
              Conectado a tenant <strong style={{ color: 'var(--neutral-4)' }}>{active.name}</strong>
            </>
          ) : (
            'Seleccioná tu empresa o usá el correo corporativo'
          )}
        </p>
      </div>

      <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--neutral-2)' }}>
        black-sheep.cl · control central de empresas
      </p>
    </div>
  )
}
