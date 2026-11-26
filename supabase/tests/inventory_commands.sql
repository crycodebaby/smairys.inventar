begin;

insert into auth.users(id,aud,role,email,email_confirmed_at) values
  ('913e43ee-3fb7-4bfa-b5ec-bd12136df064','authenticated','authenticated','inventory-test-a@example.invalid',now()),
  ('d4f72251-bc6b-4ab1-8ae3-45abe3f14169','authenticated','authenticated','inventory-test-b@example.invalid',now());
insert into private.inventory_owner(user_id) values ('913e43ee-3fb7-4bfa-b5ec-bd12136df064')
  on conflict (singleton) do update set user_id = excluded.user_id;
insert into auth.sessions(id,user_id,created_at,updated_at)
  values ('7df6e020-58e0-4999-946f-d199af38f9e1','913e43ee-3fb7-4bfa-b5ec-bd12136df064',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"913e43ee-3fb7-4bfa-b5ec-bd12136df064","role":"authenticated","amr":[{"method":"otp"}],"session_id":"7df6e020-58e0-4999-946f-d199af38f9e1"}',true);

do $$
declare
  first_result jsonb;
  repeated_result jsonb;
  item_id uuid;
  result jsonb;
  category_id uuid;
  wrong_label_id uuid;
  item_number text;
begin
  result := public.inventory_command('search_inventory','{"query":"","limit":20,"offset":0}');
  if result is distinct from '{"items":[]}'::jsonb then raise exception 'Empty startup search failed'; end if;
  result := public.inventory_command('list_labels','{"kind":"category"}');
  if result is distinct from '{"labels":[]}'::jsonb then raise exception 'Empty startup category read failed'; end if;
  first_result := public.inventory_command('create_item','{"operation_id":"e604f8e0-f01a-4dca-8c06-eb974e99c975","title":"Test ECC83"}');
  repeated_result := public.inventory_command('create_item','{"operation_id":"e604f8e0-f01a-4dca-8c06-eb974e99c975","title":"Test ECC83"}');
  if first_result <> repeated_result then raise exception 'Repeated command changed its result'; end if;
  item_id := (first_result->'item'->>'id')::uuid;
  item_number := first_result->'item'->>'inventory_number';
  perform set_config('inventory.test_item', item_id::text,true);
  if (select count(*) from public.inventory_items) <> 1 then raise exception 'Unexpected item count'; end if;
  result := public.inventory_command('search_inventory','{"query":"ecc83","limit":20,"offset":0}');
  if jsonb_array_length(result->'items') is distinct from 1 or (result->'items'->0->>'id')::uuid is distinct from item_id then raise exception 'Matching search failed'; end if;
  result := public.inventory_command('search_inventory','{"query":"ecc83","limit":1,"offset":1}');
  if result is distinct from '{"items":[]}'::jsonb then raise exception 'Search pagination failed'; end if;
  result := public.inventory_command('search_inventory',jsonb_build_object('query','#00'||item_number,'limit',1));
  if result->'items'->0->>'id' is distinct from item_id::text then raise exception 'Inventory number lookup failed'; end if;
  category_id := (public.inventory_command('create_label',jsonb_build_object('operation_id',gen_random_uuid(),'kind','category','name','Röhren'))->'label'->>'id')::uuid;
  wrong_label_id := (public.inventory_command('create_label',jsonb_build_object('operation_id',gen_random_uuid(),'kind','marker','name','Geprüft'))->'label'->>'id')::uuid;
  begin
    perform public.inventory_command('search_inventory',jsonb_build_object('query',repeat('x',262145)));
    raise exception 'Oversized command accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.inventory_command('create_item','{"operation_id":"e604f8e0-f01a-4dca-8c06-eb974e99c975","title":"Different payload"}');
    raise exception 'Changed idempotency payload was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  begin
    perform public.inventory_command('update_item',jsonb_build_object('operation_id',gen_random_uuid(),'item_id',item_id,'expected_revision',1,'changes',jsonb_build_object('category_id',wrong_label_id)));
    raise exception 'Non-category label accepted';
  exception when no_data_found then
    if sqlerrm <> 'LABEL_NOT_FOUND' then raise; end if;
  end;
  result := public.inventory_command('update_item',jsonb_build_object('operation_id',gen_random_uuid(),'item_id',item_id,'expected_revision',1,'changes',jsonb_build_object('title','Test ECC83 updated','category_id',category_id)));
  if (result->'item'->>'revision')::integer <> 2 then raise exception 'Revision failed'; end if;
  if result->'item'->>'category_id' is distinct from category_id::text then raise exception 'Category update failed'; end if;
  result := public.inventory_command('search_inventory',jsonb_build_object('query','Röhren'));
  if result->'items'->0->>'id' is distinct from item_id::text then raise exception 'Category search failed'; end if;
  result := public.inventory_command('update_item',jsonb_build_object('operation_id',gen_random_uuid(),'item_id',item_id,'expected_revision',1,'changes',jsonb_build_object('title','Stale')));
  if result->>'error' <> 'REVISION_CONFLICT' then raise exception 'Stale revision accepted'; end if;
  result := public.inventory_command('update_item',jsonb_build_object('operation_id',gen_random_uuid(),'item_id',item_id,'expected_revision',2,'changes',jsonb_build_object('category_id',null)));
  if result->'item'->'category_id' is distinct from 'null'::jsonb then raise exception 'Clearing the category failed'; end if;
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

select set_config('request.jwt.claims','{"sub":"d4f72251-bc6b-4ab1-8ae3-45abe3f14169","role":"authenticated","amr":[{"method":"otp"}]}',true);
do $$
begin
  if (select count(*) from public.inventory_items) <> 0 then raise exception 'Cross-account SELECT leak'; end if;
  begin
    perform public.inventory_command('search_inventory','{"query":"ecc83"}');
    raise exception 'Cross-account search accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'INVENTORY_ACCESS_DENIED' then raise; end if;
  end;
  begin
    perform public.inventory_command('create_item',jsonb_build_object('operation_id',gen_random_uuid(),'title','Foreign account'));
    raise exception 'Cross-account write accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'INVENTORY_ACCESS_DENIED' then raise; end if;
  end;
  begin
    perform public.inventory_command('get_item',jsonb_build_object('item_id',current_setting('inventory.test_item')));
    raise exception 'Cross-account command leak';
  exception when insufficient_privilege then
    if sqlerrm <> 'INVENTORY_ACCESS_DENIED' then raise; end if;
  end;
  begin
    perform public.inventory_command('add_note',jsonb_build_object('operation_id',gen_random_uuid(),'item_id',current_setting('inventory.test_item'),'title','Wrong owner'));
    raise exception 'Cross-account note accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'INVENTORY_ACCESS_DENIED' then raise; end if;
  end;
  begin
    perform private.inventory_dispatch_for_owner('search_inventory','{}');
    raise exception 'Internal unguarded function is callable';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"913e43ee-3fb7-4bfa-b5ec-bd12136df064","role":"authenticated","amr":[{"method":"password"}],"session_id":"7df6e020-58e0-4999-946f-d199af38f9e1"}',true);
do $$
begin
  if exists (select 1 from public.inventory_items) then raise exception 'Password-authenticated access to inventory'; end if;
  begin
    perform public.inventory_command('search_inventory','{}');
    raise exception 'Password-authenticated command accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'INVENTORY_ACCESS_DENIED' then raise; end if;
  end;
  perform set_config('request.jwt.claims','{"sub":"913e43ee-3fb7-4bfa-b5ec-bd12136df064","role":"authenticated","session_id":"7df6e020-58e0-4999-946f-d199af38f9e1"}',true);
  begin
    perform public.inventory_command('search_inventory','{}');
    raise exception 'Command accepted without proof of OTP';
  exception when insufficient_privilege then
    if sqlerrm <> 'INVENTORY_ACCESS_DENIED' then raise; end if;
  end;
end;
$$;
reset role;
delete from auth.sessions where id='7df6e020-58e0-4999-946f-d199af38f9e1';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"913e43ee-3fb7-4bfa-b5ec-bd12136df064","role":"authenticated","amr":[{"method":"otp"}],"session_id":"7df6e020-58e0-4999-946f-d199af38f9e1"}',true);
do $$
begin
  if exists (select 1 from public.inventory_items) then raise exception 'Revoked session can read inventory rows'; end if;
  begin
    perform public.inventory_command('search_inventory','{}');
    raise exception 'Revoked session can call inventory';
  exception when insufficient_privilege then
    if sqlerrm <> 'INVENTORY_ACCESS_DENIED' then raise; end if;
  end;
end;
$$;
reset role;
rollback;
