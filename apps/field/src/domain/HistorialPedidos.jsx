import { useEffect, useMemo, useState } from 'react'
import {
  listarPedidosHistorial,
  folioPedido,
  totalPedido,
  formatFechaPedido,
  etiquetaEstadoPedido,
  marcarPedidoEstado,
} from '../lib/pedido'

const money = n => {
  const v = Number(n)
  if (!v || v <= 0) return '—'
  return '$' + Math.round(v).toLocaleString('es-CL')
}

const ESTADOS = [
  { id: '', label: 'Todos' },
  { id: 'borrador', label: 'Borrador' },
  { id: 'enviado', label: 'Enviado' },
  { id: 'recibido', label: 'Recibido' },
  { id: 'confirmado', label: 'Confirmado' },
  { id: 'cancelado', label: 'Cancelado' },
]

const FUENTES = [
  { id: '', label: 'Todas' },
  { id: 'field_app', label: 'Terreno' },
  { id: 'catalogo_publico', label: 'Catálogo web' },
]

/**
 * Historial de pedidos — ejecutivo o por cliente.
 */
export default function HistorialPedidos({
  ejecutivoId,
  clienteKey,
  compact = false,
  onOpenPedido,
  defaultDias = 30,
  title,
}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [dias, setDias] = useState(defaultDias)
  const [openId, setOpenId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState('')
  const [fuente, setFuente] = useState('')
  const [sort, setSort] = useState('fecha') // fecha | total
  const [showAdv, setShowAdv] = useState(false)

  useEffect(() => {
    let dead = false
    ;(async () => {
      if (!ejecutivoId && !clienteKey) {
        setItems([])
        setLoading(false)
        return
      }
      setLoading(true)
      setErr('')
      const { data, error } = await listarPedidosHistorial({
        ejecutivoId,
        clienteKey,
        dias,
        limit: clienteKey ? 60 : 120,
        // estado se filtra client-side también (catalogo_publico mezcla etiqueta)
      })
      if (dead) return
      if (error) setErr(error.message || 'No se pudo cargar historial')
      setItems(data || [])
      setLoading(false)
    })()
    return () => { dead = true }
  }, [ejecutivoId, clienteKey, dias])

  const filtered = useMemo(() => {
    let rows = [...items]
    const text = q.trim().toLowerCase()
    if (text) {
      rows = rows.filter(p => {
        const nom = String(p.nombre_cliente || '').toLowerCase()
        const ck = String(p.cliente_key || '').toLowerCase()
        const nota = String(p.nota || '').toLowerCase()
        const folio = folioPedido(p.id).toLowerCase()
        const lineHit = (Array.isArray(p.lineas) ? p.lineas : []).some(l =>
          String(l.nombre || l.sku || '')
            .toLowerCase()
            .includes(text)
        )
        return nom.includes(text) || ck.includes(text) || nota.includes(text) || folio.includes(text) || lineHit
      })
    }
    if (estado) {
      rows = rows.filter(p => String(p.estado || 'borrador').toLowerCase() === estado)
    }
    if (fuente) {
      rows = rows.filter(p => String(p.fuente || 'field_app') === fuente)
    }
    if (sort === 'total') {
      rows.sort((a, b) => totalPedido(b) - totalPedido(a))
    } else {
      rows.sort((a, b) => new Date(b.creado_en || 0) - new Date(a.creado_en || 0))
    }
    return rows
  }, [items, q, estado, fuente, sort])

  const resumen = useMemo(() => {
    let total = 0
    for (const p of filtered) total += totalPedido(p)
    return { n: filtered.length, total, nRaw: items.length }
  }, [filtered, items])

  const activeFilters = [estado, fuente, q].filter(Boolean).length

  async function cambiarEstado(p, next) {
    setBusyId(p.id)
    const { error } = await marcarPedidoEstado(p.id, next)
    if (!error) setItems(prev => prev.map(x => (x.id === p.id ? { ...x, estado: next } : x)))
    setBusyId(null)
  }

  function clearFilters() {
    setQ('')
    setEstado('')
    setFuente('')
    setSort('fecha')
  }

  return (
    <div className={compact ? '' : 'card'} style={compact ? {} : { padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>
            {title || (clienteKey ? 'Pedidos de este cliente' : 'Historial de pedidos')}
          </div>
          {!loading && (
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>
              {resumen.n}
              {resumen.n !== resumen.nRaw ? ` de ${resumen.nRaw}` : ''} pedido
              {resumen.n === 1 ? '' : 's'}
              {resumen.total > 0 ? ` · ${money(resumen.total)}` : ''}
              {dias ? ` · ${dias}d` : ''}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {[7, 30, 90].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(d)}
              style={{
                border: 'none',
                borderRadius: 999,
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: dias === d ? 'var(--brand)' : 'var(--line)',
                color: dias === d ? '#fff' : 'var(--ink-4)',
              }}
            >
              {d}d
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowAdv(v => !v)}
            style={{
              border: '1px solid ' + (showAdv || activeFilters ? 'var(--warn-lt5)' : 'var(--line-3)'),
              borderRadius: 999,
              padding: '5px 10px',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: showAdv || activeFilters ? 'var(--brand-lt2)' : '#fff',
              color: 'var(--brand)',
            }}
          >
            Filtros{activeFilters ? ` (${activeFilters})` : ''}
          </button>
        </div>
      </div>

      {showAdv && (
        <div
          style={{
            background: 'var(--bg-raised)',
            border: '1px solid #e7e5e4',
            borderRadius: 14,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar cliente, folio, producto o nota…"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid #e7e5e4',
              borderRadius: 10,
              padding: '10px 12px',
              font: 'inherit',
              fontSize: 13,
              marginBottom: 10,
            }}
          />
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 6 }}>
            ESTADO
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {ESTADOS.map(e => (
              <button
                key={e.id || 'all'}
                type="button"
                onClick={() => setEstado(e.id)}
                style={{
                  border: 'none',
                  borderRadius: 999,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: estado === e.id ? 'var(--ink)' : '#fff',
                  color: estado === e.id ? '#fff' : 'var(--ink-4)',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: estado === e.id ? 'var(--ink)' : 'var(--line-3)',
                }}
              >
                {e.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 6 }}>
            ORIGEN
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {FUENTES.map(f => (
              <button
                key={f.id || 'allf'}
                type="button"
                onClick={() => setFuente(f.id)}
                style={{
                  border: '1px solid ' + (fuente === f.id ? 'var(--teal)' : 'var(--line-3)'),
                  borderRadius: 999,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: fuente === f.id ? 'var(--teal-lt)' : '#fff',
                  color: fuente === f.id ? 'var(--teal)' : 'var(--ink-4)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setSort('fecha')}
                style={{
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: sort === 'fecha' ? 'var(--line-3)' : 'transparent',
                  color: 'var(--ink-2)',
                }}
              >
                Por fecha
              </button>
              <button
                type="button"
                onClick={() => setSort('total')}
                style={{
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: sort === 'total' ? 'var(--line-3)' : 'transparent',
                  color: 'var(--ink-2)',
                }}
              >
                Por monto
              </button>
            </div>
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--brand)',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}

      {loading && <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>Cargando pedidos…</div>}
      {err && (
        <div style={{ fontSize: 12, color: 'var(--danger-dk)', background: 'var(--danger-lt)', padding: 10, borderRadius: 10 }}>
          {err}
        </div>
      )}
      {!loading && !err && filtered.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '10px 0' }}>
          {items.length === 0
            ? clienteKey
              ? 'Sin pedidos en el período.'
              : 'Sin pedidos en el período.'
            : 'Ningún pedido coincide con los filtros.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(p => {
          const n = Array.isArray(p.lineas) ? p.lineas.length : 0
          const total = totalPedido(p)
          const et = etiquetaEstadoPedido(p.estado, p.fuente)
          const expanded = openId === p.id
          const lineas = Array.isArray(p.lineas) ? p.lineas : []
          return (
            <div
              key={p.id}
              style={{
                border: '1px solid #e7e5e4',
                borderRadius: 14,
                background: '#fff',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setOpenId(expanded ? null : p.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  padding: '12px 12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--brand)', letterSpacing: '0.04em' }}>
                      {folioPedido(p.id)}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: et.color,
                        background: et.color + '18',
                        borderRadius: 999,
                        padding: '2px 7px',
                      }}
                    >
                      {et.label}
                    </span>
                    {p.fuente === 'catalogo_publico' && String(p.estado || '') !== '' && (
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{p.estado}</span>
                    )}
                  </div>
                  {!clienteKey && (
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
                      {p.nombre_cliente || p.cliente_key || 'Sin nombre'}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    {n} línea{n === 1 ? '' : 's'}
                    {total > 0 ? ` · ${money(total)}` : ''}
                    {p.nota ? ` · ${String(p.nota).slice(0, 36)}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {formatFechaPedido(p.creado_en)}
                  <span style={{ display: 'block', textAlign: 'right', marginTop: 4 }}>{expanded ? '▴' : '▾'}</span>
                </div>
              </button>

              {expanded && (
                <div style={{ padding: '0 12px 12px', borderTop: '1px solid #f5f5f4' }}>
                  {lineas.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', paddingTop: 8 }}>Sin líneas</div>
                  )}
                  {lineas.map((l, i) => {
                    const cant = Number(l.cantidad) || 0
                    const precio = Number(l.precio) || 0
                    const sub = cant * precio
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '8px 0',
                          borderBottom: i < lineas.length - 1 ? '1px solid #f5f5f4' : 'none',
                          fontSize: 13,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 650 }}>{l.nombre || l.sku || 'Producto'}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {cant} {l.unidad || 'ud'}
                            {precio > 0 ? ` × ${money(precio)}` : ''}
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--brand)', whiteSpace: 'nowrap' }}>
                          {sub > 0 ? money(sub) : '—'}
                        </div>
                      </div>
                    )
                  })}

                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {onOpenPedido && (
                      <button
                        type="button"
                        onClick={() => onOpenPedido(p)}
                        style={{
                          flex: 1,
                          minWidth: 100,
                          padding: '10px',
                          borderRadius: 10,
                          border: 'none',
                          background: 'var(--brand)',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Abrir / editar
                      </button>
                    )}
                    {p.estado !== 'confirmado' && p.estado !== 'cancelado' && (
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => cambiarEstado(p, 'confirmado')}
                        style={{
                          flex: 1,
                          minWidth: 90,
                          padding: '10px',
                          borderRadius: 10,
                          border: '1px solid #bbf7d0',
                          background: 'var(--ok-lt)',
                          color: 'var(--ok)',
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Confirmar
                      </button>
                    )}
                    {p.estado !== 'cancelado' && (
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => cambiarEstado(p, 'cancelado')}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: '1px solid #fecaca',
                          background: '#fff',
                          color: 'var(--danger-dk)',
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
