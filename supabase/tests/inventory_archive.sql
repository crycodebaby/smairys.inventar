begin;

insert into auth.users(id,aud,role,email,email_confirmed_at)
values ('8b890821-71e4-473e-bd92-b2aa4dd35ed7','authenticated','authenticated','inventory-archive@example.invalid',now());
insert into private.inventory_owner(user_id) values ('8b890821-71e4-473e-bd92-b2aa4dd35ed7')
  on conflict (singleton) do update set user_id = excluded.user_id;
insert into auth.sessions(id,user_id,created_at,updated_at)
  values ('a028c171-7dbd-43e4-8530-9c19d33d10ed','8b890821-71e4-473e-bd92-b2aa4dd35ed7',now(),now());

set local role anon;
do $$ begin
  begin
    perform public.inventory_archive('inspect',gen_random_uuid(),repeat('a',64));
    raise exception 'Anonymous archive access accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"8b890821-71e4-473e-bd92-b2aa4dd35ed7","role":"authenticated","amr":[{"method":"otp"}],"session_id":"a028c171-7dbd-43e4-8530-9c19d33d10ed"}',true);

do $$
declare
  source uuid := gen_random_uuid();
  first_digest text := repeat('a',64);
  second_digest text := repeat('b',64);
  third_digest text := repeat('c',64);
  legacy_digest text := repeat('d',64);
  original uuid;
  copied uuid;
  legacy uuid;
  reply jsonb;
begin
  reply := public.inventory_archive('begin',source,first_digest,null,'{"title":"Archivtest"}');
  original := (reply->'existing'->>'item_id')::uuid;
  if original is null or (select archive_import_pending from public.inventory_items where id = original) is not true then
    raise exception 'Partial object is unmarked';
  end if;
  if (public.inventory_archive('begin',source,first_digest)->'existing'->>'item_id')::uuid is distinct from original then
    raise exception 'Repeated begin created a duplicate';
  end if;
  reply := public.inventory_archive('inspect',source,second_digest);
  if reply->'candidates'->0->>'id' is distinct from original::text then
    raise exception 'Changed archive could not find prior target';
  end if;
  perform public.inventory_archive('begin',source,second_digest,original);
  perform public.inventory_archive('finish',source,first_digest,original);
  if (select archive_import_pending from public.inventory_items where id = original) is not true then
    raise exception 'Completing one version cleared another pending version';
  end if;
  perform public.inventory_archive('finish',source,second_digest,original);
  if (select archive_import_pending from public.inventory_items where id = original) is not false then
    raise exception 'Completed archive still shows pending';
  end if;
  if (public.inventory_archive('begin',source,first_digest)->'existing'->>'completed')::boolean is not true then
    raise exception 'Finished archive reopened';
  end if;
  copied := (public.inventory_archive('begin',source,third_digest,null,'{"title":"Archivkopie"}')->'existing'->>'item_id')::uuid;
  if copied is null or copied = original then raise exception 'Explicit copy did not create an object'; end if;
  begin
    perform public.inventory_archive('begin',gen_random_uuid(),first_digest,original);
    raise exception 'Unrelated target accepted';
  exception when no_data_found then null;
  end;
  begin
    perform public.inventory_archive('finish',source,third_digest,original);
    raise exception 'Wrong target finished an archive';
  exception when no_data_found then null;
  end;

  -- Expected UUID from the version-1 browser's old SHA-256 operation-ID algorithm.
  legacy := (public.inventory_command('create_item','{"operation_id":"db7767fd-914e-8f01-a86c-4fc3a020d6b4","title":"Altes Archiv"}')->'item'->>'id')::uuid;
  if public.inventory_archive('inspect',source,legacy_digest)->>'legacy_item' is distinct from legacy::text
    or public.inventory_archive('begin',source,legacy_digest)->'existing'->>'item_id' is distinct from legacy::text then
    raise exception 'Legacy import could not be adopted';
  end if;

  perform set_config('request.jwt.claims', (auth.jwt() || '{"client_id":"test-mcp"}'::jsonb)::text, true);
  begin
    perform public.inventory_archive('inspect',source,first_digest);
    raise exception 'Delegated archive access accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', (auth.jwt() - 'client_id' - 'session_id')::text, true);
  begin
    perform public.inventory_archive('inspect',source,first_digest);
    raise exception 'Archive access without a live session accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
