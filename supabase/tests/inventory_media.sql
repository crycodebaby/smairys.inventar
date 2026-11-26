begin;

insert into auth.users(id,aud,role,email) values
  ('af6dd23e-ab0c-494e-a7f1-d7511549c73e','authenticated','authenticated','inventory-media-a@example.invalid'),
  ('c4cbaba3-3ea8-4dad-8dad-82cfabef1966','authenticated','authenticated','inventory-media-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"af6dd23e-ab0c-494e-a7f1-d7511549c73e","role":"authenticated"}',true);

do $$
declare
  target uuid;
  first_upload public.inventory_media;
  second_upload public.inventory_media;
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
  first_upload := jsonb_populate_record(null::public.inventory_media,public.inventory_media_confirm(first_upload.id));
  second_upload := jsonb_populate_record(null::public.inventory_media,public.inventory_media_confirm(first_upload.id));
  if first_upload.uploaded_at is null or not first_upload.has_preview or second_upload.uploaded_at is distinct from first_upload.uploaded_at then
    raise exception 'Confirmation did not return the same completed upload';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'inventory-media') <> 2 then
    raise exception 'Owner cannot see the stored original and preview';
  end if;
end;
$$;

select set_config('request.jwt.claims','{"sub":"c4cbaba3-3ea8-4dad-8dad-82cfabef1966","role":"authenticated"}',true);
do $$
begin
  if exists (select 1 from public.inventory_media) or exists (select 1 from storage.objects where bucket_id = 'inventory-media') then
    raise exception 'Another account can read private media';
  end if;
  begin
    perform public.inventory_media_begin(current_setting('inventory.media_item')::uuid,'x.jpg','image/jpeg',30,repeat('a',64));
    raise exception 'Another account can reserve media for the object';
  exception when no_data_found then null;
  end;
  begin
    perform public.inventory_media_confirm(current_setting('inventory.media_id')::uuid);
    raise exception 'Another account can confirm the media';
  exception when no_data_found then null;
  end;
end;
$$;

select set_config('request.jwt.claims','{"sub":"af6dd23e-ab0c-494e-a7f1-d7511549c73e","role":"authenticated","client_id":"test-mcp"}',true);
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

rollback;
