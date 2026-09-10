import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, contextoDeSesion } from '../lib/supabase.js'

const Ctx = createContext(null)

export function ProveedorSesion({ children }) {
  const [sesion, setSesion] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const ctx = contextoDeSesion(sesion)
  return (
    <Ctx.Provider value={{ sesion, cargando, ...ctx, salir: () => supabase.auth.signOut() }}>
      {children}
    </Ctx.Provider>
  )
}

export const useSesion = () => useContext(Ctx)
