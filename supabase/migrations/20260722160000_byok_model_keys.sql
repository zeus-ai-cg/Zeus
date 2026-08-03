-- Phase 4: Multi-Model Support (BYOK).
--
-- Lets a user optionally connect their own API key for a supported model
-- provider and pick which provider/model is "active" for their chats.
-- Keys are encrypted at rest with AES-256-GCM using a server-only secret
-- (see src/lib/crypto.server.ts) before they ever reach this table — the
-- database only ever stores ciphertext, and no server function returns the
-- decrypted value to the client (only a masked preview).

create table if not exists public.user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'openai', 'anthropic', 'openrouter', 'groq', 'deepseek', 'mistral')),
  encrypted_key text not null,
  last_four text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

comment on table public.user_api_keys is
  'User-supplied ("bring your own key") API keys for AI model providers, encrypted at rest (Phase 4). Never queried from client code — only from server functions in src/lib/model-keys.functions.ts.';

alter table public.user_api_keys enable row level security;

create policy "Users manage their own API keys"
  on public.user_api_keys
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_user_api_key_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_api_keys_set_updated_at on public.user_api_keys;
create trigger user_api_keys_set_updated_at
  before update on public.user_api_keys
  for each row execute function public.set_user_api_key_updated_at();

-- Which provider/model a user's chats should use. Defaults preserve
-- exactly the current behavior (Zeus AI's own Gemini key).
alter table public.profiles add column if not exists active_model_provider text not null default 'gemini';
alter table public.profiles add column if not exists active_model_id text not null default 'gemini-2.5-flash';
