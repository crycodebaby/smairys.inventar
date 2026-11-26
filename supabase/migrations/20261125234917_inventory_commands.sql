create schema if not exists private;

create table public.inventory_labels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('category', 'condition', 'workflow', 'marker')),
  name text not null check (length(trim(name)) between 1 and 200),
  color text not null default '#8EACD0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  unique (owner_id, id)
);
create unique index inventory_labels_name on public.inventory_labels(owner_id, kind, lower(trim(name)));

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  inventory_number bigint generated always as identity unique,
  title text not null check (length(trim(title)) between 1 and 200),
  brand text not null default '' check (length(brand) <= 200),
  model text not null default '' check (length(model) <= 200),
  location text not null default '' check (length(location) <= 500),
  description text not null default '' check (length(description) <= 10000),
  category_id uuid,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  foreign key (owner_id, category_id) references public.inventory_labels(owner_id, id)
);
create index inventory_items_owner on public.inventory_items(owner_id, created_at desc, id);

create table public.inventory_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 200),
  verbatim_text text not null default '' check (length(verbatim_text) <= 20000),
  interpretation text not null default '' check (length(interpretation) <= 20000),
  attribution text not null default 'unknown' check (attribution in ('unknown', 'reported_by_user', 'verified')),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (owner_id, item_id) references public.inventory_items(owner_id, id)
);
create index inventory_notes_item on public.inventory_notes(owner_id, item_id);

create table public.inventory_command_log (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  command_name text not null,
  arguments jsonb not null,
  result jsonb not null,
  oauth_client_id text,
  created_at timestamptz not null default now(),
  primary key(owner_id, operation_id)
);

alter table public.inventory_labels enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_notes enable row level security;
alter table public.inventory_command_log enable row level security;

create policy labels_owner_read on public.inventory_labels for select to authenticated using (owner_id = (select auth.uid()));
create policy items_owner_read on public.inventory_items for select to authenticated using (owner_id = (select auth.uid()));
create policy notes_owner_read on public.inventory_notes for select to authenticated using (owner_id = (select auth.uid()));
create policy log_owner_read on public.inventory_command_log for select to authenticated using (owner_id = (select auth.uid()));

revoke all on public.inventory_labels, public.inventory_items, public.inventory_notes, public.inventory_command_log from anon, authenticated;
grant select on public.inventory_labels, public.inventory_items, public.inventory_notes, public.inventory_command_log to authenticated;

create function private.inventory_dispatch(command_name text, arguments jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  operation uuid;
  previous public.inventory_command_log%rowtype;
  item public.inventory_items%rowtype;
  label public.inventory_labels%rowtype;
  note public.inventory_notes%rowtype;
  result jsonb;
  allowed_keys text[];
begin
  if account_id is null or coalesce(auth.jwt()->>'role', '') <> 'authenticated' then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if jsonb_typeof(arguments) is distinct from 'object' then
    raise exception 'INVALID_ARGUMENTS' using errcode = '22023';
  end if;
  allowed_keys := case command_name
    when 'search_inventory' then array['query','limit','offset']
    when 'get_item' then array['item_id']
    when 'list_labels' then array['kind']
    when 'create_item' then array['operation_id','title','brand','model','location','description','category_id']
    when 'update_item' then array['operation_id','item_id','expected_revision','changes']
    when 'add_note' then array['operation_id','item_id','title','verbatim_text','interpretation','attribution','pinned']
    when 'create_label' then array['operation_id','kind','name','color']
    else null end;
  if allowed_keys is null then raise exception 'UNKNOWN_COMMAND' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_object_keys(arguments) k where not (k = any(allowed_keys))) then
    raise exception 'INVALID_ARGUMENTS' using errcode = '22023';
  end if;

  if command_name = 'search_inventory' then
    if length(coalesce(arguments->>'query', '')) > 200
      or coalesce((arguments->>'limit')::integer,20) not between 1 and 50
      or coalesce((arguments->>'offset')::integer,0) not between 0 and 100000 then
      raise exception 'INVALID_ARGUMENTS' using errcode = '22023';
    end if;
    select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(found)), '[]'::jsonb)) into result
    from (
      select * from public.inventory_items i where i.owner_id = account_id
        and position(lower(coalesce(arguments->>'query','')) in lower(i.title || ' ' || i.brand || ' ' || i.model || ' ' || i.description)) > 0
      order by i.created_at desc, i.id
      limit coalesce((arguments->>'limit')::integer,20) offset coalesce((arguments->>'offset')::integer,0)
    ) found;
    return result;
  elsif command_name = 'list_labels' then
    if arguments ? 'kind' and arguments->>'kind' not in ('category','condition','workflow','marker') then
      raise exception 'INVALID_ARGUMENTS' using errcode = '22023';
    end if;
    select jsonb_build_object('labels',coalesce(jsonb_agg(to_jsonb(l) order by l.kind,l.name), '[]'::jsonb)) into result
    from public.inventory_labels l where l.owner_id = account_id and (not (arguments ? 'kind') or l.kind = arguments->>'kind');
    return result;
  elsif command_name = 'get_item' then
    select * into item from public.inventory_items where id = (arguments->>'item_id')::uuid and owner_id = account_id;
    if not found then raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
    select jsonb_build_object('item',to_jsonb(item),'notes',coalesce(jsonb_agg(to_jsonb(n) order by n.pinned desc,n.created_at,n.id), '[]'::jsonb)) into result
    from public.inventory_notes n where n.item_id = item.id and n.owner_id = account_id;
    return result;
  end if;

  operation := (arguments->>'operation_id')::uuid;
  if operation is null then raise exception 'INVALID_ARGUMENTS' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(account_id::text || operation::text, 0));
  select * into previous from public.inventory_command_log where owner_id = account_id and operation_id = operation;
  if found then
    if previous.command_name <> command_name or previous.arguments <> arguments then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return previous.result;
  end if;

  if command_name = 'create_label' then
    insert into public.inventory_labels(owner_id,kind,name,color)
    values(account_id,arguments->>'kind',trim(arguments->>'name'),coalesce(arguments->>'color','#8EACD0')) returning * into label;
    result := jsonb_build_object('label',to_jsonb(label));
  elsif command_name = 'create_item' then
    if arguments ? 'category_id' and not exists(select 1 from public.inventory_labels where id = (arguments->>'category_id')::uuid and owner_id = account_id and kind = 'category') then
      raise exception 'LABEL_NOT_FOUND' using errcode = 'P0002';
    end if;
    insert into public.inventory_items(owner_id,title,brand,model,location,description,category_id)
    values(account_id,trim(arguments->>'title'),coalesce(arguments->>'brand',''),coalesce(arguments->>'model',''),coalesce(arguments->>'location',''),coalesce(arguments->>'description',''),(arguments->>'category_id')::uuid) returning * into item;
    result := jsonb_build_object('item',to_jsonb(item));
  elsif command_name = 'update_item' then
    if jsonb_typeof(arguments->'changes') is distinct from 'object' or arguments->'changes' = '{}'::jsonb
      or exists(select 1 from jsonb_object_keys(arguments->'changes') k where k not in ('title','brand','model','location','description'))
      or coalesce((arguments->>'expected_revision')::integer,0) < 1 then
      raise exception 'INVALID_ARGUMENTS' using errcode = '22023';
    end if;
    select * into item from public.inventory_items where id = (arguments->>'item_id')::uuid and owner_id = account_id for update;
    if not found then raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
    if item.revision <> (arguments->>'expected_revision')::integer then
      return jsonb_build_object('error','REVISION_CONFLICT','current',to_jsonb(item));
    end if;
    update public.inventory_items set
      title = case when arguments->'changes' ? 'title' then trim(arguments->'changes'->>'title') else title end,
      brand = coalesce(arguments->'changes'->>'brand',brand),
      model = coalesce(arguments->'changes'->>'model',model),
      location = coalesce(arguments->'changes'->>'location',location),
      description = coalesce(arguments->'changes'->>'description',description),
      revision = revision + 1, updated_at = now()
    where id = item.id returning * into item;
    result := jsonb_build_object('item',to_jsonb(item));
  elsif command_name = 'add_note' then
    if not exists(select 1 from public.inventory_items where id = (arguments->>'item_id')::uuid and owner_id = account_id) then
      raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
    end if;
    insert into public.inventory_notes(owner_id,item_id,title,verbatim_text,interpretation,attribution,pinned)
    values(account_id,(arguments->>'item_id')::uuid,trim(arguments->>'title'),coalesce(arguments->>'verbatim_text',''),coalesce(arguments->>'interpretation',''),coalesce(arguments->>'attribution','unknown'),coalesce((arguments->>'pinned')::boolean,false)) returning * into note;
    result := jsonb_build_object('note',to_jsonb(note));
  end if;

  insert into public.inventory_command_log(owner_id,operation_id,command_name,arguments,result,oauth_client_id)
  values(account_id,operation,command_name,arguments,result,auth.jwt()->>'client_id');
  return result;
end;
$$;

revoke all on function private.inventory_dispatch(text,jsonb) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.inventory_dispatch(text,jsonb) to authenticated;

create function public.inventory_command(command_name text, arguments jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.inventory_dispatch(command_name,arguments); $$;
revoke all on function public.inventory_command(text,jsonb) from public, anon;
grant execute on function public.inventory_command(text,jsonb) to authenticated;

comment on function private.inventory_dispatch(text,jsonb) is 'Command boundary. Derives the account from auth.uid, checks ownership for every object, serializes repeated operation IDs and logs successful writes atomically. Tables grant authenticated callers SELECT only.';

create function public.inventory_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare claims jsonb := event->'claims';
begin
  if coalesce(claims->>'client_id','') <> '' then
    claims := jsonb_set(claims,'{aud}','"https://xywnhifzahwcmclrfsil.supabase.co/functions/v1/inventory/mcp"'::jsonb);
  end if;
  return jsonb_set(event,'{claims}',claims);
end;
$$;
revoke all on function public.inventory_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.inventory_access_token_hook(jsonb) to supabase_auth_admin;
