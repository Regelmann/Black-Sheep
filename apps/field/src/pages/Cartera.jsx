import ClientActionBar from '../components/ClientActionBar.jsx'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PedidoSheet from '../components/PedidoSheet.jsx'
import HistorialPedidos from '../components/HistorialPedidos.jsx'
import OfertaClienteSheet from '../components/OfertaClienteSheet.jsx'
import { saveOfflineSnapshot, loadOfflineSnapshot, isProbablyOffline } from '../lib/offline'
import { money, DataAsOfBanner } from '../components.jsx'
import { useEjecutivo } from '../App.jsx'
import { parseSkuDetalle, pctRitmo, clpEfectivo } from '../lib/coach'
import {
  esActivoMes,
  esNuevoMes,
  esRecuperadoMes,
  cicloReposicion,
  skusAReponer,
  clienteTocaReponer,
  computeConsistentMetrics,
} from '../lib/metrics'

function estadoInfo(estado) {
  const e = (estado || '').toLowerCase()
  if (e.includes('activ')) return { cls: 'b-green' }
  if (e.includes('enfri')) return { cls: 'b-amber' }
  if (e.includes('riesgo')) return { cls: 'b-orange' }
  if (e.includes('dormi')) return { cls: 'b-gray' }
  if (e.includes('fug')) return { cls: 'b-red' }
  if (e.includes('nunca')) return { cls: 'b-gray' }
  return { cls: 'b-gray' }
}

const limpiaEstado = e => (e || 's/estado').replace(/^\d+_?/, '').replace(/_/g, ' ')
const limpiaOferta = t => (t ? String(t).replace(/_/g, ' ').replace(/\s+/g, ' ').trim() : '')


function nombreCliente(c) {
  return (
    c?.razon_social ||
    c?.nombre_razon ||
    c?.nombre_cliente ||
    c?.nombre_comercial ||
    c?.nombre ||
    '—'
  )
}




function mapsUrl(c) {
  if (c.lat != null && c.lng != null)
    return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
  if (c.direccion)
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.direccion)}`
  if (c.nombre_cliente) {
    const q = [c.nombre_cliente, c.comuna].filter(Boolean).join(' ')
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
  }
  return null
}

/** Alerta accionable del cliente (reglas simples, sin ML) */
function alertaCliente(c) {
  const dias = Number(c.dias_sin_comprar)
  const mtd = Number(c.venta_mtd) || 0
  const prom = Number(c.venta_mensual) || 0
  const oferta = (c.oferta_real || '').split('·')[0]?.replace(/^Foco:\s*/i, '').trim()

  if (c.es_bloqueado) {
    return { tone: 'bad', title: 'Bloqueado', body: 'No gestionar venta hasta desbloquear.' }
  }
  if (/FUGADO|DORMIDO/i.test(c.estado_fuga || '')) {
    return {
      tone: 'bad',
      title: 'Recuperar',
      body: oferta
        ? `Lleva ${dias || '—'}d sin comprar. Entrar con: ${oferta}`
        : `Lleva ${dias || '—'}d sin comprar. Agendá visita de recuperación.`,
    }
  }
  if (/RIESGO|ENFRIANDO/i.test(c.estado_fuga || '') || (dias === dias && dias >= 21)) {
    return {
      tone: 'warn',
      title: 'Hoy deberías contactarlo',
      body: oferta
        ? `${dias}d sin compra. Ofrecé hoy: ${oferta}`
        : `${dias}d sin compra. Confirmá pedido o visita.`,
    }
  }
  if (prom > 0 && mtd < prom * 0.5 && mtd >= 0) {
    const falta = prom - mtd
    return {
      tone: 'warn',
      title: 'Va bajo su promedio',
      body: oferta
        ? `Lleva ${money(mtd)} de ~${money(prom)}/mes. Cerrar gap ~${money(falta)} con: ${oferta}`
        : `Lleva ${money(mtd)} de ~${money(prom)} promedio. Faltan ~${money(falta)} al ritmo habitual.`,
    }
  }
  if (oferta) {
    return {
      tone: 'ok',
      title: 'Siguiente producto',
      body: `En la visita priorizá: ${oferta}`,
    }
  }
  return null
}

const PAGE = 40

export default function Cartera({ session }) {
  const nav = useNavigate()
  const eje = useEjecutivo()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [clientes, setClientes] = useState([])
  const [dataAsOf, setDataAsOf] = useState(null)
  const [showAdvFiltros, setShowAdvFiltros] = useState(false)
  const [advComuna, setAdvComuna] = useState('')
  const [advDias, setAdvDias] = useState('') // '' | '0-7' | '8-30' | '31-60' | '60+'
  const [advVentaMin, setAdvVentaMin] = useState('')
  const [advSoloTel, setAdvSoloTel] = useState(false)
  const [advOrden, setAdvOrden] = useState('venta') // venta | dias | nombre
  const [filtro, setFiltro] = useState(() => {
    const f = searchParams.get('filtro')
    if (!f) return 'Todos'
    if (f === 'Riesgo') return 'RIESGO'
    if (f === 'Enfri') return 'ENFRI'
    return f
  })
  const [q, setQ] = useState(() => searchParams.get('q') || '')
  const [notaDe, setNotaDe] = useState(null)
  const [pedidoCliente, setPedidoCliente] = useState(null)
  const [ofertaCliente, setOfertaCliente] = useState(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [expandido, setExpandido] = useState(null)
  const [show, setShow] = useState(PAGE)
  const [skuOpen, setSkuOpen] = useState({})

  async function cargar() {
    setLoading(true)
    const eid = eje?.eidVista || session.user.id
    let q = supabase
      .from('cartera')
      .select('*')
      .eq('ejecutivo_id', eid)
      .order('venta_mtd', { ascending: false, nullsFirst: false })
    const { data, error } = await q
    if (error) console.error('cartera error', error)
    setClientes(data || [])
      const snaps = (data || []).map(r => r.fecha_snapshot).filter(Boolean)
      if (snaps.length) {
        const sorted = [...snaps].sort()
        setDataAsOf(sorted[sorted.length - 1])
      } else {
        const off = loadOfflineSnapshot()
        setDataAsOf(off?.savedAt ? String(off.savedAt).slice(0, 10) : null)
      }
      try {
        saveOfflineSnapshot({ tipo: 'cartera', clientes: data || [], savedAt: new Date().toISOString() })
      } catch (_) {}
    setLoading(false)
  }

  useEffect(() => {
    if (eje?.eidVista) cargar()
  }, [eje?.eidVista])

  async function bloquear(cliente, motivo) {
    const key = cliente.cliente_key
    const id = cliente.id
    // Optimistic UI — se ve al toque aunque la red tarde
    setClientes(prev =>
      prev.map(c =>
        (id && c.id === id) || (key && c.cliente_key === key)
          ? { ...c, es_bloqueado: true, bloqueo_motivo: motivo }
          : c
      )
    )
    let q = supabase.from('cartera').update({ es_bloqueado: true })
    if (id) q = q.eq('id', id)
    else if (key) q = q.eq('cliente_key', key)
    else return
    const { error } = await q
    if (error) {
      // Rollback
      setClientes(prev =>
        prev.map(c =>
          (id && c.id === id) || (key && c.cliente_key === key)
            ? { ...c, es_bloqueado: false }
            : c
        )
      )
      alert('No se pudo bloquear: ' + (error.message || 'permiso / red'))
      return
    }
    try {
      await supabase.from('notas_cliente').insert({
        ejecutivo_id: session.user.id,
        cliente_key: key,
        nombre_local: cliente.nombre_cliente || cliente.razon_social,
        tipo: motivo === 'deuda' ? 'bloqueo_deuda' : 'bloqueo_cerrado',
        texto: motivo === 'deuda' ? 'Bloqueado por deuda' : 'Cerrado / sin actividad',
      })
    } catch {
      /* nota opcional */
    }
  }

  async function desbloquear(cliente) {
    const key = cliente.cliente_key
    const id = cliente.id
    setClientes(prev =>
      prev.map(c =>
        (id && c.id === id) || (key && c.cliente_key === key)
          ? { ...c, es_bloqueado: false, bloqueo_motivo: null }
          : c
      )
    )
    let q = supabase.from('cartera').update({ es_bloqueado: false })
    if (id) q = q.eq('id', id)
    else if (key) q = q.eq('cliente_key', key)
    else return
    const { error } = await q
    if (error) {
      setClientes(prev =>
        prev.map(c =>
          (id && c.id === id) || (key && c.cliente_key === key)
            ? { ...c, es_bloqueado: true }
            : c
        )
      )
      alert('No se pudo desbloquear: ' + (error.message || 'permiso / red'))
    }
  }

  const orden = [
    '1_ACTIVO',
    '2_ENFRIANDOSE',
    '3_EN_RIESGO',
    '4_DORMIDO',
    '5_FUGADO',
    '0_NUNCA_COMPRO',
  ]

  const resumen = useMemo(() => {
    const r = {}
    clientes.forEach(c => {
      if (c.estado_fuga) r[c.estado_fuga] = (r[c.estado_fuga] || 0) + 1
    })
    return r
  }, [clientes])

  const estadosOrd = Object.keys(resumen).sort((a, b) => orden.indexOf(a) - orden.indexOf(b))
  const nNuevos = clientes.filter(esNuevoMes).length
  const nRecuperados = clientes.filter(esRecuperadoMes).length
  const nActivosMes = clientes.filter(c => Number(c.venta_mtd) > 0).length
  const nSinVentaMes = clientes.filter(c => !(Number(c.venta_mtd) > 0)).length
  const nBloqueados = clientes.filter(c => c.es_bloqueado).length
  const comunasOpts = useMemo(() => {
    const s = new Set()
    for (const c of clientes) {
      const com = String(c.comuna || '').trim().toUpperCase()
      if (com) s.add(com)
    }
    return Array.from(s).sort()
  }, [clientes])
  const nAdvActivos = [advComuna, advDias, advVentaMin !== '' ? advVentaMin : '', advSoloTel ? '1' : '', advOrden !== 'venta' ? advOrden : ''].filter(Boolean).length

  const reponerHoy = useMemo(() => {
    try {
      return clientes
        .map(c => {
          const skus = skusAReponer(c)
          if (!skus.length) return null
          return {
            ...c,
            _reponer: skus,
            _urgencia: skus.some(s => s.tone === 'bad') ? 2 : 1,
          }
        })
        .filter(Boolean)
        .sort(
          (a, b) =>
            b._urgencia - a._urgencia ||
            (Number(b.venta_mensual) || 0) - (Number(a.venta_mensual) || 0)
        )
    } catch {
      return []
    }
  }, [clientes])

  const lista = useMemo(() => {
    let rows = clientes
    if (filtro === 'Bloqueados') rows = rows.filter(c => c.es_bloqueado)
    else if (filtro === 'Nuevos') rows = rows.filter(c => esNuevoMes(c))
    else if (filtro === 'Recuperados') rows = rows.filter(c => esRecuperadoMes(c))
    else if (filtro === 'ActivosMes') rows = rows.filter(c => Number(c.venta_mtd) > 0)
    else if (filtro === 'SinVentaMes') rows = rows.filter(c => !(Number(c.venta_mtd) > 0))
    else if (filtro === 'ReponerHoy') rows = rows.filter(c => clienteTocaReponer(c))
    else if (filtro === 'RIESGO') rows = rows.filter(c => /RIESGO/i.test(c.estado_fuga || ''))
    else if (filtro === 'ENFRI') rows = rows.filter(c => /ENFRI/i.test(c.estado_fuga || ''))
    else if (filtro === 'CerrarMeta') {
      // Clientes para sobrepasar meta: reponer + riesgo/enfri + altos $ sin venta mes
      rows = rows.filter(c => {
        if (c.es_bloqueado) return false
        if (clienteTocaReponer(c)) return true
        if (/RIESGO|ENFRI|FUGA|DORMIDO/i.test(c.estado_fuga || '')) return true
        const mtd = Number(c.venta_mtd) || 0
        const prom = Number(c.venta_mensual) || 0
        if (prom >= 200000 && mtd < prom * 0.5) return true
        return false
      })
    } else if (filtro === 'Foco') {
      // Clientes que alguna vez compraron / tienen el foco en mix
      const focoQ = (q || searchParams.get('q') || '').toLowerCase().trim()
      if (focoQ) {
        const tokens = focoQ.split(/\s+/).filter(t => t.length > 2)
        rows = rows.filter(c => {
          const hay = [
            c.sku_detalle, c.oferta_real, c.productos_top, c.nombre_cliente,
          ].map(x => String(x || '').toLowerCase()).join(' ')
          // match al menos 1 token fuerte del foco (ej. POLLO, HANKS)
          return tokens.some(t => hay.includes(t))
        })
      }
    } else if (filtro !== 'Todos') rows = rows.filter(c => c.estado_fuga === filtro)
    if (q && filtro !== 'Foco') {
      const qq = q.toLowerCase().trim()
      const tokens = qq.split(/\s+/).filter(Boolean)
      rows = rows.filter(c => {
        const hay = [
          c.nombre_cliente, c.comuna, c.cliente_key, c.direccion,
          c.razon_social, c.segmento, c.oferta_real, c.sku_detalle,
        ].map(x => String(x || '').toLowerCase()).join(' ')
        return tokens.every(t => hay.includes(t))
      })
    }
    // Filtros avanzados
    if (advComuna) {
      rows = rows.filter(c => String(c.comuna || '').toUpperCase() === advComuna)
    }
    if (advDias) {
      rows = rows.filter(c => {
        const d = Number(c.dias_sin_comprar)
        if (!Number.isFinite(d)) return advDias === '60+'
        if (advDias === '0-7') return d >= 0 && d <= 7
        if (advDias === '8-30') return d >= 8 && d <= 30
        if (advDias === '31-60') return d >= 31 && d <= 60
        if (advDias === '60+') return d > 60
        return true
      })
    }
    if (advVentaMin !== '' && advVentaMin != null) {
      const min = Number(advVentaMin) || 0
      rows = rows.filter(c => (Number(c.venta_mtd) || 0) >= min)
    }
    if (advSoloTel) {
      rows = rows.filter(c => {
        const tel = String(c.telefono || c.link_whatsapp || '').replace(/\D/g, '')
        return tel.length >= 8
      })
    }
    return [...rows].sort((a, b) => {
      if (advOrden === 'nombre') {
        return String(a.nombre_cliente || '').localeCompare(String(b.nombre_cliente || ''), 'es')
      }
      if (advOrden === 'dias') {
        const da = Number(a.dias_sin_comprar)
        const db = Number(b.dias_sin_comprar)
        const va = Number.isFinite(da) ? da : 9999
        const vb = Number.isFinite(db) ? db : 9999
        if (vb !== va) return vb - va
      }

      if (filtro === 'Foco' || filtro === 'CerrarMeta') {
        const score = c => {
          let s = 0
          if (clienteTocaReponer(c)) s += 50
          if (/RIESGO/i.test(c.estado_fuga || '')) s += 30
          if (/ENFRI/i.test(c.estado_fuga || '')) s += 20
          if (/FUGA|DORMIDO/i.test(c.estado_fuga || '')) s += 15
          const mtd = Number(c.venta_mtd) || 0
          const prom = Number(c.venta_mensual) || 0
          if (prom > 0 && mtd < prom * 0.5) s += 25
          s += Math.min(30, Math.log10(Math.max(prom, 1)) * 5)
          if (filtro === 'Foco' && q) {
            const toks = q.toLowerCase().split(/\s+/).filter(t => t.length > 2)
            const det = String(c.sku_detalle || '').toLowerCase()
            if (toks.some(tok => det.includes(tok))) s += 20
          }
          return s
        }
        const d = score(b) - score(a)
        if (d) return d
      }
      const va = Number(a.venta_mtd) || 0
      const vb = Number(b.venta_mtd) || 0
      if (vb !== va) return vb - va
      return (Number(b.venta_mensual) || 0) - (Number(a.venta_mensual) || 0)
    })
  }, [clientes, filtro, q, searchParams, advComuna, advDias, advVentaMin, advSoloTel, advOrden])

  function exportarCSV(modo) {
    // modo: 'todo' | 'bloqueados' | 'fugados' | 'reponer'
    let base = clientes
    let fname = 'cartera'
    if (modo === true || modo === 'bloqueados') {
      base = clientes.filter(c => c.es_bloqueado)
      fname = 'bloqueados'
    } else if (modo === 'fugados') {
      base = clientes.filter(c => /FUGA|RIESGO|DORMIDO|ENFRI/i.test(String(c.estado_fuga || '')))
      fname = 'riesgo_fugados'
    } else if (modo === 'reponer') {
      base = clientes.filter(c => clienteTocaReponer(c))
      fname = 'reponer_hoy'
    } else if (modo === 'con_venta') {
      base = clientes.filter(c => Number(c.venta_mtd) > 0)
      fname = 'con_venta_mes'
    } else {
      base = lista.length ? lista : clientes
      fname = filtro === 'Todos' ? 'cartera' : 'cartera_' + String(filtro).replace(/\s+/g, '_')
    }
    if (!base.length) {
      alert('No hay clientes para exportar.')
      return
    }
    const cab = [
      'nombre', 'cliente_key', 'comuna', 'estado', 'bloqueado',
      'venta_mtd', 'venta_promedio_mensual', 'dias_sin_comprar',
      'oferta', 'productos_top', 'sku_detalle', 'telefono', 'contacto',
      'fecha_snapshot', 'direccion',
    ].join(',')
    const filas = base
      .map(c =>
        [
          c.nombre_cliente,
          c.cliente_key,
          c.comuna,
          limpiaEstado(c.estado_fuga),
          c.es_bloqueado ? 'SI' : 'NO',
          c.venta_mtd,
          c.venta_mensual,
          c.dias_sin_comprar,
          c.oferta_real,
          c.productos_top,
          c.sku_detalle,
          c.telefono,
          c.persona_contacto,
          c.fecha_snapshot,
          c.direccion,
        ]
          .map(x => `"${(x ?? '').toString().replace(/"/g, "'")}"`)
          .join(',')
      )
      .join('\n')
    const blob = new Blob(['\ufeff' + cab + '\n' + filas], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fname + '_' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="bs-spinner">Cargando cartera…</div>

  return (
    <div className="bs-page">
      <div className="bs-page-hero">
        <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#fdba74', marginBottom: 8,
          }}>Clientes</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 8 }}>
          Mi cartera
        </h1>
        <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.62)', fontWeight: 500, lineHeight: 1.4 }}>
          {clientes.length} en zona · {nActivosMes} con venta este mes · {nNuevos} nuevos
        </p>
        {dataAsOf && (
          <p style={{ fontSize: 11, color: 'rgba(253,186,116,0.9)', fontWeight: 600, marginTop: 8 }}>
            Datos al {String(dataAsOf).slice(0, 10)}
          </p>
        )}
      </div>

      <div className="wrap">
        {dataAsOf && <DataAsOfBanner fecha={dataAsOf} extra={`${clientes.length} clientes · zona activa`} />}
        <div className="estado-grid">
          <button
            className={'estado-card' + (filtro === 'ActivosMes' ? ' sel' : '')}
            onClick={() => { setFiltro(filtro === 'ActivosMes' ? 'Todos' : 'ActivosMes'); setShow(PAGE) }}
          >
            <div className="estado-num t-green">{nActivosMes}</div>
            <div className="estado-lbl">CON VENTA MES</div>
          </button>
          <button
            className={'estado-card' + (filtro === 'SinVentaMes' ? ' sel' : '')}
            onClick={() => { setFiltro(filtro === 'SinVentaMes' ? 'Todos' : 'SinVentaMes'); setShow(PAGE) }}
          >
            <div className="estado-num t-amber">{nSinVentaMes}</div>
            <div className="estado-lbl">SIN VENTA MES</div>
          </button>
          <button
            className={'estado-card' + (filtro === 'Nuevos' ? ' sel' : '')}
            onClick={() => { setFiltro(filtro === 'Nuevos' ? 'Todos' : 'Nuevos'); setShow(PAGE) }}
          >
            <div className="estado-num t-blue">{nNuevos}</div>
            <div className="estado-lbl">NUEVOS MES</div>
          </button>
          {estadosOrd.filter(e => /RIESGO|FUGADO|DORMIDO|ENFRIANDO/i.test(e)).map(e => {
            const info = estadoInfo(e)
            return (
              <button
                key={e}
                className={'estado-card' + (filtro === e ? ' sel' : '')}
                onClick={() => { setFiltro(filtro === e ? 'Todos' : e); setShow(PAGE) }}
              >
                <div className={'estado-num ' + info.cls.replace('b-', 't-')}>{resumen[e]}</div>
                <div className="estado-lbl">{limpiaEstado(e)}</div>
              </button>
            )
          })}
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '4px 0 8px' }}>
          Con venta mes = facturó en el mes en curso (bajada). Salud (riesgo/fugado) es histórico.
        </p>

        <input
          className="search"
          placeholder="Buscar cliente o comuna..."
          value={q}
          onChange={e => {
            setQ(e.target.value)
            setShow(PAGE)
          }}
        />

        <div className="filter-row bs-chips">
          <button
            className={'filter-btn' + (filtro === 'Todos' ? ' active' : '')}
            onClick={() => {
              setFiltro('Todos')
              setShow(PAGE)
            }}
          >
            Todos
          </button>
          <button
            className={'filter-btn' + (filtro === 'Bloqueados' ? ' active' : '')}
            onClick={() => {
              setFiltro('Bloqueados')
              setShow(PAGE)
            }}
            style={filtro === 'Bloqueados' ? { background: '#b91c1c', color: '#fff', borderColor: '#b91c1c' } : (nBloqueados > 0 ? { borderColor: '#fecaca', color: '#b91c1c' } : {})}
          >
            Bloqueados{nBloqueados > 0 ? ` (${nBloqueados})` : ''}
          </button>
          <button
            className={'filter-btn' + (filtro === 'Nuevos' ? ' active' : '')}
            onClick={() => {
              setFiltro('Nuevos')
              setShow(PAGE)
            }}
          >
            Nuevos ({nNuevos})
          </button>
          {nRecuperados > 0 && (
            <button
              className={'filter-btn' + (filtro === 'Recuperados' ? ' active' : '')}
              onClick={() => { setFiltro('Recuperados'); setShow(PAGE) }}
            >
              Recuperados ({nRecuperados})
            </button>
          )}
          <button
            className={'filter-btn' + (filtro === 'ReponerHoy' ? ' active' : '')}
            onClick={() => {
              setFiltro('ReponerHoy')
              setShow(PAGE)
            }}
            style={filtro === 'ReponerHoy' ? { background: '#c2410c', color: '#fff', borderColor: '#c2410c' } : {}}
          >
            Reponer ({reponerHoy.length})
          </button>
          <button
            type="button"
            className={'filter-btn' + (showAdvFiltros || nAdvActivos > 0 ? ' active' : '')}
            onClick={() => setShowAdvFiltros(v => !v)}
            style={showAdvFiltros || nAdvActivos > 0 ? { background: '#fff7ed', color: '#c2410c', borderColor: '#fdba74' } : {}}
          >
            Más filtros{nAdvActivos > 0 ? ` (${nAdvActivos})` : ''}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={'filter-btn' + (exportOpen ? ' active' : '')}
              onClick={() => setExportOpen(o => !o)}
            >
              Exportar ▾
            </button>
            {exportOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 6,
                  background: '#fff',
                  border: '1px solid #ebe6df',
                  borderRadius: 14,
                  boxShadow: '0 12px 32px rgba(26,22,20,0.12)',
                  zIndex: 50,
                  minWidth: 200,
                  overflow: 'hidden',
                }}
              >
                {[
                  ['todo', 'Toda la cartera'],
                  ['bloqueados', 'Bloqueados'],
                  ['fugados', 'Riesgo / fugados'],
                  ['reponer', 'A reponer'],
                ].map(([modo, label]) => (
                  <button
                    key={modo}
                    type="button"
                    onClick={() => {
                      exportarCSV(modo)
                      setExportOpen(false)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 16px',
                      border: 'none',
                      borderBottom: '1px solid #f5f5f4',
                      background: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#1a1614',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {showAdvFiltros && (
          <div style={{
            background: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 14,
            padding: 12, marginBottom: 12,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#78716c' }}>
                Comuna
                <select
                  value={advComuna}
                  onChange={e => { setAdvComuna(e.target.value); setShow(PAGE) }}
                  style={{
                    display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box',
                    border: '1px solid #e7e5e4', borderRadius: 10, padding: '10px 10px',
                    font: 'inherit', fontSize: 13, background: '#fff',
                  }}
                >
                  <option value="">Todas</option>
                  {comunasOpts.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#78716c' }}>
                Días sin compra
                <select
                  value={advDias}
                  onChange={e => { setAdvDias(e.target.value); setShow(PAGE) }}
                  style={{
                    display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box',
                    border: '1px solid #e7e5e4', borderRadius: 10, padding: '10px 10px',
                    font: 'inherit', fontSize: 13, background: '#fff',
                  }}
                >
                  <option value="">Cualquiera</option>
                  <option value="0-7">0–7 días</option>
                  <option value="8-30">8–30 días</option>
                  <option value="31-60">31–60 días</option>
                  <option value="60+">Más de 60</option>
                </select>
              </label>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#78716c' }}>
                Venta MTD mínima
                <input
                  type="number"
                  min={0}
                  placeholder="Ej. 500000"
                  value={advVentaMin}
                  onChange={e => { setAdvVentaMin(e.target.value); setShow(PAGE) }}
                  style={{
                    display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box',
                    border: '1px solid #e7e5e4', borderRadius: 10, padding: '10px 10px',
                    font: 'inherit', fontSize: 13, background: '#fff',
                  }}
                />
              </label>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#78716c' }}>
                Ordenar por
                <select
                  value={advOrden}
                  onChange={e => setAdvOrden(e.target.value)}
                  style={{
                    display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box',
                    border: '1px solid #e7e5e4', borderRadius: 10, padding: '10px 10px',
                    font: 'inherit', fontSize: 13, background: '#fff',
                  }}
                >
                  <option value="venta">Venta MTD</option>
                  <option value="dias">Días sin compra</option>
                  <option value="nombre">Nombre</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#44403c' }}>
                <input
                  type="checkbox"
                  checked={advSoloTel}
                  onChange={e => { setAdvSoloTel(e.target.checked); setShow(PAGE) }}
                />
                Solo con teléfono / WhatsApp
              </label>
              {nAdvActivos > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setAdvComuna('')
                    setAdvDias('')
                    setAdvVentaMin('')
                    setAdvSoloTel(false)
                    setAdvOrden('venta')
                    setShow(PAGE)
                  }}
                  style={{
                    border: 'none', background: 'transparent', color: '#c2410c',
                    fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12, marginTop: 4, gap: 8,
        }}>
          <div style={{ fontSize: 12, color: '#78716c', fontWeight: 600 }}>
            {Math.min(show, lista.length)} de {lista.length}
            {filtro === 'ReponerHoy' ? ' · reposición vencida' : ''}
            {filtro === 'CerrarMeta' ? ' · para cerrar / superar meta' : ''}
            {filtro === 'Foco' && q ? ` · foco: ${q}` : ''}{nAdvActivos > 0 ? ` · ${nAdvActivos} filtro${nAdvActivos > 1 ? 's' : ''} adv.` : ''}
          </div>
          {reponerHoy.length > 0 && filtro !== 'ReponerHoy' && (
            <button
              type="button"
              onClick={() => { setFiltro('ReponerHoy'); setShow(PAGE) }}
              style={{
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', color: '#9a3412',
                fontSize: 11, fontWeight: 800, padding: '6px 12px',
                borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                border: '1.5px solid #fb923c',
              }}
            >
              {reponerHoy.length} a reponer
            </button>
          )}
        </div>

        {lista.slice(0, show).map(c => {
          const info = estadoInfo(c.estado_fuga)
          const cardKey = c.id || c.cliente_key
          const abierto = expandido === cardKey
          const nav = mapsUrl(c)
          const skus = parseSkuDetalle(c.sku_detalle)
          const aReponer = skusAReponer(c)
          const nSkuMix = skus.length
          const mtd = Number(c.venta_mtd) || 0
          const prom = Number(c.venta_mensual) || 0
          const pct = pctRitmo(mtd, prom)
          const pctBar = pct != null ? Math.min(100, Math.max(0, pct)) : 0
          const ofertaTxt = limpiaOferta(c.oferta_real)
          const topReponer = aReponer.slice(0, 2)

          return (
            <div
              key={c.id || c.cliente_key}
              style={{
                background: '#fff',
                border: c.es_bloqueado ? '1.5px solid #fecaca' : '1px solid #ebe6e0',
                borderRadius: 12,
                marginBottom: 6,
                overflow: 'hidden',
                boxShadow: abierto ? '0 6px 20px rgba(26,22,20,0.08)' : '0 1px 2px rgba(26,22,20,0.04)',
              }}
            >
              {/* ── Cabecera compacta ── */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
                onClick={() => setExpandido(abierto ? null : cardKey)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: '#1a1614',
                      letterSpacing: '-0.01em',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {nombreCliente(c)}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span className={'badge ' + info.cls}>{limpiaEstado(c.estado_fuga)}</span>
                    {c.es_bloqueado && <span className="badge b-red">Bloqueado</span>}
                    {esNuevoMes(c) && <span className="badge b-blue">Nuevo</span>}
                    {aReponer.length > 0 && (
                      <span
                        className="badge"
                        style={{ background: '#fef2f2', color: '#b91c1c' }}
                      >
                        Reponer {aReponer.length}
                      </span>
                    )}
                    {nSkuMix > 0 && (
                      <span className="badge b-gray">{nSkuMix} SKU</span>
                    )}
                    {c.comuna && (
                      <span style={{ fontSize: 12, color: '#a8a29e', fontWeight: 500 }}>
                        {c.comuna}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#c2410c', letterSpacing: '-0.02em' }}>
                    {money(mtd > 0 ? mtd : prom)}
                  </div>
                  <div style={{ fontSize: 11, color: '#a8a29e', fontWeight: 600, marginTop: 2 }}>
                    {mtd > 0 ? 'este mes' : 'prom. mes'}
                  </div>
                </div>
                <div
                  style={{
                    color: '#d6d3d1',
                    fontSize: 18,
                    fontWeight: 700,
                    transform: abierto ? 'rotate(90deg)' : 'none',
                    transition: 'transform .15s',
                  }}
                >
                  ›
                </div>
              </div>

              {/* ── Detalle ── */}
              {abierto && (
                <div style={{ padding: '0 16px 16px' }}>
                  {/* Métricas simples */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        background: '#faf8f5',
                        borderRadius: 12,
                        padding: '12px 14px',
                        border: '1px solid #ebe6e0',
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', letterSpacing: '0.04em' }}>
                        ESTE MES
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1614', marginTop: 2 }}>
                        {money(mtd)}
                      </div>
                    </div>
                    <div
                      style={{
                        background: '#faf8f5',
                        borderRadius: 12,
                        padding: '12px 14px',
                        border: '1px solid #ebe6e0',
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', letterSpacing: '0.04em' }}>
                        PROMEDIO
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1614', marginTop: 2 }}>
                        {money(prom)}
                      </div>
                    </div>
                  </div>

                  {pct != null && (
                    <div style={{ marginBottom: 14 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#78716c',
                          marginBottom: 6,
                        }}
                      >
                        <span>Ritmo del mes</span>
                        <span style={{ color: pct >= 100 ? '#15803d' : pct >= 50 ? '#b45309' : '#dc2626' }}>
                          {pct}%
                        </span>
                      </div>
                      <div className="progress-bg">
                        <div
                          className="progress-fill"
                          style={{
                            width: pctBar + '%',
                            background: pct >= 100 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Una sola acción prioritaria */}
                  {(ofertaTxt || topReponer.length > 0) && (
                    <div
                      style={{
                        background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                        border: '1.5px solid #fb923c',
                        borderRadius: 12,
                        padding: '12px 14px',
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: '#c2410c',
                          letterSpacing: '0.06em',
                          marginBottom: 4,
                        }}
                      >
                        OFRECÉ HOY
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1614', lineHeight: 1.35 }}>
                        {ofertaTxt ||
                          topReponer.map(s => s.nombre).join(' · ')}
                      </div>
                      {topReponer.length > 0 && ofertaTxt && (
                        <div style={{ fontSize: 12, color: '#9a3412', marginTop: 6, lineHeight: 1.35 }}>
                          Reponer: {topReponer.map(s => s.nombre.split(' ').slice(0, 4).join(' ')).join(' · ')}
                          {aReponer.length > 2 ? ` +${aReponer.length - 2}` : ''}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Contacto breve */}
                  {(c.persona_contacto || c.dias_sin_comprar != null) && (
                    <div
                      style={{
                        fontSize: 12,
                        color: '#78716c',
                        marginBottom: 12,
                        lineHeight: 1.4,
                      }}
                    >
                      {c.persona_contacto && <span>{c.persona_contacto}</span>}
                      {c.persona_contacto && c.dias_sin_comprar != null && <span> · </span>}
                      {c.dias_sin_comprar != null && (
                        <span>
                          {Number(c.dias_sin_comprar) === 0
                            ? 'Compró hoy'
                            : `Sin comprar ${c.dias_sin_comprar} d`}
                        </span>
                      )}
                      {c.ultima_compra && (
                        <span>
                          {(c.dias_sin_comprar != null) ? ' · ' : ''}
                          Últ. venta {String(c.ultima_compra).slice(0, 10).split('-').reverse().join('/')}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Acciones principales — botones separados (no texto pegado) */}
                  <ClientActionBar
                    telefono={c.telefono}
                    onNota={() => setNotaDe(c)}
                    onVisita={() => nav('/visita/' + encodeURIComponent(c.cliente_key))}
                  />

                  {aReponer.length > 0 && (
                    <div style={{ marginTop: 12, background: '#fef2f2', borderRadius: 12, padding: '8px 12px', border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#b91c1c', letterSpacing: '0.06em', marginBottom: 6 }}>
                        A REPONER
                      </div>
                      {aReponer.slice(0, 5).map((s, i) => (
                        <div key={i} style={{
                          display: 'flex', gap: 8, alignItems: 'flex-start',
                          padding: '6px 0',
                          borderTop: i === 0 ? 'none' : '1px solid #fecaca55',
                        }}>
                          <span style={{
                            flexShrink: 0, width: 18, height: 18, borderRadius: 6,
                            background: '#fee2e2', color: '#b91c1c',
                            fontSize: 10, fontWeight: 800,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}>{i + 1}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: '#1c1917' }}>{s.nombre}</div>
                            <div style={{ fontSize: 11, color: '#9a3412', marginTop: 1 }}>
                              {s.recompra?.label || (s.estadoRecompra === 'RECOMPRAR_HOY' ? 'Reponer hoy' : 'Atrasado')}
                              {s.falta > 0 ? ` · falta ${Number(s.falta).toLocaleString('es-CL', { maximumFractionDigits: 1 })}` : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                      {skus.filter(s => s.nombre && s.nombre.length > 2 && !/^\d+$/.test(s.nombre)).length > 0 ? (
                        skus
                          .filter(s => s.nombre && s.nombre.length > 2 && !/^\d+$/.test(s.nombre))
                          .sort((a, b) => (Number(b.clpMtd) || Number(b.udMtd) || 0) - (Number(a.clpMtd) || Number(a.udMtd) || 0))
                          .map((s, i) => {
                          const p = pctRitmo(s.udMtd, s.promUd)
                          const barPct = p != null ? Math.min(100, Math.max(0, p)) : 0
                          const barColor = p == null ? '#d6d3d1' : p >= 100 ? '#22c55e' : p >= 50 ? '#f59e0b' : '#ef4444'
                          const clp = clpEfectivo(s)
                          const tieneData = s.udMtd > 0 || s.promUd > 0 || clp > 0
                          return (
                            <div
                              key={i}
                              style={{
                                padding: '10px 0',
                                borderBottom: i < skus.length - 1 ? '1px solid #f5f5f4' : 'none',
                                opacity: tieneData ? 1 : 0.5,
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1614', flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                                  {s.nombre}
                                </div>
                                <span style={{ fontWeight: 800, fontSize: 13, color: barColor, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {clp > 0 ? money(clp) : p != null ? p + '%' : '—'}
                                </span>
                              </div>
                              {tieneData && (
                                <>
                                  <div style={{ marginTop: 5, height: 4, borderRadius: 999, background: '#f0ece6', overflow: 'hidden' }}>
                                    <div style={{ width: barPct + '%', height: '100%', borderRadius: 999, background: barColor, transition: 'width .3s ease' }} />
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a8a29e', marginTop: 4, gap: 8 }}>
                                    <span>
                                      {s.udMtd > 0 ? `${Number(s.udMtd).toLocaleString('es-CL', { maximumFractionDigits: 1 })} ud este mes` : 'Sin compra este mes'}
                                    </span>
                                    <span>
                                      {s.promUd > 0 ? `prom ${Number(s.promUd).toLocaleString('es-CL', { maximumFractionDigits: 1 })} ud` : ''}
                                      {s.promClp > 0 ? ` · ${money(s.promClp)}` : ''}
                                    </span>
                                  </div>
                                  {(s.estadoRecompra === 'RECOMPRAR_HOY' || s.estadoRecompra === 'RECOMPRAR_PRONTO') && (
                                    <div style={{ fontSize: 11, color: s.estadoRecompra === 'RECOMPRAR_HOY' ? '#b91c1c' : '#c2410c', marginTop: 3, fontWeight: 700 }}>
                                      {s.estadoRecompra === 'RECOMPRAR_HOY' ? '⚡ Reponer hoy' : '↑ Reponer pronto'}
                                      {s.falta > 0 ? ` · faltan ${Number(s.falta).toLocaleString('es-CL', { maximumFractionDigits: 1 })} ud` : ''}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )
                        })
                      ) : (
                        <div style={{ fontSize: 12, color: '#a8a29e', padding: '10px 0', textAlign: 'center' }}>
                          Sin historial de productos. Corré el ciclo para ver el mix.
                        </div>
                      )}

                      <div className="cli-bloqueo" style={{ marginTop: 12 }}>
                        {c.es_bloqueado ? (
                          <button type="button" className="blq-btn blq-off" onClick={() => desbloquear(c)}>
                            Desbloquear
                          </button>
                        ) : (
                          <>
                            <button type="button" className="blq-btn blq-on" onClick={() => bloquear(c, 'cerrado')}>
                              Cerrado
                            </button>
                            <button type="button" className="blq-btn blq-on" onClick={() => bloquear(c, 'deuda')}>
                              Deuda
                            </button>
                          </>
                        )}
                      </div>
                </div>
              )}
            </div>
          )
        })}

        {lista.length > show && (
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setShow(s => s + PAGE)}>
            Ver más ({lista.length - show})
          </button>
        )}

        {!lista.length && (
          <div
            style={{
              background: '#fff',
              border: '1px solid #ebe6df',
              borderRadius: 16,
              padding: '28px 20px',
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1614', marginBottom: 6 }}>
              Nada en este filtro
            </div>
            <p style={{ fontSize: 13, color: '#78716c', margin: '0 0 14px', lineHeight: 1.45 }}>
              Probá &quot;Todos&quot; o buscá por nombre / comuna.
            </p>
            <button
              type="button"
              className="filter-btn active"
              onClick={() => { setFiltro('Todos'); setShow(PAGE); setQ('') }}
            >
              Ver toda la cartera
            </button>
          </div>
        )}
      </div>

      {notaDe && <NotaModal cliente={notaDe} session={session} onClose={() => setNotaDe(null)} />}
      {ofertaCliente && (
        <OfertaClienteSheet
          cliente={ofertaCliente}
          ejecutivoId={eje?.eidVista || session.user.id}
          onClose={() => setOfertaCliente(null)}
        />
      )}
      {pedidoCliente && (
        <PedidoSheet
          cliente={pedidoCliente}
          initialPedido={pedidoCliente._pedido || null}
          aReponer={skusAReponer(pedidoCliente)}
          ejecutivoId={eje?.eidVista || session.user.id}
          ejecutivoNombre={eje?.nombre || eje?.zona}
          onClose={() => setPedidoCliente(null)}
        />
      )}

    </div>
  )
}

function NotaModal({ cliente, session, onClose }) {
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('otro')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)
  const tipos = [
    { v: 'sin_stock', l: 'Sin stock' },
    { v: 'volver', l: 'Volver' },
    { v: 'no_interesado', l: 'No interesa' },
    { v: 'pidio', l: 'Pidio' },
    { v: 'otro', l: 'Otro' },
  ]

  async function guardar() {
    setBusy(true)
    const { error } = await supabase.from('notas_cliente').insert({
      ejecutivo_id: session.user.id,
      cliente_key: cliente.cliente_key,
      nombre_local: cliente.nombre_cliente,
      tipo,
      texto,
    })
    setBusy(false)
    if (!error) {
      setOk(true)
      setTimeout(onClose, 900)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(28,25,23,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          padding: '18px 16px 28px',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.25)',
          maxHeight: '85vh',
          overflow: 'auto',
        }}
      >
        <div style={{ width: 40, height: 4, background: '#e7e5e4', borderRadius: 4, margin: '0 auto 14px' }} />
        <div style={{ fontSize: 11, fontWeight: 800, color: '#c2410c', letterSpacing: '.06em' }}>NOTA</div>
        <h3 style={{ margin: '4px 0 12px', fontSize: 17, fontWeight: 800, color: '#1c1917' }}>
          {cliente.nombre_cliente}
        </h3>
        {ok ? (
          <div className="badge b-green">Nota guardada</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {tipos.map(t => (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setTipo(t.v)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 999,
                    border: tipo === t.v ? 'none' : '1.5px solid #e7e5e4',
                    background: tipo === t.v ? '#1c1917' : '#fff',
                    color: tipo === t.v ? '#fff' : '#44403c',
                    fontWeight: 700,
                    fontSize: 12,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {t.l}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Escribe tu nota..."
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 12,
                border: '1.5px solid #e7e5e4',
                fontFamily: 'inherit',
                fontSize: 14,
                resize: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1, padding: 14, borderRadius: 12,
                  border: '1.5px solid #e7e5e4', background: '#fff',
                  fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={busy || !texto}
                style={{
                  flex: 1, padding: 14, borderRadius: 12, border: 'none',
                  background: busy || !texto ? '#d6d3d1' : '#c2410c',
                  color: '#fff', fontWeight: 800, fontSize: 14,
                  fontFamily: 'inherit', cursor: busy || !texto ? 'not-allowed' : 'pointer',
                }}
              >
                {busy ? '...' : 'Guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
