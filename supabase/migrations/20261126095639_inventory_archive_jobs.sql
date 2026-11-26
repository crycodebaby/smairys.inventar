alter table public.inventory_items add column archive_import_pending boolean not null default false;

create table private.inventory_archive_jobs (
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null,
  archive_digest text not null check (archive_digest ~ '^[0-9a-f]{64}$'),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  legacy boolean not null default false,
  completed_at timestamptz,
  primary key (owner_id, source_id, archive_digest)
);
alter table private.inventory_archive_jobs enable row level security;
revoke all on private.inventory_archive_jobs from public, anon, authenticated;
create index inventory_archive_jobs_item on private.inventory_archive_jobs(item_id);

create function private.inventory_archive(archive_action text, source_item uuid, digest text, target_item uuid, fields jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  job private.inventory_archive_jobs%rowtype;
  selected_id uuid;
  legacy_id uuid;
  candidates jsonb;
  old_operation text;
  created jsonb;
begin
  if private.inventory_owner_allowed() is not true or nullif(auth.jwt()->>'client_id','') is not null then
    raise exception 'INVENTORY_ACCESS_DENIED' using errcode = '42501';
  end if;
  if archive_action is null or archive_action not in ('inspect','begin','finish') or source_item is null
    or digest is null or digest !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_ARGUMENTS' using errcode = '22023';
  end if;
  if archive_action <> 'inspect' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('inventory-archive:' || account_id::text || source_item::text,0));
  end if;
  select * into job from private.inventory_archive_jobs a
    where a.owner_id = account_id and a.source_id = source_item and a.archive_digest = digest;
  if archive_action = 'finish' then
    if job.item_id is null or job.item_id is distinct from target_item then
      raise exception 'ARCHIVE_JOB_NOT_FOUND' using errcode = 'P0002';
    end if;
    perform 1 from public.inventory_items i where i.id = job.item_id and i.owner_id = account_id for update;
    if job.completed_at is null then
      update private.inventory_archive_jobs a set completed_at = now()
        where a.owner_id = account_id and a.source_id = source_item and a.archive_digest = digest;
      update public.inventory_items i set archive_import_pending = exists (
        select 1 from private.inventory_archive_jobs a
          where a.item_id = job.item_id and a.owner_id = account_id and a.completed_at is null
      ) where i.id = job.item_id and i.owner_id = account_id;
    end if;
    return jsonb_build_object('item_id',job.item_id,'completed',true,'legacy',job.legacy);
  end if;

  if job.item_id is not null then
    return jsonb_build_object('existing',jsonb_build_object('item_id',job.item_id,
      'completed',job.completed_at is not null,'legacy',job.legacy),'candidates','[]'::jsonb);
  end if;

  -- The old importer derived its create-item operation UUID from this exact manifest digest.
  old_operation := substr(encode(sha256(convert_to(digest || '/item','UTF8')),'hex'),1,32);
  old_operation := overlay(old_operation placing '8' from 13 for 1);
  old_operation := overlay(old_operation placing substr('89ab', ((get_byte(decode(old_operation,'hex'),8) >> 4) & 3) + 1, 1) from 17 for 1);
  select i.id into legacy_id
    from public.inventory_command_log l join public.inventory_items i
      on i.id = (l.result->'item'->>'id')::uuid and i.owner_id = account_id
    where l.owner_id = account_id and l.operation_id = old_operation::uuid and l.command_name = 'create_item';

  if archive_action = 'inspect' then
    select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.inventory_number desc),'[]'::jsonb) into candidates
    from (
      select i.id, i.title, i.inventory_number::text as inventory_number
      from public.inventory_items i
      where i.owner_id = account_id and (
        i.id = source_item or exists (
          select 1 from private.inventory_archive_jobs a
          where a.owner_id = account_id and a.source_id = source_item and a.item_id = i.id
        )
      )
      order by i.inventory_number desc
      limit 50
    ) candidate;
    return jsonb_build_object('existing',null,'legacy_item',legacy_id,'candidates',candidates);
  end if;

  if legacy_id is not null then
    selected_id := legacy_id;
  elsif target_item is not null then
    if not exists (
      select 1 from public.inventory_items i where i.id = target_item and i.owner_id = account_id and (
        i.id = source_item or exists (
          select 1 from private.inventory_archive_jobs a
          where a.owner_id = account_id and a.source_id = source_item and a.item_id = i.id
        )
      )
    ) then raise exception 'ARCHIVE_TARGET_NOT_FOUND' using errcode = 'P0002'; end if;
    selected_id := target_item;
  else
    if jsonb_typeof(fields) is distinct from 'object' or fields ? 'operation_id' then
      raise exception 'INVALID_ARGUMENTS' using errcode = '22023';
    end if;
    created := private.inventory_dispatch_for_owner('create_item',fields || jsonb_build_object('operation_id',gen_random_uuid()));
    selected_id := (created->'item'->>'id')::uuid;
  end if;

  update public.inventory_items i set archive_import_pending = true where i.id = selected_id and i.owner_id = account_id;
  if not found then raise exception 'ARCHIVE_TARGET_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into private.inventory_archive_jobs(owner_id,source_id,archive_digest,item_id,legacy)
    values(account_id,source_item,digest,selected_id,legacy_id is not null)
    returning * into job;
  return jsonb_build_object('existing',jsonb_build_object('item_id',job.item_id,'completed',false,'legacy',job.legacy),'candidates','[]'::jsonb);
end;
$$;

create function public.inventory_archive(archive_action text, source_item uuid, digest text, target_item uuid default null, fields jsonb default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.inventory_archive(archive_action,source_item,digest,target_item,fields);
$$;

revoke all on function private.inventory_archive(text,uuid,text,uuid,jsonb), public.inventory_archive(text,uuid,text,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function private.inventory_archive(text,uuid,text,uuid,jsonb), public.inventory_archive(text,uuid,text,uuid,jsonb)
  to authenticated;
