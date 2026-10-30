import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'

type PickupWindow = {
  id: string
  label: string
  cutoff_at: string
  is_active: boolean
  max_orders: number
  remaining?: number
  is_cutoff_passed?: boolean
}

type Order = {
  id: string
  status: string
  amount_cents: number
  pickup_code: string
  created_at: string
  pickup_windows: { label: string }
  users: { email: string }
}

type ApiError = {
  error?: string
}

const price = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
}).format(2.25)

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  const payload = (await response.json().catch(() => ({}))) as ApiError
  if (!response.ok) {
    throw new Error(payload.error ?? 'Something went wrong.')
  }
  return payload as T
}

function App() {
  const path = window.location.pathname
  if (path === '/admin') return <AdminPage />
  if (path === '/verify') return <VerifyPage />
  if (path === '/order/success') return <SuccessPage />
  return <OrderPage />
}

function OrderPage() {
  const [email, setEmail] = useState('')
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null)
  const [pickupWindows, setPickupWindows] = useState<PickupWindow[]>([])
  const [selectedWindowId, setSelectedWindowId] = useState('')
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    api<{ email: string | null }>('/api/me')
      .then((result) => setVerifiedEmail(result.email))
      .catch(() => setVerifiedEmail(null))

    api<{ pickupWindows: PickupWindow[] }>('/api/pickup-windows')
      .then((result) => {
        setPickupWindows(result.pickupWindows)
        const firstAvailable = result.pickupWindows.find(
          (pickupWindow) =>
            pickupWindow.is_active &&
            !pickupWindow.is_cutoff_passed &&
            (pickupWindow.remaining ?? 0) > 0,
        )
        if (firstAvailable) setSelectedWindowId(firstAvailable.id)
      })
      .catch((apiError: Error) => setError(apiError.message))
  }, [])

  const selectedWindow = useMemo(
    () => pickupWindows.find((pickupWindow) => pickupWindow.id === selectedWindowId),
    [pickupWindows, selectedWindowId],
  )

  async function requestVerification(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsBusy(true)
    try {
      await api('/api/auth/request-link', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      setMessage('Check your Yale email for a verification link.')
    } catch (apiError) {
      setError((apiError as Error).message)
    } finally {
      setIsBusy(false)
    }
  }

  async function startCheckout() {
    setError('')
    setIsBusy(true)
    try {
      const result = await api<{ checkoutUrl: string }>('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          pickupWindowId: selectedWindowId,
          acceptedDisclaimer,
        }),
      })
      window.location.assign(result.checkoutUrl)
    } catch (apiError) {
      setError((apiError as Error).message)
      setIsBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Student-run McNay prototype</p>
          <h1>Skip the line. Pick up your McNay cookie between classes.</h1>
          <p className="hero-copy">
            Verify your Yale email, choose a pickup window, pay ahead, and meet
            at the entrance of McNay's.
          </p>
        </div>
        <div className="hero-card">
          <span>Chocolate chip cookie</span>
          <strong>{price}</strong>
          <small>One cookie per order</small>
        </div>
      </section>

      <section className="notice">
        This is a student-run prototype, not an official Yale or McNay's service.
        If your order cannot be fulfilled, it will be refunded.
      </section>

      <section className="content-grid">
        <div className="menu-grid">
          <article className="menu-card featured-card">
            <span className="pill">MVP item</span>
            <h2>McNay Chocolate Chip Cookie</h2>
            <p>
              A simple pressure-test product: one paid cookie order, one pickup
              window, one clean handoff.
            </p>
            <div className="menu-card-footer">
              <div>
                <strong>{price}</strong>
                <small>Includes pickup coordination</small>
              </div>
            </div>
          </article>

          <article className="menu-card">
            <span className="pill">Pickup point</span>
            <h2>Meet at McNay's entrance</h2>
            <p>
              Order by the cutoff and your cookie will be ready for your selected
              pickup window.
            </p>
          </article>
        </div>

        <aside className="order-panel" aria-label="Cookie preorder">
          <h2>Start your order</h2>
          {!verifiedEmail ? (
            <form onSubmit={requestVerification}>
              <label>
                Yale email
                <input
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@yale.edu"
                  type="email"
                  value={email}
                />
              </label>
              <button className="checkout-button" disabled={isBusy} type="submit">
                Send verification link
              </button>
            </form>
          ) : (
            <>
              <div className="verified-box">
                Verified as <strong>{verifiedEmail}</strong>
              </div>
              <label>
                Pickup window
                <select
                  onChange={(event) => setSelectedWindowId(event.target.value)}
                  value={selectedWindowId}
                >
                  {pickupWindows.map((pickupWindow) => {
                    const unavailable =
                      !pickupWindow.is_active ||
                      pickupWindow.is_cutoff_passed ||
                      (pickupWindow.remaining ?? 0) <= 0
                    return (
                      <option disabled={unavailable} key={pickupWindow.id} value={pickupWindow.id}>
                        {pickupWindow.label}
                        {unavailable ? ' - unavailable' : ` - ${pickupWindow.remaining} left`}
                      </option>
                    )
                  })}
                </select>
              </label>
              {selectedWindow ? (
                <p className="fine-print">Order cutoff: {selectedWindow.cutoff_at}</p>
              ) : null}
              <label className="checkbox-label">
                <input
                  checked={acceptedDisclaimer}
                  onChange={(event) => setAcceptedDisclaimer(event.target.checked)}
                  type="checkbox"
                />
                I understand this is a student-run prototype, not an official Yale
                or McNay's service.
              </label>
              <button
                className="checkout-button"
                disabled={!selectedWindowId || !acceptedDisclaimer || isBusy}
                onClick={startCheckout}
                type="button"
              >
                Pay {price} with Stripe
              </button>
            </>
          )}
          <StatusMessage error={error} message={message} />
        </aside>
      </section>
    </main>
  )
}

function VerifyPage() {
  const [state, setState] = useState<'checking' | 'ready' | 'verified' | 'error'>('checking')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const token = new URLSearchParams(window.location.search).get('token') ?? ''

  useEffect(() => {
    api<{ valid: boolean; email: string | null }>(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then((result) => {
        if (!result.valid || !result.email) {
          setState('error')
          setError('This verification link is invalid or expired.')
          return
        }
        setEmail(result.email)
        setState('ready')
      })
      .catch((apiError: Error) => {
        setError(apiError.message)
        setState('error')
      })
  }, [token])

  async function verifyEmail() {
    setState('checking')
    try {
      await api('/api/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
      })
      setState('verified')
    } catch (apiError) {
      setError((apiError as Error).message)
      setState('error')
    }
  }

  return (
    <CenteredCard
      eyebrow="Yale verification"
      title={state === 'verified' ? 'Email verified' : 'Verify your Yale email'}
    >
      {state === 'checking' ? <p>Checking verification link...</p> : null}
      {state === 'ready' ? (
        <>
          <p>Confirm that you want to verify <strong>{email}</strong>.</p>
          <button className="checkout-button" onClick={verifyEmail} type="button">
            Verify email
          </button>
        </>
      ) : null}
      {state === 'verified' ? (
        <>
          <p>You can now finish your McNay cookie pickup order.</p>
          <a className="button-link" href="/">Continue to order</a>
        </>
      ) : null}
      {state === 'error' ? <p className="error-text">{error}</p> : null}
    </CenteredCard>
  )
}

function SuccessPage() {
  const [order, setOrder] = useState<Order | null>(null)
  const [error, setError] = useState('')
  const sessionId = new URLSearchParams(window.location.search).get('session_id')
  const missingSession = !sessionId

  useEffect(() => {
    if (!sessionId) return
    const interval = window.setInterval(() => {
      api<{ order: Order | null }>(`/api/orders/session/${sessionId}`)
        .then((result) => {
          if (result.order) {
            setOrder(result.order)
            window.clearInterval(interval)
          }
        })
        .catch((apiError: Error) => {
          setError(apiError.message)
          window.clearInterval(interval)
        })
    }, 1500)
    return () => window.clearInterval(interval)
  }, [sessionId])

  return (
    <CenteredCard eyebrow="Paid order" title="Cookie pickup confirmed">
      {order ? (
        <>
          <p>Your pickup window is <strong>{order.pickup_windows.label}</strong>.</p>
          <p>Your pickup code is <strong className="pickup-code">{order.pickup_code}</strong>.</p>
          <p>Meet at the entrance of McNay's.</p>
        </>
      ) : missingSession ? (
        <p className="error-text">Missing Stripe session.</p>
      ) : (
        <p>Waiting for Stripe to confirm payment...</p>
      )}
      {error ? <p className="error-text">{error}</p> : null}
    </CenteredCard>
  )
}

function AdminPage() {
  const [password, setPassword] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [pickupWindows, setPickupWindows] = useState<PickupWindow[]>([])
  const [isAuthed, setIsAuthed] = useState(false)
  const [error, setError] = useState('')

  async function loadAdminData() {
    const result = await api<{ orders: Order[]; pickupWindows: PickupWindow[] }>('/api/admin/orders')
    setOrders(result.orders)
    setPickupWindows(result.pickupWindows)
    setIsAuthed(true)
  }

  useEffect(() => {
    api<{ orders: Order[]; pickupWindows: PickupWindow[] }>('/api/admin/orders')
      .then((result) => {
        setOrders(result.orders)
        setPickupWindows(result.pickupWindows)
        setIsAuthed(true)
      })
      .catch(() => setIsAuthed(false))
  }, [])

  async function login(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      await loadAdminData()
    } catch (apiError) {
      setError((apiError as Error).message)
    }
  }

  async function updateOrderStatus(orderId: string, status: string) {
    await api(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    await loadAdminData()
  }

  async function togglePickupWindow(id: string, isActive: boolean) {
    await api(`/api/admin/pickup-windows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    })
    await loadAdminData()
  }

  if (!isAuthed) {
    return (
      <CenteredCard eyebrow="Admin" title="Cookie operations">
        <form onSubmit={login}>
          <label>
            Admin password
            <input
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>
          <button className="checkout-button" type="submit">Log in</button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
      </CenteredCard>
    )
  }

  return (
    <main className="app-shell">
      <section className="hero admin-hero">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Cookie pickup operations</h1>
          <p className="hero-copy">Open windows, watch paid orders, and update fulfillment status.</p>
        </div>
      </section>

      <section className="admin-grid">
        <article className="order-panel">
          <h2>Pickup windows</h2>
          <div className="cart-list">
            {pickupWindows.map((pickupWindow) => (
              <div className="cart-row" key={pickupWindow.id}>
                <div>
                  <strong>{pickupWindow.label}</strong>
                  <span>{pickupWindow.is_active ? 'Open' : 'Closed'}</span>
                </div>
                <button
                  className="small-button"
                  onClick={() => togglePickupWindow(pickupWindow.id, !pickupWindow.is_active)}
                  type="button"
                >
                  {pickupWindow.is_active ? 'Close' : 'Open'}
                </button>
              </div>
            ))}
          </div>
        </article>

        <article className="order-panel">
          <h2>Paid orders</h2>
          <div className="cart-list">
            {orders.length === 0 ? <p className="empty-cart">No paid orders yet.</p> : null}
            {orders.map((order) => (
              <div className="admin-order" key={order.id}>
                <div>
                  <strong>{order.users.email}</strong>
                  <span>{order.pickup_windows.label} · {order.pickup_code} · {order.status}</span>
                </div>
                <div className="admin-actions">
                  {['placed', 'ready', 'picked_up', 'refund_needed', 'refunded'].map((status) => (
                    <button
                      className="small-button"
                      disabled={order.status === status}
                      key={status}
                      onClick={() => updateOrderStatus(order.id, status)}
                      type="button"
                    >
                      {status.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  )
}

function CenteredCard({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode
  eyebrow: string
  title: string
}) {
  return (
    <main className="centered-shell">
      <section className="order-panel centered-card">
        <p className="eyebrow dark">{eyebrow}</p>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  )
}

function StatusMessage({ error, message }: { error: string; message: string }) {
  if (error) return <p className="error-text">{error}</p>
  if (message) return <p className="success-text">{message}</p>
  return null
}

export default App
