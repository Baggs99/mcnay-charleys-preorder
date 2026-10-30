import 'dotenv/config'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cookieParser from 'cookie-parser'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import Stripe from 'stripe'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = process.env.PORT ?? 3000
const isProduction = process.env.NODE_ENV === 'production'
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  maxAge: 1000 * 60 * 60 * 24 * 30,
}

const config = {
  appBaseUrl: process.env.APP_BASE_URL ?? `http://localhost:${port}`,
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean),
  adminPassword: process.env.ADMIN_PASSWORD,
  emailFrom: process.env.EMAIL_FROM,
  resendApiKey: process.env.RESEND_API_KEY,
  sessionSecret: process.env.SESSION_SECRET,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
}

function requireEnv(...keys) {
  const missing = keys.filter((key) => !config[key])
  if (missing.length > 0) {
    const publicNames = missing.map((key) => key.replace(/[A-Z]/g, (match) => `_${match}`).toUpperCase())
    throw new Error(`Missing required env vars: ${publicNames.join(', ')}`)
  }
}

function getSupabase() {
  requireEnv('supabaseUrl', 'supabaseServiceRoleKey')
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  })
}

function getStripe() {
  requireEnv('stripeSecretKey')
  return new Stripe(config.stripeSecretKey)
}

function getResend() {
  requireEnv('resendApiKey', 'emailFrom')
  return new Resend(config.resendApiKey)
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

function assertYaleEmail(email) {
  if (!/^[^@\s]+@yale\.edu$/i.test(email)) {
    const error = new Error('Use your Yale email address.')
    error.status = 400
    throw error
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function makeToken() {
  return crypto.randomBytes(32).toString('base64url')
}

function makePickupCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase()
}

function signValue(value) {
  requireEnv('sessionSecret')
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url')
  return `${value}.${signature}`
}

function unsignValue(signedValue) {
  requireEnv('sessionSecret')
  const value = String(signedValue ?? '')
  const lastDot = value.lastIndexOf('.')
  if (lastDot === -1) return null
  const payload = value.slice(0, lastDot)
  const signature = value.slice(lastDot + 1)
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? payload : null
}

function setSignedCookie(res, name, value) {
  res.cookie(name, signValue(value), cookieOptions)
}

function readSignedCookie(req, name) {
  const value = req.cookies?.[name]
  if (!value) return null
  try {
    return unsignValue(value)
  } catch {
    return null
  }
}

function requireVerifiedEmail(req, res, next) {
  const email = readSignedCookie(req, 'mcnay_verified_email')
  if (!email) {
    return res.status(401).json({ error: 'Verify your Yale email first.' })
  }
  req.verifiedEmail = email
  next()
}

function requireAdmin(req, res, next) {
  const admin = readSignedCookie(req, 'mcnay_admin')
  if (admin !== 'admin') {
    return res.status(401).json({ error: 'Admin login required.' })
  }
  next()
}

async function sendEmail({ to, subject, text, html }) {
  const resend = getResend()
  await resend.emails.send({
    from: config.emailFrom,
    to,
    subject,
    text,
    html,
  })
}

async function sendVerificationEmail(email, token) {
  const verificationUrl = `${config.appBaseUrl}/verify?token=${encodeURIComponent(token)}`
  await sendEmail({
    to: email,
    subject: 'Verify your Yale email for McNay cookie pickup',
    text: `Verify your Yale email to preorder a McNay cookie: ${verificationUrl}`,
    html: `<p>Verify your Yale email to preorder a McNay cookie.</p><p><a href="${verificationUrl}">Verify email</a></p>`,
  })
}

async function sendOrderEmails({ order, user, pickupWindow }) {
  const customerText = [
    'Your McNay cookie pickup order is paid.',
    '',
    `Pickup window: ${pickupWindow.label}`,
    'Pickup point: Meet me at the entrance of McNay\'s.',
    `Pickup code: ${order.pickup_code}`,
    '',
    'This is a student-run prototype, not an official Yale or McNay\'s service.',
  ].join('\n')

  await sendEmail({
    to: user.email,
    subject: 'McNay cookie pickup confirmed',
    text: customerText,
  })

  if (config.adminEmails.length > 0) {
    await sendEmail({
      to: config.adminEmails,
      subject: `New McNay cookie order: ${pickupWindow.label}`,
      text: [
        'New paid cookie pickup order.',
        '',
        `Customer: ${user.email}`,
        `Pickup window: ${pickupWindow.label}`,
        `Pickup code: ${order.pickup_code}`,
        `Admin: ${config.appBaseUrl}/admin`,
      ].join('\n'),
    })
  }
}

async function sendStatusEmail({ order, user, pickupWindow }) {
  const messages = {
    placed: 'Your cookie order has been placed at McNay\'s.',
    ready: 'Your cookie is ready for pickup at the entrance of McNay\'s.',
    picked_up: 'Your McNay cookie pickup is complete. Thanks for testing the prototype.',
    refund_needed: 'I could not fulfill your cookie pickup order. I will refund it through Stripe.',
    refunded: 'Your McNay cookie pickup order has been marked refunded.',
  }
  const message = messages[order.status]
  if (!message) return
  await sendEmail({
    to: user.email,
    subject: 'McNay cookie pickup update',
    text: [
      message,
      '',
      `Pickup window: ${pickupWindow.label}`,
      `Pickup code: ${order.pickup_code}`,
    ].join('\n'),
  })
}

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  try {
    requireEnv('stripeWebhookSecret')
    const stripe = getStripe()
    const signature = req.headers['stripe-signature']
    const event = stripe.webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const email = normalizeEmail(session.metadata?.email)
      const pickupWindowId = session.metadata?.pickupWindowId
      assertYaleEmail(email)

      const supabase = getSupabase()
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single()
      if (userError || !user?.email_verified_at) {
        throw new Error('Verified user not found for paid checkout session.')
      }

      const { data: pickupWindow, error: windowError } = await supabase
        .from('pickup_windows')
        .select('*')
        .eq('id', pickupWindowId)
        .single()
      if (windowError || !pickupWindow) {
        throw new Error('Pickup window not found for paid checkout session.')
      }

      const payload = {
        user_id: user.id,
        pickup_window_id: pickupWindow.id,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        amount_cents: session.amount_total ?? 225,
        currency: session.currency ?? 'usd',
        pickup_code: makePickupCode(),
        status: 'paid',
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert(payload)
        .select('*')
        .single()

      if (orderError) {
        if (orderError.code !== '23505') throw orderError
        return res.json({ received: true })
      }

      await sendOrderEmails({ order, user, pickupWindow })
    }

    res.json({ received: true })
  } catch (error) {
    next(error)
  }
})

app.use(express.json())
app.use(cookieParser())

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.get('/api/me', (req, res) => {
  res.json({ email: readSignedCookie(req, 'mcnay_verified_email') })
})

app.post('/api/auth/request-link', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email)
    assertYaleEmail(email)
    const supabase = getSupabase()

    const { data: user, error: userError } = await supabase
      .from('users')
      .upsert({ email }, { onConflict: 'email' })
      .select('*')
      .single()
    if (userError) throw userError

    const token = makeToken()
    const { error: tokenError } = await supabase.from('email_verification_tokens').insert({
      user_id: user.id,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    })
    if (tokenError) throw tokenError

    await sendVerificationEmail(email, token)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/verify', async (req, res, next) => {
  try {
    const token = String(req.query.token ?? '')
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('email_verification_tokens')
      .select('expires_at, consumed_at, users(email)')
      .eq('token_hash', hashToken(token))
      .maybeSingle()
    if (error) throw error
    const valid = Boolean(data && !data.consumed_at && new Date(data.expires_at) > new Date())
    res.json({ valid, email: valid ? data.users.email : null })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/verify', async (req, res, next) => {
  try {
    const token = String(req.body.token ?? '')
    const tokenHash = hashToken(token)
    const supabase = getSupabase()

    const { data: tokenRow, error: tokenError } = await supabase
      .from('email_verification_tokens')
      .select('id, user_id, expires_at, consumed_at, users(email)')
      .eq('token_hash', tokenHash)
      .maybeSingle()
    if (tokenError) throw tokenError
    if (!tokenRow || tokenRow.consumed_at || new Date(tokenRow.expires_at) <= new Date()) {
      return res.status(400).json({ error: 'This verification link is invalid or expired.' })
    }

    const now = new Date().toISOString()
    const { error: consumeError } = await supabase
      .from('email_verification_tokens')
      .update({ consumed_at: now })
      .eq('id', tokenRow.id)
    if (consumeError) throw consumeError

    const { error: userError } = await supabase
      .from('users')
      .update({ email_verified_at: now, updated_at: now })
      .eq('id', tokenRow.user_id)
    if (userError) throw userError

    setSignedCookie(res, 'mcnay_verified_email', tokenRow.users.email)
    res.json({ ok: true, email: tokenRow.users.email })
  } catch (error) {
    next(error)
  }
})

app.get('/api/pickup-windows', async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data: windows, error } = await supabase
      .from('pickup_windows')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) throw error

    const today = new Date()
    const withAvailability = await Promise.all(
      windows.map(async (pickupWindow) => {
        const { count, error: countError } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('pickup_window_id', pickupWindow.id)
          .in('status', ['paid', 'placed', 'ready'])
        if (countError) throw countError
        const [hours, minutes] = pickupWindow.cutoff_at.split(':').map(Number)
        const cutoff = new Date(today)
        cutoff.setHours(hours, minutes, 0, 0)
        return {
          ...pickupWindow,
          remaining: Math.max(pickupWindow.max_orders - (count ?? 0), 0),
          is_cutoff_passed: cutoff <= today,
        }
      }),
    )

    res.json({ pickupWindows: withAvailability })
  } catch (error) {
    next(error)
  }
})

app.post('/api/checkout', requireVerifiedEmail, async (req, res, next) => {
  try {
    const { pickupWindowId, acceptedDisclaimer } = req.body
    if (!acceptedDisclaimer) {
      return res.status(400).json({ error: 'Accept the prototype disclaimer before checkout.' })
    }

    const email = req.verifiedEmail
    const supabase = getSupabase()
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()
    if (userError || !user?.email_verified_at) {
      return res.status(401).json({ error: 'Verify your Yale email first.' })
    }

    const { data: pickupWindow, error: windowError } = await supabase
      .from('pickup_windows')
      .select('*')
      .eq('id', pickupWindowId)
      .single()
    if (windowError || !pickupWindow?.is_active) {
      return res.status(400).json({ error: 'That pickup window is not available.' })
    }

    const [hours, minutes] = pickupWindow.cutoff_at.split(':').map(Number)
    const cutoff = new Date()
    cutoff.setHours(hours, minutes, 0, 0)
    if (cutoff <= new Date()) {
      return res.status(400).json({ error: 'The cutoff for that pickup window has passed.' })
    }

    const { count, error: countError } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('pickup_window_id', pickupWindow.id)
      .in('status', ['paid', 'placed', 'ready'])
    if (countError) throw countError
    if ((count ?? 0) >= pickupWindow.max_orders) {
      return res.status(400).json({ error: 'That pickup window is sold out.' })
    }

    const { data: activeOrder, error: activeOrderError } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('pickup_window_id', pickupWindow.id)
      .in('status', ['paid', 'placed', 'ready'])
      .maybeSingle()
    if (activeOrderError) throw activeOrderError
    if (activeOrder) {
      return res.status(400).json({ error: 'You already have an active order for that window.' })
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: 225,
            product_data: {
              name: 'McNay Cookie Pickup - Student-run prototype',
              description: `Pickup window: ${pickupWindow.label}`,
            },
          },
        },
      ],
      metadata: {
        email,
        pickupWindowId: pickupWindow.id,
      },
      success_url: `${config.appBaseUrl}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appBaseUrl}/`,
    })

    res.json({ checkoutUrl: session.url })
  } catch (error) {
    next(error)
  }
})

app.get('/api/orders/session/:sessionId', requireVerifiedEmail, async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, pickup_windows(label), users(email)')
      .eq('stripe_checkout_session_id', req.params.sessionId)
      .maybeSingle()
    if (error) throw error
    if (!order || order.users.email !== req.verifiedEmail) {
      return res.status(404).json({ order: null })
    }
    res.json({ order })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/login', (req, res, next) => {
  try {
    requireEnv('adminPassword')
    if (req.body.password !== config.adminPassword) {
      return res.status(401).json({ error: 'Invalid admin password.' })
    }
    setSignedCookie(res, 'mcnay_admin', 'admin')
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('mcnay_admin')
  res.json({ ok: true })
})

app.get('/api/admin/orders', requireAdmin, async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data: pickupWindows, error: windowsError } = await supabase
      .from('pickup_windows')
      .select('*')
      .order('sort_order', { ascending: true })
    if (windowsError) throw windowsError
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*, pickup_windows(label), users(email)')
      .order('created_at', { ascending: false })
    if (ordersError) throw ordersError
    res.json({ pickupWindows, orders })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/pickup-windows/:id', requireAdmin, async (req, res, next) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('pickup_windows')
      .update({ is_active: Boolean(req.body.isActive) })
      .eq('id', req.params.id)
      .select('*')
      .single()
    if (error) throw error
    res.json({ pickupWindow: data })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/orders/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const status = String(req.body.status ?? '')
    const allowedStatuses = new Set(['placed', 'ready', 'picked_up', 'refund_needed', 'refunded'])
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({ error: 'Unsupported status.' })
    }

    const timestampFields = {
      placed: 'placed_at',
      ready: 'ready_at',
      picked_up: 'picked_up_at',
      refund_needed: 'refund_marked_at',
      refunded: 'refund_marked_at',
    }
    const now = new Date().toISOString()
    const supabase = getSupabase()
    const { data: order, error } = await supabase
      .from('orders')
      .update({ status, [timestampFields[status]]: now, updated_at: now })
      .eq('id', req.params.id)
      .select('*, pickup_windows(label), users(email)')
      .single()
    if (error) throw error

    await sendStatusEmail({
      order,
      user: order.users,
      pickupWindow: order.pickup_windows,
    })

    res.json({ order })
  } catch (error) {
    next(error)
  }
})

const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.use((error, req, res, _next) => {
  const status = error.status ?? 500
  if (status >= 500) {
    console.error(error)
  }
  res.status(status).json({ error: error.message ?? 'Something went wrong.' })
})

app.listen(port, () => {
  console.log(`McNay cookie pickup server listening on ${port}`)
})
