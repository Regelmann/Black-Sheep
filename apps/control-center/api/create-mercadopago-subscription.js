import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const plans = {
  starter: { reason: 'Black Sheep Starter', amount: 29900 },
  growth: { reason: 'Black Sheep Growth', amount: 69900 },
  enterprise: { reason: 'Black Sheep Enterprise', amount: 149900 },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const { data: authData } = await supabaseAdmin.auth.getUser(token)
  if (!authData.user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: admin } = await supabaseAdmin.schema('platform').from('platform_admins').select('usuario_id').eq('usuario_id', authData.user.id).eq('activo', true).maybeSingle()
  if (!admin) return res.status(403).json({ error: 'Forbidden' })

  const { tenantId, plan = 'starter' } = req.body || {}
  const selectedPlan = plans[plan]
  if (!tenantId || !selectedPlan) return res.status(400).json({ error: 'Tenant and valid plan are required' })
  const { data: tenant } = await supabaseAdmin.schema('platform').from('tenants').select('id, nombre').eq('id', tenantId).maybeSingle()
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' })

  const origin = req.headers.origin || `https://${req.headers.host}`
  const response = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `tenant-${tenantId}-${plan}` },
    body: JSON.stringify({
      reason: selectedPlan.reason,
      external_reference: tenantId,
      payer_email: authData.user.email,
      back_url: `${origin}/?billing=return`,
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: selectedPlan.amount, currency_id: 'CLP' },
      status: 'pending',
    }),
  })
  const payload = await response.json()
  if (!response.ok) return res.status(response.status).json({ error: payload.message || 'Mercado Pago rechazó la suscripción.' })
  await supabaseAdmin.schema('platform').from('suscripciones').upsert({ tenant_id: tenantId, plan, estado: 'trialing', importe_mensual: selectedPlan.amount, mercadopago_preapproval_id: payload.id, actualizado_en: new Date().toISOString() }, { onConflict: 'tenant_id' })
  return res.status(200).json({ url: payload.init_point || payload.sandbox_init_point })
}
