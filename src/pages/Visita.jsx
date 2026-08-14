import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getPositionPrecise, haversineM, formatDist, isNearClient } from '../lib/geo'
import { skusAReponer } from '../lib/coach'
import PedidoSheet from '../components/PedidoSheet.jsx'
import { useEjecutivo } from '../App.jsx'

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
  const { id } = useParams()
  const nav = useNavigate()
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

  async function cargar() {
    setLoading(true)
    const { data: v } = await supabase.from('visitas').select('*').eq('id', id).maybeSingle()
    setVisita(v)

    // Enriquecer con cartera (teléfono, whatsapp, web, última compra)
    if (v) {
      let q = supabase
        .from('cartera')
        .select(
          'cliente_key,nombre_cliente,telefono,link_whatsapp,persona_contacto,direccion,comuna,ultima_compra,dias_sin_comprar,venta_mtd,oferta_real,productos_top,sku_detalle'
        )
        .limit(1)
      if (v.cliente_key) {
        q = q.eq('cliente_key', v.cliente_key)
      } else if (v.nombre_local) {
        q = q.ilike('nombre_cliente', v.nombre_local)
      }
      const { data: cRows } = await q
      setCliente(cRows && cRows[0] ? cRows[0] : null)
    } else {
      setCliente(null)
    }

    const { data: c } = await supabase
      .from('checkins')
      .select('*')
      .eq('visita_id', id)
      .order('creado_en', { ascending: false })
      .limit(1)
    setCheckin(c && c[0] ? c[0] : null)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [id])

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

    const { data, error } = await supabase
      .from('checkins')
      .insert({
        visita_id: id,
        hora_llegada: new Date().toISOString(),
        lat_real: lat,
        lng_real: lng,
      })
      .select()
      .maybeSingle()
    setBusy(false)
    if (error) {
      setMsg('No se pudo registrar el check-in.')
      return
    }
    setCheckin(data)
    setLastCheckinCoords({ lat, lng, accuracy, dist, verificado })
    if (verificado) {
      setMsg(`Check-in verificado · a ${formatDist(dist)} del local` + (accuracy ? ` (±${Math.round(accuracy)} m)` : ''))
    } else if (dist != null) {
      setMsg(`Check-in OK pero lejos del pin (${formatDist(dist)}). Revisá GPS o la dirección.`)
    } else {
      setMsg('Check-in registrado (sin coords del local para verificar).')
    }
    await supabase.from('visitas').update({ estado: 'en_curso' }).eq('id', id)
    // Encuesta guiada justo después del check-in
    setShowEncuesta(true)
  }

  async function terminar(resultado) {
    setBusy(true)
    if (checkin) {
      await supabase
        .from('checkins')
        .update({ hora_fin: new Date().toISOString(), resultado })
        .eq('id', checkin.id)
    }
    await supabase.from('visitas').update({ estado: 'visitada' }).eq('id', id)
    setBusy(false)
    nav('/')
  }

  async function omitir() {
    setBusy(true)
    await supabase.from('visitas').update({ estado: 'omitida' }).eq('id', id)
    setBusy(false)
    nav('/')
  }

  if (loading) return <div className="spinner">Cargando visita...</div>
  if (!visita)
    return (
      <div className="wrap">
        <div className="card">Visita no encontrada.</div>
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
            return items.slice(0, 8).map((it, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '10px 0', borderBottom: i < items.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}>
                <span style={{ color: '#22c55e', fontWeight: 800, marginTop: 2 }}>✓</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', lineHeight: 1.3 }}>{it.nombre}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{it.tag}</div>
                </div>
              </div>
            ))
          })()}
        </div>

        {/* Check-in */}
        <div style={{
          background: '#fff', borderRadius: 20, padding: 16,
          boxShadow: '0 2px 12px rgba(15,23,42,0.04)', marginBottom: 12,
        }}>
          {msg && <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>{msg}</div>}
          {yaLlego ? (
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
              Check-in{' '}
              {new Date(checkin.hora_llegada).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              {lastCheckinCoords?.dist != null && (
                <span style={{ color: '#64748b', fontWeight: 500 }}>
                  {' '}· {Math.round(lastCheckinCoords.dist)} m del pin
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={hacerCheckin}
              disabled={busy}
              style={{
                width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                background: 'linear-gradient(180deg,#c2410c,#9a3412)', color: '#fff',
                fontWeight: 800, fontSize: 15, fontFamily: 'inherit',
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? 'Registrando GPS…' : 'Hacer check-in (llegué)'}
            </button>
          )}
        </div>

        {/* Formularios */}
        <div style={{
          background: '#fff', borderRadius: 20, padding: 16,
          boxShadow: '0 2px 12px rgba(15,23,42,0.04)', marginBottom: 12,
        }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Formularios</div>
          <button
            type="button"
            onClick={() => {
              if (!yaLlego) {
                setMsg('Primero hacé check-in para registrar dónde estás')
                return
              }
              setShowEncuesta(true)
            }}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: '#c2410c', color: '#fff', fontWeight: 800, fontSize: 14,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            Llenar Encuesta en Terreno
          </button>
        </div>

        {/* Foto */}
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
              Tomar foto
            </div>
          )}
        </label>

        {/* Acciones finales */}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (fotoPreview) {
              await supabase.from('notas_cliente').insert({
                ejecutivo_id: session.user.id,
                cliente_key: visita.cliente_key || cliente?.cliente_key,
                nombre_local: visita.nombre_local,
                tipo: 'foto_visita',
                texto: `Foto en visita${fotoName ? ': ' + fotoName : ''} · ${new Date().toISOString()}`,
              })
            }
            await terminar(yaLlego ? 'completada' : 'sin_checkin')
          }}
          style={{
            width: '100%', padding: '16px', borderRadius: 999, border: 'none',
            background: 'linear-gradient(180deg,#ea580c,#c2410c)', color: '#fff',
            fontWeight: 800, fontSize: 16, fontFamily: 'inherit', cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(22,163,74,0.3)', marginBottom: 10,
          }}
        >
          Completar visita
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={omitir}
          style={{
            width: '100%', padding: '12px', border: 'none', background: 'transparent',
            color: '#64748b', fontWeight: 600, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          Omitir cliente por hoy
        </button>

        {(wsp || telefono) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {telefono && (
              <a href={'tel:' + telefono} style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 12, background: '#0f172a', color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>Llamar</a>
            )}
            {wsp && (
              <a href={wsp} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 12, background: '#dcfce7', color: '#166534', fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>WhatsApp</a>
            )}
            <button type="button" onClick={() => setPedidoOpen(true)} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#c2410c', color: '#fff', fontWeight: 800, fontSize: 13, fontFamily: 'inherit' }}>Pedido</button>
          </div>
        )}
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
      {pedidoOpen && (cliente || visita) && (
        <PedidoSheet
          cliente={cliente || { nombre_cliente: visita.nombre_local, cliente_key: visita.cliente_key, telefono: visita.telefono, link_whatsapp: visita.link_whatsapp, comuna: visita.comuna }}
          aReponer={aReponer}
          ejecutivoId={eje?.eidVista || session?.user?.id}
          ejecutivoNombre={eje?.nombre || eje?.zona}
          onClose={() => setPedidoOpen(false)}
        />
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
