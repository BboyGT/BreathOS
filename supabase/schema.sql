-- BreatheOS premium subscriptions
-- Run this in the Supabase SQL editor for your project.

create table if not exists public.breatheos_subscriptions (
  app_user_id text primary key,
  email text,
  subscription_tier text not null default 'free',
  subscription_expiry timestamptz,
  paystack_ref text unique,
  paystack_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.breatheos_subscriptions enable row level security;

-- The app writes with SUPABASE_SERVICE_ROLE_KEY from server-only API routes.
-- Do not expose the service role key in browser/client code.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_breatheos_subscriptions_updated_at on public.breatheos_subscriptions;

create trigger set_breatheos_subscriptions_updated_at
before update on public.breatheos_subscriptions
for each row
execute function public.set_updated_at();
