import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const plans = {
  starter: { name: 'Black Sheep Starter', amount: 29900 },
  growth: { name: 'Black Sheep Growth', amount: 69900 },
  enterprise: { name: 'Black Sheep Enterprise', amount: 149900 },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const { data: authData } = await supabaseAdmin.auth.getUser(token)
  if (!authData.user || authData.user.email?.toLowerCase() !== 'sregelmann@gmail.com') return res.status(403).json({ error: 'Forbidden' })

  const { tenantId, plan = 'starter' } = req.body || {}
  const selectedPlan = plans[plan]
  if (!tenantId || !selectedPlan) return res.status(400).json({ error: 'Tenant and valid plan are required' })

  const { data: tenant, error: tenantError } = await supabaseAdmin.schema('platform').from('tenants').select('id, nombre').eq('id', tenantId).maybeSingle()
  if (tenantError || !tenant) return res.status(404).json({ error: 'Tenant not found' })

  const origin = req.headers.origin || `https://${req.headers.host}`
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price_data: { currency: 'clp', product_data: { name: selectedPlan.name, description: `Suscripción mensual para ${tenant.nombre}` }, unit_amount: selectedPlan.amount, recurring: { interval: 'month' } }, quantity: 1 }],
    client_reference_id: tenant.id,
    metadata: { tenant_id: tenant.id, plan },
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=cancelled`,
    integration_identifier: `blacksheep_${Math.random().toString(36).slice(2, 10)}`,
  })
  return res.status(200).json({ url: session.url })
}
