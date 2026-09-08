import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const body = req.body || {}
  const resourceId = body.data?.id || req.query?.id
  if (!resourceId || !process.env.MERCADOPAGO_ACCESS_TOKEN) return res.status(200).json({ received: true })

  const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(resourceId)}`, { headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } })
  if (!response.ok) return res.status(502).json({ error: 'Could not retrieve Mercado Pago subscription' })
  const subscription = await response.json()
  const state = { authorized: 'active', paused: 'past_due', cancelled: 'canceled', pending: 'trialing' }[subscription.status] || 'past_due'
  const tenantId = subscription.external_reference
  if (tenantId) {
    await supabaseAdmin.schema('platform').from('suscripciones').update({ estado: state, importe_mensual: subscription.auto_recurring?.transaction_amount || undefined, vence_en: subscription.next_payment_date || null, mercadopago_payer_id: subscription.payer_id ? String(subscription.payer_id) : null, actualizado_en: new Date().toISOString() }).eq('tenant_id', tenantId)
    await supabaseAdmin.schema('platform').from('audit_log').insert({ tenant_id: tenantId, action: 'subscription.updated', resource_type: 'mercadopago_preapproval', details: { id: subscription.id, status: subscription.status } })
  }
  return res.status(200).json({ received: true })
}
