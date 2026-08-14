import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (err) throw err
    } catch (err) {
      setError(err.message || 'No se pudo ingresar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="login-logo">KF</div>
        <h1>KeyFoods Field</h1>
        <p>Tu día de terreno, ordenado por impacto</p>
      </div>

      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-field">
          <label htmlFor="email">Correo</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="tu@keyfoods.cl"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="login-field">
          <label htmlFor="pass">Contraseña</label>
          <input
            id="pass"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <div style={{
            background: '#fef2f2', color: '#991b1b', padding: '10px 12px',
            borderRadius: 12, fontSize: 13, fontWeight: 600, marginBottom: 12,
          }}>
            {error}
          </div>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? 'Ingresando…' : 'Entrar'}
        </button>
      </form>

      <p style={{
        textAlign: 'center', marginTop: 20, fontSize: 12,
        color: '#a8a29e', fontWeight: 500,
      }}>
        Acceso ejecutivos KeyFoods
      </p>
      <div style={{
        textAlign: 'center', marginTop: 12, fontSize: 11,
        fontWeight: 800, color: '#c2410c', letterSpacing: '0.06em',
      }}>
        v-UX-V17
      </div>
    </div>
  )
}
