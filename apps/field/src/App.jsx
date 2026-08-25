import { useEffect, useState, createContext, useContext } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase, initSupabase, getActiveTenant } from './lib/supabase'
import { resolveTenant, applyTenantBrand } from './lib/tenants'
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
// V9.0 — domain components
import { ZonePicker } from './components/domain/ZonePicker.jsx'
import { syncHandlers } from './lib/syncHandlers.js'
import { SyncBanner } from './components/domain/SyncBanner.jsx'
import { applyZoneCssVars, zonesFromEjecutivos } from './lib/theme/zones.js'
import { runSyncFlush } from './lib/sync/engine.js'

// Visible en UI — si no lo ves en el teléfono, el deploy NO subió
export const BUILD_STAMP = 'v-BS-PLATFORM-V9.6-SYSTEM'

// ── Contexto global ──────────────────────────────────────────────────────
export const EjecutivoCtx = createContext(null)
export function useEjecutivo() {
  return useContext(EjecutivoCtx)
}

// Handlers reales para el sync engine — los mismos que usan Hoy/Visita
// SyncBanner los recibe para que "Reintentar" drene de verdad la outbox
// Handlers del outbox: fuente ÚNICA en lib/syncHandlers.js.
// Antes vivían duplicados acá, en Hoy.jsx y en SyncBanner, y estos
// devolvían undefined (falsy) → la cola NUNCA se drenaba.
const SYNC_HANDLERS = syncHandlers


export default function App() {
  const [session, setSession] = useState(undefined)
  const [ejecutivo, setEjecutivo] = useState(null)
  const [todosEjecutivos, setTodosEjecutivos] = useState([])
  const [zonaVista, setZonaVista] = useState(null)
  const [eidVista, setEidVista] = useState(null)

  useEffect(() => {
    const t = resolveTenant()
    if (t) {
      initSupabase(t)
      applyTenantBrand(t)  // aplica colores del tenant al DOM inmediatamente
    }
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
    applyZoneCssVars(zona) // V9.0 — colores de zona al DOM inmediatamente
  }

  if (window.location.pathname.startsWith('/catalogo/')) {
    return <Routes><Route path="/catalogo/:token" element={<CatalogoCliente />} /></Routes>
  }
  if (session === undefined) {
    return (
      <div className="bs-boot">
        <div className="bs-boot-logo-wrap">
          <img src="/brand/logo-mark-192.png" alt="Black Sheep" className="bs-boot-logo-img"
            onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}
          />
          <div className="bs-boot-logo-fb" style={{display:'none'}}>BS</div>
        </div>
        <p className="bs-boot-name">Black Sheep Field</p>
        <div className="bs-boot-bar"><span /></div>
        <p>Iniciando…</p>
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
        <div className="bs-boot-logo-wrap">
          <img src="/brand/logo-mark-192.png" alt="Black Sheep" className="bs-boot-logo-img"
            onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}
          />
          <div className="bs-boot-logo-fb" style={{display:'none'}}>BS</div>
        </div>
        <div className="bs-boot-bar"><span /></div>
        <p>Cargando tu perfil…</p>
      </div>
    )
  }

  const esGerente = !!ejecutivo.esSuperAdmin
  const zonasDisponibles = zonesFromEjecutivos(todosEjecutivos)
  const ctxValue = {
    ...ejecutivo,
    zonaVista,
    eidVista,
    todosEjecutivos,
    cambiarZona,
  }

  return (
    <EjecutivoCtx.Provider value={ctxValue}>
      {/* V9.0 — la zona vive en el saludo, no en una barra de pills.
          Con una sola zona no se muestra ningún control. */}
      <ZonePicker
        nombre={ejecutivo?.nombre}
        zonaActiva={zonaVista}
        zonas={esGerente ? zonasDisponibles : []}
        onChange={cambiarZona}
      />
      {/* V9.0 — SyncBanner con handlers reales (no banner mentiroso) */}
      <SyncBanner handlers={SYNC_HANDLERS} />
      <AppShell>
      <div className="app-body">
      <div className="build-stamp">{BUILD_STAMP}{typeof window !== 'undefined' && window.__BS_TENANT__ ? ` · ${window.__BS_TENANT__.name}` : ''}</div>
        <Routes>
          <Route path="/" element={<Hoy />} />
          <Route path="/mapa" element={<Ruta session={session} />} />
          <Route path="/visita/:id" element={<Visita session={session} />} />
          <Route path="/cartera" element={<Cartera session={session} />} />
          {/* Redirect legacy: pages/Metas.jsx se eliminó en V9.3.
              Su vista de focos vive ahora en Hoy (components/FocosMes.jsx). */}
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
