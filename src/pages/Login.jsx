import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(), password,
      })
      if (err) throw err
    } catch (err) {
      setError(err.message || 'No se pudo ingresar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      justifyContent: 'center', padding: '24px 20px 40px',
      background: `
        radial-gradient(ellipse 70% 40% at 50% -5%, rgba(194,65,12,0.18) 0%, transparent 70%),
        #f4f0ea
      `,
    }}>
      {/* Logo y marca */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 64, height: 64, margin: '0 auto 16px',
          borderRadius: 20, background: 'linear-gradient(145deg, #c2410c, #9a3412)',
          color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: '-0.02em',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 12px 32px rgba(194,65,12,0.4)',
        }}>KF</div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: '#1c1917' }}>
          KeyFoods Field
        </h1>
        <p style={{ margin: '8px 0 0', color: '#78716c', fontSize: 14, fontWeight: 500 }}>
          Tu día de terreno · ordenado por impacto
        </p>
      </div>

      {/* Card de login */}
      <div style={{
        background: '#fff', borderRadius: 24, padding: '24px 20px',
        border: '1px solid #ebe5dc',
        boxShadow: '0 20px 60px rgba(28,25,23,0.08)',
      }}>
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#57534e', marginBottom: 6 }}>
              Correo
            </label>
            <input
              type="email" autoComplete="username"
              placeholder="tu@empresa.cl"
              value={email} onChange={e => setEmail(e.target.value)} required
              style={{
                width: '100%', minHeight: 50, padding: '13px 14px',
                border: '1.5px solid #e7e5e4', borderRadius: 14,
                background: '#fafaf9', fontSize: 16, fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = '#c2410c'}
              onBlur={e => e.target.style.borderColor = '#e7e5e4'}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#57534e', marginBottom: 6 }}>
              Contraseña
            </label>
            <input
              type="password" autoComplete="current-password"
              placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} required
              style={{
                width: '100%', minHeight: 50, padding: '13px 14px',
                border: '1.5px solid #e7e5e4', borderRadius: 14,
                background: '#fafaf9', fontSize: 16, fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = '#c2410c'}
              onBlur={e => e.target.style.borderColor = '#e7e5e4'}
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', color: '#991b1b',
              padding: '10px 14px', borderRadius: 12,
              fontSize: 13, fontWeight: 600, marginBottom: 14,
              border: '1px solid #fecaca',
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', minHeight: 52, borderRadius: 14, border: 'none',
            background: loading ? '#d6d3d1' : '#c2410c', color: '#fff',
            fontWeight: 800, fontSize: 16, fontFamily: 'inherit',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : '0 6px 20px rgba(194,65,12,0.3)',
            transition: 'all 0.15s',
          }}>
            {loading ? 'Ingresando…' : 'Entrar →'}
          </button>
        </form>
      </div>

      <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#a8a29e', fontWeight: 500 }}>
        Acceso restringido a ejecutivos autorizados
      </p>
    </div>
  )
}
