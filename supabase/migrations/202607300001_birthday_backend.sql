create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  billing_plan text not null default 'trial',
  billing_status text not null default 'trialing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  unique (workspace_id, email)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slug text not null unique,
  title text not null,
  subtitle text,
  locale text not null default 'vi-VN',
  timezone text not null default 'Asia/Bangkok',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  theme jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table public.recipients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  slug text not null,
  display_name text not null,
  relation_label text,
  birthday_date date,
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'hidden', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, slug)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  recipient_id uuid references public.recipients(id) on delete cascade,
  kind text not null check (kind in ('image', 'audio', 'video', 'file')),
  storage_path text,
  url text,
  alt_text text,
  width integer,
  height integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  order_index integer not null check (order_index between 1 and 4),
  title text not null,
  body text not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  is_published boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, recipient_id, order_index)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  sender_label text not null,
  body text not null,
  consent_status text not null default 'approved' check (consent_status in ('pending', 'approved', 'revoked')),
  reveal_after_order integer not null default 4 check (reveal_after_order between 1 and 4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  current_chapter_order integer not null default 1 check (current_chapter_order between 1 and 5),
  completed_chapters integer not null default 0 check (completed_chapters between 0 and 4),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  voucher_revealed_at timestamptz,
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table public.choices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete restrict,
  choice_key text not null,
  answer_text text,
  client_event_id text,
  elapsed_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, chapter_id)
);

create unique index choices_session_client_event_unique
on public.choices (session_id, client_event_id)
where client_event_id is not null;

create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid references public.recipients(id) on delete set null,
  session_id uuid references public.game_sessions(id) on delete set null,
  event_name text not null,
  chapter_id uuid references public.chapters(id) on delete set null,
  client_event_id text,
  occurred_at timestamptz not null default now(),
  occurred_date_bkk date not null default ((now() at time zone 'Asia/Bangkok')::date),
  payload jsonb not null default '{}'::jsonb,
  request_ip_hash text,
  user_agent text
);

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  code_ciphertext text not null,
  code_hint text,
  title text not null,
  description text,
  terms text,
  revealed_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, recipient_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index campaigns_workspace_status_idx on public.campaigns (workspace_id, status);
create index recipients_campaign_status_idx on public.recipients (campaign_id, status);
create index chapters_recipient_order_idx on public.chapters (recipient_id, order_index);
create index game_sessions_recipient_started_idx on public.game_sessions (recipient_id, started_at desc);
create index game_events_workspace_date_idx on public.game_events (workspace_id, occurred_date_bkk, event_name);
create index audit_logs_workspace_created_idx on public.audit_logs (workspace_id, created_at desc);

create trigger set_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create trigger set_campaigns_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

create trigger set_recipients_updated_at
before update on public.recipients
for each row execute function public.set_updated_at();

create trigger set_chapters_updated_at
before update on public.chapters
for each row execute function public.set_updated_at();

create trigger set_vouchers_updated_at
before update on public.vouchers
for each row execute function public.set_updated_at();

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_editor(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'editor')
  );
$$;

create or replace function public.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.assert_choice_tenant_integrity()
returns trigger
language plpgsql
as $$
declare
  session_row public.game_sessions%rowtype;
  chapter_row public.chapters%rowtype;
begin
  select * into session_row from public.game_sessions where id = new.session_id;
  select * into chapter_row from public.chapters where id = new.chapter_id;

  if session_row.id is null or chapter_row.id is null then
    raise exception 'Invalid session or chapter';
  end if;

  if session_row.workspace_id <> new.workspace_id
    or session_row.campaign_id <> new.campaign_id
    or session_row.recipient_id <> new.recipient_id
    or chapter_row.workspace_id <> new.workspace_id
    or chapter_row.campaign_id <> new.campaign_id
    or chapter_row.recipient_id <> new.recipient_id then
    raise exception 'Tenant integrity violation for choice';
  end if;

  return new;
end;
$$;

create trigger choices_tenant_integrity
before insert or update on public.choices
for each row execute function public.assert_choice_tenant_integrity();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.recipients enable row level security;
alter table public.media_assets enable row level security;
alter table public.chapters enable row level security;
alter table public.messages enable row level security;
alter table public.game_sessions enable row level security;
alter table public.choices enable row level security;
alter table public.game_events enable row level security;
alter table public.vouchers enable row level security;
alter table public.audit_logs enable row level security;

create policy workspaces_member_read on public.workspaces
for select to authenticated
using (public.is_workspace_member(id));

create policy workspaces_editor_update on public.workspaces
for update to authenticated
using (public.is_workspace_editor(id))
with check (public.is_workspace_editor(id));

create policy workspace_members_self_or_editor_read on public.workspace_members
for select to authenticated
using (user_id = auth.uid() or public.is_workspace_editor(workspace_id));

create policy workspace_members_owner_write on public.workspace_members
for all to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy campaigns_member_read on public.campaigns
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy campaigns_editor_write on public.campaigns
for all to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));

create policy recipients_member_read on public.recipients
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy recipients_editor_write on public.recipients
for all to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));

create policy media_assets_member_read on public.media_assets
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy media_assets_editor_write on public.media_assets
for all to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));

create policy chapters_member_read on public.chapters
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy chapters_editor_write on public.chapters
for all to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));

create policy messages_member_read on public.messages
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy messages_editor_write on public.messages
for all to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));

create policy sessions_member_read on public.game_sessions
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy choices_member_read on public.choices
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy events_member_read on public.game_events
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy vouchers_member_read on public.vouchers
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy vouchers_editor_write on public.vouchers
for all to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));

create policy audit_member_read on public.audit_logs
for select to authenticated
using (public.is_workspace_member(workspace_id));
