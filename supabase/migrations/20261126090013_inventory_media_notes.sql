alter table public.inventory_media
  add constraint inventory_media_object_reference unique (owner_id,item_id,id);

alter table public.inventory_notes
  add column media_id uuid,
  add constraint inventory_notes_media_reference foreign key (owner_id,item_id,media_id)
    references public.inventory_media (owner_id,item_id,id);
create index inventory_notes_media on public.inventory_notes (owner_id,item_id,media_id)
  where media_id is not null;

create or replace function private.inventory_dispatch_for_owner(command_name text, arguments jsonb)
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
  source_id uuid;
  source_name text;
  result jsonb;
  allowed_keys text[];
begin
  if account_id is null or coalesce(auth.jwt()->>'role', '') <> 'authenticated' then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if jsonb_typeof(arguments) is distinct from 'object' or octet_length(arguments::text) > 262144 then
    raise exception 'INVALID_ARGUMENTS' using errcode = '22023';
  end if;
  allowed_keys := case command_name
    when 'search_inventory' then array['query','limit','offset']
    when 'get_item' then array['item_id']
    when 'list_labels' then array['kind']
    when 'create_item' then array['operation_id','title','brand','model','location','description','category_id']
    when 'update_item' then array['operation_id','item_id','expected_revision','changes']
    when 'add_note' then array['operation_id','item_id','media_id','title','verbatim_text','interpretation','attribution','pinned']
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
    select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(matching_item) order by matching_item.created_at desc, matching_item.id), '[]'::jsonb)) into result
    from (
      select * from public.inventory_items i where i.owner_id = account_id
        and position(lower(coalesce(arguments->>'query','')) in lower(i.title || ' ' || i.brand || ' ' || i.model || ' ' || i.description)) > 0
      order by i.created_at desc, i.id
      limit coalesce((arguments->>'limit')::integer,20) offset coalesce((arguments->>'offset')::integer,0)
    ) matching_item;
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
    select jsonb_build_object('item',to_jsonb(item),'notes',coalesce(jsonb_agg(to_jsonb(n) || jsonb_build_object('media_name',m.original_name) order by n.pinned desc,n.created_at,n.id), '[]'::jsonb)) into result
    from public.inventory_notes n
    left join public.inventory_media m on m.id = n.media_id and m.owner_id = n.owner_id and m.item_id = n.item_id
    where n.item_id = item.id and n.owner_id = account_id;
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
    source_id := (arguments->>'media_id')::uuid;
    if source_id is not null then
      select m.original_name into source_name from public.inventory_media m
      where m.id = source_id and m.owner_id = account_id and m.item_id = (arguments->>'item_id')::uuid and m.uploaded_at is not null;
      if not found then raise exception 'MEDIA_NOT_FOUND' using errcode = 'P0002'; end if;
    end if;
    insert into public.inventory_notes(owner_id,item_id,media_id,title,verbatim_text,interpretation,attribution,pinned)
    values(account_id,(arguments->>'item_id')::uuid,source_id,trim(arguments->>'title'),coalesce(arguments->>'verbatim_text',''),coalesce(arguments->>'interpretation',''),coalesce(arguments->>'attribution','unknown'),coalesce((arguments->>'pinned')::boolean,false)) returning * into note;
    result := jsonb_build_object('note',to_jsonb(note) || jsonb_build_object('media_name',source_name));
  end if;

  insert into public.inventory_command_log(owner_id,operation_id,command_name,arguments,result,oauth_client_id)
  values(account_id,operation,command_name,arguments,result,auth.jwt()->>'client_id');
  return result;
end;
$$;
