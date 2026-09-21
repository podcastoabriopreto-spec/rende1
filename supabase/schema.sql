-- =====================================================================
--  RENDE · Esquema do banco (Supabase)
--  Cole tudo no SQL Editor do Supabase e clique em Run.
--  Antes: Authentication > Sign In / Providers > ative "Allow anonymous sign-ins".
-- =====================================================================

-- Abastecimentos ------------------------------------------------------
create table if not exists public.abastecimentos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  veiculo      text not null check (veiculo in ('carro', 'moto')),
  combustivel  text not null check (combustivel in ('gasolina', 'etanol')),
  preco_litro  numeric(6,3) not null check (preco_litro > 0),
  valor_total  numeric(9,2) not null check (valor_total > 0),
  litros       numeric(8,3) not null check (litros > 0),
  odometro     integer check (odometro >= 0),
  criado_em    timestamptz not null default now()
);

create index if not exists abastecimentos_user_data_idx
  on public.abastecimentos (user_id, criado_em desc);

-- Configurações por veículo (km/l, tanque, preços escolhidos) ---------
create table if not exists public.configs (
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  veiculo        text not null check (veiculo in ('carro', 'moto')),
  dados          jsonb not null,
  atualizado_em  timestamptz not null default now(),
  primary key (user_id, veiculo)
);

-- Segurança: cada pessoa só enxerga e altera os próprios dados --------
alter table public.abastecimentos enable row level security;
alter table public.configs        enable row level security;

drop policy if exists "abastecimentos_dono" on public.abastecimentos;
create policy "abastecimentos_dono" on public.abastecimentos
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "configs_dono" on public.configs;
create policy "configs_dono" on public.configs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Push com o app fechado ----------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint        text primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh          text not null,
  auth            text not null,
  dias            integer not null default 7 check (dias between 1 and 365),
  lembrete_ativo  boolean not null default true,
  ultimo_aviso    timestamptz,
  atualizado_em   timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_dono" on public.push_subscriptions;
create policy "push_dono" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
