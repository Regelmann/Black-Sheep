import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PedidoSheet from '../domain/PedidoSheet.jsx'
import HistorialPedidos from '../domain/HistorialPedidos.jsx'
import OfertaClienteSheet from '../domain/OfertaClienteSheet.jsx'
import { saveOfflineSnapshot, loadOfflineSnapshot, isProbablyOffline } from '../lib/offline'
import { FilterBar, SearchField, StatGrid } from '../domain/FilterBar.jsx'
import { ClientActionBar } from '../domain/ClientActionBar.jsx'
import { PageShell } from '../shells/PageShell.jsx'
import NotaModal from '../domain/NotaModal.jsx'
import { money, DataAsOfBanner } from '../components.jsx'
import { useEjecutivo } from '../App.jsx'
import { ZoneChip } from '../domain/ZonePicker.jsx'
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
  if (/RIESGO|ENFRIANDO/i.test(c.estado_fuga || '') || (!isNaN(dias) && dias >= 21)) {
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
  const eje = useEjecutivo()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [desdeCache, setDesdeCache] = useState(false)
  const [errCarga, setErrCarga] = useState(null)
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

    // 🔴 SIN SEÑAL LA CARTERA NO PUEDE QUEDAR VACÍA.
    // Antes: setClientes(data || []) — con la red caída `data` es
    // undefined, caía al `|| []` y el vendedor perdía sus 263 clientes
    // en plena calle. El snapshot se guardaba pero sólo se leía para
    // sacar la FECHA, nunca para poblar la lista.
    if (error || !data) {
      if (error) console.error('[cartera] falló la consulta', error)
      const off = loadOfflineSnapshot()
      const guardados = Array.isArray(off?.clientes) ? off.clientes : []
      if (guardados.length) {
        setClientes(guardados)
        setDataAsOf(off?.savedAt ? String(off.savedAt).slice(0, 10) : null)
        setDesdeCache(true)
        setLoading(false)
        return
      }
      // Ni red ni copia guardada: se dice, no se finge una cartera vacía.
      setClientes([])
      setErrCarga(
        isProbablyOffline()
          ? 'Sin conexión y sin copia guardada. Abrí la app una vez con señal.'
          : 'No se pudo cargar la cartera. Reintentá.'
      )
      setLoading(false)
      return
    }

    setDesdeCache(false)
    setErrCarga(null)
    setClientes(data)

    const snaps = data.map(r => r.fecha_snapshot).filter(Boolean)
    if (snaps.length) {
      const sorted = [...snaps].sort()
      setDataAsOf(sorted[sorted.length - 1])
    }

    // Guardar copia para la próxima vez que no haya señal.
    try {
      saveOfflineSnapshot({
        tipo: 'cartera',
        clientes: data,
        savedAt: new Date().toISOString(),
      })
    } catch (e) { console.warn('[cartera] no se pudo guardar la copia offline', e) }

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

  return (
    /* PageShell: MISMA estructura que Hoy, Stock y Gerencia.
       Antes esta página armaba su propio hero, su padding y su scroll —
       por eso ninguna pestaña se parecía a la otra. */
    <PageShell
      eyebrow="Clientes"
      titulo="Mi cartera"
      subtitulo={`${clientes.length} en zona · ${nActivosMes} con venta este mes · ${nNuevos} nuevos`}
      sello={dataAsOf ? `Datos al ${String(dataAsOf).slice(0, 10)}` : null}
      loading={loading}
    >
      <div className="wrap">
        {dataAsOf && <DataAsOfBanner fecha={dataAsOf} extra={`${clientes.length} clientes · zona activa`} />}
HEAD
        <StatGrid
          cols={4}
          items={[
            { label: 'Con venta mes', value: nActivosMes, tone: 'ok',
              active: filtro === 'ActivosMes',
              onClick: () => { setFiltro(filtro === 'ActivosMes' ? 'Todos' : 'ActivosMes'); setShow(PAGE) } },
            { label: 'Sin venta mes', value: nSinVentaMes, tone: 'warn',
              active: filtro === 'SinVentaMes',
              onClick: () => { setFiltro(filtro === 'SinVentaMes' ? 'Todos' : 'SinVentaMes'); setShow(PAGE) } },
            { label: 'Nuevos mes', value: nNuevos, tone: 'info',
              active: filtro === 'Nuevos',
              onClick: () => { setFiltro(filtro === 'Nuevos' ? 'Todos' : 'Nuevos'); setShow(PAGE) } },
            ...estadosOrd
              .filter(e => /RIESGO|FUGADO|DORMIDO|ENFRIANDO/i.test(e))
              .map(e => ({
                label: limpiaEstado(e),
                value: resumen[e],
                tone: /FUGADO/i.test(e) ? 'danger' : 'warn',
                active: filtro === e,
                onClick: () => { setFiltro(filtro === e ? 'Todos' : e); setShow(PAGE) },
              })),
          ]}
        />
        <p className="muted" style={{ fontSize: 11, margin: '4px 0 8px' }}>
          Con venta mes = facturó en el mes en curso (bajada). Salud (riesgo/fugado) es histórico.
        </p>

        <SearchField
          value={q}
          placeholder="Buscar cliente o comuna…"
          onChange={(v) => { setQ(v); setShow(PAGE) }}
        />

        {/* Filtros unificados: mismo componente que Stock y Hoy.
            Antes: flex-wrap con estilos inline por botón. */}
        <FilterBar
          ariaLabel="Filtrar cartera"
          value={filtro}
          onChange={(v) => { setFiltro(v); setShow(PAGE) }}
          options={[
            { value: 'Todos', label: 'Todos' },
            ...(nBloqueados > 0
              ? [{ value: 'Bloqueados', label: 'Bloqueados', count: nBloqueados, tone: 'danger' }]
              : []),
            { value: 'Nuevos', label: 'Nuevos', count: nNuevos },
            ...(nRecuperados > 0
              ? [{ value: 'Recuperados', label: 'Recuperados', count: nRecuperados, tone: 'ok' }]
              : []),
            { value: 'ReponerHoy', label: 'Reponer', count: reponerHoy.length, tone: 'warn' },
          ]}
          trailing={
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={'bs-chip' + (showAdvFiltros || nAdvActivos > 0 ? ' is-active' : '')}
                onClick={() => setShowAdvFiltros(v => !v)}
              >
                <span className="bs-chip-label">Más</span>
                {nAdvActivos > 0 && <span className="bs-chip-count">{nAdvActivos}</span>}
              </button>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className={'bs-chip' + (exportOpen ? ' is-active' : '')}
                  onClick={() => setExportOpen(o => !o)}
                >
                  <span className="bs-chip-label">Exportar</span>
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
                      color: 'var(--ink)',
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
          }
        />

        {showAdvFiltros && (
          <div style={{
            background: 'var(--bg-raised)', border: '1px solid #e7e5e4', borderRadius: 14,
            padding: 12, marginBottom: 12,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>
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
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>
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
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>
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
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
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
                    border: 'none', background: 'transparent', color: 'var(--brand)',
                    fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Limpiar filtros
                </button>
              )}
        <StatGrid cols={4} items={[{label:'Con venta mes',value:nActivosMes,tone:'ok',active:filtro==='ActivosMes',onClick:()=>{setFiltro(filtro==='ActivosMes'?'Todos':'ActivosMes');setShow(PAGE)}},{label:'Sin venta mes',value:nSinVentaMes,tone:'warn',active:filtro==='SinVentaMes',onClick:()=>{setFiltro(filtro==='SinVentaMes'?'Todos':'SinVentaMes');setShow(PAGE)}},{label:'Nuevos mes',value:nNuevos,tone:'info',active:filtro==='Nuevos',onClick:()=>{setFiltro(filtro==='Nuevos'?'Todos':'Nuevos');setShow(PAGE)}},...estadosOrd.filter(e=>/RIESGO|FUGADO|DORMIDO|ENFRIANDO/i.test(e)).map(e=>({label:limpiaEstado(e),value:resumen[e],tone:/FUGADO/i.test(e)?'danger':'warn',active:filtro===e,onClick:()=>{setFiltro(filtro===e?'Todos':e);setShow(PAGE)}}))]}/>
        <p className="muted" style={{fontSize:11,margin:'4px 0 8px'}}>Con venta mes = facturó en el mes en curso. Salud (riesgo/fugado) es histórico.</p>
        <SearchField value={q} placeholder="Buscar cliente o comuna…" onChange={v=>{setQ(v);setShow(PAGE)}} />
        <FilterBar ariaLabel="Filtrar cartera" value={filtro} onChange={v=>{setFiltro(v);setShow(PAGE)}} options={[{value:'Todos',label:'Todos'},...(nBloqueados>0?[{value:'Bloqueados',label:'Bloqueados',count:nBloqueados,tone:'danger'}]:[]),{value:'Nuevos',label:'Nuevos',count:nNuevos},...(nRecuperados>0?[{value:'Recuperados',label:'Recuperados',count:nRecuperados,tone:'ok'}]:[]),{value:'ReponerHoy',label:'Reponer',count:reponerHoy.length,tone:'warn'}]} trailing={null}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'8px 0 12px'}}><div style={{fontSize:12,color:'var(--ink-3)',fontWeight:600}}>{Math.min(show,lista.length)} de {lista.length}</div></div>
        {lista.slice(0,show).map(c=>{
          const info=estadoInfo(c.estado_fuga), cardKey=c.id||c.cliente_key, abierto=expandido===cardKey, nav=mapsUrl(c), skus=parseSkuDetalle(c.sku_detalle), aReponer=skusAReponer(c), nSkuMix=skus.length, mtd=Number(c.venta_mtd)||0,prom=Number(c.venta_mensual)||0,pct=pctRitmo(mtd,prom),pctBar=pct!=null?Math.min(100,Math.max(0,pct)):0,ofertaTxt=limpiaOferta(c.oferta_real),topReponer=aReponer.slice(0,2),decision=decideClient(c)
          return <div key={cardKey} style={{background:'#fff',border:c.es_bloqueado?'1.5px solid #fecaca':'1px solid #ebe6e0',borderRadius:14,marginBottom:7,overflow:'hidden',boxShadow:abierto?'0 8px 24px rgba(26,22,20,.08)':'0 1px 2px rgba(26,22,20,.04)'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,padding:'11px 12px',cursor:'pointer'}} onClick={()=>setExpandido(abierto?null:cardKey)}>
              <div style={{flex:1,minWidth:0}}><div style={{fontWeight:750,fontSize:14,color:'var(--ink)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{nombreCliente(c)}</div><div style={{marginTop:4,display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}><span className={'badge '+info.cls}>{limpiaEstado(c.estado_fuga)}</span>{c.es_bloqueado&&<span className="badge b-red">Bloqueado</span>}{esNuevoMes(c)&&<span className="badge b-blue">Nuevo</span>}{aReponer.length>0&&<span className="badge" style={{background:'var(--danger-lt)',color:'var(--danger-dk)'}}>Reponer {aReponer.length}</span>}{decision&&<span className="badge" style={{background:decision.attention==='now'?'#fee2e2':'#fff7ed',color:decision.attention==='now'?'#b91c1c':'#9a3412'}}>Acción {decision.score}</span>}<span style={{fontSize:12,color:'var(--muted)'}}>{c.comuna}</span></div></div>
              <div style={{textAlign:'right',flexShrink:0}}><div style={{fontWeight:800,fontSize:16,color:'var(--brand)'}}>{money(mtd>0?mtd:prom)}</div><div style={{fontSize:11,color:'var(--muted)',fontWeight:600}}>{mtd>0?'este mes':'prom. mes'}</div></div><div style={{color:'var(--line-2)',fontSize:18,fontWeight:700,transform:abierto?'rotate(90deg)':'none'}}>›</div> bfac8003419229e6e7ea9b08711499d928ecb373
            </div>
          </div>
        )}

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12, marginTop: 4, gap: 8,
        }}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>
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
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', color: 'var(--brand-dk)',
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
                      color: 'var(--ink)',
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
                        style={{ background: 'var(--danger-lt)', color: 'var(--danger-dk)' }}
                      >
                        Reponer {aReponer.length}
                      </span>
                    )}
                    {nSkuMix > 0 && (
                      <span className="badge b-gray">{nSkuMix} SKU</span>
                    )}
                    {c.comuna && (
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                        {c.comuna}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--brand)', letterSpacing: '-0.02em' }}>
                    {money(mtd > 0 ? mtd : prom)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>
                    {mtd > 0 ? 'este mes' : 'prom. mes'}
                  </div>
                </div>
                <div
                  style={{
                    color: 'var(--line-2)',
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
                        background: 'var(--bg-soft)',
                        borderRadius: 12,
                        padding: '12px 14px',
                        border: '1px solid #ebe6e0',
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em' }}>
                        ESTE MES
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>
                        {money(mtd)}
                      </div>
                    </div>
                    <div
                      style={{
                        background: 'var(--bg-soft)',
                        borderRadius: 12,
                        padding: '12px 14px',
                        border: '1px solid #ebe6e0',
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em' }}>
                        PROMEDIO
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>
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
                          color: 'var(--ink-3)',
                          marginBottom: 6,
                        }}
                      >
                        <span>Ritmo del mes</span>
                        <span style={{ color: pct >= 100 ? 'var(--ok)' : pct >= 50 ? 'var(--warn-dk2)' : 'var(--danger)' }}>
                          {pct}%
                        </span>
                      </div>
                      <div className="progress-bg">
                        <div
                          className="progress-fill"
                          style={{
                            width: pctBar + '%',
                            background: pct >= 100 ? 'var(--ok-mid)' : pct >= 50 ? 'var(--warn)' : 'var(--danger)',
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
                          color: 'var(--brand)',
                          letterSpacing: '0.06em',
                          marginBottom: 4,
                        }}
                      >
                        OFRECÉ HOY
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.35 }}>
                        {ofertaTxt ||
                          topReponer.map(s => s.nombre).join(' · ')}
                      </div>
                      {topReponer.length > 0 && ofertaTxt && (
                        <div style={{ fontSize: 12, color: 'var(--brand-dk)', marginTop: 6, lineHeight: 1.35 }}>
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
                        color: 'var(--ink-3)',
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
                  <div onClick={e => e.stopPropagation()}>
                    <ClientActionBar
                      phone={c.telefono}
                      whatsappUrl={c.link_whatsapp}
                      mapsUrl={nav}
                      onNote={() => setNotaDe(c)}
                    />
                  </div>

                  {/* Un solo CTA comercial: catálogo permanente del cliente */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      setOfertaCliente(c)
                    }}
                    style={{
                      width: '100%',
                      marginTop: 10,
                      padding: '14px',
                      borderRadius: 12,
                      border: 'none',
                      background: 'linear-gradient(180deg,#d14a12,#c2410c)',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: 14,
                      fontFamily: 'inherit',
                      boxShadow: '0 4px 14px rgba(194,65,12,0.25)',
                      cursor: 'pointer',
                    }}
                  >
                    Catálogo / precios del cliente
                  </button>
                  <div style={{ marginTop: 12 }}>
                    <HistorialPedidos
                      ejecutivoId={eje?.eidVista || session?.user?.id}
                      clienteKey={c.cliente_key}
                      compact
                      defaultDias={30}
                      title="Pedidos de este cliente"
                      onOpenPedido={(p) => setPedidoCliente({ ...c, _pedido: p })}
                    />
                  </div>


                  {/* Más detalle (colapsado) */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      setSkuOpen(s => ({ ...s, [c.cliente_key]: !s[c.cliente_key] }))
                    }}
                    style={{
                      width: '100%',
                      marginTop: 10,
                      padding: '10px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--muted)',
                      fontWeight: 700,
                      fontSize: 12,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {skuOpen[c.cliente_key] ? 'Ocultar detalle ▴' : 'Ver mix y más ▾'}
                  </button>

                  {skuOpen[c.cliente_key] && (
                    <div style={{ marginTop: 4 }}>
                      {aReponer.length > 0 && (
                        <div
                          style={{
                            background: 'linear-gradient(135deg, #fef2f2 0%, #fff7ed 100%)',
                            borderRadius: 14,
                            padding: '12px 14px',
                            marginBottom: 12,
                            border: '1px solid #fecaca',
                            fontSize: 12,
                            color: 'var(--danger-dk3)',
                            lineHeight: 1.45,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--danger-dk)' }}>
                              ⚠ Reposición vencida · {aReponer.length} SKU
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', background: '#fff', padding: '3px 8px', borderRadius: 999 }}>
                              Acción hoy
                            </div>
                          </div>
                          {aReponer.slice(0, 5).map((s, i) => (
                            <div key={i} style={{
                              display: 'flex', gap: 8, alignItems: 'flex-start',
                              padding: '6px 0',
                              borderTop: i === 0 ? 'none' : '1px solid #fecaca55',
                            }}>
                              <span style={{
                                flexShrink: 0, width: 18, height: 18, borderRadius: 6,
                                background: 'var(--danger-lt2)', color: 'var(--danger-dk)',
                                fontSize: 10, fontWeight: 800,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              }}>{i + 1}</span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{s.nombre}</div>
                                <div style={{ fontSize: 11, color: 'var(--brand-dk)', marginTop: 1 }}>
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
                          const barColor = p == null ? 'var(--line-2)' : p >= 100 ? 'var(--ok-mid2)' : p >= 50 ? 'var(--warn)' : 'var(--danger)'
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
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                                  {s.nombre}
                                </div>
                                <span style={{ fontWeight: 800, fontSize: 13, color: barColor, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {clp > 0 ? money(clp) : p != null ? p + '%' : '—'}
                                </span>
                              </div>
                              {tieneData && (
                                <>
                                  <div style={{ marginTop: 5, height: 4, borderRadius: 999, background: 'var(--line-faint)', overflow: 'hidden' }}>
                                    <div style={{ width: barPct + '%', height: '100%', borderRadius: 999, background: barColor, transition: 'width .3s ease' }} />
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 4, gap: 8 }}>
                                    <span>
                                      {s.udMtd > 0 ? `${Number(s.udMtd).toLocaleString('es-CL', { maximumFractionDigits: 1 })} ud este mes` : 'Sin compra este mes'}
                                    </span>
                                    <span>
                                      {s.promUd > 0 ? `prom ${Number(s.promUd).toLocaleString('es-CL', { maximumFractionDigits: 1 })} ud` : ''}
                                      {s.promClp > 0 ? ` · ${money(s.promClp)}` : ''}
                                    </span>
                                  </div>
                                  {(s.estadoRecompra === 'RECOMPRAR_HOY' || s.estadoRecompra === 'RECOMPRAR_PRONTO') && (
                                    <div style={{ fontSize: 11, color: s.estadoRecompra === 'RECOMPRAR_HOY' ? 'var(--danger-dk)' : 'var(--brand)', marginTop: 3, fontWeight: 700 }}>
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
                        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '10px 0', textAlign: 'center' }}>
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
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Nada en este filtro
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 14px', lineHeight: 1.45 }}>
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

    </PageShell>
  )
}

