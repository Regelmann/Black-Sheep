import { useState } from 'react'
import { supabase } from '../lib/supabase'

const fieldStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1.5px solid #e7e5e4',
  fontSize: 15,
  marginBottom: 14,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  background: '#fafaf9',
  color: '#1a1614',
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: '#78716c',
  marginBottom: 6,
}

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
    if (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos'
          : err.message || 'No se pudo iniciar sesión'
      )
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '28px 20px',
        background: '#f3efe9',
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              margin: '0 auto 14px',
              borderRadius: 14,
              background: 'linear-gradient(145deg, #ea580c, #c2410c)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 18,
              boxShadow: '0 8px 24px rgba(194,65,12,0.28)',
            }}
          >
            KF
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: '#1a1614',
            }}
          >
            KeyFoods Field
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#78716c', fontWeight: 500 }}>
            Cartera, ruta y pedidos en terreno
          </p>
        </div>

        <form
          onSubmit={entrar}
          style={{
            background: '#fff',
            borderRadius: 20,
            padding: 22,
            border: '1px solid #ebe6df',
            boxShadow: '0 8px 32px rgba(26,22,20,0.06)',
          }}
        >
          <label style={labelStyle}>CORREO</label>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@keyfoods.cl"
            required
            style={fieldStyle}
          />
          <label style={labelStyle}>CONTRASEÑA</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={fieldStyle}
          />
          {error && (
            <div
              style={{
                background: '#fef2f2',
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
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: 15,
              borderRadius: 12,
              border: 'none',
              background: loading ? '#d6d3d1' : 'linear-gradient(180deg,#ea580c,#c2410c)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
              cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: loading ? 'none' : '0 4px 14px rgba(194,65,12,0.35)',
            }}
          >
            {loading ? 'Ingresando…' : 'Entrar'}
          </button>
        </form>
        <p
          style={{
            textAlign: 'center',
            marginTop: 20,
            fontSize: 12,
            color: '#a8a29e',
            fontWeight: 500,
          }}
        >
          Acceso ejecutivos KeyFoods
        </p>
        <div
          style={{
            textAlign: 'center',
            marginTop: 12,
            fontSize: 11,
            fontWeight: 800,
            color: '#c2410c',
            letterSpacing: '0.06em',
          }}
        >
          v-LEAN-021
        </div>
      </div>
    </div>
  )
}
