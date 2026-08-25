import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { money, pctNum, DataAsOfBanner } from '../components.jsx'
import { useEjecutivo } from '../App.jsx'
import { parseSkuDetalle } from '../lib/coach'

const limpiaEstado = e => String(e || '').replace(/^\d+_?/, '').replace(/_/g, ' ')



function pctBar(pct) {
  const p = Math.min(Math.max(pct, 0), 200)
  const color = pct >= 100 ? '#16a34a' : pct >= 80 ? '#2563eb' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return { width: `${Math.min(p, 100)}%`, background: color }
}

export default function Metas({ session }) {
  const eje = useEjecutivo()
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState(null)
  const [focos, setFocos] = useState([])
  const [zona, setZona] = useState('')
  const [clientesMes, setClientesMes] = useState([])
  const [showCli, setShowCli] = useState(true)
  const [expandido, setExpandido] = useState(null)
  const [dataAsOf, setDataAsOf] = useState(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const uid = eje?.eidVista || session.user.id
      setZona(eje?.zonaVista || eje?.zona || '')

      let m = null
      const { data: m1 } = await supabase
        .from('metas')
        .select('*')
        .eq('ejecutivo_id', uid)
        .order('mes', { ascending: false })
        .limit(1)
      if (m1 && m1[0]) m = m1[0]
      else if (eje?.zonaVista) {
        const { data: m2 } = await supabase
          .from('metas')
          .select('*')
          .eq('ejecutivo', eje.zonaVista)
          .order('mes', { ascending: false })
          .limit(1)
        m = m2?.[0] || null
      }
      setMeta(m)
      if (m?.fecha_snapshot) setDataAsOf(m.fecha_snapshot)

      let f = []
      const { data: f1 } = await supabase.from('focos').select('*').eq('ejecutivo_id', uid)
      if (f1?.length) f = f1
      else if (eje?.zonaVista) {
        const { data: f2 } = await supabase.from('focos').select('*').eq('ejecutivo', eje.zonaVista)
        f = f2 || []
      }
      setFocos(f)

      const { data: cli } = await supabase
        .from('cartera')
        .select(
          'cliente_key,nombre_cliente,comuna,venta_mtd,venta_mensual,estado_fuga,estado_texto,oferta_real,productos_top,sku_detalle,dias_sin_comprar,ultima_compra'
        )
        .eq('ejecutivo_id', uid)
        .gt('venta_mtd', 0)
        .order('venta_mtd', { ascending: false })
        .limit(200)
      setClientesMes(cli || [])
      setLoading(false)
    })()
  }, [eje?.eidVista, session.user.id])

  const totalCli = useMemo(
    () => clientesMes.reduce((s, c) => s + (Number(c.venta_mtd) || 0), 0),
    [clientesMes]
  )

  if (loading) return <div className="spinner">Cargando metas…</div>

  const p = meta
    ? pctNum(
        meta.pct_avance != null
          ? meta.pct_avance
          : meta.meta_mensual
            ? Number(meta.venta_mtd) / Number(meta.meta_mensual)
            : 0
      )
    : 0
  const color = p >= 90 ? '#16a34a' : p >= 60 ? '#f59e0b' : '#ef4444'
  const venta = Number(meta?.venta_mtd) || 0
  const metaVal = Number(meta?.meta_mensual) || 0

  return (
    <div>
      <div
        style={{
          background: 'linear-gradient(145deg, #1c1917 0%, #292524 70%, #44403c 100%)',
          color: '#fff',
          padding: '26px 20px 28px',
          borderRadius: '0 0 24px 24px',
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
          Metas
        </div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Tu avance · cerrar la brecha</h1>
        <p style={{ margin: '6px 0 0', opacity: 0.8 }}>{zona ? `Zona ${zona}` : 'Mes en curso'}</p>
      </div>

      <div style={{ padding: 14 }}>
        {dataAsOf && <DataAsOfBanner fecha={dataAsOf} />}
        {/* Meta principal */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #e7e0d8',
            borderRadius: 16,
            padding: 16,
            marginBottom: 12,
          }}
        >
          {meta ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: color }}>{p}%</div>
                <div style={{ textAlign: 'right', fontSize: 13, color: '#78716c' }}>
                  {money(venta)} / {money(metaVal)}
                </div>
              </div>
              <div
                style={{
                  height: 10,
                  background: '#f5f5f4',
                  borderRadius: 999,
                  marginTop: 10,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(p, 100)}%`,
                    background: color,
                    borderRadius: 999,
                  }}
                />
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#78716c' }}>
                Brecha: {money(Math.max(0, metaVal - venta))}
                {p > 100 ? ` · Sobre meta +${money(venta - metaVal)}` : ''}
              </div>
            </>
          ) : (
            <p style={{ margin: 0, color: '#78716c' }}>Sin meta cargada para este ejecutivo.</p>
          )}
        </div>

        {/* Focos */}
        <h3 style={{ margin: '8px 4px', fontSize: 15 }}>Focos del mes</h3>
        {!focos.length && (
          <div
            style={{
              background: '#fff',
              border: '1px solid #e7e0d8',
              borderRadius: 14,
              padding: 14,
              color: '#78716c',
              fontSize: 13,
            }}
          >
            Sin focos para esta zona.
          </div>
        )}
        {focos.map((f, i) => {
          const vendido = Number(f.vendido_unidad ?? f.vendido_unidad_mtd ?? 0)
          const metaU = Number(f.meta_unidad ?? f.meta_unidad_mes ?? 0)
          const pct = metaU ? Math.round((vendido / metaU) * 100) : pctNum(f.pct_avance)
          const bar = pctBar(pct)
          return (
            <div
              key={f.id || i}
              style={{
                background: '#fff',
                border: '1px solid #e7e0d8',
                borderRadius: 14,
                padding: 14,
                marginBottom: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{f.foco || f.nombre || 'Foco'}</div>
                <div style={{ fontWeight: 800, color: bar.background }}>{pct}%</div>
              </div>
              <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>
                {vendido.toLocaleString('es-CL')} de {metaU.toLocaleString('es-CL')}{' '}
                {f.unidad_meta || 'ud'}
                {f.estado_ritmo ? ` · ${String(f.estado_ritmo).replace(/_/g, ' ')}` : ''}
              </div>
              <div
                style={{
                  height: 8,
                  background: '#f5f5f4',
                  borderRadius: 999,
                  marginTop: 8,
                  overflow: 'hidden',
                }}
              >
                <div style={{ height: '100%', width: bar.width, background: bar.background }} />
              </div>
            </div>
          )
        })}

        {/* Clientes del mes */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            margin: '16px 4px 8px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15 }}>
            Clientes con venta este mes ({clientesMes.length})
          </h3>
          <button
            type="button"
            onClick={() => setShowCli(s => !s)}
            style={{
              border: 'none',
              background: 'none',
              color: '#c2410c',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {showCli ? 'Ocultar' : 'Ver'}
          </button>
        </div>
        <div style={{ fontSize: 12, color: '#78716c', margin: '0 4px 8px' }}>
          Suma cartera MTD: {money(totalCli)} · Tocá un cliente para ver mix del mes
        </div>

        {showCli && !clientesMes.length && (
          <div
            style={{
              background: '#fff',
              border: '1px solid #e7e0d8',
              borderRadius: 14,
              padding: 14,
              color: '#78716c',
            }}
          >
            Ningún cliente de tu cartera con venta este mes.
          </div>
        )}

        {showCli &&
          clientesMes.map(c => {
            const open = expandido === c.cliente_key
            const skus = parseSkuDetalle(c.sku_detalle)
            const skusMes = skus.filter(s => s.clpMtd > 0 || s.udMtd > 0)
            return (
              <div
                key={c.cliente_key}
                style={{
                  background: '#fff',
                  border: '1px solid #e7e0d8',
                  borderRadius: 14,
                  marginBottom: 8,
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpandido(open ? null : c.cliente_key)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    background: 'none',
                    padding: '12px 14px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1c1917' }}>
                        {c.nombre_cliente}
                      </div>
                      <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>
                        {c.comuna || '—'} · {limpiaEstado(c.estado_fuga || c.estado_texto)}
                        {c.dias_sin_comprar != null ? ` · ${c.dias_sin_comprar}d` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 800, color: '#c2410c' }}>{money(c.venta_mtd)}</div>
                      <div style={{ fontSize: 11, color: '#78716c' }}>
                        {open ? '▲' : '▼'} este mes
                      </div>
                    </div>
                  </div>
                </button>

                {open && (
                  <div style={{ padding: '0 14px 14px', borderTop: '1px solid #f5f5f4' }}>
                    {c.ultima_compra && (
                      <div style={{ fontSize: 12, color: '#78716c', marginTop: 8 }}>
                        Última compra: <b>{c.ultima_compra}</b>
                        {c.dias_sin_comprar != null
                          ? ` (${c.dias_sin_comprar} días sin comprar)`
                          : ''}
                      </div>
                    )}
                    {c.oferta_real && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          color: '#9a3412',
                          background: '#fff7ed',
                          padding: '8px 10px',
                          borderRadius: 10,
                        }}
                      >
                        <b>Ofrecé:</b> {c.oferta_real}
                      </div>
                    )}

                    <div style={{ marginTop: 10, fontWeight: 700, fontSize: 13 }}>
                      Mix del mes ({skusMes.length || skus.length} productos)
                    </div>
                    <div style={{ fontSize: 11, color: '#a8a29e', marginBottom: 6 }}>
                      Este mes vs promedio meses anteriores · gap = oportunidad
                    </div>

                    {(skusMes.length ? skusMes : skus).slice(0, 8).map((s, i) => {
                      const pct =
                        s.promUd > 0
                          ? Math.round((s.udMtd / s.promUd) * 100)
                          : s.udMtd > 0
                            ? 100
                            : 0
                      const gapUd = s.promUd - s.udMtd
                      const over = pct >= 100
                      return (
                        <div
                          key={i}
                          style={{
                            padding: '8px 0',
                            borderBottom: '1px solid #f5f5f4',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{s.nombre}</div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: 11,
                              color: '#78716c',
                              marginTop: 2,
                            }}
                          >
                            <span>
                              Prom. {s.promUd.toLocaleString('es-CL')} ud · {money(s.promClp)}
                            </span>
                            <span>
                              Este mes {s.udMtd.toLocaleString('es-CL')} ud · {money(s.clpMtd)}
                            </span>
                          </div>
                          {s.ultima && (
                            <div style={{ fontSize: 11, color: '#a8a29e', marginTop: 2 }}>
                              Última venta de este SKU: {s.ultima}
                            </div>
                          )}
                          <div
                            style={{
                              height: 6,
                              background: '#f5f5f4',
                              borderRadius: 999,
                              marginTop: 6,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${Math.min(pct, 100)}%`,
                                background: over ? '#16a34a' : pct >= 70 ? '#f59e0b' : '#ef4444',
                              }}
                            />
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              marginTop: 3,
                              color: over ? '#16a34a' : '#b45309',
                              fontWeight: 600,
                            }}
                          >
                            {over
                              ? `Sobre promedio · ${money(Math.max(0, s.clpMtd - s.promClp))} más (${pct}%)`
                              : gapUd > 0
                                ? `Faltan ~${gapUd.toLocaleString('es-CL')} ud a su ritmo`
                                : pct
                                  ? `${pct}% del promedio`
                                  : 'Sin compra este mes'}
                          </div>
                        </div>
                      )
                    })}
                    {!skus.length && c.productos_top && (
                      <div style={{ fontSize: 12, marginTop: 6, color: '#475569' }}>
                        <b>Compraba:</b> {c.productos_top}
                      </div>
                    )}
                    {!skus.length && !c.productos_top && (
                      <div style={{ fontSize: 12, color: '#a8a29e', marginTop: 6 }}>
                        Sin detalle SKU para este cliente en la bajada.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}
