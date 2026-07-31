create or replace function public.assert_memory_world_tenant_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.campaigns campaign
    join public.recipients recipient
      on recipient.id = new.recipient_id
     and recipient.workspace_id = campaign.workspace_id
     and recipient.campaign_id = campaign.id
    where campaign.id = new.campaign_id
      and campaign.workspace_id = new.workspace_id
  ) then
    raise exception 'Tenant integrity violation for memory world' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.assert_memory_node_tenant_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.memory_worlds world
    left join public.chapters chapter on chapter.id = new.chapter_id
    where world.id = new.world_id
      and world.workspace_id = new.workspace_id
      and world.campaign_id = new.campaign_id
      and (
        new.chapter_id is null
        or (
          chapter.workspace_id = new.workspace_id
          and chapter.campaign_id = new.campaign_id
          and chapter.recipient_id = world.recipient_id
        )
      )
  ) then
    raise exception 'Tenant integrity violation for memory node' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.assert_memory_quest_tenant_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.memory_nodes node
    join public.memory_worlds world on world.id = node.world_id
    where node.id = new.node_id
      and node.world_id = new.world_id
      and node.workspace_id = new.workspace_id
      and node.campaign_id = new.campaign_id
      and world.workspace_id = new.workspace_id
      and world.campaign_id = new.campaign_id
  ) then
    raise exception 'Tenant integrity violation for memory quest' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.assert_game_session_progress_tenant_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.game_sessions session
    join public.memory_worlds world on world.id = new.world_id
    join public.memory_nodes node on node.id = new.node_id
    join public.memory_quests quest on quest.id = new.quest_id
    where session.id = new.session_id
      and session.workspace_id = new.workspace_id
      and session.campaign_id = new.campaign_id
      and session.recipient_id = new.recipient_id
      and world.workspace_id = new.workspace_id
      and world.campaign_id = new.campaign_id
      and world.recipient_id = new.recipient_id
      and node.workspace_id = new.workspace_id
      and node.campaign_id = new.campaign_id
      and node.world_id = world.id
      and quest.workspace_id = new.workspace_id
      and quest.campaign_id = new.campaign_id
      and quest.world_id = world.id
      and quest.node_id = node.id
  ) then
    raise exception 'Tenant integrity violation for game session progress' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists memory_worlds_tenant_integrity on public.memory_worlds;
create trigger memory_worlds_tenant_integrity
before insert or update on public.memory_worlds
for each row execute function public.assert_memory_world_tenant_integrity();

drop trigger if exists memory_nodes_tenant_integrity on public.memory_nodes;
create trigger memory_nodes_tenant_integrity
before insert or update on public.memory_nodes
for each row execute function public.assert_memory_node_tenant_integrity();

drop trigger if exists memory_quests_tenant_integrity on public.memory_quests;
create trigger memory_quests_tenant_integrity
before insert or update on public.memory_quests
for each row execute function public.assert_memory_quest_tenant_integrity();

drop trigger if exists game_session_progress_tenant_integrity on public.game_session_progress;
create trigger game_session_progress_tenant_integrity
before insert or update on public.game_session_progress
for each row execute function public.assert_game_session_progress_tenant_integrity();

create or replace function public.record_birthday_choice_progress(
  p_workspace_id uuid,
  p_campaign_id uuid,
  p_recipient_id uuid,
  p_session_id uuid,
  p_chapter_id uuid,
  p_choice_key text,
  p_answer_text text,
  p_client_event_id text,
  p_elapsed_ms integer
)
returns table (
  choice_id uuid,
  choice_key text,
  inserted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.game_sessions%rowtype;
  chapter_row public.chapters%rowtype;
  recorded_choice public.choices%rowtype;
  inserted_choice boolean := false;
begin
  select * into session_row
  from public.game_sessions
  where id = p_session_id
    and workspace_id = p_workspace_id
    and campaign_id = p_campaign_id
    and recipient_id = p_recipient_id
  for update;

  select * into chapter_row
  from public.chapters
  where id = p_chapter_id
    and workspace_id = p_workspace_id
    and campaign_id = p_campaign_id
    and recipient_id = p_recipient_id;

  if session_row.id is null or chapter_row.id is null then
    raise exception 'Invalid session or chapter for choice progress' using errcode = '23514';
  end if;

  if session_row.status <> 'active' then
    raise exception 'Session is already completed' using errcode = '23514';
  end if;

  select * into recorded_choice
  from public.choices
  where session_id = p_session_id
    and chapter_id = p_chapter_id;

  if recorded_choice.id is null then
    if chapter_row.order_index <> session_row.current_chapter_order then
      raise exception 'Chapter is not active for choice progress' using errcode = '23514';
    end if;

    insert into public.choices (
      workspace_id,
      campaign_id,
      recipient_id,
      session_id,
      chapter_id,
      choice_key,
      answer_text,
      client_event_id,
      elapsed_ms,
      metadata
    ) values (
      p_workspace_id,
      p_campaign_id,
      p_recipient_id,
      p_session_id,
      p_chapter_id,
      p_choice_key,
      p_answer_text,
      p_client_event_id,
      p_elapsed_ms,
      '{}'::jsonb
    )
    on conflict do nothing
    returning * into recorded_choice;

    inserted_choice := recorded_choice.id is not null;

    if recorded_choice.id is null then
      select * into recorded_choice
      from public.choices
      where session_id = p_session_id
        and chapter_id = p_chapter_id;
    end if;
  end if;

  if recorded_choice.id is null then
    raise exception 'client_event_id is already used by another progress event' using errcode = '23505';
  end if;

  update public.game_sessions
  set completed_chapters = greatest(completed_chapters, chapter_row.order_index),
      current_chapter_order = greatest(current_chapter_order, chapter_row.order_index + 1),
      last_seen_at = now()
  where id = p_session_id;

  choice_id := recorded_choice.id;
  choice_key := recorded_choice.choice_key;
  inserted := inserted_choice;
  return next;
end;
$$;

revoke all on function public.record_birthday_choice_progress(
  uuid, uuid, uuid, uuid, uuid, text, text, text, integer
) from public, anon, authenticated;

grant execute on function public.record_birthday_choice_progress(
  uuid, uuid, uuid, uuid, uuid, text, text, text, integer
) to service_role;
