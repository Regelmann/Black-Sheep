import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export const config = { api: { bodyParser: false } }

async function rawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const signature = req.headers['stripe-signature']
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).json({ error: 'Missing webhook signature configuration' })

  let event
  try {
    event = stripe.webhooks.constructEvent(await rawBody(req), signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (error) {
    return res.status(400).json({ error: `Invalid signature: ${error.message}` })
  }

  const subscription = event.data.object
  const tenantId = subscription.metadata?.tenant_id || subscription.client_reference_id
  if (tenantId && ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    const state = event.type === 'customer.subscription.deleted' ? 'canceled' : ({ active: 'active', trialing: 'trialing', past_due: 'past_due', canceled: 'canceled' }[subscription.status] || 'past_due')
    await supabaseAdmin.schema('platform').from('suscripciones').upsert({ tenant_id: tenantId, stripe_subscription_id: subscription.id, stripe_customer_id: subscription.customer, plan: subscription.items?.data?.[0]?.price?.nickname || subscription.items?.data?.[0]?.price?.id || 'stripe', estado: state, vence_en: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null, actualizado_en: new Date().toISOString() }, { onConflict: 'tenant_id' })
  }

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const subscriptionId = typeof subscription.subscription === 'string' ? subscription.subscription : subscription.subscription?.id
    if (subscriptionId) await supabaseAdmin.schema('platform').from('suscripciones').update({ estado: event.type === 'invoice.paid' ? 'active' : 'past_due', actualizado_en: new Date().toISOString() }).eq('stripe_subscription_id', subscriptionId)
  }

  return res.status(200).json({ received: true })
}
