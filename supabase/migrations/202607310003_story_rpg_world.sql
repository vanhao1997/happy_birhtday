alter table public.game_sessions
  add column if not exists world_version integer not null default 3,
  add column if not exists last_checkpoint_node text,
  add column if not exists state_version integer not null default 1;

create table if not exists public.memory_worlds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  version integer not null default 3 check (version >= 3),
  preset text not null default 'childhood-memory-atlas',
  width_px integer not null check (width_px between 800 and 2400),
  height_px integer not null check (height_px between 480 and 1400),
  zoom numeric(3,2) not null default 0.76 check (zoom between 0.5 and 1),
  spawn_x numeric not null default 0,
  spawn_y numeric not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, recipient_id, version)
);

create table if not exists public.memory_nodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  world_id uuid not null references public.memory_worlds(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  node_key text not null,
  kind text not null check (kind in ('station', 'npc', 'gate', 'landmark')),
  title text not null,
  x_percent numeric not null check (x_percent between 5 and 95),
  y_percent numeric not null check (y_percent between 8 and 92),
  unlock_after text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (world_id, node_key)
);

create table if not exists public.memory_quests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  world_id uuid not null references public.memory_worlds(id) on delete cascade,
  node_id uuid not null references public.memory_nodes(id) on delete cascade,
  objective_key text not null,
  quest_type text not null check (quest_type in ('collect', 'talk', 'activate', 'deliver', 'story')),
  title text not null,
  prompt text not null,
  target_label text not null,
  completion_line text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (node_id, objective_key)
);

create table if not exists public.game_session_progress (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  world_id uuid not null references public.memory_worlds(id) on delete cascade,
  node_id uuid not null references public.memory_nodes(id) on delete cascade,
  quest_id uuid not null references public.memory_quests(id) on delete cascade,
  status text not null default 'completed' check (status in ('available', 'in_progress', 'completed')),
  client_event_id text,
  elapsed_ms integer,
  payload jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, node_id, quest_id),
  unique (session_id, client_event_id)
);

create index if not exists memory_nodes_world_position_idx
  on public.memory_nodes (world_id, y_percent, x_percent);
create index if not exists memory_quests_node_idx
  on public.memory_quests (node_id);
create index if not exists game_session_progress_session_idx
  on public.game_session_progress (session_id, status);

alter table public.memory_worlds enable row level security;
alter table public.memory_nodes enable row level security;
alter table public.memory_quests enable row level security;
alter table public.game_session_progress enable row level security;

create policy memory_worlds_member_read on public.memory_worlds
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy memory_worlds_editor_write on public.memory_worlds
for all to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));

create policy memory_nodes_member_read on public.memory_nodes
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy memory_nodes_editor_write on public.memory_nodes
for all to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));

create policy memory_quests_member_read on public.memory_quests
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy memory_quests_editor_write on public.memory_quests
for all to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));

create policy game_session_progress_member_read on public.game_session_progress
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy game_session_progress_editor_write on public.game_session_progress
for all to authenticated
using (public.is_workspace_editor(workspace_id))
with check (public.is_workspace_editor(workspace_id));
