import { useState } from 'react'
import { money } from '../../components.jsx'
import { parseSkuDetalle, pctRitmo, clpEfectivo } from '../../lib/coach'
import { skusAReponer } from '../../lib/metrics'

const limpiaOferta = t => (t ? String(t).replace(/_/g, ' ').replace(/\s+/g, ' ').trim() : '')

function buildAction(c) {
  const dias = Number(c.dias_sin_comprar)
  const mtd = Number(c.venta_mtd) || 0
  const prom = Number(c.venta_mensual) || 0
  const oferta = limpiaOferta((c.oferta_real || '').split('·')[0]?.replace(/^Foco:\s*/i, '').trim())
  const estado = String(c.estado_fuga || '').toLowerCase()

  if (c.es_bloqueado) {
    return {
      tone: 'blocked',
      title: 'Bloqueado',
      why: c.motivo_bloqueo ? `Motivo: ${c.motivo_bloqueo}` : 'No gestionar venta hasta desbloquear.',
      cta: 'Desbloquear',
    }
  }
  if (estado.includes('riesgo') || estado.includes('fuga') || (dias >= 21 && prom > 0 && mtd === 0)) {
    return {
      tone: 'risk',
      title: 'Recuperar',
      why: oferta
        ? `Lleva ${dias || '—'}d sin comprar. Entrar con: ${oferta}`
        : `Lleva ${dias || '—'}d sin compra. Priorizá visita hoy.`,
      cta: 'Pedido de recuperación',
    }
  }
  const aRep = skusAReponer(c)
  if (aRep.length > 0) {
    return {
      tone: 'reponer',
      title: 'Reponer hoy',
      why: `${aRep.length} SKU fuera de ciclo` + (oferta ? ` · priorizá ${oferta}` : ''),
      cta: 'Armar pedido',
    }
  }
  if (prom > 0 && mtd > 0 && mtd < prom * 0.7) {
    const falta = Math.max(0, prom - mtd)
    return {
      tone: 'gap',
      title: 'Cerrar ritmo',
      why: oferta
        ? `${money(mtd)} de ~${money(prom)}/mes. Gap ~${money(falta)} · ${oferta}`
        : `${money(mtd)} vs promedio ${money(prom)}. Falta ~${money(falta)}.`,
      cta: 'Completar pedido',
    }
  }
  if (oferta) {
    return {
      tone: 'offer',
      title: 'Ofrecer foco',
      why: `En la visita priorizá: ${oferta}`,
      cta: 'Agregar al pedido',
    }
  }
  return {
    tone: 'ok',
    title: 'Mantener relación',
    why: mtd > 0 ? `Va ${money(mtd)} este mes.` : 'Sin venta MTD — validar interés.',
    cta: 'Pedido en terreno',
  }
}

const TONE = {
  blocked: { bg: '#fef2f2', border: '#fecaca', badge: '#991b1b', soft: '#dc2626' },
  risk: { bg: '#fff7ed', border: '#fed7aa', badge: '#9a3412', soft: '#c2410c' },
  reponer: { bg: '#fff7ed', border: '#fdba74', badge: '#c2410c', soft: '#ea580c' },
  gap: { bg: '#fffbeb', border: '#fde68a', badge: '#92400e', soft: '#d97706' },
  offer: { bg: '#ecfdf5', border: '#a7f3d0', badge: '#065f46', soft: '#15803d' },
  ok: { bg: '#f8f6f2', border: '#e8e2da', badge: '#5f5953', soft: '#c2410c' },
}

/**
 * Ficha Cliente 360 — Black Sheep Field
 * Acción recomendada + métricas + mix + CTAs. Sin nueva lógica de backend.
 */
export default function Client360({
  c,
  navUrl,
  onPedido,
  onNota,
  onBloquear,
  onDesbloquear,
}) {
  const [mixOpen, setMixOpen] = useState(false)
  const action = buildAction(c)
  const tone = TONE[action.tone] || TONE.ok
  const mtd = Number(c.venta_mtd) || 0
  const prom = Number(c.venta_mensual) || 0
  const pct = pctRitmo(mtd, prom)
  const skus = parseSkuDetalle(c.sku_detalle)
  const aReponer = skusAReponer(c)
  const ofertaTxt = limpiaOferta(c.oferta_real)
  const dias = Number(c.dias_sin_comprar)
  const mix = skus.filter(s => s.nombre && s.nombre.length > 2 && !/^\d+$/.test(s.nombre))

  return (
    <div className="c360" onClick={e => e.stopPropagation()}>
      {/* Acción recomendada */}
      <div className="c360-action" style={{ background: tone.bg, borderColor: tone.border }}>
        <div className="c360-action-top">
          <span className="c360-badge" style={{ background: tone.badge }}>{action.title}</span>
          {dias >= 0 && !Number.isNaN(dias) ? (
            <span className="c360-days">
              {dias === 0 ? 'Compró hoy' : `Sin compra ${dias}d`}
            </span>
          ) : null}
        </div>
        <p className="c360-why">{action.why}</p>
        {ofertaTxt ? (
          <div className="c360-offer-chip">Oferta · {ofertaTxt.split('·')[0].trim().slice(0, 48)}</div>
        ) : null}
        {!c.es_bloqueado && (
          <button type="button" className="c360-cta-main" onClick={() => onPedido?.(c)}>
            Pedido en terreno
          </button>
        )}
      </div>

      {/* Métricas */}
      <div className="c360-metrics">
        <div className="c360-metric">
          <div className="c360-metric-label">Este mes</div>
          <div className="c360-metric-value">{money(mtd)}</div>
        </div>
        <div className="c360-metric">
          <div className="c360-metric-label">Promedio</div>
          <div className="c360-metric-value">{money(prom)}</div>
        </div>
        <div className="c360-metric">
          <div className="c360-metric-label">Ritmo</div>
          <div className="c360-metric-value" style={{ color: pct == null ? undefined : pct >= 100 ? '#15803d' : pct >= 50 ? '#d97706' : '#dc2626' }}>
            {pct != null ? `${pct}%` : '—'}
          </div>
        </div>
        <div className="c360-metric">
          <div className="c360-metric-label">Mix SKU</div>
          <div className="c360-metric-value">{mix.length || '—'}</div>
        </div>
      </div>

      {pct != null && (
        <div className="c360-bar-wrap">
          <div className="c360-bar-track">
            <div
              className="c360-bar-fill"
              style={{
                width: `${Math.min(100, Math.max(0, pct))}%`,
                background: pct >= 100 ? '#15803d' : pct >= 50 ? '#d97706' : '#dc2626',
              }}
            />
          </div>
          <div className="c360-bar-cap">Avance vs promedio mensual</div>
        </div>
      )}

      {/* Reposición urgente */}
      {aReponer.length > 0 && (
        <div className="c360-reponer">
          <div className="c360-reponer-title">⚠ Reposición · {aReponer.length} SKU</div>
          {aReponer.slice(0, 4).map((s, i) => (
            <div key={i} className="c360-reponer-row">
              <span>{s.nombre || s.sku || 'SKU'}</span>
              <span className="c360-reponer-meta">
                {s.etiqueta?.label || (s.estadoRecompra === 'RECOMPRAR_HOY' ? 'Hoy' : 'Atrasado')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Acciones rápidas */}
      <div className="c360-actions">
        {c.telefono ? (
          <a href={'tel:' + c.telefono} className="c360-btn c360-btn-ghost">Llamar</a>
        ) : null}
        {c.link_whatsapp ? (
          <a href={c.link_whatsapp} target="_blank" rel="noreferrer" className="c360-btn c360-btn-wa">WhatsApp</a>
        ) : null}
        {navUrl ? (
          <a href={navUrl} target="_blank" rel="noreferrer" className="c360-btn c360-btn-ghost">Navegar</a>
        ) : null}
        <button type="button" className="c360-btn c360-btn-ghost" onClick={() => onNota?.(c)}>Nota</button>
      </div>

      

      {/* Mix colapsable */}
      <button type="button" className="c360-mix-toggle" onClick={() => setMixOpen(v => !v)}>
        {mixOpen ? 'Ocultar mix ▴' : `Ver mix y más (${mix.length}) ▾`}
      </button>

      {mixOpen && (
        <div className="c360-mix">
          {mix.length === 0 ? (
            <div className="c360-empty">Sin historial de SKU en la ficha.</div>
          ) : (
            mix.slice(0, 12).map((s, i) => {
              const p = pctRitmo(s.udMtd, s.promUd)
              const barColor = p == null ? '#d6d3d1' : p >= 100 ? '#22c55e' : p >= 50 ? '#f59e0b' : '#ef4444'
              return (
                <div key={i} className="c360-sku">
                  <div className="c360-sku-top">
                    <div className="c360-sku-name">{s.nombre}</div>
                    <div className="c360-sku-pct" style={{ color: barColor }}>{p != null ? p + '%' : '—'}</div>
                  </div>
                  <div className="c360-sku-bar">
                    <div style={{ width: `${p != null ? Math.min(100, Math.max(0, p)) : 0}%`, background: barColor }} />
                  </div>
                  <div className="c360-sku-meta">
                    Mes {Number(s.udMtd || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 })} · prom {Number(s.promUd || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 })}
                    {s.promClp ? ` · ${money(clpEfectivo(s) || s.promClp)}` : ''}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Bloqueo */}
      <div className="c360-block-row">
        {c.es_bloqueado ? (
          <button type="button" className="c360-btn c360-btn-ghost" onClick={() => onDesbloquear?.(c)}>
            Desbloquear
          </button>
        ) : (
          <>
            <button type="button" className="c360-btn c360-btn-danger" onClick={() => onBloquear?.(c, 'cerrado')}>
              Bloquear cerrado
            </button>
            <button type="button" className="c360-btn c360-btn-danger" onClick={() => onBloquear?.(c, 'deuda')}>
              Bloquear deuda
            </button>
          </>
        )}
      </div>
    </div>
  )
}
