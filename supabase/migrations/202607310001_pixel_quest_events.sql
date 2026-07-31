create unique index game_events_session_client_event_unique
on public.game_events (session_id, client_event_id);

create or replace function public.assert_game_event_tenant_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.campaigns campaign
    where campaign.id = new.campaign_id
      and campaign.workspace_id = new.workspace_id
  ) then
    raise exception 'game event campaign does not belong to workspace';
  end if;

  if new.recipient_id is not null and not exists (
    select 1
    from public.recipients recipient
    where recipient.id = new.recipient_id
      and recipient.workspace_id = new.workspace_id
      and recipient.campaign_id = new.campaign_id
  ) then
    raise exception 'game event recipient does not belong to campaign';
  end if;

  if new.session_id is not null and not exists (
    select 1
    from public.game_sessions session
    where session.id = new.session_id
      and session.workspace_id = new.workspace_id
      and session.campaign_id = new.campaign_id
      and session.recipient_id = new.recipient_id
  ) then
    raise exception 'game event session does not match tenant scope';
  end if;

  if new.chapter_id is not null and not exists (
    select 1
    from public.chapters chapter
    where chapter.id = new.chapter_id
      and chapter.workspace_id = new.workspace_id
      and chapter.campaign_id = new.campaign_id
      and (new.recipient_id is null or chapter.recipient_id = new.recipient_id)
  ) then
    raise exception 'game event chapter does not match tenant scope';
  end if;

  return new;
end;
$$;

create trigger assert_game_event_tenant_integrity
before insert or update on public.game_events
for each row execute function public.assert_game_event_tenant_integrity();
