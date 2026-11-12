create table if not exists public.destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  tagline text,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  destination text not null,
  country text,
  tagline text,
  start_date date not null,
  end_date date not null,
  travelers int not null default 1 check (travelers between 1 and 99),
  status text not null default 'planning' check (status in ('planning', 'booked', 'saved', 'completed')),
  budget numeric(12,2) not null default 0 check (budget >= 0),
  cover_url text,
  latitude double precision,
  longitude double precision,
  place_id text,
  stay_name text,
  stay_lat double precision,
  stay_lng double precision,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  destination_id uuid references public.destinations(id) on delete set null,
  name text not null,
  destination text,
  country text,
  image_url text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  item_date date not null,
  item_time time,
  end_time time,
  place text,
  tag text,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  label text,
  amount numeric(12,2) not null check (amount >= 0),
  category text,
  spent_on date,
  created_at timestamptz not null default now()
);

alter table public.trips add column if not exists stay_name text;
alter table public.trips add column if not exists stay_lat double precision;
alter table public.trips add column if not exists stay_lng double precision;
alter table public.trips add column if not exists deleted_at timestamptz;

alter table public.itinerary_items add column if not exists end_time time;
alter table public.itinerary_items add column if not exists place text;

alter table public.expenses add column if not exists category text;
alter table public.expenses add column if not exists spent_on date;

alter table public.saved_places add column if not exists latitude double precision;
alter table public.saved_places add column if not exists longitude double precision;

alter table public.destinations enable row level security;
alter table public.trips enable row level security;
alter table public.saved_places enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.checklist_items enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "Anyone can read destinations" on public.destinations;
create policy "Anyone can read destinations" on public.destinations
  for select using (true);

drop policy if exists "Own trips" on public.trips;
drop policy if exists "Read own trips" on public.trips;
drop policy if exists "Add own trips" on public.trips;
drop policy if exists "Edit own trips" on public.trips;
create policy "Read own trips" on public.trips
  for select using (auth.uid() = user_id);
create policy "Add own trips" on public.trips
  for insert with check (auth.uid() = user_id);
create policy "Edit own trips" on public.trips
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own saved places" on public.saved_places;
create policy "Own saved places" on public.saved_places
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own itinerary items" on public.itinerary_items;
create policy "Own itinerary items" on public.itinerary_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own checklist items" on public.checklist_items;
create policy "Own checklist items" on public.checklist_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own expenses" on public.expenses;
create policy "Own expenses" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into public.destinations (name, country, tagline, image_url)
select * from (values
  ('Kyoto', 'Japan', 'Temples, gardens & tea houses', 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=500&q=80'),
  ('Amalfi Coast', 'Italy', 'Cliffside towns & lemon groves', 'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=500&q=80'),
  ('Swiss Alps', 'Switzerland', 'Peaks, lakes & mountain trains', 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=500&q=80'),
  ('Bali', 'Indonesia', 'Rice terraces & slow mornings', 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=500&q=80'),
  ('Tokyo', 'Japan', 'Neon nights & hidden alleys', 'https://images.unsplash.com/photo-1540959733332-eab4deae3f6e?auto=format&fit=crop&w=500&q=80'),
  ('Palawan', 'Philippines', 'Lagoons, limestone & island hopping', 'https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?auto=format&fit=crop&w=500&q=80'),
  ('Paris', 'France', 'Cafés, art & the Eiffel Tower', null),
  ('Santorini', 'Greece', 'White villages & caldera sunsets', null),
  ('New York City', 'United States', 'Skyline, Broadway & bagels', null)
) as v(name, country, tagline, image_url)
where not exists (select 1 from public.destinations);