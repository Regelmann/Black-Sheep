/**
 * Example wiring — how to use ActionQueue inside Hoy (React Router + Supabase).
 * Copy patterns into your Hoy page; do not ship this file as-is in production.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionQueue } from './ActionQueue'
import { useActionQueue } from '../../hooks/useActionQueue'
import type { Client, MetaRow } from '../../types/domain'
import type { ParseSkuFn } from '../../hooks/useConsistentMetrics'

// Inject your real parser from coach.ts
const parseSku: ParseSkuFn = (_text) => []

export function HoyActionQueueExample({
  eidVista,
  fetchCartera,
  fetchMeta,
}: {
  eidVista: string
  fetchCartera: (eid: string) => Promise<Client[]>
  fetchMeta: (eid: string) => Promise<MetaRow | null>
}) {
  const nav = useNavigate()
  const [cartera, setCartera] = useState<Client[]>([])
  const [meta, setMeta] = useState<MetaRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' && !navigator.onLine
  )

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [c, m] = await Promise.all([
          fetchCartera(eidVista),
          fetchMeta(eidVista),
        ])
        if (!cancelled) {
          setCartera(c)
          setMeta(m)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [eidVista, fetchCartera, fetchMeta])

  const { items, metrics, dismiss, onItemAction } = useActionQueue({
    cartera,
    meta,
    parseSku,
    limit: 8,
  })

  return (
    <>
      {/* Optional: surface consistent KPIs above the queue */}
      <div aria-live="polite" style={{ fontSize: 12, color: '#78716c', marginBottom: 8 }}>
        {metrics.reponerHoy} a reponer · {metrics.nRiesgo} en riesgo · {metrics.nNuevos} nuevos
      </div>

      <ActionQueue
        items={items}
        isLoading={loading}
        isOffline={offline}
        onAction={item =>
          onItemAction(item, i => {
            if (i.clientId) {
              nav(`/visita/${encodeURIComponent(i.clientId)}`)
            } else {
              nav('/mapa')
            }
          })
        }
        onWhatsApp={item => {
          if (item.whatsapp) window.open(item.whatsapp, '_blank', 'noopener')
        }}
        onCall={item => {
          if (item.telefono) window.location.href = `tel:${item.telefono}`
        }}
        onDismiss={item => dismiss(item.id)}
        onEmptyCta={() => nav('/mapa')}
      />
    </>
  )
}
