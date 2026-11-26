begin;

insert into auth.users(id,aud,role,email) values
  ('913e43ee-3fb7-4bfa-b5ec-bd12136df064','authenticated','authenticated','inventory-test-a@example.invalid'),
  ('d4f72251-bc6b-4ab1-8ae3-45abe3f14169','authenticated','authenticated','inventory-test-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"913e43ee-3fb7-4bfa-b5ec-bd12136df064","role":"authenticated"}',true);

do $$
declare
  first_result jsonb;
  repeated_result jsonb;
  item_id uuid;
  result jsonb;
begin
  first_result := public.inventory_command('create_item','{"operation_id":"e604f8e0-f01a-4dca-8c06-eb974e99c975","title":"Test ECC83"}');
  repeated_result := public.inventory_command('create_item','{"operation_id":"e604f8e0-f01a-4dca-8c06-eb974e99c975","title":"Test ECC83"}');
  if first_result <> repeated_result then raise exception 'Repeated command changed its result'; end if;
  item_id := (first_result->'item'->>'id')::uuid;
  perform set_config('inventory.test_item', item_id::text,true);
  if (select count(*) from public.inventory_items) <> 1 then raise exception 'Unexpected item count'; end if;
  begin
    perform public.inventory_command('create_item','{"operation_id":"e604f8e0-f01a-4dca-8c06-eb974e99c975","title":"Different payload"}');
    raise exception 'Changed idempotency payload was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  result := public.inventory_command('update_item',jsonb_build_object('operation_id',gen_random_uuid(),'item_id',item_id,'expected_revision',1,'changes',jsonb_build_object('title','Test ECC83 updated')));
  if (result->'item'->>'revision')::integer <> 2 then raise exception 'Revision failed'; end if;
  result := public.inventory_command('update_item',jsonb_build_object('operation_id',gen_random_uuid(),'item_id',item_id,'expected_revision',1,'changes',jsonb_build_object('title','Stale')));
  if result->>'error' <> 'REVISION_CONFLICT' then raise exception 'Stale revision accepted'; end if;
  perform public.inventory_command('add_note',jsonb_build_object('operation_id',gen_random_uuid(),'item_id',item_id,'title','Aufschrift','verbatim_text','alt [3?]','interpretation','Unklar','pinned',true));
  result := public.inventory_command('get_item',jsonb_build_object('item_id',item_id));
  if jsonb_array_length(result->'notes') <> 1 then raise exception 'Note missing'; end if;
  begin
    insert into public.inventory_items(owner_id,title) values(auth.uid(),'Bypass');
    raise exception 'Direct write bypass accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claims','{"sub":"d4f72251-bc6b-4ab1-8ae3-45abe3f14169","role":"authenticated"}',true);
do $$
begin
  if (select count(*) from public.inventory_items) <> 0 then raise exception 'Cross-account SELECT leak'; end if;
  begin
    perform public.inventory_command('get_item',jsonb_build_object('item_id',current_setting('inventory.test_item')));
    raise exception 'Cross-account command leak';
  exception when sqlstate 'P0002' then
    if sqlerrm <> 'ITEM_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.inventory_command('add_note',jsonb_build_object('operation_id',gen_random_uuid(),'item_id',current_setting('inventory.test_item'),'title','Wrong owner'));
    raise exception 'Cross-account note accepted';
  exception when sqlstate 'P0002' then
    if sqlerrm <> 'ITEM_NOT_FOUND' then raise; end if;
  end;
end;
$$;

reset role;
rollback;
