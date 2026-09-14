import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, contextoDeSesion } from '../../../../packages/datos/supabase.js'

const Ctx = createContext(null)

/**
 * nivelMfa se agrega para el candado de 035_mfa_superadmin.sql: la base
 * exige aal2 para cualquier función de superadmin, así que el front
 * necesita saber en qué nivel está la sesión y si hay que pedir el
 * segundo factor (o inscribirlo por primera vez) antes de dejar entrar.
 */
export function ProveedorSesion({ children }) {
  const [sesion, setSesion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [nivelMfa, setNivelMfa] = useState(null)

  async function revisarNivelMfa() {
    const [{ data: nivel, error: errorNivel }, { data: listado, error: errorListado }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ])
    if (errorNivel || errorListado) {
      // Sin datos de MFA no se puede confirmar aal2 — se trata como no listo
      // en vez de dejar pasar por defecto.
      setNivelMfa({ actual: 'aal1', factores: [], listo: false })
      return
    }
    setNivelMfa({
      actual: nivel.currentLevel,
      factores: listado.totp || [],
      listo: nivel.currentLevel === 'aal2',
    })
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSesion(data.session)
      if (data.session) await revisarNivelMfa()
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSesion(s)
      if (s) await revisarNivelMfa()
      else setNivelMfa(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const ctx = contextoDeSesion(sesion)
  return (
    <Ctx.Provider value={{ sesion, cargando, nivelMfa, revisarNivelMfa, ...ctx, salir: () => supabase.auth.signOut() }}>
      {children}
    </Ctx.Provider>
  )
}

export const useSesion = () => useContext(Ctx)
