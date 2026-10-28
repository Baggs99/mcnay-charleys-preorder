import { useMemo, useState } from 'react'

type Location = "McNay's Cafe" | "Charlie's Place"

type MenuItem = {
  id: string
  name: string
  description: string
  location: Location
  price: number
  category: 'Breakfast' | 'Lunch' | 'Coffee' | 'Grab & Go'
}

type Cart = Record<string, number>

const menuItems: MenuItem[] = [
  {
    id: 'mcnay-breakfast-sandwich',
    name: 'McNay Breakfast Sandwich',
    description: 'Egg, cheddar, and turkey bacon on a toasted English muffin.',
    location: "McNay's Cafe",
    price: 6.75,
    category: 'Breakfast',
  },
  {
    id: 'mcnay-cold-brew',
    name: 'SOM Cold Brew',
    description: 'Smooth cold brew coffee with optional oat milk.',
    location: "McNay's Cafe",
    price: 4.5,
    category: 'Coffee',
  },
  {
    id: 'mcnay-yogurt-parfait',
    name: 'Greek Yogurt Parfait',
    description: 'Greek yogurt, berries, granola, and honey.',
    location: "McNay's Cafe",
    price: 5.95,
    category: 'Grab & Go',
  },
  {
    id: 'charlies-grain-bowl',
    name: "Charlie's Grain Bowl",
    description: 'Farro, roasted vegetables, greens, feta, and lemon tahini.',
    location: "Charlie's Place",
    price: 11.5,
    category: 'Lunch',
  },
  {
    id: 'charlies-chicken-wrap',
    name: 'Elm City Chicken Wrap',
    description: 'Grilled chicken, avocado, greens, tomato, and chipotle aioli.',
    location: "Charlie's Place",
    price: 10.95,
    category: 'Lunch',
  },
  {
    id: 'charlies-cookie',
    name: 'Chocolate Chunk Cookie',
    description: 'Fresh-baked cookie for the walk back to class.',
    location: "Charlie's Place",
    price: 3.25,
    category: 'Grab & Go',
  },
]

const pickupTimes = ['ASAP', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM']

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price)
}

export default function App() {
  const [selectedLocation, setSelectedLocation] = useState<Location | 'All'>('All')
  const [cart, setCart] = useState<Cart>({})
  const [pickupLocation, setPickupLocation] = useState<Location>("McNay's Cafe")
  const [pickupTime, setPickupTime] = useState(pickupTimes[0])
  const [customerName, setCustomerName] = useState('')

  const visibleItems = useMemo(
    () =>
      selectedLocation === 'All'
        ? menuItems
        : menuItems.filter((item) => item.location === selectedLocation),
    [selectedLocation],
  )

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => ({
          item: menuItems.find((menuItem) => menuItem.id === id)!,
          quantity,
        }))
        .filter(({ quantity }) => quantity > 0),
    [cart],
  )

  const subtotal = cartItems.reduce(
    (total, { item, quantity }) => total + item.price * quantity,
    0,
  )

  const itemCount = cartItems.reduce((total, { quantity }) => total + quantity, 0)

  function addItem(id: string) {
    setCart((currentCart) => ({
      ...currentCart,
      [id]: (currentCart[id] ?? 0) + 1,
    }))
  }

  function removeItem(id: string) {
    setCart((currentCart) => ({
      ...currentCart,
      [id]: Math.max((currentCart[id] ?? 0) - 1, 0),
    }))
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Yale SOM preorder</p>
          <h1>Skip the line at McNay's Cafe and Charlie's Place.</h1>
          <p className="hero-copy">
            Pick your food, choose a pickup time, and get a clean order summary
            you can turn into a real checkout flow next.
          </p>
        </div>
        <div className="hero-card">
          <span>{itemCount} items</span>
          <strong>{formatPrice(subtotal)}</strong>
          <small>Current cart total</small>
        </div>
      </section>

      <section className="toolbar" aria-label="Menu filters">
        {(['All', "McNay's Cafe", "Charlie's Place"] as const).map((location) => (
          <button
            className={selectedLocation === location ? 'active' : ''}
            key={location}
            onClick={() => setSelectedLocation(location)}
            type="button"
          >
            {location}
          </button>
        ))}
      </section>

      <section className="content-grid">
        <div className="menu-grid">
          {visibleItems.map((item) => (
            <article className="menu-card" key={item.id}>
              <div>
                <span className="pill">{item.category}</span>
                <h2>{item.name}</h2>
                <p>{item.description}</p>
              </div>
              <div className="menu-card-footer">
                <div>
                  <strong>{formatPrice(item.price)}</strong>
                  <small>{item.location}</small>
                </div>
                <button onClick={() => addItem(item.id)} type="button">
                  Add
                </button>
              </div>
            </article>
          ))}
        </div>

        <aside className="order-panel" aria-label="Order summary">
          <h2>Your preorder</h2>
          <label>
            Name
            <input
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Your name"
              value={customerName}
            />
          </label>
          <label>
            Pickup location
            <select
              onChange={(event) => setPickupLocation(event.target.value as Location)}
              value={pickupLocation}
            >
              <option>McNay's Cafe</option>
              <option>Charlie's Place</option>
            </select>
          </label>
          <label>
            Pickup time
            <select
              onChange={(event) => setPickupTime(event.target.value)}
              value={pickupTime}
            >
              {pickupTimes.map((time) => (
                <option key={time}>{time}</option>
              ))}
            </select>
          </label>

          <div className="cart-list">
            {cartItems.length === 0 ? (
              <p className="empty-cart">Add a few favorites to start an order.</p>
            ) : (
              cartItems.map(({ item, quantity }) => (
                <div className="cart-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {quantity} x {formatPrice(item.price)}
                    </span>
                  </div>
                  <div className="quantity-controls">
                    <button onClick={() => removeItem(item.id)} type="button">
                      -
                    </button>
                    <span>{quantity}</span>
                    <button onClick={() => addItem(item.id)} type="button">
                      +
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="total-row">
            <span>Subtotal</span>
            <strong>{formatPrice(subtotal)}</strong>
          </div>

          <button className="checkout-button" disabled={cartItems.length === 0} type="button">
            {customerName ? `Place preorder for ${customerName}` : 'Place preorder'}
          </button>
          <p className="fine-print">
            Demo app only. Payments, inventory, and staff order routing still need to be connected.
          </p>
        </aside>
      </section>
    </main>
  )
}
