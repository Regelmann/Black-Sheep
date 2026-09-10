import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function Entrar() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar() {
    setEnviando(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave })
    // El error de Supabase habla de "credentials"; acá se dice qué hacer.
    if (error) setError('Correo o contraseña incorrectos. Revísalos y vuelve a intentar.')
    setEnviando(false)
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 'var(--e4)' }}>
      <div className="panel" style={{ width: 'min(400px, 100%)' }}>
        <h1 style={{ marginBottom: 'var(--e1)' }}>Black Sheep</h1>
        <p className="silencio" style={{ marginBottom: 'var(--e5)' }}>Panel de gerencia</p>

        <div className="campo">
          <label htmlFor="email">Correo</label>
          <input id="email" type="email" autoComplete="username" value={email}
                 onChange={(e) => setEmail(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && entrar()} />
        </div>
        <div className="campo">
          <label htmlFor="clave">Contraseña</label>
          <input id="clave" type="password" autoComplete="current-password" value={clave}
                 onChange={(e) => setClave(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && entrar()} />
        </div>

        {error ? <div className="estado error" role="alert" style={{ marginBottom: 'var(--e3)' }}>{error}</div> : null}

        <button className="boton primario" style={{ width: '100%' }} onClick={entrar} disabled={enviando || !email || !clave}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </div>
  )
}
