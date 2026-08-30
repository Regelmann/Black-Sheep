import { useEffect, useState, createContext, useContext } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase, initSupabase } from './lib/supabase.js'
import { resolveTenant, applyTenantBrand } from './lib/tenants.js'
import { lazy, Suspense } from 'react'
import Login from './pages/Login.jsx'
import Hoy from './pages/Hoy.jsx'
import Ruta from './pages/Ruta.jsx'
import Visita from './pages/Visita.jsx'
import Cartera from './pages/Cartera.jsx'

const CatalogoCliente = lazy(() => import('./pages/CatalogoCliente.jsx'))
const Stock = lazy(() => import('./pages/Stock.jsx'))
const Gerencia = lazy(() => import('./pages/Gerencia.jsx'))
const Admin = lazy(() => import('./pages/Admin.jsx'))
const ControlCenter = lazy(() => import('./control-center/ControlCenter.jsx'))
const Stock           = lazy(() => import('./pages/Stock.jsx'))
const Gerencia        = lazy(() => import('./pages/Gerencia.jsx'))
const DashboardGerencia = lazy(() => import('./pages/DashboardGerencia.jsx'))
const Admin           = lazy(() => import('./pages/Admin.jsx'))
e3a7697 (V12.5: gerencia opera desde el dashboard)

function CargandoPagina() {
  return <div className="bs-page-loading" role="status" aria-live="polite"><div className="bs-skel" style={{ height: 92 }} /><div className="bs-skel" style={{ height: 58 }} /><span className="bs-sr">Cargando…</span></div>
}
import { NavBar } from './components.jsx'
import { AppShell } from './shells/AppShell.jsx'
import { AppHeader } from './chrome/AppHeader.jsx'
import { ErrorBoundary } from './chrome/ErrorBoundary.jsx'
import { BandejaAgotados } from './chrome/BandejaAgotados.jsx'
import { BUILD_STAMP } from './lib/buildStamp.js'
export { BUILD_STAMP }
import { syncHandlers } from './lib/syncHandlers.js'
import { SyncBanner } from './chrome/SyncBanner.jsx'
import { applyZoneCssVars, zonesFromEjecutivos } from './lib/theme/zones.js'

export const EjecutivoCtx = createContext(null)
export function useEjecutivo() { return useContext(EjecutivoCtx) }
const SYNC_HANDLERS = syncHandlers

export default function App() {
  const [session, setSession] = useState(undefined)
  const [ejecutivo, setEjecutivo] = useState(null)
  const [todosEjecutivos, setTodosEjecutivos] = useState([])
  const [zonaVista, setZonaVista] = useState(null)
  const [eidVista, setEidVista] = useState(null)

  useEffect(() => {
    const t = resolveTenant()
    if (t) { initSupabase(t); applyTenantBrand(t) }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setEjecutivo(null); return }
    supabase.from('ejecutivos').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => {
      if (!data) { setEjecutivo({ id: session.user.id, nombre: session.user.email || '', zona: '', rol: 'ejecutivo', esSuperAdmin: false }); return }
      const rol = (data.rol || 'ejecutivo').toLowerCase()
      setEjecutivo({ id: data.id, nombre: data.nombre || '', zona: data.zona || '', rol, esSuperAdmin: rol === 'superadmin' || rol === 'gerente' || rol === 'admin' })
    })
  }, [session])

  useEffect(() => {
    if (!ejecutivo) return
    if (ejecutivo.esSuperAdmin) {
      supabase.from('ejecutivos').select('id,nombre,zona,rol').not('zona', 'is', null).then(({ data }) => {
        const lista = (data || []).filter(e => e.zona && String(e.zona).trim())
        const orden = ['NOR-ORIENTE', 'NOR-PONIENTE', 'ZONA SUR']
        lista.sort((a, b) => { const ia = orden.indexOf(a.zona), ib = orden.indexOf(b.zona); if (ia < 0 && ib < 0) return String(a.zona).localeCompare(String(b.zona)); if (ia < 0) return 1; if (ib < 0) return -1; return ia - ib })
        setTodosEjecutivos(lista)
        const propia = lista.find(e => e.zona === ejecutivo.zona) || lista.find(e => e.id === ejecutivo.id) || lista[0]
        if (propia) { setZonaVista(propia.zona); setEidVista(propia.id) } else { setZonaVista(ejecutivo.zona || null); setEidVista(ejecutivo.id) }
      })
    } else { setTodosEjecutivos([]); setZonaVista(ejecutivo.zona || null); setEidVista(ejecutivo.id) }
  }, [ejecutivo])

  function cambiarZona(zona) {
    const ej = todosEjecutivos.find(e => e.zona === zona)
    if (!ej) return
    setZonaVista(zona); setEidVista(ej.id); applyZoneCssVars(zona)
  }

  if (window.location.pathname.startsWith('/catalogo/')) return <Suspense fallback={<CargandoPagina />}><Routes><Route path="/catalogo/:token" element={<CatalogoCliente />} /></Routes></Suspense>
  if (session === undefined) return <div className="bs-boot"><div className="bs-boot-logo-wrap"><img src="/brand/logo-mark-192.png" alt="Black Sheep" className="bs-boot-logo-img" /></div><p className="bs-boot-name">Black Sheep</p><p>Iniciando…</p></div>
  if (!session) return <Routes><Route path="*" element={<Login />} /></Routes>
  if (!ejecutivo || !eidVista) return <div className="bs-boot"><p>Cargando tu perfil…</p></div>

  const esGerente = !!ejecutivo.esSuperAdmin
  const zonasDisponibles = zonesFromEjecutivos(todosEjecutivos)
  const ctxValue = { ...ejecutivo, zonaVista, eidVista, todosEjecutivos, cambiarZona }

  return <EjecutivoCtx.Provider value={ctxValue}>
    <AppHeader zonaActiva={zonaVista} zonas={esGerente ? zonasDisponibles : []} onZonaChange={cambiarZona} titulo={ejecutivo?.nombre ? `Hola, ${String(ejecutivo.nombre).split(' ')[0]}` : 'Black Sheep'} />
    <SyncBanner handlers={SYNC_HANDLERS} />
    <BandejaAgotados />
    <AppShell>
      <div className="app-body">
        <div className="build-stamp">{BUILD_STAMP}{typeof window !== 'undefined' && window.__BS_TENANT__ ? ` · ${window.__BS_TENANT__.name}` : ''}</div>
        <ErrorBoundary stamp={BUILD_STAMP} zona={window.location.pathname}>
          <Suspense fallback={<CargandoPagina />}>
            <Routes>
              <Route path="/" element={<Hoy />} />
              <Route path="/mapa" element={<Ruta session={session} />} />
              <Route path="/visita/:id" element={<Visita session={session} />} />
              <Route path="/cartera" element={<Cartera session={session} />} />
              <Route path="/metas" element={<Navigate to="/" replace />} />
              <Route path="/stock" element={<Stock session={session} />} />
              <Route path="/gerencia" element={<Gerencia session={session} esGerente={esGerente} />} />
<<<<<<< HEAD
              <Route path="/dashboard" element={<Navigate to="/control-center" replace />} />
              <Route path="/control-center" element={esGerente ? <ControlCenter /> : <Navigate to="/" replace />} />
=======
              {/* /dashboard es el nombre que usa la web y el que la gente
                  escribe. El dashboard SIEMPRE existió: es /gerencia. No
                  había que construirlo, había que hacerlo alcanzable. */}
              {/* Dashboard de GERENCIA para pantalla grande: todo el
                  negocio por canal (KAM, Televenta, Corporativo y las 3
                  zonas). NO es /gerencia, que es la vista móvil de
                  terreno — se confundieron desde el principio. */}
              <Route path="/dashboard" element={esGerente ? <DashboardGerencia /> : <Navigate to="/" replace />} />
>>>>>>> e3a7697 (V12.5: gerencia opera desde el dashboard)
              <Route path="/admin" element={esGerente ? <Admin /> : <Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
    </AppShell>
    <NavBar esGerente={esGerente} onLogout={async () => { await supabase.auth.signOut(); window.location.href = '/' }} />
  </EjecutivoCtx.Provider>
}
