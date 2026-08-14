import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (err) setError(err.message || 'No se pudo iniciar sesión')
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="logo-mark">KF</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 6 }}>
          KeyFoods Field
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, fontWeight: 500 }}>
          Tu día de terreno, ordenado
        </p>
      </div>

      <div className="login-card">
        <form onSubmit={entrar}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
            CORREO
          </label>
          <input
            className="field"
            type="email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@keyfoods.cl"
            required
          />
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)', marginBottom: 6, marginTop: 4 }}>
            CONTRASEÑA
          </label>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          {error && (
            <div
              style={{
                background: 'rgba(254,242,242,0.95)',
                color: '#b91c1c',
                padding: '12px 14px',
                borderRadius: 12,
                fontSize: 13,
                marginBottom: 14,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: 16, fontSize: 16, marginTop: 4 }}
          >
            {loading ? 'Entrando…' : 'Entrar al terreno'}
          </button>
        </form>
      </div>

      <p style={{ textAlign: 'center', marginTop: 28, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
        KeyFoods · fuerza de ventas
      </p>
    </div>
  )
}
