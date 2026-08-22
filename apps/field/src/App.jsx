import { useEffect, useState, createContext, useContext } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase, initSupabase, getActiveTenant } from './lib/supabase'
import { resolveTenant } from './lib/tenants'
import Login from './pages/Login.jsx'
import Hoy from './pages/Hoy.jsx'
import Ruta from './pages/Ruta.jsx'
import Visita from './pages/Visita.jsx'
import Cartera from './pages/Cartera.jsx'
import CatalogoCliente from './pages/CatalogoCliente.jsx'
import Stock from './pages/Stock.jsx'
import Gerencia from './pages/Gerencia.jsx'
import Admin from './pages/Admin.jsx'
import { NavBar } from './components.jsx'
import { AppShell } from './components/layout/AppShell.jsx'

// Visible en UI — si no lo ves en el teléfono, el deploy NO subió
export const BUILD_STAMP = 'v-BS-PLATFORM-V3.3-SISTEMA'

// ── Contexto global ──────────────────────────────────────────────────────
// id/nombre/zona/rol del logueado + zonaVista/eidVista (zona que se está viendo)
export const EjecutivoCtx = createContext(null)
export function useEjecutivo() {
  return useContext(EjecutivoCtx)
}

const ZONA_COLOR = {
  'NOR-ORIENTE': '#1e3a5f',
  'NOR-PONIENTE': '#0f766e',
  'ZONA SUR': '#7c2d12',
}

function ZonaSelector({ todos, zonaVista, onChange }) {
  if (!todos?.length) return null
  const color = {
    'NOR-ORIENTE': '#c2410c',
    'NOR-PONIENTE': '#0d9488',
    'ZONA SUR': '#ea580c',
  }
  return (
    <div className="kf-zone-bar" aria-label="Selector de zona">
      {todos.map(e => {
        const zona = e.zona || e.nombre
        const activo = zona === zonaVista
        return (
          <button
            key={e.id || zona}
            type="button"
            className={'kf-zone-btn' + (activo ? ' is-active' : '')}
            style={{ '--zone-color': color[zona] || '#c2410c' }}
            aria-pressed={activo}
            onClick={() => onChange(zona)}
          >
            {zona}
          </button>
        )
      })}
    </div>
  )
}


export default function App() {
  const [session, setSession] = useState(undefined)
  const [ejecutivo, setEjecutivo] = useState(null)
  const [todosEjecutivos, setTodosEjecutivos] = useState([])
  const [zonaVista, setZonaVista] = useState(null)
  const [eidVista, setEidVista] = useState(null)

  useEffect(() => {
    const t = resolveTenant()
    if (t) initSupabase(t)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setEjecutivo(null)
      return
    }
    supabase
      .from('ejecutivos')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          // Usuario auth sin fila en ejecutivos
          setEjecutivo({
            id: session.user.id,
            nombre: session.user.email || '',
            zona: '',
            rol: 'ejecutivo',
            esSuperAdmin: false,
          })
          return
        }
        const rol = (data.rol || 'ejecutivo').toLowerCase()
        setEjecutivo({
          id: data.id,
          nombre: data.nombre || '',
          zona: data.zona || '',
          rol,
          esSuperAdmin: rol === 'superadmin' || rol === 'gerente' || rol === 'admin',
        })
      })
  }, [session])

  // Cargar lista de zonas de campo + setear vista inicial
  useEffect(() => {
    if (!ejecutivo) return

    if (ejecutivo.esSuperAdmin) {
      supabase
        .from('ejecutivos')
        .select('id, nombre, zona, rol')
        .not('zona', 'is', null)
        .then(({ data }) => {
          const lista = (data || []).filter((e) => e.zona && String(e.zona).trim())
          // Preferir las 3 zonas de terreno si existen
          const orden = ['NOR-ORIENTE', 'NOR-PONIENTE', 'ZONA SUR']
          lista.sort((a, b) => {
            const ia = orden.indexOf(a.zona)
            const ib = orden.indexOf(b.zona)
            if (ia < 0 && ib < 0) return String(a.zona).localeCompare(String(b.zona))
            if (ia < 0) return 1
            if (ib < 0) return -1
            return ia - ib
          })
          setTodosEjecutivos(lista)
          const propia =
            lista.find((e) => e.zona === ejecutivo.zona) ||
            lista.find((e) => e.id === ejecutivo.id) ||
            lista[0]
          if (propia) {
            setZonaVista(propia.zona)
            setEidVista(propia.id)
          } else {
            setZonaVista(ejecutivo.zona || null)
            setEidVista(ejecutivo.id)
          }
        })
    } else {
      setTodosEjecutivos([])
      setZonaVista(ejecutivo.zona || null)
      setEidVista(ejecutivo.id)
    }
  }, [ejecutivo])

  function cambiarZona(zona) {
    const ej = todosEjecutivos.find((e) => e.zona === zona)
    if (!ej) return
    setZonaVista(zona)
    setEidVista(ej.id)
  }

  if (window.location.pathname.startsWith('/catalogo/')) {
    return <Routes><Route path="/catalogo/:token" element={<CatalogoCliente />} /></Routes>
  }
  if (session === undefined) {
    return (
      <div className="bs-boot">
        <div className="bs-boot-logo">🐑</div>
        <div className="bs-boot-bar"><span /></div>
        <p>Iniciando Black Sheep Field…</p>
      </div>
    )
  }
  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }
  if (!ejecutivo || !eidVista) {
    return (
      <div className="bs-boot">
        <div className="bs-boot-logo">🐑</div>
        <div className="bs-boot-bar"><span /></div>
        <p>Cargando tu perfil…</p>
      </div>
    )
  }

  const esGerente = !!ejecutivo.esSuperAdmin
  const ctxValue = {
    ...ejecutivo,
    zonaVista,
    eidVista,
    todosEjecutivos,
    cambiarZona,
  }

  return (
    <EjecutivoCtx.Provider value={ctxValue}>
      {esGerente && todosEjecutivos.length > 0 && (
        <ZonaSelector todos={todosEjecutivos} zonaVista={zonaVista} onChange={cambiarZona} />
      )}
      <AppShell>
      <div className="app-body">
      <div className="build-stamp">{BUILD_STAMP}{typeof window !== 'undefined' && window.__BS_TENANT__ ? ` · ${window.__BS_TENANT__.name}` : ''}</div>
        <Routes>
          <Route path="/" element={<Hoy />} />
          <Route path="/mapa" element={<Ruta session={session} />} />
          <Route path="/visita/:id" element={<Visita session={session} />} />
          <Route path="/cartera" element={<Cartera session={session} />} />
          <Route path="/metas" element={<Navigate to="/" replace />} />
          <Route path="/stock" element={<Stock session={session} />} />
          <Route path="/gerencia" element={<Gerencia session={session} esGerente={esGerente} />} />
          <Route path="/admin" element={esGerente ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      </AppShell>
      <NavBar
        esGerente={esGerente}
        onLogout={async () => {
          await supabase.auth.signOut()
          window.location.href = '/'
        }}
      />
    </EjecutivoCtx.Provider>
  )
}
