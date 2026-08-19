import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getPositionPrecise, haversineM, formatDist } from '../lib/geo'
import { skusAReponer } from '../lib/coach'
import PedidoSheet from '../components/PedidoSheet.jsx'
import OfertaClienteSheet from '../components/OfertaClienteSheet.jsx'
import { useEjecutivo } from '../App.jsx'
import { enqueueAction, isProbablyOffline, markHoyResultado } from '../lib/offline'

const money = n => {
  const v = Number(n)
  return isNaN(v) ? '$0' : '$' + v.toLocaleString('es-CL', { maximumFractionDigits: 0 })
}

function limpiaOferta(t) {
  if (!t) return ''
  return String(t).replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Parsea oferta_real. Une fragmentos tipo "1X2" + "5KG" y evita basura. */
function parseOfertaItems(oferta) {
  if (!oferta) return []
  let s = String(oferta).replace(/_/g, ' ')
  // Normalizar separadores raros
  s = s.replace(/\s*[·|]\s*/g, ' · ')
  // No partir por coma dentro de tamaños 1X2,5KG — proteger temporalmente
  s = s.replace(/(\d),(\d)/g, '$1‹$2')
  const parts = s.split(/\s*·\s*|;|\n/).map(x => x.replace(/‹/g, ',').trim()).filter(Boolean)
  const out = []
  for (let p of parts) {
    let tag = 'Oferta'
    let nombre = p
    const m = p.match(/^(Foco|Tu rubro|Complemento|Reponer|Alternativa)\s*:\s*(.+)$/i)
    if (m) {
      tag = m[1].replace(/^Tu rubro$/i, 'Tu rubro')
      nombre = m[2].trim()
    }
    // Fragmento solo unidad → pegar al anterior
    if (/^\d+([.,]\d+)?\s*(kg|lt|l|un|ud|mm)\b/i.test(nombre) && out.length) {
      out[out.length - 1].nombre = (out[out.length - 1].nombre + ' ' + nombre).trim()
      continue
    }
    if (/^\d+([.,]\d+)?\s*(kg|lt|l|un|ud|mm)?$/i.test(nombre)) continue
    if (nombre.length < 3) continue
    out.push({ nombre, tag })
  }
  return out
}


export default function Visita({ session }) {
  const eje = useEjecutivo()
  const [pedidoOpen, setPedidoOpen] = useState(false)
  const [ofertaOpen, setOfertaOpen] = useState(false)
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  const [visita, setVisita] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [checkin, setCheckin] = useState(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [showEncuesta, setShowEncuesta] = useState(false)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [fotoName, setFotoName] = useState('')
  const [lastCheckinCoords, setLastCheckinCoords] = useState(null)
  const [resultado, setResultado] = useState(null) // pedido | no_venta | completada
  const [showNoVenta, setShowNoVenta] = useState(false)
  const [noVentaMotivo, setNoVentaMotivo] = useState('')
  const [pedidoOk, setPedidoOk] = useState(false)
  const [preciosPorNombre, setPreciosPorNombre] = useState({}) // nombre → precio_unidad de lista

  const CARTERA_SEL =
    'cliente_key,nombre_cliente,razon_social,telefono,link_whatsapp,persona_contacto,direccion,comuna,ultima_compra,dias_sin_comprar,venta_mtd,venta_mensual,oferta_real,productos_top,sku_detalle,lat,lng,estado_fuga,ejecutivo_id'

  function cliFromNavState(decodedId) {
    const st = location?.state
    if (!st) return null
    if (!(st.fromHoy || st.cliente_key || st.nombre_cliente)) return null
    return {
      cliente_key: st.cliente_key || decodedId,
      nombre_cliente: st.nombre_cliente || st.title || decodedId,
      comuna: st.comuna || null,
      telefono: st.telefono || null,
      link_whatsapp: st.link_whatsapp || st.whatsapp || null,
      oferta_real: st.oferta_real || st.oferta || null,
      sku_detalle: st.sku_detalle || null,
      direccion: st.direccion || null,
      lat: st.lat ?? null,
      lng: st.lng ?? null,
      venta_mtd: st.venta_mtd,
      venta_mensual: st.venta_mensual,
      estado_fuga: st.estado_fuga || null,
      _fromHoy: true,
    }
  }

  function applyCliente(cli, decodedId, extraVisita = {}) {
    if (!cli) {
      setVisita(null)
      setCliente(null)
      return
    }
    setCliente(cli)
    setVisita({
      id: extraVisita.id || decodedId,
      nombre_local: cli.nombre_cliente || cli.razon_social || decodedId,
      cliente_key: cli.cliente_key || decodedId,
      direccion: cli.direccion,
      comuna: cli.comuna,
      lat: cli.lat,
      lng: cli.lng,
      estado: extraVisita.estado || 'pendiente',
      oferta: cli.oferta_real,
      segmento: cli.estado_fuga,
      telefono: cli.telefono,
      link_whatsapp: cli.link_whatsapp,
      _sinRuta: extraVisita._sinRuta !== false,
      ...extraVisita,
    })
  }

  async function buscarCarteraPorKey(key) {
    if (!key) return null
    const k = String(key).trim()
    // eq exacto
    let { data, error } = await supabase.from('cartera').select(CARTERA_SEL).eq('cliente_key', k).limit(1)
    if (!error && data?.[0]) return data[0]
    // sin ceros a la izquierda / numérico
    const k2 = k.replace(/^0+/, '')
    if (k2 && k2 !== k) {
      const r2 = await supabase.from('cartera').select(CARTERA_SEL).eq('cliente_key', k2).limit(1)
      if (r2.data?.[0]) return r2.data[0]
    }
    return null
  }

  async function cargar() {
    const decodedId = decodeURIComponent(id || '').trim()
    if (!decodedId) {
      setLoading(false)
      setMsg('Sin ID de visita')
      setVisita(null)
      setCliente(null)
      return
    }

    setMsg('')
    setLoading(true)

    // 0) Hidratar YA desde navigation state (Hoy/Mapa) → UI inmediata
    const snap = cliFromNavState(decodedId)
    if (snap?.nombre_cliente) {
      applyCliente(snap, decodedId, { _sinRuta: true })
      setLoading(false) // mostrar pantalla; enriquecer en background
    }

    try {
      const looksUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decodedId)

      // 1) Visita planificada (solo UUID)
      if (looksUuid) {
        const { data: v, error: ve } = await supabase
          .from('visitas')
          .select('*')
          .eq('id', decodedId)
          .maybeSingle()
        if (ve) console.warn('Visita.visitas', ve.message)
        if (v) {
          let cli = null
          if (v.cliente_key) cli = await buscarCarteraPorKey(v.cliente_key)
          if (!cli && v.nombre_local) {
            const { data: cRows } = await supabase
              .from('cartera')
              .select(CARTERA_SEL)
              .ilike('nombre_cliente', `%${String(v.nombre_local).slice(0, 40)}%`)
              .limit(3)
            cli = cRows?.[0] || null
          }
          if (cli) {
            applyCliente(cli, decodedId, {
              id: v.id,
              estado: v.estado || 'pendiente',
              _sinRuta: false,
              lat: v.lat ?? cli.lat,
              lng: v.lng ?? cli.lng,
            })
          } else {
            // visita sin match en cartera
            setVisita({
              ...v,
              nombre_local: v.nombre_local || decodedId,
              _sinRuta: false,
            })
            setCliente({
              cliente_key: v.cliente_key,
              nombre_cliente: v.nombre_local,
              comuna: v.comuna,
              direccion: v.direccion,
              lat: v.lat,
              lng: v.lng,
              telefono: v.telefono,
            })
          }
          // check-in de esta visita
          try {
            const { data: c } = await supabase
              .from('checkins')
              .select('*')
              .eq('visita_id', decodedId)
              .order('creado_en', { ascending: false })
              .limit(1)
            setCheckin(c?.[0] || null)
          } catch (_) {
            /* ignore */
          }
          setLoading(false)
          return
        }
      }

      // 2) cliente_key desde Hoy / Mapa / deep link
      let cli = await buscarCarteraPorKey(decodedId)

      // 3) prospecto
      if (!cli) {
        try {
          const { data: pRows } = await supabase
            .from('prospectos')
            .select('cliente_key,nombre_cliente,comuna,direccion,lat,lng,oferta,telefono,place_id')
            .or(`cliente_key.eq.${decodedId},place_id.eq.${decodedId}`)
            .limit(1)
          const p = pRows?.[0]
          if (p) {
            cli = {
              cliente_key: p.cliente_key || p.place_id || decodedId,
              nombre_cliente: p.nombre_cliente,
              comuna: p.comuna,
              direccion: p.direccion,
              lat: p.lat,
              lng: p.lng,
              oferta_real: p.oferta,
              telefono: p.telefono,
              _prospecto: true,
            }
          }
        } catch (_) {
          /* ignore */
        }
      }

      // 4) snapshot de navegación (si no había UI aún)
      if (!cli) cli = snap

      if (cli) {
        applyCliente(cli, decodedId, { _sinRuta: true })
        setMsg('')
      } else {
        setVisita(null)
        setCliente(null)
        setMsg('No se encontró el cliente. Volvé al mapa o a Hoy.')
      }
    } catch (e) {
      console.error('Visita.cargar', e)
      // Si ya hay snap en pantalla, no borrar; solo avisar
      if (!snap) {
        setMsg(String(e?.message || e))
        setVisita(null)
        setCliente(null)
      } else {
        setMsg('Datos parciales (sin red o RLS). Podés seguir la visita.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Montar / cambiar :id → cargar
  useEffect(() => {
    if (!id) {
      setLoading(false)
      setMsg('Sin ID de visita')
      setVisita(null)
      setCliente(null)
      return
    }
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      await cargar()
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Cargar precios de lista desde tabla stock (se ejecuta cuando termina cargar)
  useEffect(() => {
    if (loading) return
    ;(async () => {
      try {
        const { data } = await supabase
          .from('stock')
          .select('producto_nombre,sku_canon,precio_unidad,precio_kilo')
          .not('precio_unidad', 'is', null)
          .limit(500)
        if (!data?.length) return
        const mapa = {}
        for (const s of data) {
          const precio = Number(s.precio_unidad) || 0
          if (precio <= 0) continue
          // Indexar por nombre y por sku_canon para máxima cobertura de matches
          const keys = [
            String(s.producto_nombre || '').toLowerCase().trim(),
            String(s.sku_canon || '').toLowerCase().trim(),
          ].filter(k => k.length > 2)
          for (const k of keys) mapa[k] = precio
        }
        setPreciosPorNombre(mapa)
      } catch { /* silent — precios es un nice-to-have */ }
    })()
  }, [loading])

  function posicion() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve({ lat: null, lng: null })
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve({ lat: null, lng: null }),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    })
  }

  async function hacerCheckin() {
    setBusy(true)
    setMsg('Fijando GPS preciso…')
    let lat = null
    let lng = null
    let accuracy = null
    try {
      const pos = await getPositionPrecise({ targetAccM: 60, maxWaitMs: 18000 })
      lat = pos?.lat
      lng = pos?.lng
      accuracy = pos?.accuracy
    } catch {
      const p = await posicion()
      lat = p.lat
      lng = p.lng
    }

    let dist = null
    let verificado = false
    if (lat != null && visita?.lat != null && visita?.lng != null) {
      dist = haversineM(lat, lng, visita.lat, visita.lng)
      verificado = dist != null && dist <= 150
    }

    const payload = {
      visita_id: id,
      cliente_key: visita?.cliente_key || null,
      hora_llegada: new Date().toISOString(),
      lat_real: lat,
      lng_real: lng,
      accuracy_m: accuracy != null ? Math.round(accuracy) : null,
      dist_m: dist != null ? Math.round(dist) : null,
      verificado: !!verificado,
    }

    if (isProbablyOffline()) {
      enqueueAction({ type: 'checkin', payload })
      setCheckin({ ...payload, id: 'offline_' + Date.now(), _offline: true })
      setLastCheckinCoords({ lat, lng, accuracy, dist, verificado })
      if (payload.cliente_key) markHoyResultado(payload.cliente_key, 'checkin')
      setMsg('Check-in guardado offline · se sincroniza al recuperar red')
      setBusy(false)
      return
    }

    const { data, error } = await supabase
      .from('checkins')
      .insert({
        visita_id: id,
        hora_llegada: payload.hora_llegada,
        lat_real: lat,
        lng_real: lng,
      })
      .select()
      .maybeSingle()
    setBusy(false)
    if (error) {
      enqueueAction({ type: 'checkin', payload })
      setCheckin({ ...payload, id: 'offline_' + Date.now(), _offline: true })
      setLastCheckinCoords({ lat, lng, accuracy, dist, verificado })
      setMsg('Check-in en cola offline (error de red). Seguís operando.')
      return
    }
    setCheckin(data)
    setLastCheckinCoords({ lat, lng, accuracy, dist, verificado })
    if (payload.cliente_key) markHoyResultado(payload.cliente_key, 'checkin')
    if (verificado) {
      setMsg(`Check-in verificado · a ${formatDist(dist)} del local` + (accuracy ? ` (±${Math.round(accuracy)} m)` : ''))
    } else if (dist != null) {
      setMsg(`Check-in OK pero lejos del pin (${formatDist(dist)}). Revisá GPS o la dirección.`)
    } else {
      setMsg('Check-in registrado (sin coords del local para verificar).')
    }
    if (!visita?._sinRuta) {
      await supabase.from('visitas').update({ estado: 'en_curso' }).eq('id', id)
    }
  }

  async function terminar(res) {
    setBusy(true)
    const finalRes = res || resultado || (pedidoOk ? 'pedido' : 'completada')
    const ck = visita?.cliente_key || cliente?.cliente_key
    if (ck) {
      const tag = finalRes === 'pedido' || pedidoOk ? 'pedido' : finalRes === 'no_venta' ? 'no_venta' : 'visitado'
      markHoyResultado(ck, tag, { resultado_detalle: finalRes })
    }
    const fin = new Date().toISOString()

    if (isProbablyOffline()) {
      enqueueAction({
        type: 'completar',
        payload: {
          visita_id: id,
          checkin_id: checkin?.id,
          cliente_key: visita?.cliente_key,
          resultado: finalRes,
          hora_fin: fin,
          motivo: noVentaMotivo || null,
        },
      })
      setBusy(false)
      nav('/')
      return
    }

    if (checkin?.id && !String(checkin.id).startsWith('offline_')) {
      await supabase
        .from('checkins')
        .update({ hora_fin: fin, resultado: finalRes })
        .eq('id', checkin.id)
    }
    if (!visita?._sinRuta) {
      await supabase.from('visitas').update({ estado: 'visitada' }).eq('id', id)
    }
    // Nota de resultado para gerencia / timeline
    try {
      await supabase.from('notas_cliente').insert({
        ejecutivo_id: session.user.id,
        cliente_key: visita?.cliente_key || cliente?.cliente_key,
        nombre_local: visita?.nombre_local,
        tipo: 'resultado_visita',
        texto: [
          `Resultado: ${finalRes}`,
          noVentaMotivo ? `Motivo: ${noVentaMotivo}` : null,
          pedidoOk ? 'Pedido capturado' : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })
    } catch {
      /* tabla opcional */
    }
    setBusy(false)
    nav('/')
  }

  async function omitir() {
    setBusy(true)
    if (!visita?._sinRuta) {
      await supabase.from('visitas').update({ estado: 'omitida' }).eq('id', id)
    }
    setBusy(false)
    nav('/')
  }

  async function registrarNoVenta() {
    if (!noVentaMotivo.trim()) {
      setMsg('Elegí un motivo de no venta')
      return
    }
    setResultado('no_venta')
    setShowNoVenta(false)
    await terminar('no_venta')
  }

  if (loading) return <div className="spinner">Cargando visita...</div>
  if (!visita) {
    return (
      <div className="wrap" style={{ paddingTop: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1c1917' }}>No se pudo abrir la visita</div>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{msg || 'Cliente no encontrado en cartera.'}</p>
        <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => nav(-1)}>
          Volver
        </button>
        <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => nav('/')}>
          Ir a Hoy
        </button>
      </div>
    )
  }
  if (!visita)
    return (
      <div className="wrap">
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1c1917' }}>Cliente no encontrado</div>
          <div style={{ fontSize: 13, color: '#78716c', marginTop: 6 }}>Este cliente no está en tu cartera activa.</div>
          <button type="button" onClick={() => nav(-1)}
            style={{ marginTop: 16, padding: '10px 20px', borderRadius: 10, border: 'none', background: '#1c1917', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
            ← Volver
          </button>
        </div>
      </div>
    )

  const yaLlego = checkin && checkin.hora_llegada
  const hasCoords = visita.lat != null && visita.lng != null
  const mapsUrl =
    visita.link_maps ||
    (hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${visita.lat},${visita.lng}`
      : visita.direccion
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(visita.direccion)}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visita.nombre_local || '')}`)

  const embedUrl = hasCoords
    ? `https://www.google.com/maps?q=${visita.lat},${visita.lng}&z=16&output=embed`
    : null

  const telefono = visita.telefono || cliente?.telefono
  const wsp = visita.link_whatsapp || cliente?.link_whatsapp
  const contacto = visita.persona_contacto || cliente?.persona_contacto
  const dir = visita.direccion || cliente?.direccion
  const aReponer = skusAReponer(cliente || {})

  return (
    <>
    <div style={{ paddingBottom: 32, background: '#faf7f2', minHeight: '100dvh' }}>
      {/* Header azul */}
      <div
        style={{
          background: 'linear-gradient(165deg,#ea580c 0%,#c2410c 40%,#1c1917 100%)',
          color: '#fff',
          padding: '14px 16px 28px',
          borderRadius: '0 0 28px 28px',
        }}
      >
        <button
          type="button"
          onClick={() => nav('/')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff',
            borderRadius: 999, padding: '8px 12px', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12,
          }}
        >
          ← Detalle de Visita
        </button>
        <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85, marginBottom: 4 }}>Detalle de Visita</div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
          {visita.nombre_local}
        </h1>
        <div style={{ marginTop: 10 }}>
          <span style={{
            display: 'inline-block', background: yaLlego ? '#fef3c7' : 'rgba(255,255,255,0.2)',
            color: yaLlego ? '#92400e' : '#fff',
            fontWeight: 800, fontSize: 12, padding: '5px 12px', borderRadius: 999,
          }}>
            {visita.estado === 'visitada' ? 'Completada' : yaLlego ? 'En progreso' : 'Pendiente'}
          </span>
        </div>
      </div>

      <div style={{ padding: '0 14px', marginTop: -18 }}>
        {/* Card dirección / comuna / ir / tel */}
        <div style={{
          background: '#fff', borderRadius: 20, padding: 16,
          boxShadow: '0 8px 28px rgba(15,23,42,0.08)', marginBottom: 12,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em' }}>DIRECCIÓN</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginTop: 4, lineHeight: 1.35 }}>
                {dir || visita.comuna || '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em' }}>COMUNA</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginTop: 4 }}>
                {visita.comuna || cliente?.comuna || '—'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ flex: 1, textDecoration: 'none' }}>
              <div style={{
                textAlign: 'center', padding: '12px', borderRadius: 999,
                background: '#c2410c', color: '#fff', fontWeight: 800, fontSize: 14,
              }}>
                ↗ Ir
              </div>
            </a>
            {telefono ? (
              <a href={'tel:' + telefono} style={{ flex: 1, textDecoration: 'none' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8' }}>TELÉFONO</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#c2410c', marginTop: 2 }}>{telefono}</div>
                </div>
              </a>
            ) : (
              <div style={{ flex: 1, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Sin teléfono</div>
            )}
          </div>
          {(Number(cliente?.venta_mtd) > 0 || Number(cliente?.venta_mensual) > 0) && (
            <div style={{
              marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>★ SCORE / VENTA</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                {Number(cliente?.venta_mtd) > 0 ? money(cliente.venta_mtd) + ' mes' : money(cliente.venta_mensual) + ' prom'}
              </span>
            </div>
          )}
        </div>

        {/* Productos sugeridos */}
        <div style={{
          background: '#fff', borderRadius: 20, padding: 16,
          boxShadow: '0 2px 12px rgba(15,23,42,0.04)', marginBottom: 12,
        }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Productos sugeridos</div>
          {(cliente?.oferta_real || aReponer.length > 0) && (
            <div style={{ fontSize: 12, color: '#15803d', fontWeight: 700, marginBottom: 10 }}>
              Potencial · {aReponer.length > 0 ? `${aReponer.length} a reponer` : 'oferta del día'}
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>Recomendamos ofrecer:</div>
          {(() => {
            const items = []
            if (cliente?.oferta_real) {
              parseOfertaItems(cliente.oferta_real).forEach(it => {
                if (!items.some(x => x.nombre === it.nombre)) items.push(it)
              })
            }
            aReponer.slice(0, 6).forEach(s => {
              if (!items.some(x => x.nombre === s.nombre)) {
                items.push({ nombre: s.nombre, tag: s.recompra?.label || 'Reponer' })
              }
            })
            if (cliente?.productos_top) {
              String(cliente.productos_top).split(/\s*[·|]\s*/).slice(0, 6).forEach(s => {
                const n = limpiaOferta(s)
                if (!n || n.length < 3) return
                if (/^\d+([.,]\d+)?\s*(kg|lt|l|un|ud)?$/i.test(n)) return
                if (!items.some(x => x.nombre === n)) items.push({ nombre: n, tag: 'Compraba' })
              })
            }
            if (!items.length) {
              return <div style={{ fontSize: 13, color: '#94a3b8' }}>Sin sugerencias cargadas para este cliente.</div>
            }
            return (
              <>
                {items.slice(0, 8).map((it, i) => {
                  // Buscar precio de lista por nombre del producto
                  const nombreKey = String(it.nombre || '').toLowerCase().trim()
                  // Buscar match exacto o parcial (ej: "PECHUGA DESH 10KG" → "pechuga desh 10kg")
                  const precioDeLista = preciosPorNombre[nombreKey] ||
                    Object.entries(preciosPorNombre).find(([k]) =>
                      k.length > 4 && (nombreKey.includes(k) || k.includes(nombreKey))
                    )?.[1]
                  return (
                    <div key={i} style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '10px 0', borderBottom: i < items.length - 1 ? '1px solid #f1f5f9' : 'none',
                    }}>
                      <span style={{ color: '#22c55e', fontWeight: 800, marginTop: 2 }}>✓</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', lineHeight: 1.3 }}>{it.nombre}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span>{it.tag}</span>
                          {precioDeLista > 0 && (
                            <span style={{ color: '#c2410c', fontWeight: 700 }}>
                              Lista: ${Math.round(precioDeLista).toLocaleString('es-CL')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setOfertaOpen(true)}
                  style={{
                    width: '100%', marginTop: 12, minHeight: 48, borderRadius: 14, border: 'none',
                    background: '#c2410c', color: '#fff', fontWeight: 800, fontSize: 14,
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  Armar pedido sugerido
                </button>
              </>
            )
          })()}
        </div>

        {/* Pasos del flujo */}
        <div style={{
          display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 2,
        }}>
          {[
            { n: 1, label: 'Contexto', done: true },
            { n: 2, label: 'Check-in', done: !!yaLlego },
            { n: 3, label: 'Acción', done: !!pedidoOk || resultado === 'no_venta' },
            { n: 4, label: 'Cerrar', done: false },
          ].map(s => (
            <div key={s.n} style={{
              flex: '1 1 0', minWidth: 72, textAlign: 'center', padding: '8px 4px',
              borderRadius: 12, fontSize: 11, fontWeight: 700,
              background: s.done ? '#ecfdf5' : '#fff',
              color: s.done ? '#15803d' : '#78716c',
              border: `1.5px solid ${s.done ? '#86efac' : '#e7e5e4'}`,
            }}>
              {s.done ? '✓' : s.n} {s.label}
            </div>
          ))}
        </div>

        {/* Check-in */}
        <div style={{
          background: '#fff', borderRadius: 20, padding: 16,
          boxShadow: '0 2px 12px rgba(15,23,42,0.04)', marginBottom: 12,
        }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>2 · Check-in</div>
          {msg && <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>{msg}</div>}
          {yaLlego ? (
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
              ✓ Llegaste{' '}
              {new Date(checkin.hora_llegada).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              {lastCheckinCoords?.dist != null && (
                <span style={{ color: '#64748b', fontWeight: 500 }}>
                  {' '}· {Math.round(lastCheckinCoords.dist)} m del pin
                </span>
              )}
              {checkin?._offline && (
                <span style={{ marginLeft: 6, fontSize: 11, color: '#92400e', fontWeight: 700 }}>offline</span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={hacerCheckin}
              disabled={busy}
              style={{
                width: '100%', minHeight: 48, padding: '14px', borderRadius: 14, border: 'none',
                background: 'linear-gradient(180deg,#c2410c,#9a3412)', color: '#fff',
                fontWeight: 800, fontSize: 15, fontFamily: 'inherit',
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? 'Registrando GPS…' : 'Hacer check-in (llegué)'}
            </button>
          )}
        </div>

        {/* 3 · Acción comercial */}
        <div style={{
          background: '#fff', borderRadius: 20, padding: 16,
          boxShadow: '0 2px 12px rgba(15,23,42,0.04)', marginBottom: 12,
        }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>3 · Acción comercial</div>
          {pedidoOk && (
            <div style={{
              marginBottom: 10, padding: '10px 12px', borderRadius: 12,
              background: '#ecfdf5', color: '#15803d', fontWeight: 700, fontSize: 13,
            }}>
              ✓ Pedido capturado · listo para cerrar
            </div>
          )}
          {resultado === 'no_venta' && (
            <div style={{
              marginBottom: 10, padding: '10px 12px', borderRadius: 12,
              background: '#fff7ed', color: '#9a3412', fontWeight: 700, fontSize: 13,
            }}>
              No compró · {noVentaMotivo || 'sin motivo'}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={() => setOfertaOpen(true)}
              style={{
                minHeight: 48, borderRadius: 14, border: 'none',
                background: '#c2410c', color: '#fff', fontWeight: 800, fontSize: 14,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              Tomar pedido
            </button>
            <button
              type="button"
              onClick={() => setShowNoVenta(true)}
              style={{
                minHeight: 48, borderRadius: 14, border: '1.5px solid #e7e5e4',
                background: '#fff', color: '#57534e', fontWeight: 700, fontSize: 14,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              No compró
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {telefono && (
              <a href={'tel:' + telefono} style={{
                flex: 1, textAlign: 'center', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 12, background: '#0f172a', color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 13,
              }}>Llamar</a>
            )}
            {wsp && (
              <a href={wsp} target="_blank" rel="noreferrer" style={{
                flex: 1, textAlign: 'center', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 12, background: '#dcfce7', color: '#166534', fontWeight: 700, textDecoration: 'none', fontSize: 13,
              }}>WhatsApp</a>
            )}
            <button
              type="button"
              onClick={() => {
                if (!yaLlego) {
                  setMsg('Primero hacé check-in')
                  return
                }
                setShowEncuesta(true)
              }}
              style={{
                flex: 1, minHeight: 44, borderRadius: 12, border: '1.5px solid #e7e5e4',
                background: '#fff', color: '#57534e', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              Encuesta
            </button>
          </div>
        </div>

        {/* Foto opcional */}
        <label style={{
          display: 'block', background: '#fff', borderRadius: 20, padding: 16,
          border: '1.5px dashed #cbd5e1', marginBottom: 12, cursor: 'pointer', textAlign: 'center',
        }}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (!f) return
              setFotoName(f.name)
              const reader = new FileReader()
              reader.onload = () => setFotoPreview(reader.result)
              reader.readAsDataURL(f)
            }}
          />
          {fotoPreview ? (
            <div>
              <img src={fotoPreview} alt="foto visita" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 12 }} />
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Tocá para cambiar foto</div>
            </div>
          ) : (
            <div style={{ padding: '12px 0', color: '#64748b', fontWeight: 600, fontSize: 14 }}>
              Foto opcional
            </div>
          )}
        </label>

        {/* 4 · Cerrar */}
        <div style={{
          background: '#fff', borderRadius: 20, padding: 16,
          boxShadow: '0 2px 12px rgba(15,23,42,0.04)', marginBottom: 12,
        }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>4 · Cerrar visita</div>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (fotoPreview) {
                try {
                  await supabase.from('notas_cliente').insert({
                    ejecutivo_id: session.user.id,
                    cliente_key: visita.cliente_key || cliente?.cliente_key,
                    nombre_local: visita.nombre_local,
                    tipo: 'foto_visita',
                    texto: `Foto en visita${fotoName ? ': ' + fotoName : ''} · ${new Date().toISOString()}`,
                  })
                } catch {
                  enqueueAction({
                    type: 'nota',
                    payload: {
                      ejecutivo_id: session.user.id,
                      cliente_key: visita.cliente_key || cliente?.cliente_key,
                      tipo: 'foto_visita',
                      texto: `Foto visita ${fotoName || ''}`.trim(),
                    },
                  })
                }
              }
              await terminar(
                pedidoOk ? 'pedido' : resultado === 'no_venta' ? 'no_venta' : yaLlego ? 'completada' : 'sin_checkin'
              )
            }}
            style={{
              width: '100%', minHeight: 52, padding: '16px', borderRadius: 999, border: 'none',
              background: 'linear-gradient(180deg,#ea580c,#c2410c)', color: '#fff',
              fontWeight: 800, fontSize: 16, fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer',
              boxShadow: '0 8px 24px rgba(194,65,12,0.3)', marginBottom: 8,
            }}
          >
            {pedidoOk ? 'Completar con pedido' : resultado === 'no_venta' ? 'Cerrar · no compró' : 'Completar visita'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={omitir}
            style={{
              width: '100%', minHeight: 44, padding: '12px', border: 'none', background: 'transparent',
              color: '#64748b', fontWeight: 600, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            Omitir cliente por hoy
          </button>
        </div>
      </div>
    </div>

    {showEncuesta && (
        <EncuestaVisitaSheet
          visita={visita}
          cliente={cliente}
          checkin={checkin}
          coords={lastCheckinCoords}
          session={session}
          onClose={() => setShowEncuesta(false)}
          onDone={async () => {
            setShowEncuesta(false)
            setMsg('Encuesta guardada')
            await supabase.from('visitas').update({ estado: 'visitada' }).eq('id', id)
          }}
        />
      )}
      {ofertaOpen && cliente && (
        <OfertaClienteSheet
          cliente={cliente}
          ejecutivoId={eje?.eidVista || session?.user?.id}
          onClose={() => { setOfertaOpen(false); setPedidoOk(true) }}
        />
      )}
      {pedidoOpen && (cliente || visita) && (
        <PedidoSheet
          cliente={cliente || { nombre_cliente: visita.nombre_local, cliente_key: visita.cliente_key, telefono: visita.telefono, link_whatsapp: visita.link_whatsapp, comuna: visita.comuna }}
          aReponer={aReponer}
          ejecutivoId={eje?.eidVista || session?.user?.id}
          ejecutivoNombre={eje?.nombre || eje?.zona}
          onClose={() => setPedidoOpen(false)}
          onSaved={() => {
            setPedidoOk(true)
            {
              const ck = visita?.cliente_key || cliente?.cliente_key
              if (ck) markHoyResultado(ck, 'pedido')
            }
            setResultado('pedido')
            setPedidoOpen(false)
            setMsg('Pedido guardado · cerrá la visita cuando termines')
          }}
        />
      )}

      {showNoVenta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Motivo de no venta"
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(28,25,23,0.45)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
          onClick={() => setShowNoVenta(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480, background: '#fff',
              borderRadius: '24px 24px 0 0', padding: '20px 18px calc(20px + env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>¿Por qué no compró?</div>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#78716c' }}>
              Queda registrado para gerencia y mejora la próxima visita.
            </p>
            {[
              'Sin stock / no necesitaba',
              'Precio / competencia',
              'Cerrado / sin encargado',
              'Solo cotizó',
              'Volver otro día',
              'Otro',
            ].map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setNoVentaMotivo(m)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  minHeight: 48, padding: '12px 14px', marginBottom: 8,
                  borderRadius: 14, fontFamily: 'inherit', fontWeight: 650, fontSize: 14,
                  border: noVentaMotivo === m ? '2px solid #c2410c' : '1.5px solid #e7e5e4',
                  background: noVentaMotivo === m ? '#fff7ed' : '#fff',
                  color: '#1c1917', cursor: 'pointer',
                }}
              >
                {m}
              </button>
            ))}
            <button
              type="button"
              disabled={busy || !noVentaMotivo}
              onClick={registrarNoVenta}
              style={{
                width: '100%', minHeight: 52, marginTop: 8, borderRadius: 14, border: 'none',
                background: noVentaMotivo ? '#c2410c' : '#d6d3d1', color: '#fff',
                fontWeight: 800, fontSize: 15, fontFamily: 'inherit',
                cursor: noVentaMotivo ? 'pointer' : 'not-allowed',
              }}
            >
              Confirmar y cerrar visita
            </button>
            <button
              type="button"
              onClick={() => setShowNoVenta(false)}
              style={{
                width: '100%', minHeight: 44, marginTop: 8, border: 'none', background: 'transparent',
                color: '#78716c', fontWeight: 600, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** Encuesta guiada post check-in (estilo primera visita) */
function EncuestaVisitaSheet({ visita, cliente, checkin, coords, session, onClose, onDone }) {
  const [encargado, setEncargado] = useState(null) // true | false | null
  const [nombre, setNombre] = useState(cliente?.persona_contacto || visita?.persona_contacto || '')
  const [telefono, setTelefono] = useState(cliente?.telefono || visita?.telefono || '')
  const [correo, setCorreo] = useState('')
  const [obs, setObs] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const pasos = [
    encargado !== null,
    nombre.trim().length > 0,
    telefono.trim().length > 0,
    true, // correo opcional
    true, // obs opcional
  ]
  const avance = pasos.filter(Boolean).length
  const puedeCerrar = encargado !== null // mínimo obligatorio

  async function completar() {
    if (!puedeCerrar) {
      setErr('Indicá si está el encargado')
      return
    }
    setBusy(true)
    setErr('')
    const row = {
      visita_id: visita?.id || null,
      checkin_id: checkin?.id || null,
      ejecutivo_id: session.user.id,
      cliente_key: visita?.cliente_key || cliente?.cliente_key || null,
      nombre_local: visita?.nombre_local || cliente?.nombre_cliente || null,
      encargado_presente: encargado,
      nombre_contacto: nombre.trim() || null,
      telefono_contacto: telefono.trim() || null,
      correo_contacto: correo.trim() || null,
      observaciones: obs.trim() || null,
      lat_real: coords?.lat ?? checkin?.lat_real ?? null,
      lng_real: coords?.lng ?? checkin?.lng_real ?? null,
    }
    const { error } = await supabase.from('encuestas_visita').insert(row)
    if (error) {
      // Fallback: guardar como nota estructurada si la tabla aún no existe
      await supabase.from('notas_cliente').insert({
        ejecutivo_id: session.user.id,
        cliente_key: row.cliente_key,
        nombre_local: row.nombre_local,
        tipo: 'encuesta_visita',
        texto: [
          `Encargado: ${encargado ? 'Sí' : 'No'}`,
          nombre && `Contacto: ${nombre}`,
          telefono && `Tel: ${telefono}`,
          correo && `Mail: ${correo}`,
          obs && `Obs: ${obs}`,
          coords?.dist != null && `Dist check-in: ${Math.round(coords.dist)} m`,
        ]
          .filter(Boolean)
          .join(' · '),
      })
    }
    // Persistir contacto en cartera o prospecto
    const ck = row.cliente_key
    if (ck) {
      const patch = {}
      if (nombre.trim()) patch.persona_contacto = nombre.trim()
      if (telefono.trim()) {
        patch.telefono = telefono.trim()
        const digits = telefono.replace(/\D/g, '')
        if (digits) patch.link_whatsapp = `https://wa.me/${digits.startsWith('56') ? digits : '56' + digits}`
      }
      if (Object.keys(patch).length) {
        const { error: e1 } = await supabase.from('cartera').update(patch).eq('cliente_key', ck)
        if (e1) {
          // prospecto: match por cliente_key o place_id
          await supabase.from('prospectos').update({
            ...patch,
            estado: 'contactado',
          }).or(`cliente_key.eq.${ck},place_id.eq.${ck}`)
        }
      }
    }
    // Actualizar checkin resultado si existe
    if (checkin?.id) {
      await supabase
        .from('checkins')
        .update({
          hora_fin: new Date().toISOString(),
          resultado: encargado ? 'con_encargado' : 'sin_encargado',
        })
        .eq('id', checkin.id)
    }
    setBusy(false)
    onDone?.()
  }

  const fieldStyle = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 14,
    border: '1.5px solid #e8eef7',
    background: '#f8fafc',
    fontSize: 15,
    fontFamily: 'inherit',
    outline: 'none',
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 600,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '92dvh',
          overflow: 'auto',
          background: '#f1f5f9',
          borderRadius: '24px 24px 0 0',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        }}
      >
        {/* Header azul */}
        <div
          style={{
            background: 'linear-gradient(160deg,#c2410c 0%,#9a3412 100%)',
            color: '#fff',
            padding: '18px 20px 20px',
            borderRadius: '24px 24px 0 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                border: 'none',
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                fontSize: 18,
                cursor: 'pointer',
              }}
            >
              ←
            </button>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Encuesta de visita</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, marginBottom: 4 }}>
            {coords?.verificado ? 'Check-in verificado en zona' : 'Check-in registrado'}
            {coords?.dist != null ? ` · ${Math.round(coords.dist)} m del pin` : ''}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {visita?.nombre_local || cliente?.nombre_cliente || 'Cliente'}
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.9, marginBottom: 6 }}>
              <span>Avance</span>
              <span>{avance}/5</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.25)' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(avance / 5) * 100}%`,
                  borderRadius: 999,
                  background: '#fff',
                  transition: 'width .2s ease',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 1 Encargado */}
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <span style={{
                width: 28, height: 28, borderRadius: 999, background: '#c2410c', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800,
              }}>1</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>¿Se encuentra el encargado? <span style={{ color: '#dc2626' }}>*</span></span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { v: true, l: 'Sí' },
                { v: false, l: 'No' },
              ].map(opt => (
                <button
                  key={String(opt.v)}
                  type="button"
                  onClick={() => setEncargado(opt.v)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    borderRadius: 12,
                    border: encargado === opt.v ? '2px solid #c2410c' : '1.5px solid #e2e8f0',
                    background: encargado === opt.v ? '#fff7ed' : '#fff',
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: encargado === opt.v ? '#9a3412' : '#334155',
                  }}
                >
                  {opt.v ? '✓ Sí' : '✗ No'}
                </button>
              ))}
            </div>
          </div>

          {/* 2 Nombre */}
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <span style={{
                width: 28, height: 28, borderRadius: 999, background: '#c2410c', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800,
              }}>2</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Nombre contacto</span>
            </div>
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Escribe el nombre…"
              style={fieldStyle}
            />
          </div>

          {/* 3 Teléfono */}
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <span style={{
                width: 28, height: 28, borderRadius: 999, background: '#c2410c', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800,
              }}>3</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Teléfono contacto</span>
            </div>
            <input
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              placeholder="+56 9 …"
              inputMode="tel"
              style={fieldStyle}
            />
          </div>

          {/* 4 Correo */}
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <span style={{
                width: 28, height: 28, borderRadius: 999, background: '#c2410c', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800,
              }}>4</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Correo contacto</span>
            </div>
            <input
              value={correo}
              onChange={e => setCorreo(e.target.value)}
              placeholder="correo@empresa.cl"
              inputMode="email"
              style={fieldStyle}
            />
          </div>

          {/* 5 Observaciones */}
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <span style={{
                width: 28, height: 28, borderRadius: 999, background: '#c2410c', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800,
              }}>5</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Observaciones / próxima acción</span>
            </div>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              rows={3}
              placeholder="Ej. pedir cotización, volver jueves, probar pechuga…"
              style={{ ...fieldStyle, resize: 'vertical' }}
            />
          </div>

          {err && (
            <div style={{ color: '#b91c1c', fontWeight: 600, fontSize: 13, padding: '0 4px' }}>{err}</div>
          )}

          <button
            type="button"
            disabled={busy || !puedeCerrar}
            onClick={completar}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '16px',
              borderRadius: 999,
              border: 'none',
              background: puedeCerrar ? 'linear-gradient(180deg,#ea580c,#c2410c)' : '#cbd5e1',
              color: '#fff',
              fontWeight: 800,
              fontSize: 16,
              fontFamily: 'inherit',
              cursor: puedeCerrar && !busy ? 'pointer' : 'not-allowed',
              boxShadow: puedeCerrar ? '0 8px 24px rgba(194,65,12,0.35)' : 'none',
            }}
          >
            {busy ? 'Guardando…' : 'Completar visita'}
          </button>
        </div>
      </div>
    </div>
  )
}
