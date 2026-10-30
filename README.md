# McNay Cookie Pickup

A student-run McNay cookie pickup prototype for Yale SOM. Users verify a Yale
email, choose a class-break pickup window, pay through Stripe Checkout, and meet
at the entrance of McNay's.

## What It Does

- Sells one MVP item: a McNay chocolate chip cookie pickup for $2.25.
- Verifies `@yale.edu` emails with a Resend magic link.
- Uses Stripe Checkout and webhook-confirmed paid orders.
- Stores users, pickup windows, verification tokens, and orders in Supabase.
- Sends customer and admin status emails.
- Provides a password-protected admin page at `/admin`.

## Development

```bash
npm install
npm run dev:server
npm run dev
```

Copy `.env.example` to `.env` and fill in real local values before using API
routes. Keep `.env` out of git.

## Build

```bash
npm run build
npm start
```

## Supabase

Run `supabase/schema.sql` in the Supabase SQL editor. It creates:

- `users`
- `email_verification_tokens`
- `pickup_windows`
- `orders`

## Render

Use a Node web service.

- Build command: `npm install && npm run build`
- Start command: `npm start`

Add the values from `.env.example` in Render's environment settings.

## Stripe

Create a webhook pointed at:

```text
https://your-render-url.onrender.com/api/stripe/webhook
```

Listen for `checkout.session.completed`.

## MVP Safety

Run a full test-mode order before switching to live Stripe credentials.

