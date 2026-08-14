import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEjecutivo } from '../App.jsx'
import { watchPosition, getPositionPrecise, haversineM, geoErrorMessage } from '../lib/geo'
import { ordenarPorDistancia } from '../lib/coach'
import { money } from '../components.jsx'
import PedidoSheet from '../components/PedidoSheet.jsx'
import MisPedidosHoy from '../components/MisPedidosHoy.jsx'

function saludoHora() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}


const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
let mapsPromise = null
let mapsPromiseKey = null  // clave para detectar si hay que reiniciar

function loadMaps(forceReset = false) {
  if (forceReset) {
    mapsPromise = null
  }
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (mapsPromise) return mapsPromise
  if (!KEY) return Promise.reject(new Error('NO_KEY'))
  mapsPromise = new Promise((resolve, reject) => {
    if (document.querySelector('script[data-gmaps="1"]')) {
      const t = setInterval(() => {
        if (window.google?.maps) {
          clearInterval(t)
          resolve(window.google.maps)
        }
      }, 50)
      return
    }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&v=weekly`
    s.async = true
    s.dataset.gmaps = '1'
    s.onload = () => resolve(window.google.maps)
    s.onerror = reject
    document.head.appendChild(s)
  })
  return mapsPromise
}

const limpiaEstado = e => String(e || '').replace(/^\d+_?/, '').replace(/_/g, ' ')
const limpiaOferta = t => String(t || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()

// RM ampliada: incluye Maipú, San Bernardo, Puente Alto, Colina
const BOUNDS = { latMin: -33.85, latMax: -33.10, lngMin: -71.05, lngMax: -70.30 }
function inSantiago(lat, lng) {
  const la = Number(lat),
    lo = Number(lng)
  return !isNaN(la) && !isNaN(lo) && la >= BOUNDS.latMin && la <= BOUNDS.latMax && lo >= BOUNDS.lngMin && lo <= BOUNDS.lngMax
}

function ymd(d) {
  const x = d instanceof Date ? d : new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return ymd(dt)
}
function labelFecha(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

const HOY = ymd(new Date())
const CENTER = { lat: -33.39, lng: -70.57 }

/** Opciones de fecha: -7 … +14 */
function buildFechas() {
  const out = []
  for (let i = -7; i <= 14; i++) {
    const f = addDays(HOY, i)
    let tag = labelFecha(f)
    if (f === HOY) tag = `Hoy · ${tag}`
    else if (i === 1) tag = `Mañana · ${tag}`
    else if (i === -1) tag = `Ayer · ${tag}`
    out.push({ value: f, label: tag })
  }
  return out
}
const FECHAS = buildFechas()

function pinColor(item) {
  if (item._tipo === 'ruta') return '#1e3a8a'
  if (item._tipo === 'prospecto') return '#16a34a'
  if (item.es_bloqueado) return '#94a3b8'
  const e = (item.estado_fuga || '').toUpperCase()
  if (e.includes('ACTIV')) return '#2563eb'
  if (e.includes('ENFRIANDO') || e.includes('RIESGO')) return '#f59e0b'
  if (e.includes('DORMIDO') || e.includes('FUGADO') || e.includes('NUNCA')) return '#ef4444'
  return '#64748b'
}

function pinSvg(color, label) {
  const esc = label != null && label !== '' ? String(label).substring(0, 2) : ''
  const text = esc
    ? `<text x="12" y="14" text-anchor="middle" fill="#fff" font-size="9" font-weight="800">${esc}</text>`
    : `<circle cx="12" cy="11" r="3.5" fill="#fff"/>`
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32"><path d="M12 0C6 0 1 5 1 11c0 8 11 21 11 21s11-13 11-21C23 5 18 0 12 0z" fill="${color}"/>${text}</svg>`
  )}`
}

const FILTROS = [
  { id: 'ruta', label: 'Ruta', color: '#1e3a8a' },
  { id: 'riesgo', label: 'En riesgo', color: '#f59e0b' },
  { id: 'activo', label: 'Activos', color: '#c2410c' },
  { id: 'recuperar', label: 'Recuperar', color: '#ef4444' },
  { id: 'prospecto', label: 'Prospectos', color: '#16a34a' },
]

export default function Ruta({ session }) {
  const nav = useNavigate()
  const eje = useEjecutivo()
  const uid = eje?.eidVista || session.user.id

  const [fecha, setFecha] = useState(HOY)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [ruta, setRuta] = useState(null)
  const [visitas, setVisitas] = useState([])
  const [territorio, setTerritorio] = useState([])
  const [activos, setActivos] = useState(() => new Set(['ruta', 'riesgo', 'activo', 'recuperar', 'prospecto']))
  const [selected, setSelected] = useState(null)
  const [mapQ, setMapQ] = useState('')
  const [pedidoFromMap, setPedidoFromMap] = useState(null)
  const [notaFromMap, setNotaFromMap] = useState(null)
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [listaOpen, setListaOpen] = useState(true)
  const [myPos, setMyPos] = useState(null) // {lat,lng,accuracy}
  const [gpsBusy, setGpsBusy] = useState(false)
  const [radioKm, setRadioKm] = useState(1) // 1 | 3 | 5 cerca de mí

  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef([])
  const meMarkerRef = useRef(null)
  const meAccRef = useRef(null)
  const fittedFecha = useRef(null) // fecha para la que ya hicimos fitBounds


  const cercanos = (() => {
    if (!myPos?.lat || !myPos?.lng) return []
    const maxM = radioKm * 1000
    const out = []
    for (const item of territorio) {
      const lat = Number(item.lat)
      const lng = Number(item.lng)
      if (isNaN(lat) || isNaN(lng)) continue
      const d = haversineM(myPos.lat, myPos.lng, lat, lng)
      if (d <= maxM) out.push({ ...item, _distM: d })
    }
    out.sort((a, b) => a._distM - b._distM)
    return out.slice(0, 40)
  })()

  function tip(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function forzarGps() {
    if (gpsBusy) return
    setGpsBusy(true)
    tip('Buscando ubicación… aceptá el permiso si el celular lo pide')
    try {
      const pos = await getPositionPrecise({ targetAccM: 80, maxWaitMs: 28000 })
      if (pos?.lat != null && pos?.lng != null) {
        setMyPos({ ...pos, pending: false })
        const acc = pos.accuracy != null ? Math.round(pos.accuracy) : null
        tip(acc != null && acc > 150
          ? `Ubicación ±${acc} m (aproximada). Mejor al aire libre`
          : `GPS OK${acc != null ? ` ±${acc} m` : ''}`)
        // Centrar mapa en el usuario
        try {
          if (mapInstance.current && window.google?.maps) {
            mapInstance.current.panTo({ lat: Number(pos.lat), lng: Number(pos.lng) })
            const z = mapInstance.current.getZoom?.() || 12
            if (z < 14) mapInstance.current.setZoom(15)
          }
        } catch (_) {}
      } else {
        tip(geoErrorMessage(pos?.error || 'unavailable'))
      }
    } finally {
      setGpsBusy(false)
    }
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setSelected(null)
    // Resetear estado del mapa para forzar reinit limpio al cambiar zona
    setMapReady(false)
    fittedFecha.current = null
    try {
      let { data: rutas, error: er } = await supabase
        .from('rutas')
        .select('*')
        .eq('ejecutivo_id', uid)
        .eq('fecha', fecha)
        .order('created_at', { ascending: false })
        .limit(1)
      if (er) console.warn('rutas', er.message)
      let r = rutas?.[0] || null
      if (!r) {
        const { data: r2 } = await supabase.from('rutas').select('*').eq('fecha', fecha).limit(5)
        r = (r2 || []).find(x => !x.ejecutivo_id || x.ejecutivo_id === uid) || null
      }
      setRuta(r)

      let vis = []
      if (r?.id) {
        const { data: v, error: ev } = await supabase
          .from('visitas')
          .select('*')
          .eq('ruta_id', r.id)
          .order('orden')
        if (ev) console.warn('visitas', ev.message)
        vis = v || []
      }
      setVisitas(vis)

      const enRutaKeys = new Set(
        vis.map(v => String(v.punto_id_bq || v.cliente_key || '')).filter(Boolean)
      )
      const items = []

      vis.forEach(v => {
        if (v.lat != null && v.lng != null && inSantiago(v.lat, v.lng)) {
          items.push({
            ...v,
            _tipo: 'ruta',
            _id: 'r_' + v.id,
            _label: String(v.orden),
            nombre_cliente: v.nombre_local || v.nombre_cliente,
            _enRuta: true,
          })
        }
      })

      // Solo columnas necesarias (más rápido + menos payload)
      const { data: cart, error: ec } = await supabase
        .from('cartera')
        .select(
          'cliente_key,nombre_cliente,comuna,direccion,lat,lng,estado_fuga,estado_texto,oferta_real,productos_top,telefono,link_whatsapp,venta_mensual,venta_mtd,dias_sin_comprar,sku_detalle,fecha_snapshot'
        )
        .eq('ejecutivo_id', uid)
      if (ec) {
        console.warn('cartera', ec.message)
        setLoadError('Cartera: ' + ec.message)
      }
      let nGeo = 0
      ;(cart || []).forEach(c => {
        if (c.lat == null || c.lng == null || !inSantiago(c.lat, c.lng)) return
        nGeo++
        const key = String(c.cliente_key || '')
        if (enRutaKeys.has(key)) return
        items.push({
          ...c,
          _tipo: 'cliente',
          _id: 'c_' + key,
          _enRuta: false,
        })
      })

      const zonaNom = eje?.zonaVista || eje?.zona || ''
      let pros = null
      let ep = null
      // 1) por ejecutivo_id
      {
        const r1 = await supabase
          .from('prospectos')
          .select('cliente_key,nombre_cliente,comuna,direccion,lat,lng,score,potencial,oferta,segmento,estado,ejecutivo_id,zona')
          .eq('ejecutivo_id', uid)
          .limit(1500)
        ep = r1.error
        pros = r1.data
      }
      // 2) si 0 filas, por zona (Places guarda zona; RLS a veces bloquea eid ajeno)
      if ((!pros || !pros.length) && zonaNom) {
        const r2 = await supabase
          .from('prospectos')
          .select('cliente_key,nombre_cliente,comuna,direccion,lat,lng,score,potencial,oferta,segmento,estado,ejecutivo_id,zona')
          .eq('zona', zonaNom)
          .limit(1500)
        if (!r2.error && r2.data?.length) {
          pros = r2.data
          ep = null
          console.log('prospectos por zona', zonaNom, pros.length)
        } else if (r2.error) {
          console.warn('prospectos zona', r2.error.message)
        }
      }
      if (ep) console.warn('prospectos', ep.message)
      let nPros = 0, nSkipGeo = 0
      ;(pros || []).forEach(p => {
        if (p.lat == null || p.lng == null) { nSkipGeo++; return }
        if (!inSantiago(p.lat, p.lng)) { nSkipGeo++; return }
        const key = String(p.cliente_key || p.nombre_cliente || '')
        if (!key || enRutaKeys.has(key)) return
        nPros++
        items.push({
          ...p,
          _tipo: 'prospecto',
          _id: 'p_' + key,
          nombre_cliente: p.nombre_cliente || key,
          oferta_real: p.oferta || null,
          score_prioridad: p.score,
          _enRuta: false,
        })
      })
      console.log('prospectos cargados', nPros, 'skip geo', nSkipGeo, 'uid', uid, 'zona', zonaNom)

      setTerritorio(items)
      if ((cart || []).length > 0 && nGeo === 0) {
        setLoadError(
          `Tu cartera tiene ${(cart || []).length} clientes pero ninguno con coordenadas en RM. Corré KEYFOODS_FIELD_BAJADA_v8.4 o KEYFOODS_GEO_CARTERA_3ZONAS en Colab.`
        )
      }
    } catch (e) {
      console.error(e)
      setLoadError(String(e.message || e))
      setTerritorio([])
      setVisitas([])
    } finally {
      fittedFecha.current = null
      setLoading(false)
    }
  }, [uid, fecha])

  useEffect(() => {
    cargar()
  }, [cargar])

  const visible = useMemo(() => {
    return territorio.filter(item => {
      if (item._tipo === 'ruta' && activos.has('ruta')) return true
      if (item._tipo === 'prospecto' && activos.has('prospecto')) return true
      if (item._tipo === 'cliente') {
        const e = (item.estado_fuga || '').toUpperCase()
        if (activos.has('activo') && e.includes('ACTIV')) return true
        if (activos.has('riesgo') && (e.includes('ENFRIANDO') || e.includes('RIESGO'))) return true
        if (
          activos.has('recuperar') &&
          (e.includes('DORMIDO') || e.includes('FUGADO') || e.includes('NUNCA'))
        )
          return true
      }
      return false
    })
  }, [territorio, activos])

  const counts = useMemo(() => {
    const c = { ruta: 0, activo: 0, riesgo: 0, recuperar: 0, prospecto: 0 }
    territorio.forEach(item => {
      if (item._tipo === 'ruta') c.ruta++
      else if (item._tipo === 'prospecto') c.prospecto++
      else {
        const e = (item.estado_fuga || '').toUpperCase()
        if (e.includes('ACTIV')) c.activo++
        else if (e.includes('ENFRIANDO') || e.includes('RIESGO')) c.riesgo++
        else if (e.includes('DORMIDO') || e.includes('FUGADO') || e.includes('NUNCA')) c.recuperar++
      }
    })
    return c
  }, [territorio])


  async function optimizarOrdenRuta() {
    if (!visitas.length || busy) return
    setBusy(true)
    try {
      const origin = myPos?.lat != null ? myPos : null
      const ordered = ordenarPorDistancia(visitas, origin)
      // Persist new orden
      for (let i = 0; i < ordered.length; i++) {
        const v = ordered[i]
        if (!v.id) continue
        const nuevo = i + 1
        if (Number(v.orden) === nuevo) continue
        await supabase.from('visitas').update({ orden: nuevo }).eq('id', v.id)
      }
      tip('Ruta optimizada por distancia')
      if (ruta?.id) await recargarVisitas(ruta.id)
      else await cargar()
    } finally {
      setBusy(false)
    }
  }


  // Init mapa: recrear cuando cambia uid (zona) o cuando termina loading
  useEffect(() => {
    if (loading) return
    let cancelled = false
    ;(async () => {
      if (!mapRef.current) return
      try {
        const maps = await loadMaps()
        if (cancelled || !mapRef.current) return

        // Siempre destruir marcadores anteriores al reiniciar
        markersRef.current.forEach(m => { try { m.setMap(null) } catch {} })
        markersRef.current = []
        if (meMarkerRef.current) {
          try { meMarkerRef.current.setMap(null) } catch {}
          meMarkerRef.current = null
        }

        // Crear mapa nuevo — siempre recrear si el div cambió o no hay instancia
        const divConectado = mapInstance.current?.getDiv?.()
        const needNew = !mapInstance.current || !divConectado || !mapRef.current.contains(divConectado)

        if (needNew) {
          mapInstance.current = new maps.Map(mapRef.current, {
            zoom: 12,
            center: CENTER,
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: 'greedy',
            clickableIcons: false,
            styles: [
              { featureType: 'poi', stylers: [{ visibility: 'off' }] },
              { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            ],
          })
          fittedFecha.current = null
        } else {
          try { maps.event.trigger(mapInstance.current, 'resize') } catch {}
        }
        setMapReady(true)
      } catch {
        setMapReady(false)
      }
    })()
    return () => { cancelled = true }
  }, [loading, uid])

  // GPS en vivo: punto azul que sigue al ejecutivo
  useEffect(() => {
    const stop = watchPosition(pos => {
      // Solo fijar punto si hay coords reales (no lecturas coarse pendientes)
      if (pos?.lat != null && pos?.lng != null && !pos.pending) {
        setMyPos(pos)
      } else if (pos?.pending || pos?.error === 'coarse') {
        // Mantener null coords pero guardar accuracy para el chip
        setMyPos(prev => prev?.lat != null ? prev : { lat: null, lng: null, accuracy: pos.accuracy, pending: true })
      }
    }, { enableHighAccuracy: true, acceptAccM: 250, hardRejectM: 2500, minMoveM: 8 })
    return () => { try { stop() } catch {} }
  }, [])

  // Actualizar marcador "yo" sin tocar fitBounds de la ruta
  useEffect(() => {
    if (!mapReady || !mapInstance.current || !window.google?.maps || !myPos?.lat) return
    const maps = window.google.maps
    const pos = { lat: Number(myPos.lat), lng: Number(myPos.lng) }
    if (isNaN(pos.lat) || isNaN(pos.lng)) return
    // No dibujar si accuracy sigue siendo mala
    if (myPos.accuracy != null && myPos.accuracy > 1200) return

    if (!meMarkerRef.current) {
      meMarkerRef.current = new maps.Marker({
        position: pos,
        map: mapInstance.current,
        zIndex: 999,
        title: 'Tu ubicación',
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#c2410c',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
      })
      meAccRef.current = new maps.Circle({
        map: mapInstance.current,
        center: pos,
        radius: Math.min(Number(myPos.accuracy) || 40, 80),
        fillColor: '#fb923c',
        fillOpacity: 0.15,
        strokeColor: '#c2410c',
        strokeOpacity: 0.4,
        strokeWeight: 1,
        zIndex: 998,
      })
    } else {
      meMarkerRef.current.setPosition(pos)
      if (meAccRef.current) {
        meAccRef.current.setCenter(pos)
        meAccRef.current.setRadius(Math.min(Number(myPos.accuracy) || 40, 80))
      }
    }
  }, [mapReady, myPos])

  // Markers: siempre redibuja cuando hay mapa + visible
  useEffect(() => {
    if (!mapReady || !mapInstance.current || !window.google?.maps) return
    const maps = window.google.maps

    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    if (!visible.length) return

    const bounds = new maps.LatLngBounds()
    visible.forEach(item => {
      const pos = { lat: Number(item.lat), lng: Number(item.lng) }
      bounds.extend(pos)
      const isRuta = item._tipo === 'ruta'
      const marker = new maps.Marker({
        position: pos,
        map: mapInstance.current,
        icon: {
          url: pinSvg(pinColor(item), isRuta ? item._label : null),
          scaledSize: new maps.Size(isRuta ? 28 : 20, isRuta ? 36 : 26),
          anchor: new maps.Point(isRuta ? 14 : 10, isRuta ? 36 : 26),
        },
        zIndex: isRuta ? 120 : item._tipo === 'cliente' ? 50 : 20,
        title: item.nombre_cliente || '',
        optimized: false,
      })
      marker.addListener('click', () => {
        try {
          setSelected({
            ...item,
            lat: Number(item.lat),
            lng: Number(item.lng),
            nombre_cliente: item.nombre_cliente || item.nombre_local || item.nombre || 'Sin nombre',
            oferta_real: item.oferta_real || item.oferta || null,
            productos_top: item.productos_top || null,
          })
        } catch (err) {
          console.error('pin click', err)
          tip('No se pudo abrir este pin')
        }
      })
      markersRef.current.push(marker)
    })

    // fitBounds UNA sola vez por fecha+zona (evita zoom in/out al redibujar pines)
    const fitKey = fecha + '|' + uid
    if (fittedFecha.current !== fitKey && visible.length) {
      fittedFecha.current = fitKey
      try {
        maps.event.trigger(mapInstance.current, 'resize')
        // maxZoom/minZoom en el fit evita el rebote post-idle
        mapInstance.current.fitBounds(bounds, {
          top: 40, right: 40, bottom: 40, left: 40,
        })
        // Limitar zoom sin listener idle (sin animación extra)
        const z = mapInstance.current.getZoom()
        if (typeof z === 'number') {
          if (z > 14) mapInstance.current.setZoom(14)
          if (z < 11) mapInstance.current.setZoom(11)
        }
      } catch {
        /* ignore */
      }
    }
  }, [mapReady, visible, fecha, uid])

  /** Recarga SOLO visitas + actualiza los pines de ruta en territorio (1 query liviana) */
  const recargarVisitas = useCallback(async (rutaId) => {
    const rid = rutaId || ruta?.id
    if (!rid) return
    const { data: v } = await supabase
      .from('visitas')
      .select('*')
      .eq('ruta_id', rid)
      .order('orden')
    const vis = v || []
    setVisitas(vis)

    // Actualizar solo los items tipo "ruta" en territorio sin tocar clientes/prospectos
    const enRutaKeys = new Set(vis.map(x => String(x.punto_id_bq || x.cliente_key || '')).filter(Boolean))
    setTerritorio(prev => {
      // Quitar ruta items viejos, agregar los nuevos
      const sinRuta = prev.filter(t => t._tipo !== 'ruta')
      const nuevosRuta = vis
        .filter(x => x.lat != null && x.lng != null && inSantiago(x.lat, x.lng))
        .map(x => ({
          ...x,
          _tipo: 'ruta',
          _id: 'r_' + x.id,
          _label: String(x.orden),
          nombre_cliente: x.nombre_local || x.nombre_cliente,
          _enRuta: true,
        }))
      // Marcar clientes que ya están en ruta para no duplicar pines
      const filtrado = sinRuta.filter(t => {
        const key = String(t.cliente_key || '')
        return !key || !enRutaKeys.has(key)
      })
      return [...nuevosRuta, ...filtrado]
    })
  }, [ruta?.id])

  async function ensureRuta() {
    if (ruta?.id) return ruta.id
    // 1) Intentar con el ejecutivo de la zona vista (eidVista)
    let { data: nr, error } = await supabase
      .from('rutas')
      .insert({ ejecutivo_id: uid, fecha, estado: 'pendiente' })
      .select()
      .maybeSingle()

    // 2) Si RLS bloquea (superadmin viendo otra zona), crear bajo el usuario logueado
    if ((error || !nr) && session?.user?.id && session.user.id !== uid) {
      const r2 = await supabase
        .from('rutas')
        .insert({ ejecutivo_id: session.user.id, fecha, estado: 'pendiente' })
        .select()
        .maybeSingle()
      if (!r2.error && r2.data) {
        nr = r2.data
        error = null
        tip('Ruta bajo tu usuario (la zona no permite crear por RLS)')
      } else {
        error = r2.error || error
      }
    }

    if (error || !nr) {
      const detail = error?.message || error?.code || 'sin detalle'
      console.warn('ensureRuta', error)
      tip('No se pudo crear la ruta: ' + String(detail).slice(0, 80))
      return null
    }
    setRuta(nr)
    return nr.id
  }

  async function agregarARuta(item) {
    if (busy) return
    setBusy(true)
    try {
      const rid = await ensureRuta()
      if (!rid) return
      const maxOrden = visitas.reduce((m, v) => Math.max(m, Number(v.orden) || 0), 0)
      const { error } = await supabase.from('visitas').insert({
        ruta_id: rid,
        orden: maxOrden + 1,
        punto_id_bq: item.cliente_key || String(item.id),
        nombre_local: item.nombre_cliente || item.nombre_local || 'Parada',
        direccion: item.direccion || item.comuna,
        comuna: item.comuna,
        lat: item.lat,
        lng: item.lng,
        segmento: item._tipo === 'prospecto' ? 'PROSPECTO' : limpiaEstado(item.estado_fuga),
        oferta: limpiaOferta(item.oferta_real || item.oferta || item.productos_top),
        potencial: Number(item.venta_mensual || item.potencial) || 0,
        estado: 'pendiente',
      })
      if (error) {
        console.warn('agregar visita', error)
        tip('Error al agregar: ' + String(error.message || error.code || '').slice(0, 70))
        return
      }
      tip('Sumado a la ruta')
      setSelected(null)
      setListaOpen(true)
      await recargarVisitas(rid)
    } finally {
      setBusy(false)
    }
  }

  async function quitarDeRuta(visitaId) {
    if (busy) return
    setBusy(true)
    try {
      await supabase.from('visitas').delete().eq('id', visitaId)
      tip('Quitado de la ruta')
      setSelected(null)
      await recargarVisitas()
    } finally {
      setBusy(false)
    }
  }


  const searchHits = useMemo(() => {
    const q = mapQ.trim().toLowerCase()
    if (!q || q.length < 2) return []
    return territorio
      .filter(item => {
        const nom = String(item.nombre_cliente || item.nombre_local || '').toLowerCase()
        const com = String(item.comuna || '').toLowerCase()
        const dir = String(item.direccion || '').toLowerCase()
        const key = String(item.cliente_key || item.punto_id_bq || '').toLowerCase()
        return nom.includes(q) || com.includes(q) || dir.includes(q) || key.includes(q)
      })
      .slice(0, 15)
  }, [mapQ, territorio])

  function irABusqueda(item) {
    setMapQ('')
    setSelected(item)
    if (mapInstance.current && item.lat != null && item.lng != null && window.google?.maps) {
      mapInstance.current.panTo({ lat: Number(item.lat), lng: Number(item.lng) })
      mapInstance.current.setZoom(16)
    }
  }

    function toggleFiltro(id) {
    setActivos(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const linkNavegar =
    visitas.filter(v => v.lat != null && v.lng != null).length >= 1
      ? 'https://www.google.com/maps/dir/' +
        visitas
          .filter(v => v.lat != null)
          .map(v => `${v.lat},${v.lng}`)
          .join('/')
      : null

  return (
    <div style={{ paddingBottom: 72 }}>
      {loadError && (
        <div
          style={{
            margin: '12px 16px',
            padding: 12,
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: 12,
            fontSize: 13,
            color: '#92400e',
          }}
        >
          {loadError}
        </div>
      )}
      <div
        style={{
          background: 'linear-gradient(145deg, #1c1917 0%, #292524 70%, #44403c 100%)',
          color: '#fff',
          padding: '24px 18px 26px',
          borderRadius: '0 0 22px 22px',
          boxShadow: '0 8px 24px rgba(28,25,23,0.25)',
          borderBottom: '3px solid #c2410c',
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#fdba74',
            marginBottom: 6,
          }}
        >
          {saludoHora()}
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.3px' }}>
          Tu ruta de hoy
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
          {loading
            ? 'Cargando territorio…'
            : `${visitas.length} paradas · ${territorio.filter(x => x._tipo === 'cliente').length} clientes · ${territorio.filter(x => x._tipo === 'prospecto').length} prospectos`}
        </p>
      </div>
      {!loading && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
            padding: '14px 16px 0',
          }}
        >
          {[
            { val: visitas.length, lbl: 'Paradas' },
            { val: territorio.filter(x => x._tipo === 'cliente').length, lbl: 'Clientes' },
            { val: territorio.filter(x => x._tipo === 'prospecto').length, lbl: 'Prospectos' },
          ].map(m => (
            <div
              key={m.lbl}
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: '14px 8px',
                textAlign: 'center',
                boxShadow: '0 2px 10px rgba(15,23,42,0.06)',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {m.val}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#94a3b8',
                  marginTop: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >
                {m.lbl}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div style={{ padding: '14px 16px 0' }}>
          <MisPedidosHoy ejecutivoId={uid} />
        </div>
      )}

      {/* Cerca de mí — estilo Spotio / oportunidades por distancia */}
      {!loading && (
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Cerca de mí</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {myPos?.lat
                  ? `Oportunidades a ≤${radioKm} km · ${cercanos.length} puntos`
                  : 'Activá GPS para ordenar por cercanía'}
              </div>
            </div>
            <button
              type="button"
              onClick={forzarGps}
              disabled={gpsBusy}
              style={{
                border: '1.5px solid #e2e8f0', borderRadius: 999, padding: '8px 12px',
                background: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {gpsBusy ? '…' : '📍 GPS'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {[1, 3, 5].map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setRadioKm(k)}
                style={{
                  borderRadius: 999, padding: '8px 14px', fontWeight: 800, fontSize: 13,
                  border: radioKm === k ? 'none' : '1.5px solid #e2e8f0',
                  background: radioKm === k ? '#c2410c' : '#fff',
                  color: radioKm === k ? '#fff' : '#334155',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {k} km
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflow: 'auto' }}>
            {myPos?.lat && cercanos.length === 0 && (
              <div style={{ padding: 14, background: '#f8fafc', borderRadius: 14, fontSize: 13, color: '#64748b' }}>
                No hay clientes/prospectos con geo en este radio. Subí el radio o revisá coordenadas.
              </div>
            )}
            {cercanos.map((item, i) => {
              const dist =
                item._distM < 1000
                  ? `${Math.round(item._distM)} m`
                  : `${(item._distM / 1000).toFixed(1)} km`
              const esPros = item._tipo === 'prospecto'
              return (
                <button
                  key={(item.cliente_key || item.place_id || item.id || i) + dist}
                  type="button"
                  onClick={() => setSelected(item)}
                  style={{
                    textAlign: 'left', border: '1px solid #e2e8f0', borderRadius: 14,
                    padding: '12px 14px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
                      {item.nombre_cliente || item.nombre || '—'}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#c2410c', whiteSpace: 'nowrap' }}>
                      {dist}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {esPros ? 'Prospecto' : (item.comuna || 'Cliente')}
                    {item.oferta_real || item.oferta ? ` · ${String(item.oferta_real || item.oferta).slice(0, 60)}` : ''}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Selector de día — desplegable */}
      <div style={{ padding: '12px 16px 0' }}>
        <label
          style={{
            display: 'block',
            fontSize: 10,
            fontWeight: 700,
            color: '#64748b',
            letterSpacing: '.04em',
            marginBottom: 4,
          }}
        >
          DÍA DE LA RUTA
        </label>
        <select
          value={fecha}
          onChange={e => setFecha(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 12,
            border: '1.5px solid #e2e8f0',
            fontFamily: 'var(--font)',
            fontSize: 15,
            fontWeight: 700,
            background: '#fff',
            color: '#0f172a',
            appearance: 'auto',
          }}
        >
          {FECHAS.map(f => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>



      {/* Chips */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '12px 16px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {FILTROS.map(f => {
          const on = activos.has(f.id)
          const n = counts[f.id] || 0
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => toggleFiltro(f.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 999,
                border: on ? `2px solid ${f.color}` : '1.5px solid #e2e8f0',
                background: on ? f.color : '#fff',
                color: on ? '#fff' : '#475569',
                fontFamily: 'var(--font)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                boxShadow: on ? `0 2px 8px ${f.color}40` : 'none',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: on ? '#fff' : f.color,
                }}
              />
              {f.label}
              <span
                style={{
                  background: on ? 'rgba(255,255,255,.22)' : '#f1f5f9',
                  borderRadius: 999,
                  padding: '1px 7px',
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {n}
              </span>
            </button>
          )
        })}
      </div>

      {/* Buscador mapa */}
      <div style={{ padding: '8px 16px 10px', position: 'relative', zIndex: 20 }}>
        <input
          value={mapQ}
          onChange={e => setMapQ(e.target.value)}
          placeholder="Buscar cliente, comuna o dirección…"
          className="search"
          style={{ marginBottom: 0 }}
        />
        {searchHits.length > 0 && (
          <div style={{
            position: 'absolute', left: 16, right: 16, top: '100%', marginTop: 4, zIndex: 50,
            background: '#fff', borderRadius: 14, border: '1px solid #e7e5e4',
            boxShadow: '0 12px 32px rgba(0,0,0,.12)', maxHeight: 240, overflow: 'auto',
          }}>
            {searchHits.map(item => (
              <button
                key={String(item._id || item.cliente_key || item.id)}
                type="button"
                onClick={() => irABusqueda(item)}
                style={{
                  width: '100%', textAlign: 'left', padding: '12px 14px',
                  border: 'none', borderBottom: '1px solid #f5f5f4',
                  background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {item.nombre_cliente || item.nombre_local || '—'}
                </div>
                <div style={{ fontSize: 12, color: '#a8a29e', marginTop: 2 }}>
                  {item._tipo === 'prospecto' ? 'Prospecto' : item._tipo === 'ruta' ? 'En ruta' : 'Cliente'}
                  {item.comuna ? ` · ${item.comuna}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mapa — altura fija para que el contenedor exista al init */}
      <div style={{ padding: '0 16px', position: 'relative' }}>
        <div
          ref={mapRef}
          className="map-box"
          style={{ height: 300, marginBottom: 0, background: '#e2e8f0' }}
        />
      </div>

      {/* Listado de la ruta del día — siempre visible */}
      <div style={{ padding: '12px 16px 24px' }}>
        <button
          type="button"
          onClick={() => setListaOpen(o => !o)}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 14px',
            borderRadius: 12,
            border: '1.5px solid #e2e8f0',
            background: '#fff',
            fontFamily: 'var(--font)',
            fontWeight: 800,
            fontSize: 14,
            cursor: 'pointer',
            marginBottom: listaOpen ? 8 : 0,
          }}
        >
          <span>Itinerario del día ({visitas.length})</span>
          <span style={{ color: '#64748b' }}>{listaOpen ? '▾' : '▸'}</span>
        </button>
        {listaOpen && visitas.length >= 2 && (
          <button
            type="button"
            onClick={optimizarOrdenRuta}
            disabled={busy}
            style={{
              width: '100%', marginBottom: 8, padding: '10px 12px',
              borderRadius: 10, border: '1.5px solid #c2410c', background: '#fff7ed',
              color: '#9a3412', fontWeight: 800, fontSize: 13, fontFamily: 'inherit',
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            ⚡ Optimizar orden por distancia
          </button>
        )}

        {listaOpen && (
          <div>
            {!visitas.length && (
              <div className="card center" style={{ marginTop: 0 }}>
                <p style={{ fontWeight: 600, marginBottom: 6 }}>Sin paradas aún</p>
                <p className="muted">
                  Tocá un pin del mapa (cliente o prospecto) y usá <b>+ A la ruta</b>.
                </p>
              </div>
            )}
            {visitas.map(v => (
              <div
                key={v.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  background: '#fff',
                  border: '1px solid #e7e0d8',
                  borderRadius: 14,
                  padding: '12px 12px',
                  marginBottom: 8,
                  boxShadow: '0 1px 3px rgba(28,25,23,0.05)',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: '#1c1917',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {v.orden}
                </div>
                <div
                  style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  onClick={() => nav(`/visita/${v.id}`)}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: '#1c1917',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {v.nombre_local}
                  </div>
                  <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>
                    {v.comuna || v.direccion || '—'}
                  </div>
                  {v.oferta && (
                    <div
                      style={{
                        fontSize: 11,
                        color: '#9a3412',
                        marginTop: 4,
                        background: '#fff7ed',
                        borderRadius: 8,
                        padding: '4px 8px',
                        display: 'inline-block',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Ofrecé: {limpiaOferta(v.oferta).slice(0, 42)}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => quitarDeRuta(v.id)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border: '1.5px solid #fecaca',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontWeight: 800,
                    fontSize: 18,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  aria-label="Quitar"
                >
                  −
                </button>
              </div>
            ))}
            {linkNavegar && visitas.length >= 1 && (
              <a
                href={linkNavegar}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  marginTop: 12, padding: '13px 16px', borderRadius: 14,
                  background: '#1a1614', color: '#fff',
                  fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
                  textDecoration: 'none', width: '100%',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
                </svg>
                Navegar recorrido en Maps
              </a>
            )}
          </div>
        )}
      </div>

      {/* Popup pin centrado */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.55)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 400,
              background: '#fff',
              borderRadius: 20,
              padding: 18,
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 17, color: '#1c1917', lineHeight: 1.25 }}>
                  {selected.nombre_cliente || selected.nombre_local || 'Sin nombre'}
                </div>
                <div style={{ fontSize: 13, color: '#78716c', marginTop: 4 }}>
                  {selected._tipo === 'ruta'
                    ? `Parada #${selected.orden}`
                    : selected._tipo === 'prospecto'
                      ? 'Prospecto'
                      : limpiaEstado(selected.estado_fuga)}
                  {selected.comuna ? ` · ${selected.comuna}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={{
                  width: 36, height: 36, borderRadius: 10, border: 'none',
                  background: '#f5f5f4', color: '#57534e', fontSize: 18, fontWeight: 700, cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {(Number(selected.venta_mtd) > 0 || Number(selected.venta_mensual) > 0) && (
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: '#c2410c' }}>
                {Number(selected.venta_mtd) > 0
                  ? `${money(selected.venta_mtd)} este mes`
                  : `${money(selected.venta_mensual)} /mes prom.`}
              </div>
            )}

            {(selected.telefono || selected.link_whatsapp) && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {selected.telefono && (
                  <a href={`tel:${selected.telefono}`} style={{
                    flex: 1, textAlign: 'center', padding: '10px', borderRadius: 12,
                    background: '#1c1917', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none',
                  }}>Llamar</a>
                )}
                {selected.link_whatsapp && (
                  <a href={selected.link_whatsapp} target="_blank" rel="noreferrer" style={{
                    flex: 1, textAlign: 'center', padding: '10px', borderRadius: 12,
                    background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: 13, textDecoration: 'none',
                  }}>WhatsApp</a>
                )}
              </div>
            )}

            {selected.oferta_real && (
              <div style={{
                marginTop: 12, padding: '10px 12px', borderRadius: 12,
                background: '#fff7ed', borderLeft: '3px solid #c2410c', fontSize: 13, color: '#9a3412',
              }}>
                <b>Ofrecé:</b> {limpiaOferta(selected.oferta_real)}
              </div>
            )}
            {selected.productos_top && (
              <div style={{
                marginTop: 8, padding: '10px 12px', borderRadius: 12,
                background: '#f8fafc', borderLeft: '3px solid #64748b', fontSize: 13, color: '#334155',
              }}>
                <b>Compraba:</b> {limpiaOferta(selected.productos_top)}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={() => setNotaFromMap(selected)} style={{
                flex: 1, padding: '11px', borderRadius: 12, border: '1.5px solid #e7e5e4',
                background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>Nota</button>
              {selected._tipo !== 'prospecto' && (
                <button type="button" onClick={() => setPedidoFromMap(selected)} style={{
                  flex: 1, padding: '11px', borderRadius: 12, border: 'none',
                  background: '#c2410c', color: '#fff', fontWeight: 800, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Pedido</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <a
                href={selected.lat != null && selected.lng != null && !isNaN(Number(selected.lat))
                  ? `https://www.google.com/maps/dir/?api=1&destination=${Number(selected.lat)},${Number(selected.lng)}`
                  : '#'}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1, textAlign: 'center', padding: '12px', borderRadius: 12,
                  background: '#f5f5f4', color: '#1c1917', fontWeight: 700, fontSize: 14, textDecoration: 'none',
                }}
              >
                Navegar
              </a>
              {selected._tipo === 'ruta' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => quitarDeRuta(selected.id)}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 12, border: '1.5px solid #fecaca',
                    background: '#fef2f2', color: '#dc2626', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  − Quitar
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => agregarARuta(selected)}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 12, border: 'none',
                    background: '#c2410c', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  + A la ruta
                </button>
              )}
            </div>
            {selected._tipo === 'ruta' && selected.id && (
              <button
                type="button"
                onClick={() => nav(`/visita/${selected.id}`)}
                style={{
                  width: '100%', marginTop: 10, padding: '12px', borderRadius: 12,
                  border: '1.5px solid #e7e0d8', background: '#fff', color: '#1c1917',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}
              >
                Abrir visita →
              </button>
            )}
          </div>
        </div>
      )}

{pedidoFromMap && (
        <PedidoSheet
          cliente={pedidoFromMap}
          aReponer={[]}
          ejecutivoId={uid}
          ejecutivoNombre={eje?.nombre || eje?.zonaVista}
          onClose={() => setPedidoFromMap(null)}
        />
      )}
      {notaFromMap && (
        <NotaRapidaMap cliente={notaFromMap} session={session} onClose={() => setNotaFromMap(null)} />
      )}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0f172a',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 200,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

function NotaRapidaMap({ cliente, session, onClose }) {
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('otro')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)
  const tipos = [
    { v: 'sin_stock', l: 'Sin stock' },
    { v: 'volver', l: 'Volver' },
    { v: 'no_interesado', l: 'No interesa' },
    { v: 'pidio', l: 'Pidió' },
    { v: 'otro', l: 'Otro' },
  ]
  async function guardar() {
    setBusy(true)
    await supabase.from('notas_cliente').insert({
      ejecutivo_id: session.user.id,
      cliente_key: cliente.cliente_key || cliente.punto_id_bq,
      nombre_local: cliente.nombre_cliente || cliente.nombre_local,
      tipo,
      texto,
    })
    setBusy(false)
    setOk(true)
    setTimeout(onClose, 700)
  }
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(26,22,20,0.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, background: '#fff', borderRadius: '20px 20px 0 0',
        padding: '16px 16px 28px',
      }}>
        <div style={{ width: 40, height: 4, background: '#e7e5e4', borderRadius: 4, margin: '0 auto 12px' }} />
        <div style={{ fontSize: 11, fontWeight: 800, color: '#c2410c' }}>NOTA</div>
        <div style={{ fontWeight: 800, fontSize: 17, margin: '4px 0 12px' }}>
          {cliente.nombre_cliente || cliente.nombre_local}
        </div>
        {ok ? <div style={{ color: '#15803d', fontWeight: 700 }}>Guardada</div> : (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {tipos.map(x => (
                <button key={x.v} type="button" onClick={() => setTipo(x.v)} style={{
                  padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  border: tipo === x.v ? 'none' : '1.5px solid #e7e5e4',
                  background: tipo === x.v ? '#1a1614' : '#fff',
                  color: tipo === x.v ? '#fff' : '#444', fontFamily: 'inherit',
                }}>{x.l}</button>
              ))}
            </div>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3}
              placeholder="Escribe la nota…"
              style={{ width: '100%', padding: 12, borderRadius: 12, border: '1.5px solid #e7e5e4', fontFamily: 'inherit', fontSize: 14, resize: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: 12, border: '1.5px solid #e7e5e4', background: '#fff', fontWeight: 700, fontFamily: 'inherit' }}>Cancelar</button>
              <button type="button" disabled={busy || !texto} onClick={guardar} style={{ flex: 1, padding: 14, borderRadius: 12, border: 'none', background: texto ? '#c2410c' : '#d6d3d1', color: '#fff', fontWeight: 800, fontFamily: 'inherit' }}>{busy ? '…' : 'Guardar'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
