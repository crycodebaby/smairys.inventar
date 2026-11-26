begin;

insert into auth.users(id,aud,role,email,email_confirmed_at) values
  ('af6dd23e-ab0c-494e-a7f1-d7511549c73e','authenticated','authenticated','inventory-media-a@example.invalid',now()),
  ('c4cbaba3-3ea8-4dad-8dad-82cfabef1966','authenticated','authenticated','inventory-media-b@example.invalid',now());
insert into private.inventory_owner(user_id) values ('af6dd23e-ab0c-494e-a7f1-d7511549c73e')
  on conflict (singleton) do update set user_id = excluded.user_id;
insert into auth.sessions(id,user_id,created_at,updated_at)
  values ('5c95daad-b026-4223-820d-f489c9360bdd','af6dd23e-ab0c-494e-a7f1-d7511549c73e',now(),now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"af6dd23e-ab0c-494e-a7f1-d7511549c73e","role":"authenticated","amr":[{"method":"otp"}],"session_id":"5c95daad-b026-4223-820d-f489c9360bdd"}',true);

do $$
declare
  target uuid;
  first_upload public.inventory_media;
  second_upload public.inventory_media;
  another_item uuid;
  args jsonb;
  note_result jsonb;
begin
  target := (public.inventory_command('create_item', jsonb_build_object('operation_id',gen_random_uuid(),'title','Medientest'))->'item'->>'id')::uuid;
  first_upload := jsonb_populate_record(null::public.inventory_media,public.inventory_media_begin(target,'test.jpg','image/jpeg',30,repeat('a',64)));
  second_upload := jsonb_populate_record(null::public.inventory_media,public.inventory_media_begin(target,'umbenannt.jpg','image/jpeg',30,repeat('a',64)));
  if second_upload.id is distinct from first_upload.id or first_upload.uploaded_at is not null then
    raise exception 'Upload reservation is not idempotent';
  end if;
  perform set_config('inventory.media_id',first_upload.id::text,true);
  perform set_config('inventory.media_item',target::text,true);
  perform set_config('inventory.media_path',first_upload.original_path,true);
  perform set_config('inventory.media_preview_path',first_upload.preview_path,true);
  args := jsonb_build_object('operation_id',gen_random_uuid(),'item_id',target,'media_id',first_upload.id,'title','Mediennotiz','verbatim_text','B-15 [3?]','interpretation','Typ vermutlich B-15');
  begin
    perform public.inventory_command('add_note',args);
    raise exception 'Unconfirmed media accepted as note source';
  exception when no_data_found then
    if sqlerrm <> 'MEDIA_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.inventory_media_confirm(first_upload.id);
    raise exception 'Confirmation accepted without a stored object';
  exception when sqlstate '22023' then
    if sqlerrm <> 'MEDIA_FILE_UNCONFIRMED' then raise; end if;
  end;
  begin
    insert into storage.objects(bucket_id,name,metadata) values ('inventory-media','invalid/path','{}');
    raise exception 'Unreserved path accepted';
  exception when insufficient_privilege then null;
  end;
  insert into storage.objects(bucket_id,name,metadata)
    values ('inventory-media',first_upload.original_path,'{"size":30,"mimetype":"image/jpeg"}'),
           ('inventory-media',first_upload.preview_path,'{"size":10,"mimetype":"image/jpeg"}');
  perform set_config('storage.operation','storage.object.get_authenticated',true);
  if exists (select 1 from storage.objects where bucket_id = 'inventory-media') then
    raise exception 'An unconfirmed upload is downloadable';
  end if;
  first_upload := jsonb_populate_record(null::public.inventory_media,public.inventory_media_confirm(first_upload.id));
  second_upload := jsonb_populate_record(null::public.inventory_media,public.inventory_media_confirm(first_upload.id));
  if first_upload.uploaded_at is null or not first_upload.has_preview or second_upload.uploaded_at is distinct from first_upload.uploaded_at then
    raise exception 'Confirmation did not return the same completed upload';
  end if;
  note_result := public.inventory_command('add_note',args);
  if note_result->'note'->>'media_id' is distinct from first_upload.id::text
    or note_result->'note'->>'media_name' is distinct from 'test.jpg'
    or public.inventory_command('add_note',args) is distinct from note_result then
    raise exception 'Source linkage or idempotent retry failed';
  end if;
  if public.inventory_command('get_item',jsonb_build_object('item_id',target))->'notes'->0->>'media_name' is distinct from 'test.jpg' then
    raise exception 'Detail read omitted the source filename';
  end if;
  another_item := (public.inventory_command('create_item',jsonb_build_object('operation_id',gen_random_uuid(),'title','Anderes Objekt'))->'item'->>'id')::uuid;
  begin
    perform public.inventory_command('add_note',args || jsonb_build_object('item_id',another_item,'operation_id',gen_random_uuid()));
    raise exception 'Another item accepted the same source';
  exception when no_data_found then
    if sqlerrm <> 'MEDIA_NOT_FOUND' then raise; end if;
  end;
  if (select count(*) from storage.objects where bucket_id = 'inventory-media') <> 2 then
    raise exception 'Owner cannot see the stored original and preview';
  end if;
  perform set_config('storage.operation','storage.object.list',true);
  if exists (select 1 from storage.objects where bucket_id = 'inventory-media') then
    raise exception 'The private bucket allows object enumeration';
  end if;
  perform set_config('storage.operation','storage.object.sign',true);
  if exists (select 1 from storage.objects where bucket_id = 'inventory-media') then
    raise exception 'Private attachments can be converted into shareable links';
  end if;
  perform set_config('storage.operation','storage.object.get_authenticated',true);
  second_upload := jsonb_populate_record(null::public.inventory_media,
    public.inventory_media_begin(target,'nie-gesendet.jpg','image/jpeg',30,repeat('b',64)));
  perform set_config('inventory.expired_reservation',second_upload.id::text,true);
  second_upload := jsonb_populate_record(null::public.inventory_media,
    public.inventory_media_begin(target,'vorhanden.jpg','image/jpeg',30,repeat('c',64)));
  insert into storage.objects(bucket_id,name,metadata)
    values ('inventory-media',second_upload.original_path,'{"size":30,"mimetype":"image/jpeg"}');
  perform set_config('inventory.expired_with_original',second_upload.id::text,true);
end;
$$;

reset role;
update public.inventory_media set reserved_at = now() - interval '49 hours'
  where id in (current_setting('inventory.expired_reservation')::uuid, current_setting('inventory.expired_with_original')::uuid);
set local role authenticated;
do $$
declare replacement public.inventory_media;
begin
  replacement := jsonb_populate_record(null::public.inventory_media,
    public.inventory_media_begin(current_setting('inventory.media_item')::uuid,'nie-gesendet.jpg','image/jpeg',30,repeat('b',64)));
  if replacement.id is not distinct from current_setting('inventory.expired_reservation')::uuid then
    raise exception 'Expired empty reservation was reused';
  end if;
  replacement := jsonb_populate_record(null::public.inventory_media,
    public.inventory_media_begin(current_setting('inventory.media_item')::uuid,'vorhanden.jpg','image/jpeg',30,repeat('c',64)));
  if replacement.id is distinct from current_setting('inventory.expired_with_original')::uuid then
    raise exception 'Reservation cleanup removed a pending original';
  end if;
  if not exists (select 1 from public.inventory_media where id = current_setting('inventory.media_id')::uuid and uploaded_at is not null) then
    raise exception 'Reservation cleanup removed confirmed media';
  end if;
end;
$$;

select set_config('request.jwt.claims','{"sub":"c4cbaba3-3ea8-4dad-8dad-82cfabef1966","role":"authenticated","amr":[{"method":"otp"}]}',true);
do $$
begin
  if exists (select 1 from public.inventory_media) or exists (select 1 from storage.objects where bucket_id = 'inventory-media') then
    raise exception 'Another account can read private media';
  end if;
  begin
    perform public.inventory_media_begin(current_setting('inventory.media_item')::uuid,'x.jpg','image/jpeg',30,repeat('a',64));
    raise exception 'Another account can reserve media for the object';
  exception when insufficient_privilege then
    if sqlerrm <> 'INVENTORY_ACCESS_DENIED' then raise; end if;
  end;
  begin
    perform public.inventory_media_confirm(current_setting('inventory.media_id')::uuid);
    raise exception 'Another account can confirm the media';
  exception when insufficient_privilege then
    if sqlerrm <> 'INVENTORY_ACCESS_DENIED' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claims','{"sub":"af6dd23e-ab0c-494e-a7f1-d7511549c73e","role":"authenticated","amr":[{"method":"otp"}],"session_id":"5c95daad-b026-4223-820d-f489c9360bdd","client_id":"test-mcp"}',true);
do $$
begin
  if exists (select 1 from public.inventory_media) or exists (select 1 from storage.objects where bucket_id = 'inventory-media') then
    raise exception 'Delegated text client can access private media';
  end if;
  begin
    perform public.inventory_media_confirm(current_setting('inventory.media_id')::uuid);
    raise exception 'Delegated text client can confirm media';
  exception when sqlstate '28000' then null;
  end;
end;
$$;

reset role;
delete from auth.sessions where id='5c95daad-b026-4223-820d-f489c9360bdd';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"af6dd23e-ab0c-494e-a7f1-d7511549c73e","role":"authenticated","amr":[{"method":"otp"}],"session_id":"5c95daad-b026-4223-820d-f489c9360bdd"}',true);
do $$
begin
  if exists (select 1 from public.inventory_media) or exists (select 1 from storage.objects where bucket_id = 'inventory-media') then
    raise exception 'Revoked session can download a private attachment';
  end if;
  begin
    perform public.inventory_media_confirm(current_setting('inventory.media_id')::uuid);
    raise exception 'Revoked session can confirm media';
  exception when insufficient_privilege then
    if sqlerrm <> 'INVENTORY_ACCESS_DENIED' then raise; end if;
  end;
end;
$$;

rollback;
