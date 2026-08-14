/**
 * ActionQueue — next-best-action list for field sales (Hoy tab).
 *
 * Design goals (Spotio / Badger / Salesforce Field Service patterns):
 * - Capture-first: primary CTA ≥ 48dp, thumb-zone
 * - Priority-ordered, scannable in < 30s
 * - Secondary actions: WhatsApp / Call without leaving the card
 * - Empty / loading states with clear CTAs
 *
 * Pure presentational + controlled. Logic lives in useActionQueue / metrics.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { ActionItem, ActionType } from '../../types/domain'

// ── Visual tokens per action type ───────────────────────────────────────────

const TYPE_META: Record<
  ActionType,
  { badge: string; accent: string; bgSoft: string; border: string }
> = {
  reponer: {
    badge: 'REPONER',
    accent: '#c2410c',
    bgSoft: '#fff7ed',
    border: '#fed7aa',
  },
  riesgo: {
    badge: 'RIESGO',
    accent: '#dc2626',
    bgSoft: '#fef2f2',
    border: '#fecaca',
  },
  enfriandose: {
    badge: 'ENFRIÁNDOSE',
    accent: '#d97706',
    bgSoft: '#fffbeb',
    border: '#fde68a',
  },
  nuevo: {
    badge: 'NUEVO',
    accent: '#2563eb',
    bgSoft: '#eff6ff',
    border: '#bfdbfe',
  },
  visita: {
    badge: 'VISITAR',
    accent: '#57534e',
    bgSoft: '#fafaf9',
    border: '#e7e5e4',
  },
  pedido: {
    badge: 'PEDIDO',
    accent: '#0d9488',
    bgSoft: '#f0fdfa',
    border: '#99f6e4',
  },
}

// ── Money helper (local; swap for shared utils) ─────────────────────────────

function money(n?: number): string {
  if (n == null || isNaN(Number(n))) return ''
  return '$' + Number(n).toLocaleString('es-CL', { maximumFractionDigits: 0 })
}

// ── Props ───────────────────────────────────────────────────────────────────

export interface ActionQueueProps {
  items: ActionItem[]
  isLoading?: boolean
  isOffline?: boolean
  /** Section title override */
  title?: string
  emptyTitle?: string
  emptyDescription?: string
  emptyCtaLabel?: string
  onEmptyCta?: () => void
  /** Primary action (navigate to visit / map / client) */
  onAction: (item: ActionItem) => void
  /** Optional secondary handlers */
  onWhatsApp?: (item: ActionItem) => void
  onCall?: (item: ActionItem) => void
  onDismiss?: (item: ActionItem) => void
  /** Optional: custom card footer */
  renderFooter?: (item: ActionItem) => ReactNode
  className?: string
  style?: CSSProperties
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      aria-hidden
      style={{
        height: 120,
        borderRadius: 18,
        marginBottom: 10,
        background:
          'linear-gradient(90deg, #f5f5f4 25%, #e7e5e4 50%, #f5f5f4 75%)',
        backgroundSize: '200% 100%',
        animation: 'aq-sk 1.2s ease-in-out infinite',
      }}
    />
  )
}

function EmptyState({
  title,
  description,
  ctaLabel,
  onCta,
}: {
  title: string
  description: string
  ctaLabel?: string
  onCta?: () => void
}) {
  return (
    <div
      role="status"
      style={{
        textAlign: 'center',
        padding: '28px 20px',
        background: '#fff',
        border: '1px solid #e7e5e4',
        borderRadius: 18,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 16, color: '#1c1917', marginBottom: 6 }}>
        {title}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: '#78716c', lineHeight: 1.45 }}>
        {description}
      </p>
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          style={{
            marginTop: 14,
            width: '100%',
            minHeight: 48,
            borderRadius: 14,
            border: 'none',
            background: '#c2410c',
            color: '#fff',
            fontWeight: 700,
            fontSize: 15,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  )
}

function ActionCard({
  item,
  index,
  onAction,
  onWhatsApp,
  onCall,
  onDismiss,
  renderFooter,
}: {
  item: ActionItem
  index: number
  onAction: (item: ActionItem) => void
  onWhatsApp?: (item: ActionItem) => void
  onCall?: (item: ActionItem) => void
  onDismiss?: (item: ActionItem) => void
  renderFooter?: (item: ActionItem) => ReactNode
}) {
  const meta = TYPE_META[item.type] || TYPE_META.visita

  return (
    <article
      className="action-queue-card"
      aria-label={`${meta.badge}: ${item.title}`}
      style={{
        background: '#fff',
        border: `1.5px solid ${meta.border}`,
        borderLeft: `4px solid ${meta.accent}`,
        borderRadius: 18,
        padding: '14px 16px',
        marginBottom: 10,
        boxShadow: '0 1px 2px rgba(28,25,23,0.04)',
      }}
    >
      {/* Header: rank + type badge + amount */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.04em',
            color: meta.accent,
          }}
        >
          #{index + 1} · {meta.badge}
          {item.count != null && item.count > 0 ? ` · ${item.count} SKU` : ''}
        </div>
        {item.amount != null && item.amount > 0 && (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#78716c' }}>
            {money(item.amount)}
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        style={{
          margin: '6px 0 0',
          fontWeight: 800,
          fontSize: 17,
          letterSpacing: '-0.02em',
          color: '#1c1917',
          lineHeight: 1.25,
        }}
      >
        {item.title}
      </h3>

      {/* Subtitle */}
      {item.subtitle && (
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 13,
            color: '#78716c',
            lineHeight: 1.35,
          }}
        >
          {item.subtitle}
        </p>
      )}

      {/* Oferta chip */}
      {item.oferta && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            borderRadius: 12,
            background: meta.bgSoft,
            fontSize: 13,
            fontWeight: 600,
            color: meta.accent,
          }}
        >
          Ofrecé: {item.oferta}
        </div>
      )}

      {/* Action bar — thumb zone */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 12,
          alignItems: 'center',
        }}
      >
        {item.whatsapp && (
          <a
            href={item.whatsapp}
            target="_blank"
            rel="noreferrer"
            onClick={e => {
              if (onWhatsApp) {
                e.preventDefault()
                onWhatsApp(item)
              }
            }}
            style={{
              minHeight: 44,
              minWidth: 44,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 14px',
              borderRadius: 12,
              border: '1.5px solid #e7e5e4',
              background: '#fff',
              color: '#1c1917',
              fontSize: 13,
              fontWeight: 650,
              textDecoration: 'none',
            }}
            aria-label={`WhatsApp a ${item.title}`}
          >
            WhatsApp
          </a>
        )}
        {item.telefono && (
          <a
            href={`tel:${item.telefono}`}
            onClick={e => {
              if (onCall) {
                e.preventDefault()
                onCall(item)
              }
            }}
            style={{
              minHeight: 44,
              minWidth: 44,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 14px',
              borderRadius: 12,
              border: '1.5px solid #e7e5e4',
              background: '#fff',
              color: '#1c1917',
              fontSize: 13,
              fontWeight: 650,
              textDecoration: 'none',
            }}
            aria-label={`Llamar a ${item.title}`}
          >
            Llamar
          </a>
        )}

        <button
          type="button"
          onClick={() => onAction(item)}
          style={{
            flex: 1,
            minHeight: 48,
            minWidth: 120,
            borderRadius: 14,
            border: 'none',
            background: meta.accent,
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            fontFamily: 'inherit',
            cursor: 'pointer',
            boxShadow: `0 4px 14px ${meta.accent}40`,
          }}
          aria-label={`${item.ctaLabel}: ${item.title}`}
        >
          {item.ctaLabel}
        </button>

        {onDismiss && (
          <button
            type="button"
            onClick={() => onDismiss(item)}
            aria-label={`Descartar ${item.title}`}
            title="Omitir por hoy"
            style={{
              minHeight: 44,
              minWidth: 44,
              borderRadius: 12,
              border: '1px solid #e7e5e4',
              background: 'transparent',
              color: '#a8a29e',
              fontSize: 18,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ×
          </button>
        )}
      </div>

      {renderFooter?.(item)}
    </article>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function ActionQueue({
  items,
  isLoading = false,
  isOffline = false,
  title = 'Tu día en 30 segundos · Priorizado',
  emptyTitle = 'Sin urgencias fuertes',
  emptyDescription = 'Revisá el mapa o cartera para armar la ruta del día.',
  emptyCtaLabel = 'Ir al mapa',
  onEmptyCta,
  onAction,
  onWhatsApp,
  onCall,
  onDismiss,
  renderFooter,
  className,
  style,
}: ActionQueueProps) {
  return (
    <section
      className={className}
      style={style}
      aria-labelledby="action-queue-title"
    >
      <style>{`
        @keyframes aq-sk {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '16px 0 10px',
          gap: 8,
        }}
      >
        <h2
          id="action-queue-title"
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#78716c',
          }}
        >
          {title}
        </h2>
        {isOffline && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: '#fef3c7',
              color: '#92400e',
              padding: '2px 8px',
              borderRadius: 999,
            }}
          >
            Offline
          </span>
        )}
      </div>

      {isLoading && (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      )}

      {!isLoading && items.length === 0 && (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          ctaLabel={emptyCtaLabel}
          onCta={onEmptyCta}
        />
      )}

      {!isLoading &&
        items.map((item, index) => (
          <ActionCard
            key={item.id}
            item={item}
            index={index}
            onAction={onAction}
            onWhatsApp={onWhatsApp}
            onCall={onCall}
            onDismiss={onDismiss}
            renderFooter={renderFooter}
          />
        ))}
    </section>
  )
}

export default ActionQueue
