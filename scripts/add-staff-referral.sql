-- Track which staff member enrolled each customer.
-- Pairs with the /staff/enroll page so waiters can earn a tip-jar commission.
alter table public.profiles
  add column if not exists referred_by_staff uuid references auth.users(id);

create index if not exists profiles_referred_by_staff_idx
  on public.profiles (referred_by_staff);
