insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory-media', 'inventory-media', false, 26214400,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']);

create table public.inventory_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  item_id uuid not null,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf')),
  byte_count integer not null check (byte_count between 1 and 26214400),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  original_path text generated always as (owner_id::text || '/' || id::text || '/original') stored,
  preview_path text generated always as (owner_id::text || '/' || id::text || '/preview.jpg') stored,
  has_preview boolean not null default false,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  unique (owner_id, item_id, sha256),
  foreign key (owner_id, item_id) references public.inventory_items(owner_id,id) on delete cascade
);
create index inventory_media_item_gallery on public.inventory_media(owner_id,item_id,uploaded_at desc,id) where uploaded_at is not null;
create unique index inventory_media_original_path on public.inventory_media(original_path);
create unique index inventory_media_preview_path on public.inventory_media(preview_path);
alter table public.inventory_media enable row level security;
revoke all on public.inventory_media from public, anon, authenticated;
grant select on public.inventory_media to authenticated;
create policy inventory_media_own on public.inventory_media for select to authenticated
  using (owner_id = (select auth.uid()) and coalesce((select auth.jwt())->>'client_id','') = '');

create policy inventory_media_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'inventory-media' and exists (
    select 1 from public.inventory_media m
    where m.owner_id = (select auth.uid()) and m.uploaded_at is null
      and (m.original_path = name or (m.mime_type <> 'application/pdf' and m.preview_path = name))
  )
);
create policy inventory_media_download on storage.objects for select to authenticated using (
  bucket_id = 'inventory-media' and exists (
    select 1 from public.inventory_media m where m.owner_id = (select auth.uid())
      and (m.original_path = name or (m.has_preview and m.preview_path = name))
  )
);

create function private.inventory_media_begin(target_item uuid, filename text, content_type text, content_size integer, digest text)
returns public.inventory_media language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  media public.inventory_media;
begin
  if account_id is null or coalesce(auth.jwt()->>'client_id','') <> ''
    or coalesce(auth.jwt()->>'is_anonymous','false') = 'true' then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  perform 1 from public.inventory_items i where i.owner_id = account_id and i.id = target_item for update;
  if not found then raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into media from public.inventory_media m
    where m.owner_id = account_id and m.item_id = target_item and m.sha256 = digest;
  if found then
    if media.byte_count is distinct from content_size or media.mime_type is distinct from content_type then
      raise exception 'MEDIA_METADATA_CONFLICT' using errcode = '22023';
    end if;
    return media;
  end if;
  if (select count(*) from public.inventory_media m where m.owner_id = account_id and m.item_id = target_item) >= 100 then
    raise exception 'MEDIA_LIMIT_REACHED' using errcode = '22023';
  end if;
  insert into public.inventory_media (owner_id,item_id,original_name,mime_type,byte_count,sha256)
    values (account_id,target_item,filename,content_type,content_size,digest) returning * into media;
  return media;
end;
$$;
create function private.inventory_media_confirm(media_id uuid)
returns public.inventory_media language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  media public.inventory_media;
  original_metadata jsonb;
  preview_metadata jsonb;
begin
  if account_id is null or coalesce(auth.jwt()->>'client_id','') <> ''
    or coalesce(auth.jwt()->>'is_anonymous','false') = 'true' then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  select * into media from public.inventory_media m where m.id = media_id and m.owner_id = account_id for update;
  if not found then raise exception 'MEDIA_NOT_FOUND' using errcode = 'P0002'; end if;
  if media.uploaded_at is not null then return media; end if;
  select o.metadata into original_metadata from storage.objects o where o.bucket_id = 'inventory-media' and o.name = media.original_path;
  if not found or (original_metadata->>'size')::bigint is distinct from media.byte_count::bigint
    or original_metadata->>'mimetype' is distinct from media.mime_type then
    raise exception 'MEDIA_FILE_UNCONFIRMED' using errcode = '22023';
  end if;
  select o.metadata into preview_metadata from storage.objects o where o.bucket_id = 'inventory-media' and o.name = media.preview_path;
  update public.inventory_media m set uploaded_at = clock_timestamp(), has_preview = coalesce(
    preview_metadata->>'mimetype' = 'image/jpeg' and (preview_metadata->>'size')::bigint between 1 and 262144, false
  ) where m.id = media_id and m.owner_id = account_id returning * into media;
  return media;
end;
$$;

create function public.inventory_media_begin(target_item uuid, filename text, content_type text, content_size integer, digest text)
returns jsonb language sql security invoker set search_path = '' as $$
  select to_jsonb(private.inventory_media_begin(target_item,filename,content_type,content_size,digest));
$$;
create function public.inventory_media_confirm(media_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select to_jsonb(private.inventory_media_confirm(media_id));
$$;
revoke all on function private.inventory_media_begin(uuid,text,text,integer,text), private.inventory_media_confirm(uuid),
  public.inventory_media_begin(uuid,text,text,integer,text), public.inventory_media_confirm(uuid) from public, anon, authenticated;
grant execute on function private.inventory_media_begin(uuid,text,text,integer,text), private.inventory_media_confirm(uuid),
  public.inventory_media_begin(uuid,text,text,integer,text), public.inventory_media_confirm(uuid) to authenticated;
