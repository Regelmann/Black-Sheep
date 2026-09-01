import { useEffect, useState, createContext, useContext } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase, initSupabase, getActiveTenant } from './lib/supabase.js'
import { resolveTenant, applyTenantBrand } from './lib/tenants.js'
/* ------------------------------------------------------------------
   CARGA POR RUTA
   Antes las 9 páginas viajaban en un solo archivo de 738 kB. Un
   vendedor descargaba Gerencia (2.300 líneas) y Admin (958) para
   abrir "Hoy", en 4G de terreno.

   CRITERIO — qué va directo y qué a demanda:
   · Directo: lo que se usa EN LA CALLE, sin señal garantizada.
     Login, Hoy, Ruta, Visita, Cartera. Si el vendedor entra a un
     subterráneo y la ruta no está descargada, no puede trabajar.
   · A demanda: lo que se abre desde una oficina con wifi.
     Gerencia, Admin, Stock, Catálogo.

   El catálogo público es su propio bundle: lo abre el CLIENTE, que no
   necesita descargar nada de la app del vendedor.
   ------------------------------------------------------------------ */
import { lazy, Suspense } from 'react'
import Login from './pages/Login.jsx'
import Hoy from './pages/Hoy.jsx'
import Ruta from './pages/Ruta.jsx'
import Visita from './pages/Visita.jsx'
import Cartera from './pages/Cartera.jsx'

const CatalogoCliente = lazy(() => import('./pages/CatalogoCliente.jsx'))
const Stock           = lazy(() => import('./pages/Stock.jsx'))
const Gerencia        = lazy(() => import('./pages/Gerencia.jsx'))
const DashboardGerencia = lazy(() => import('./pages/DashboardGerencia.jsx'))
const Admin           = lazy(() => import('./pages/Admin.jsx'))
const Ventas          = lazy(() => import('./pages/Ventas.jsx'))

/** Placeholder de carga. Nunca pantalla en blanco. */
function CargandoPagina() {
  return (
    <div className="bs-page-loading" role="status" aria-live="polite">
      <div className="bs-skel" style={{ height: 92 }} />
      <div className="bs-skel" style={{ height: 58 }} />
      <div className="bs-skel" style={{ height: 58 }} />
      <span className="bs-sr">Cargando…</span>
    </div>
  )
}
import { NavBar } from './components.jsx'
import { AppShell } from './shells/AppShell.jsx'
// V9.0 — domain components
import { AppHeader } from './chrome/AppHeader.jsx'
import { ErrorBoundary } from './chrome/ErrorBoundary.jsx'
import { BandejaAgotados } from './chrome/BandejaAgotados.jsx'
// Fuente ÚNICA del sello. Vive en su módulo para evitar el ciclo
// App → ErrorBoundary → App.
import { BUILD_STAMP } from './lib/buildStamp.js'
export { BUILD_STAMP }
import { syncHandlers } from './lib/syncHandlers.js'
import { SyncBanner } from './chrome/SyncBanner.jsx'
import { applyZoneCssVars, zonesFromEjecutivos } from './lib/theme/zones.js'
import { runSyncFlush } from './lib/sync/engine.js'

// Visible en UI — si no lo ves en el teléfono, el deploy NO subió

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
    return (
      <Suspense fallback={<CargandoPagina />}>
        <Routes><Route path="/catalogo/:token" element={<CatalogoCliente />} /></Routes>
      </Suspense>
    )
  }
  /* V13.0: /dashboard se abre en pestaña aparte (window.open, ver
     Gerencia.jsx) y por eso debe renderizar SOLO, sin AppHeader/AppShell/
     NavBar del terreno — es una pantalla de escritorio, no una vista más
     de la app móvil. Requiere sesión + esGerente, así que este chequeo va
     después de resolver sesión/ejecutivo, no antes como /catalogo/. */
  if (window.location.pathname === '/dashboard') {
    if (session === undefined || (session && (!ejecutivo || !eidVista))) {
      return (
        <div className="bs-boot">
          <div className="bs-boot-bar"><span /></div>
          <p>Cargando…</p>
        </div>
      )
    }
    if (!session) return <Navigate to="/" replace />
    const esGerenteDash = !!ejecutivo.esSuperAdmin
    if (!esGerenteDash) return <Navigate to="/" replace />
    return (
      <Suspense fallback={<CargandoPagina />}>
        <Routes><Route path="/dashboard" element={<DashboardGerencia />} /></Routes>
      </Suspense>
    )
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
      {/* ROOT FIX V9.7: sin barra de zona global.
          La zona vive dentro del hero de cada pantalla (ZoneChip). */}
      {/* V9.9: header ÚNICO. Antes había franja blanca + hero de página
          apilados (~180px sin una sola acción). El selector de zona es
          segmented control: 3 opciones se muestran, no se esconden. */}
      {/* Un solo saludo. Antes se pasaba `titulo` Y `nombre`, y el
          componente renderizaba los dos: "Hola, Se…" arriba y
          "Hola, Sebastian" abajo, con la zona en el medio. */}
      <AppHeader
        zonaActiva={zonaVista}
        zonas={esGerente ? zonasDisponibles : []}
        onZonaChange={cambiarZona}
        titulo={ejecutivo?.nombre ? `Hola, ${String(ejecutivo.nombre).split(' ')[0]}` : 'Black Sheep'}
      />
      <>
        <SyncBanner handlers={SYNC_HANDLERS} />
      <BandejaAgotados />
        <AppShell>
          <div className="app-body">
            <div className="build-stamp">
              {BUILD_STAMP}
              {typeof window !== 'undefined' && window.__BS_TENANT__ ? ` · ${window.__BS_TENANT__.name}` : ''}
            </div>
            {/* Suspense envuelve TODAS las rutas: las directas lo
                ignoran, las lazy muestran el esqueleto mientras baja
                su chunk. */}
            {/* Boundary por ruta, no una sola global: si Gerencia explota,
                el resto de la app sigue funcionando. `key` con la ruta hace
                que el boundary se resetee al navegar. */}
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
              {/* /dashboard YA NO es una ruta de este árbol: se resuelve
                  standalone más arriba (antes de AppHeader/AppShell/
                  NavBar) porque ahora se abre en pestaña aparte, no
                  navegado dentro de la SPA. Ver el chequeo de
                  window.location.pathname === '/dashboard' arriba. */}
              <Route path="/ventas" element={esGerente ? <Ventas /> : <Navigate to="/" replace />} />
              <Route path="/admin" element={esGerente ? <Admin /> : <Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </div>
        </AppShell>
        <NavBar
          esGerente={esGerente}
          onLogout={async () => {
            await supabase.auth.signOut()
            window.location.href = '/'
          }}
        />
      </>
    </EjecutivoCtx.Provider>
  )
}
