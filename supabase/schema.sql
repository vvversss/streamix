-- Apply once to a fresh Supabase project through SQL Editor.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  avatar_url text not null default '' check (length(avatar_url) <= 500 and (avatar_url = '' or avatar_url ~ '^https://')),
  bio text not null default '' check (length(bio) <= 300)
);

create table public.streams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 100),
  category text not null check (category in ('chat','cs2','fortnite','minecraft','roblox','music','irl','other')),
  playback_id text not null unique check (length(playback_id) > 0),
  is_live boolean not null default false,
  started_at timestamptz
);
create index streams_live_idx on public.streams (started_at desc) where is_live;

create table public.stream_secrets (
  stream_id uuid primary key references public.streams(id) on delete cascade,
  mux_id text not null unique,
  stream_key text not null check (length(stream_key) > 0),
  last_event_at timestamptz
);

create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  channel_id uuid not null references public.profiles(id) on delete cascade,
  primary key (follower_id, channel_id),
  check (follower_id <> channel_id)
);
create index follows_channel_idx on public.follows(channel_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  username text not null,
  body text not null,
  created_at timestamptz not null default clock_timestamp(),
  removed boolean not null default false,
  check ((removed and body = '') or (not removed and length(btrim(body)) between 1 and 300))
);
create index chat_history_idx on public.chat_messages(stream_id, created_at desc, id desc);
create index chat_sender_idx on public.chat_messages(sender_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.streams enable row level security;
alter table public.stream_secrets enable row level security;
alter table public.follows enable row level security;
alter table public.chat_messages enable row level security;

revoke all on public.profiles, public.streams, public.stream_secrets, public.follows, public.chat_messages from public, anon, authenticated;
grant select on public.profiles, public.streams, public.chat_messages to anon, authenticated;
grant update(username, avatar_url, bio) on public.profiles to authenticated;
grant select on public.follows to authenticated;
grant insert(channel_id) on public.follows to authenticated;
grant delete on public.follows to authenticated;
grant select(stream_id, stream_key) on public.stream_secrets to authenticated;
grant insert(stream_id, body) on public.chat_messages to authenticated;
grant all on public.profiles, public.streams, public.stream_secrets, public.follows, public.chat_messages to service_role;

create policy profiles_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_edit on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy streams_read on public.streams for select to anon, authenticated using (true);
create policy secrets_owner on public.stream_secrets for select to authenticated using (
  exists (select 1 from public.streams where id = stream_id and owner_id = (select auth.uid()))
);
create policy follows_read on public.follows for select to authenticated using ((select auth.uid()) = follower_id);
create policy follows_add on public.follows for insert to authenticated with check ((select auth.uid()) = follower_id);
create policy follows_remove on public.follows for delete to authenticated using ((select auth.uid()) = follower_id);
create policy chat_read on public.chat_messages for select to anon, authenticated using (true);
create policy chat_write on public.chat_messages for insert to authenticated with check ((select auth.uid()) = sender_id);

create schema if not exists streamix_internal;
revoke all on schema streamix_internal from public, anon, authenticated;

create function streamix_internal.new_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, username)
  values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 19));
  return new;
end;
$$;
create trigger streamix_new_profile after insert on auth.users
for each row execute function streamix_internal.new_profile();
insert into public.profiles(id, username)
select id, 'user_' || substr(replace(id::text, '-', ''), 1, 19) from auth.users;

create function streamix_internal.guard_chat() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is distinct from new.sender_id or new.sender_id is null
    or coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.sender_id::text, 0));
  if exists (select 1 from public.chat_messages
      where sender_id = new.sender_id and created_at > clock_timestamp() - interval '2 seconds') then
    raise exception 'Подождите 2 секунды между сообщениями';
  end if;
  new.body := regexp_replace(btrim(new.body), '[[:cntrl:]]', ' ', 'g');
  if new.body ~* '(https?://|www\.)' then
    raise exception 'Ссылки в чате запрещены';
  end if;
  new.created_at := clock_timestamp();
  select username into new.username from public.profiles where id = new.sender_id;
  return new;
end;
$$;
create trigger streamix_guard_chat before insert on public.chat_messages
for each row execute function streamix_internal.guard_chat();

create function public.streamix_save_channel(
  p_owner uuid, p_title text, p_category text, p_mux text, p_playback text, p_key text
) returns uuid language plpgsql set search_path = '' as $$
declare channel uuid;
begin
  insert into public.streams(owner_id, title, category, playback_id)
  values (p_owner, p_title, p_category, p_playback)
  returning id into channel;
  insert into public.stream_secrets(stream_id, mux_id, stream_key) values (channel, p_mux, p_key);
  return channel;
end;
$$;

create function public.streamix_apply_live_event(
  p_mux text, p_live boolean, p_event_at timestamptz
) returns void language plpgsql set search_path = '' as $$
declare channel uuid;
begin
  update public.stream_secrets set last_event_at = p_event_at
  where mux_id = p_mux and (last_event_at is null or last_event_at <= p_event_at)
  returning stream_id into channel;
  if channel is not null then
    update public.streams set is_live = p_live,
      started_at = case when p_live then coalesce(started_at, p_event_at) else null end
    where id = channel and is_live is distinct from p_live;
  end if;
end;
$$;

revoke all on function public.streamix_save_channel(uuid,text,text,text,text,text),
  public.streamix_apply_live_event(text,boolean,timestamptz) from public, anon, authenticated;
grant execute on function public.streamix_save_channel(uuid,text,text,text,text,text),
  public.streamix_apply_live_event(text,boolean,timestamptz) to service_role;
revoke all on all functions in schema streamix_internal from public, anon, authenticated;

alter publication supabase_realtime add table public.streams, public.chat_messages;
commit;
