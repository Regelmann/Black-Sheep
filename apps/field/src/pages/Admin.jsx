import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { PageShell } from '../shells/PageShell.jsx'
import { FilterBar } from '../domain/FilterBar.jsx'
import { ZONAS_COMUNAS, normComuna, zonaFromComuna } from '../lib/zonas.js'

const ZONAS = ['NOR-ORIENTE', 'NOR-PONIENTE', 'ZONA SUR']

const moneyNum = n => {
  const v = Number(n)
  if (!v || v <= 0) return '—'
  return '$' + Math.round(v).toLocaleString('es-CL')
}

const TABS = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'zonas', label: 'Zonas' },
  { id: 'precios', label: 'Precios' },
  { id: 'media', label: 'Fotos / fichas' },
  { id: 'metas', label: 'Metas' },
  { id: 'focos', label: 'Focos SKU' },
  { id: 'usuarios', label: 'Usuarios' },
]

/**
 * Panel de control operativo — Black Sheep
 * Gerente/admin: zonas, clientes, precios, media catálogo, metas y focos.
 */
export default function Admin() {
  const [tab, setTab] = useState('clientes')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  function flash(ok, text) {
    setErr(ok ? '' : text)
    setMsg(ok ? text : '')
    if (ok) setTimeout(() => setMsg(''), 3500)
  }

  return (
    <PageShell
      eyebrow="Administración"
      titulo="Control de la app"
      subtitulo="Zonas, clientes, precios, catálogo, metas y focos"
      filtros={
        <FilterBar
          ariaLabel="Sección de administración"
          value={tab}
          onChange={setTab}
          options={TABS.map(t => ({ value: t.id, label: t.label }))}
        />
      }
    >

      {msg && (
        <div style={bannerOk}>{msg}</div>
      )}
      {err && (
        <div style={bannerErr}>{err}</div>
      )}

      {tab === 'clientes' && <TabClientes onFlash={flash} />}
      {tab === 'zonas' && <TabZonas onFlash={flash} />}
      {tab === 'precios' && <TabPrecios onFlash={flash} />}
      {tab === 'media' && <TabMedia onFlash={flash} />}
      {tab === 'metas' && <TabMetas onFlash={flash} />}
      {tab === 'focos' && <TabFocos onFlash={flash} />}
      {tab === 'usuarios' && <TabUsuarios onFlash={flash} />}
    </PageShell>
  )
}

const bannerOk = {
  background: 'var(--ok-lt)', color: 'var(--ok)', borderRadius: 12, padding: '10px 12px',
  fontSize: 13, fontWeight: 700, marginBottom: 10,
}
const bannerErr = {
  background: 'var(--danger-lt)', color: 'var(--danger-dk)', borderRadius: 12, padding: '10px 12px',
  fontSize: 13, fontWeight: 700, marginBottom: 10,
}

/* ─── CLIENTES ─────────────────────────────────────────────── */
function TabClientes({ onFlash }) {
  const [q, setQ] = useState('')
  const [zonaFiltro, setZonaFiltro] = useState('Todas')
  const [rows, setRows] = useState([])
  const [ejecutivos, setEjecutivos] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    supabase.from('ejecutivos').select('id, nombre, zona, rol').order('zona')
      .then(({ data }) => setEjecutivos(data || []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('cartera')
        .select('cliente_key,nombre_cliente,comuna,ejecutivo_id,venta_mtd')
        .order('nombre_cliente')
        .limit(200)
      const term = q.trim()
      if (term) {
        query = query.or(
          `nombre_cliente.ilike.%${term}%,cliente_key.ilike.%${term}%,comuna.ilike.%${term}%`
        )
      }
      // zona no existe como columna directa en cartera - filtrar en JS después de cargar
      // if (zonaFiltro !== 'Todas') query = query.eq('zona', zonaFiltro)
      const { data, error } = await query
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      onFlash(false, e.message)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, zonaFiltro, onFlash])

  useEffect(() => {
    const t = setTimeout(load, 280)
    return () => clearTimeout(t)
  }, [load])

  async function saveRow(c, patch) {
    setSaving(c.cliente_key)
    try {
      const body = { ...patch }
      if (patch.comuna && !patch.zona) {
        const z = zonaFromComuna(patch.comuna)
        if (z) body.zona = z
      }
      if (patch.zona && !patch.ejecutivo_id) {
        const ej = ejecutivos.find(e => String(e.zona || '').toUpperCase() === String(patch.zona).toUpperCase())
        if (ej) body.ejecutivo_id = ej.id
      }
      const { error } = await supabase.from('cartera').update(body).eq('cliente_key', c.cliente_key)
      if (error) throw error
      try {
        await supabase.from('gerencia_clientes').update({
          ejecutivo: body.zona,
          comuna: body.comuna || c.comuna,
        }).eq('cliente_key', c.cliente_key)
      } catch { /* */ }
      setRows(prev => prev.map(r => (r.cliente_key === c.cliente_key ? { ...r, ...body } : r)))
      onFlash(true, `Cliente actualizado`)
    } catch (e) {
      onFlash(false, e.message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="bs-page">
      <div className="card" style={{ marginBottom: 12 }}>
        <input className="search" placeholder="Buscar cliente, código, comuna…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="filter-row" style={{ marginTop: 8 }}>
          {['Todas', ...ZONAS].map(z => (
            <button key={z} type="button" className={'filter-btn' + (zonaFiltro === z ? ' active' : '')} onClick={() => setZonaFiltro(z)}>
              {z}
            </button>
          ))}
        </div>
      </div>
      {loading && <p className="muted">Cargando…</p>}
      {rows.map(c => (
        <div key={c.cliente_key} className="card" style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ fontWeight: 800 }}>{c.nombre_cliente || c.cliente_key}</div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
            {c.cliente_key}{c.venta_mtd > 0 ? ` · MTD ${moneyNum(c.venta_mtd)}` : ''}
          </div>
          <label style={lbl}>Comuna
            <input className="search" style={{ marginTop: 4 }} defaultValue={c.comuna || ''}
              onBlur={e => { if (e.target.value.trim() !== (c.comuna || '')) saveRow(c, { comuna: e.target.value.trim() }) }} />
          </label>
          <label style={lbl}>Zona
            <select className="search" style={{ marginTop: 4 }} value={ejecutivos.find(e => e.id === c.ejecutivo_id)?.zona || ''} disabled={saving === c.cliente_key}
              onChange={e => saveRow(c, { zona: e.target.value })}>
              <option value="">—</option>
              {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <label style={lbl}>Ejecutivo
            <select className="search" style={{ marginTop: 4 }} value={c.ejecutivo_id || ''} disabled={saving === c.cliente_key}
              onChange={e => saveRow(c, { ejecutivo_id: e.target.value })}>
              <option value="">—</option>
              {ejecutivos.map(ej => (
                <option key={ej.id} value={ej.id}>{(ej.nombre || ej.id) + (ej.zona ? ` (${ej.zona})` : '')}</option>
              ))}
            </select>
          </label>
        </div>
      ))}
    </div>
  )
}

const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', marginTop: 8 }

/* ─── ZONAS ────────────────────────────────────────────────── */
function TabZonas({ onFlash }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [nuevaComuna, setNuevaComuna] = useState('')
  const [nuevaZona, setNuevaZona] = useState('NOR-PONIENTE')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('zonas_comunas').select('comuna,zona').order('zona').order('comuna')
      if (error) {
        const seed = []
        for (const [zona, comunas] of Object.entries(ZONAS_COMUNAS)) {
          for (const c of comunas) seed.push({ comuna: normComuna(c), zona })
        }
        const seen = new Set()
        setRows(seed.filter(r => (seen.has(r.comuna) ? false : (seen.add(r.comuna), true))))
        onFlash(false, 'Sin tabla zonas_comunas — corré sql/13. Mostrando defaults.')
      } else setRows(data || [])
    } finally {
      setLoading(false)
    }
  }, [onFlash])

  useEffect(() => { load() }, [load])

  async function saveZona(comuna, zona) {
    try {
      const { error } = await supabase.from('zonas_comunas').upsert({ comuna: normComuna(comuna), zona }, { onConflict: 'comuna' })
      if (error) throw error
      setRows(prev => {
        const k = normComuna(comuna)
        if (prev.some(r => normComuna(r.comuna) === k)) {
          return prev.map(r => (normComuna(r.comuna) === k ? { ...r, zona } : r))
        }
        return [...prev, { comuna: k, zona }]
      })
      onFlash(true, `${comuna} → ${zona}`)
    } catch (e) {
      onFlash(false, e.message)
    }
  }

  async function seedDefaults() {
    try {
      const seed = []
      for (const [zona, comunas] of Object.entries(ZONAS_COMUNAS)) {
        for (const c of comunas) seed.push({ comuna: normComuna(c), zona })
      }
      const { error } = await supabase.from('zonas_comunas').upsert(seed, { onConflict: 'comuna' })
      if (error) throw error
      onFlash(true, `${seed.length} comunas cargadas`)
      load()
    } catch (e) {
      onFlash(false, e.message)
    }
  }

  const byZona = useMemo(() => {
    const m = {}
    for (const z of ZONAS) m[z] = []
    for (const r of rows) {
      if (!m[r.zona]) m[r.zona] = []
      m[r.zona].push(r)
    }
    return m
  }, [rows])

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Agregar comuna</div>
        <input className="search" placeholder="Comuna" value={nuevaComuna} onChange={e => setNuevaComuna(e.target.value)} />
        <select className="search" style={{ marginTop: 8 }} value={nuevaZona} onChange={e => setNuevaZona(e.target.value)}>
          {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <button type="button" className="btn-primary" style={{ marginTop: 8, width: '100%', minHeight: 44 }}
          onClick={() => { if (nuevaComuna.trim()) { saveZona(nuevaComuna.trim(), nuevaZona); setNuevaComuna('') } }}>
          Guardar
        </button>
        <button type="button" className="btn-secondary" style={{ marginTop: 8, width: '100%' }} onClick={seedDefaults}>
          Cargar defaults KeyFoods
        </button>
      </div>
      {loading && <p className="muted">Cargando…</p>}
      {ZONAS.map(z => (
        <div key={z} className="card" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 850, marginBottom: 8 }}>{z}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(byZona[z] || []).map(r => (
              <span key={r.comuna} style={{
                fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 999,
                background: 'var(--line)', border: '1px solid #e7e5e4',
              }}>
                {r.comuna}
                <button type="button" style={{ marginLeft: 6, border: 'none', background: 'none', color: 'var(--brand)', fontWeight: 900, cursor: 'pointer' }}
                  onClick={() => saveZona(r.comuna, ZONAS[(ZONAS.indexOf(z) + 1) % ZONAS.length])}>↻</button>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── PRECIOS ──────────────────────────────────────────────── */
function TabPrecios({ onFlash }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [soloSin, setSoloSin] = useState(false)
  const [saving, setSaving] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase.from('stock')
        .select('sku_canon,producto_nombre,precio_unidad,precio_caja,precio_kilo,stock_operativo,estado_stock')
        .order('producto_nombre').limit(150)
      if (q.trim()) {
        query = query.or(`producto_nombre.ilike.%${q.trim()}%,sku_canon.ilike.%${q.trim()}%`)
      }
      const { data, error } = await query
      if (error) throw error
      let list = data || []
      if (soloSin) list = list.filter(r => !(Number(r.precio_unidad) > 0 || Number(r.precio_caja) > 0))
      setRows(list)
    } catch (e) {
      onFlash(false, e.message)
    } finally {
      setLoading(false)
    }
  }, [q, soloSin, onFlash])

  useEffect(() => { const t = setTimeout(load, 280); return () => clearTimeout(t) }, [load])

  async function save(r, field, value) {
    const n = Number(String(value).replace(/[^\d.]/g, ''))
    setSaving(r.sku_canon)
    try {
      const { error } = await supabase.from('stock').update({ [field]: n > 0 ? n : null }).eq('sku_canon', r.sku_canon)
      if (error) throw error
      setRows(prev => prev.map(x => (x.sku_canon === r.sku_canon ? { ...x, [field]: n > 0 ? n : null } : x)))
      onFlash(true, 'Precio guardado')
    } catch (e) {
      onFlash(false, e.message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <input className="search" placeholder="SKU, producto, marca…" value={q} onChange={e => setQ(e.target.value)} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={soloSin} onChange={e => setSoloSin(e.target.checked)} />
          Solo sin precio
        </label>
      </div>
      {loading && <p className="muted">Cargando…</p>}
      {rows.map(r => (
        <div key={r.sku_canon} className="card" style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ fontWeight: 800 }}>{r.producto_nombre || r.sku_canon}</div>
          <div className="muted" style={{ fontSize: 11 }}>{r.sku_canon}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <label style={lbl}>Unidad
              <input className="search" type="number" style={{ marginTop: 4 }} defaultValue={r.precio_unidad || ''}
                disabled={saving === r.sku_canon}
                onBlur={e => { if (String(e.target.value) !== String(r.precio_unidad || '')) save(r, 'precio_unidad', e.target.value) }} />
            </label>
            <label style={lbl}>Caja
              <input className="search" type="number" style={{ marginTop: 4 }} defaultValue={r.precio_caja || ''}
                disabled={saving === r.sku_canon}
                onBlur={e => { if (String(e.target.value) !== String(r.precio_caja || '')) save(r, 'precio_caja', e.target.value) }} />
            </label>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── MEDIA (fotos, ficha, descripción) ────────────────────── */
function TabMedia({ onFlash }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(null)
  const [soloSinFoto, setSoloSinFoto] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase.from('stock')
        .select('sku_canon,producto_nombre,imagen_url,ficha_url,resena,marca,precio_unidad')
        .order('producto_nombre').limit(120)
      if (q.trim()) {
        query = query.or(`producto_nombre.ilike.%${q.trim()}%,sku_canon.ilike.%${q.trim()}%`)
      }
      const { data, error } = await query
      if (error) throw error
      let list = data || []
      if (soloSinFoto) list = list.filter(r => !r.imagen_url)
      setRows(list)
    } catch (e) {
      onFlash(false, e.message + ' — ¿columnas imagen_url/resena/ficha_url? Corré sql/10b.')
    } finally {
      setLoading(false)
    }
  }, [q, soloSinFoto, onFlash])

  useEffect(() => { const t = setTimeout(load, 280); return () => clearTimeout(t) }, [load])

  async function save(r, patch) {
    setSaving(r.sku_canon)
    try {
      const { error } = await supabase.from('stock').update(patch).eq('sku_canon', r.sku_canon)
      if (error) throw error
      setRows(prev => prev.map(x => (x.sku_canon === r.sku_canon ? { ...x, ...patch } : x)))
      onFlash(true, 'Media guardada')
    } catch (e) {
      onFlash(false, e.message)
    } finally {
      setSaving(null)
    }
  }

  async function uploadFoto(r, file) {
    if (!file || !r?.sku_canon) return
    setSaving(r.sku_canon)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `productos/${r.sku_canon}.${ext}`
      const { error: upErr } = await supabase.storage.from('productos').upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/jpeg',
      })
      if (upErr) {
        // fallback: no bucket — pedir URL
        throw new Error(upErr.message + ' — Creá bucket público "productos" o pegá URL de Drive.')
      }
      const { data: pub } = supabase.storage.from('productos').getPublicUrl(path)
      const url = pub?.publicUrl
      if (!url) throw new Error('No se obtuvo URL pública')
      await save(r, { imagen_url: url })
    } catch (e) {
      onFlash(false, e.message)
      setSaving(null)
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.45 }}>
          Foto, ficha técnica (PDF) y descripción corta del producto.
          Podés <b>subir imagen</b> (bucket Supabase <code>productos</code>) o pegar URL de Drive / web.
        </p>
        <input className="search" placeholder="Buscar SKU o nombre…" value={q} onChange={e => setQ(e.target.value)} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={soloSinFoto} onChange={e => setSoloSinFoto(e.target.checked)} />
          Solo sin foto
        </label>
      </div>
      {loading && <p className="muted">Cargando…</p>}
      {rows.map(r => (
        <div key={r.sku_canon} className="card" style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{
              width: 72, height: 72, borderRadius: 12, overflow: 'hidden', background: 'var(--surface-3)', flex: '0 0 auto',
            }}>
              {r.imagen_url ? (
                <img src={r.imagen_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => { e.currentTarget.style.opacity = '0.3' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--muted)' }}>Sin foto</div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{r.producto_nombre || r.sku_canon}</div>
              <div className="muted" style={{ fontSize: 11 }}>{r.sku_canon}</div>
              <label style={{ ...lbl, marginTop: 6 }}>
                Subir foto
                <input type="file" accept="image/*" style={{ marginTop: 4, fontSize: 12 }}
                  disabled={saving === r.sku_canon}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) uploadFoto(r, f)
                    e.target.value = ''
                  }} />
              </label>
            </div>
          </div>
          <label style={lbl}>URL imagen
            <input className="search" style={{ marginTop: 4 }} defaultValue={r.imagen_url || ''}
              placeholder="https://drive.google.com/uc?export=view&id=…"
              disabled={saving === r.sku_canon}
              onBlur={e => {
                const v = e.target.value.trim()
                if (v !== (r.imagen_url || '')) save(r, { imagen_url: v || null })
              }} />
          </label>
          <label style={lbl}>URL ficha técnica (PDF)
            <input className="search" style={{ marginTop: 4 }} defaultValue={r.ficha_url || ''}
              placeholder="https://…/ficha.pdf"
              disabled={saving === r.sku_canon}
              onBlur={e => {
                const v = e.target.value.trim()
                if (v !== (r.ficha_url || '')) save(r, { ficha_url: v || null })
              }} />
          </label>
          <label style={lbl}>Descripción / reseña
            <textarea className="search" rows={2} style={{ marginTop: 4, resize: 'vertical' }}
              defaultValue={r.resena || ''}
              placeholder="Texto corto para el catálogo del cliente…"
              disabled={saving === r.sku_canon}
              onBlur={e => {
                const v = e.target.value.trim()
                if (v !== (r.resena || '')) save(r, { resena: v || null })
              }} />
          </label>
        </div>
      ))}
    </div>
  )
}

/* ─── METAS ────────────────────────────────────────────────── */
function TabMetas({ onFlash }) {
  const [rows, setRows] = useState([])
  const [ejecutivos, setEjecutivos] = useState([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [nuevoEid, setNuevoEid] = useState('')
  const [nuevaMeta, setNuevaMeta] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: ej }, { data: m, error }] = await Promise.all([
        supabase.from('ejecutivos').select('id, nombre, zona').order('zona'),
        supabase.from('metas').select('*').eq('mes', mes).order('ejecutivo_id'),
      ])
      if (error) throw error
      setEjecutivos(ej || [])
      setRows(m || [])
    } catch (e) {
      onFlash(false, e.message)
    } finally {
      setLoading(false)
    }
  }, [mes, onFlash])

  useEffect(() => { load() }, [load])

  async function saveMeta(row, metaMensual) {
    const n = Number(String(metaMensual).replace(/[^\d.]/g, ''))
    try {
      const payload = {
        ejecutivo_id: row.ejecutivo_id,
        mes,
        meta_mensual: n,
        venta_mtd: Number(row.venta_mtd) || 0,
        pct_avance: n > 0 ? Math.round(((Number(row.venta_mtd) || 0) / n) * 1000) / 10 : 0,
        fecha_snapshot: new Date().toISOString().slice(0, 10),
      }
      const { error } = await supabase.from('metas').upsert(payload, { onConflict: 'ejecutivo_id,mes' })
      if (error) {
        // sin unique constraint: update/insert manual
        // CRÍTICO: si este SELECT falla, `existing` queda undefined y el
        // flujo caía al INSERT → META DUPLICADA en vez de actualizar.
        // Ante error hay que abortar, nunca adivinar.
        const { data: existing, error: eSel } = await supabase
          .from('metas').select('id')
          .eq('ejecutivo_id', row.ejecutivo_id).eq('mes', mes).maybeSingle()
        if (eSel) throw new Error(`No se pudo verificar si la meta ya existe: ${eSel.message}`)
        if (existing?.id) {
          const { error: e2 } = await supabase.from('metas').update(payload).eq('id', existing.id)
          if (e2) throw e2
        } else {
          const { error: e3 } = await supabase.from('metas').insert(payload)
          if (e3) throw e3
        }
      }
      onFlash(true, 'Meta guardada')
      load()
    } catch (e) {
      onFlash(false, e.message)
    }
  }

  async function addMeta() {
    if (!nuevoEid || !nuevaMeta) return
    await saveMeta({ ejecutivo_id: nuevoEid, venta_mtd: 0 }, nuevaMeta)
    setNuevaMeta('')
  }

  const nombreEj = id => {
    const e = ejecutivos.find(x => x.id === id)
    return e ? `${e.nombre || id}${e.zona ? ` (${e.zona})` : ''}` : id
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <label style={lbl}>Mes (primer día)
          <input className="search" type="date" style={{ marginTop: 4 }} value={mes}
            onChange={e => setMes(e.target.value.slice(0, 8) + '01')} />
        </label>
        <p className="muted" style={{ fontSize: 11, margin: '8px 0 0' }}>
          Metas por ejecutivo/zona. La venta MTD la actualiza el ciclo; acá definís el objetivo.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Nueva / reemplazar meta</div>
        <select className="search" value={nuevoEid} onChange={e => setNuevoEid(e.target.value)}>
          <option value="">Ejecutivo…</option>
          {ejecutivos.map(e => (
            <option key={e.id} value={e.id}>{e.nombre || e.id}{e.zona ? ` (${e.zona})` : ''}</option>
          ))}
        </select>
        <input className="search" style={{ marginTop: 8 }} type="number" placeholder="Meta mensual ($)" value={nuevaMeta}
          onChange={e => setNuevaMeta(e.target.value)} />
        <button type="button" className="btn-primary" style={{ marginTop: 8, width: '100%', minHeight: 44 }} onClick={addMeta}>
          Guardar meta
        </button>
      </div>

      {loading && <p className="muted">Cargando…</p>}
      {rows.map(r => (
        <div key={r.id || r.ejecutivo_id} className="card" style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ fontWeight: 800 }}>{nombreEj(r.ejecutivo_id)}</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Venta MTD {moneyNum(r.venta_mtd)} · Avance {r.pct_avance != null ? `${r.pct_avance}%` : '—'}
          </div>
          <label style={lbl}>Meta mensual ($)
            <input className="search" type="number" style={{ marginTop: 4 }} defaultValue={r.meta_mensual || ''}
              onBlur={e => {
                if (String(e.target.value) !== String(r.meta_mensual || '')) saveMeta(r, e.target.value)
              }} />
          </label>
        </div>
      ))}
      {!loading && !rows.length && <p className="muted">Sin metas para este mes. Cargá arriba.</p>}
    </div>
  )
}

/* ─── FOCOS / SKU ──────────────────────────────────────────── */
function TabFocos({ onFlash }) {
  const [focos, setFocos] = useState([])
  const [stock, setStock] = useState([])
  const [ejecutivos, setEjecutivos] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  // nuevo foco
  const [nfEjec, setNfEjec] = useState('')
  const [nfNombre, setNfNombre] = useState('')
  const [nfMeta, setNfMeta] = useState('')
  const [nfUnidad, setNfUnidad] = useState('KG')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: f }, { data: ej }, { data: sk }] = await Promise.all([
        supabase.from('focos').select('*').order('foco').limit(100),
        supabase.from('ejecutivos').select('id, nombre, zona').order('zona'),
        supabase.from('stock').select('sku_canon,producto_nombre,es_foco_mes,precio_unidad,stock_operativo').order('producto_nombre').limit(300),
      ])
      setFocos(f || [])
      setEjecutivos(ej || [])
      setStock(sk || [])
    } catch (e) {
      onFlash(false, e.message)
    } finally {
      setLoading(false)
    }
  }, [onFlash])

  useEffect(() => { load() }, [load])

  async function toggleFocoSku(sku, on) {
    try {
      const { error } = await supabase.from('stock').update({ es_foco_mes: on }).eq('sku_canon', sku)
      if (error) throw error
      setStock(prev => prev.map(s => (s.sku_canon === sku ? { ...s, es_foco_mes: on } : s)))
      onFlash(true, on ? 'SKU marcado foco del mes' : 'SKU quitado de foco')
    } catch (e) {
      onFlash(false, e.message)
    }
  }

  async function saveFocoMeta(row, metaUnidad) {
    const n = Number(String(metaUnidad).replace(/[^\d.]/g, ''))
    try {
      const { error } = await supabase.from('focos').update({
        meta_unidad: n,
        pct_avance: n > 0 ? Math.round(((Number(row.vendido_unidad) || 0) / n) * 1000) / 10 : 0,
      }).eq('id', row.id)
      if (error) throw error
      onFlash(true, 'Foco actualizado')
      load()
    } catch (e) {
      onFlash(false, e.message)
    }
  }

  async function addFoco() {
    if (!nfEjec || !nfNombre) return
    try {
      const { error } = await supabase.from('focos').insert({
        ejecutivo_id: nfEjec,
        foco: nfNombre.trim(),
        meta_unidad: Number(nfMeta) || 0,
        unidad_meta: nfUnidad,
        vendido_unidad: 0,
        pct_avance: 0,
        estado_ritmo: 'en_curso',
        fecha_snapshot: new Date().toISOString().slice(0, 10),
      })
      if (error) throw error
      onFlash(true, 'Foco creado')
      setNfNombre('')
      setNfMeta('')
      load()
    } catch (e) {
      onFlash(false, e.message)
    }
  }

  async function deleteFoco(id) {
    if (!confirm('¿Eliminar este foco?')) return
    try {
      const { error } = await supabase.from('focos').delete().eq('id', id)
      if (error) throw error
      onFlash(true, 'Foco eliminado')
      load()
    } catch (e) {
      onFlash(false, e.message)
    }
  }

  const stockFiltrado = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return stock.slice(0, 80)
    return stock.filter(s =>
      String(s.producto_nombre || '').toLowerCase().includes(t) ||
      String(s.sku_canon || '').includes(t)
    ).slice(0, 80)
  }, [stock, q])

  const nombreEj = id => {
    const e = ejecutivos.find(x => x.id === id)
    return e ? `${e.nombre || id}${e.zona ? ` (${e.zona})` : ''}` : id
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Focos del mes (metas por producto/unidad)</div>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
          Ej. “Pollo 3000 KG” por zona. El ciclo actualiza lo vendido; acá definís el objetivo.
        </p>
        <select className="search" value={nfEjec} onChange={e => setNfEjec(e.target.value)}>
          <option value="">Ejecutivo / zona…</option>
          {ejecutivos.map(e => (
            <option key={e.id} value={e.id}>{e.nombre || e.id}{e.zona ? ` (${e.zona})` : ''}</option>
          ))}
        </select>
        <input className="search" style={{ marginTop: 8 }} placeholder="Nombre del foco (ej. Pollo)" value={nfNombre}
          onChange={e => setNfNombre(e.target.value)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8, marginTop: 8 }}>
          <input className="search" type="number" placeholder="Meta (cantidad)" value={nfMeta}
            onChange={e => setNfMeta(e.target.value)} />
          <select className="search" value={nfUnidad} onChange={e => setNfUnidad(e.target.value)}>
            <option value="KG">KG</option>
            <option value="UN">UN</option>
            <option value="LT">LT</option>
            <option value="$">$</option>
          </select>
        </div>
        <button type="button" className="btn-primary" style={{ marginTop: 8, width: '100%', minHeight: 44 }} onClick={addFoco}>
          Crear foco
        </button>
      </div>

      {loading && <p className="muted">Cargando…</p>}
      {focos.map(f => (
        <div key={f.id} className="card" style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 800 }}>{f.foco}</div>
              <div className="muted" style={{ fontSize: 11 }}>{nombreEj(f.ejecutivo_id)}</div>
            </div>
            <button type="button" onClick={() => deleteFoco(f.id)}
              style={{ border: 'none', background: 'var(--danger-lt)', color: 'var(--danger-dk)', borderRadius: 8, padding: '4px 10px', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
              Eliminar
            </button>
          </div>
          <div className="muted" style={{ fontSize: 12, margin: '6px 0' }}>
            Vendido {Number(f.vendido_unidad) || 0} {f.unidad_meta || ''} · {f.pct_avance != null ? `${f.pct_avance}%` : '—'}
          </div>
          <label style={lbl}>Meta ({f.unidad_meta || 'un'})
            <input className="search" type="number" style={{ marginTop: 4 }} defaultValue={f.meta_unidad || ''}
              onBlur={e => {
                if (String(e.target.value) !== String(f.meta_unidad || '')) saveFocoMeta(f, e.target.value)
              }} />
          </label>
        </div>
      ))}

      <div className="card" style={{ marginTop: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>SKU foco del mes (catálogo / stock)</div>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
          Marca productos a empujar. Se ve en Stock y catálogo como destacados.
        </p>
        <input className="search" placeholder="Buscar SKU…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {stockFiltrado.map(s => (
        <div key={s.sku_canon} className="card" style={{
          padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          borderColor: s.es_foco_mes ? 'var(--warn-lt5)' : undefined,
          background: s.es_foco_mes ? 'var(--brand-lt2)' : undefined,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 750, fontSize: 13 }}>{s.producto_nombre || s.sku_canon}</div>
            <div className="muted" style={{ fontSize: 11 }}>{s.sku_canon}</div>
          </div>
          <button
            type="button"
            className={s.es_foco_mes ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: '0 0 auto', fontSize: 12, padding: '8px 12px' }}
            onClick={() => toggleFocoSku(s.sku_canon, !s.es_foco_mes)}
          >
            {s.es_foco_mes ? 'Foco ✓' : 'Marcar foco'}
          </button>
        </div>
      ))}
    </div>
  )
}


/* ─── USUARIOS ─────────────────────────────────────────────── */
function TabUsuarios({ onFlash }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')
  const [zona, setZona] = useState('NOR-ORIENTE')
  const [rol, setRol] = useState('ejecutivo')
  const [email, setEmail] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('ejecutivos').select('id,nombre,zona,rol,email').order('zona')
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      onFlash(false, e.message)
    } finally {
      setLoading(false)
    }
  }, [onFlash])

  useEffect(() => { load() }, [load])

  async function saveRow(r, patch) {
    try {
      const { error } = await supabase.from('ejecutivos').update(patch).eq('id', r.id)
      if (error) throw error
      onFlash(true, 'Usuario actualizado')
      load()
    } catch (e) {
      onFlash(false, e.message)
    }
  }

  async function addUser() {
    if (!nombre.trim()) return
    try {
      const id = nombre.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 40) + '_' + Math.random().toString(36).slice(2, 6)
      const { error } = await supabase.from('ejecutivos').insert({
        id,
        nombre: nombre.trim(),
        zona,
        rol,
        email: email.trim() || null,
      })
      if (error) throw error
      onFlash(true, 'Usuario creado — asigná el mismo email en Supabase Auth')
      setNombre('')
      setEmail('')
      load()
    } catch (e) {
      onFlash(false, e.message)
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Nuevo ejecutivo</div>
        <input className="search" placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
        <input className="search" style={{ marginTop: 8 }} placeholder="Email (login)" value={email} onChange={e => setEmail(e.target.value)} />
        <select className="search" style={{ marginTop: 8 }} value={zona} onChange={e => setZona(e.target.value)}>
          {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select className="search" style={{ marginTop: 8 }} value={rol} onChange={e => setRol(e.target.value)}>
          <option value="ejecutivo">Ejecutivo</option>
          <option value="gerente">Gerente</option>
          <option value="admin">Admin</option>
        </select>
        <button type="button" className="btn-primary" style={{ marginTop: 8, width: '100%', minHeight: 44 }} onClick={addUser}>
          Crear usuario
        </button>
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Después creá el usuario en Supabase Auth con el mismo email para que pueda entrar.
        </p>
      </div>
      {loading && <p className="muted">Cargando…</p>}
      {rows.map(r => (
        <div key={r.id} className="card" style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ fontWeight: 800 }}>{r.nombre || r.id}</div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>{r.email || 'sin email'} · {r.id}</div>
          <label style={lbl}>Zona
            <select className="search" style={{ marginTop: 4 }} value={r.zona || ''} onChange={e => saveRow(r, { zona: e.target.value })}>
              {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <label style={lbl}>Rol
            <select className="search" style={{ marginTop: 4 }} value={r.rol || 'ejecutivo'} onChange={e => saveRow(r, { rol: e.target.value })}>
              <option value="ejecutivo">Ejecutivo</option>
              <option value="gerente">Gerente</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </label>
        </div>
      ))}
    </div>
  )
}

