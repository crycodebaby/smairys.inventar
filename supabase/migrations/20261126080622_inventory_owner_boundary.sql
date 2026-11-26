create table private.inventory_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id) on delete cascade
);
revoke all on private.inventory_owner from public, anon, authenticated;

-- Adopt an existing operator only if exactly one real, confirmed account exists
-- and it has signed in before. A new database starts closed until provisioned.
insert into private.inventory_owner(user_id)
select u.id from auth.users u
where u.email_confirmed_at is not null and u.last_sign_in_at is not null and not u.is_anonymous
  and (select count(*) from auth.users) = 1;

do $$
begin
  if exists (select 1 from auth.users) and not exists (select 1 from private.inventory_owner) then
    raise exception 'Select the existing inventory owner before applying this migration';
  end if;
end;
$$;

create function private.inventory_owner_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt()->>'role','') = 'authenticated'
    and coalesce(auth.jwt()->>'is_anonymous','false') = 'false'
    and (auth.jwt()->'amr') @> '[{"method":"otp"}]'::jsonb
    and not ((auth.jwt()->'amr') @> '[{"method":"password"}]'::jsonb)
    and exists (
      select 1 from private.inventory_owner o
      join auth.users u on u.id = o.user_id
      where o.user_id = auth.uid() and u.email_confirmed_at is not null and not u.is_anonymous
    );
$$;
revoke all on function private.inventory_owner_allowed() from public, anon, authenticated;
grant execute on function private.inventory_owner_allowed() to authenticated;

create policy inventory_single_owner on public.inventory_items as restrictive for select to authenticated
  using ((select private.inventory_owner_allowed()));
create policy inventory_single_owner on public.inventory_notes as restrictive for select to authenticated
  using ((select private.inventory_owner_allowed()));
create policy inventory_single_owner on public.inventory_labels as restrictive for select to authenticated
  using ((select private.inventory_owner_allowed()));
create policy inventory_single_owner on public.inventory_command_log as restrictive for select to authenticated
  using ((select private.inventory_owner_allowed()));
create policy inventory_single_owner on public.inventory_media as restrictive for select to authenticated
  using ((select private.inventory_owner_allowed()));

alter function private.inventory_dispatch(text,jsonb) rename to inventory_dispatch_for_owner;
alter function private.inventory_media_begin(uuid,text,text,integer,text) rename to inventory_media_begin_for_owner;
alter function private.inventory_media_confirm(uuid) rename to inventory_media_confirm_for_owner;
revoke all on function private.inventory_dispatch_for_owner(text,jsonb),
  private.inventory_media_begin_for_owner(uuid,text,text,integer,text), private.inventory_media_confirm_for_owner(uuid)
  from public, anon, authenticated;

create function private.inventory_dispatch(command_name text, arguments jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if private.inventory_owner_allowed() is not true then raise exception 'INVENTORY_ACCESS_DENIED' using errcode = '42501'; end if;
  return private.inventory_dispatch_for_owner(command_name,arguments);
end;
$$;
create function private.inventory_media_begin(target_item uuid, filename text, content_type text, content_size integer, digest text)
returns public.inventory_media language plpgsql security definer set search_path = '' as $$
begin
  if private.inventory_owner_allowed() is not true then raise exception 'INVENTORY_ACCESS_DENIED' using errcode = '42501'; end if;
  return private.inventory_media_begin_for_owner(target_item,filename,content_type,content_size,digest);
end;
$$;
create function private.inventory_media_confirm(media_id uuid)
returns public.inventory_media language plpgsql security definer set search_path = '' as $$
begin
  if private.inventory_owner_allowed() is not true then raise exception 'INVENTORY_ACCESS_DENIED' using errcode = '42501'; end if;
  return private.inventory_media_confirm_for_owner(media_id);
end;
$$;

revoke all on function private.inventory_dispatch(text,jsonb), private.inventory_media_begin(uuid,text,text,integer,text),
  private.inventory_media_confirm(uuid) from public, anon, authenticated;
grant execute on function private.inventory_dispatch(text,jsonb), private.inventory_media_begin(uuid,text,text,integer,text),
  private.inventory_media_confirm(uuid) to authenticated;

create or replace function public.inventory_command(command_name text, arguments jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.inventory_dispatch(command_name,arguments);
$$;
create or replace function public.inventory_media_begin(target_item uuid, filename text, content_type text, content_size integer, digest text)
returns jsonb language sql security invoker set search_path = '' as $$
  select to_jsonb(private.inventory_media_begin(target_item,filename,content_type,content_size,digest));
$$;
create or replace function public.inventory_media_confirm(media_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select to_jsonb(private.inventory_media_confirm(media_id));
$$;

alter policy inventory_media_download on storage.objects using (
  bucket_id = 'inventory-media' and storage.allow_only_operation('object.get_authenticated')
  and exists (
    select 1 from public.inventory_media m where m.owner_id = (select auth.uid())
      and m.uploaded_at is not null
      and (m.original_path = name or (m.has_preview and m.preview_path = name))
  )
);
