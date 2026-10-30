create extension if not exists citext;
create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_yale_email check (email::text ~* '^[^@\s]+@yale\.edu$')
);

create table if not exists public.email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pickup_windows (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  starts_at time not null,
  ends_at time not null,
  cutoff_at time not null,
  max_orders integer not null default 10,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint pickup_windows_label_unique unique (label)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  pickup_window_id uuid not null references public.pickup_windows(id) on delete restrict,
  status text not null default 'paid',
  amount_cents integer not null default 225,
  currency text not null default 'usd',
  pickup_code text not null,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  paid_at timestamptz not null default now(),
  placed_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz,
  refund_marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_status_check check (
    status in ('paid', 'placed', 'ready', 'picked_up', 'refund_needed', 'refunded')
  )
);

create unique index if not exists one_active_order_per_user_window
  on public.orders(user_id, pickup_window_id)
  where status in ('paid', 'placed', 'ready');

create index if not exists orders_pickup_window_id_idx
  on public.orders(pickup_window_id);

create index if not exists email_verification_tokens_user_id_idx
  on public.email_verification_tokens(user_id);

insert into public.pickup_windows (label, starts_at, ends_at, cutoff_at, max_orders, sort_order)
values
  ('9:50-10:05 AM', '09:50', '10:05', '09:40', 10, 1),
  ('11:25-11:45 AM', '11:25', '11:45', '11:15', 10, 2),
  ('2:20-2:35 PM', '14:20', '14:35', '14:10', 10, 3),
  ('3:55-4:10 PM', '15:55', '16:10', '15:45', 10, 4),
  ('5:30-5:45 PM', '17:30', '17:45', '17:20', 10, 5)
on conflict (label) do nothing;
