create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  status text check (status in ('active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'trialing')),
  plan_id text,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  razorpay_order_id text,
  razorpay_payment_id text
);

alter table subscriptions enable row level security;

create policy "Users can view own subscription" 
  on subscriptions for select 
  to authenticated 
  using (auth.uid() = user_id);

-- Only service role can insert/update for now (via verify function)
create policy "Service role can manage all subscriptions"
  on subscriptions for all
  to service_role
  using (true)
  with check (true);
