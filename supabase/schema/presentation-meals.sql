-- Apply only to the LIVE 2026 project: tzzkgfehtnuizamzlbgr.
-- Existing RSVP rows and all other events are unchanged.
create table public.presentation_meals (
  rsvp_id bigint primary key references public.rsvps(id) on delete cascade,
  meal text not null check (meal in ('cod', 'halloumi', 'cottage_pie', 'steak_pie', 'steam_burger', 'vegan_burger')),
  side text,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint valid_meal_side check (
    (meal = 'steak_pie' and side is not null and side in ('chips', 'mash'))
    or (meal <> 'steak_pie' and side is null)
  )
);
alter table public.presentation_meals enable row level security;
revoke all on public.presentation_meals from public, anon, authenticated;
grant select, insert, update on public.presentation_meals to service_role;
comment on table public.presentation_meals is
  'Presentation evening meals. Access exclusively through presentation-meals Edge Function; no public table access.';
