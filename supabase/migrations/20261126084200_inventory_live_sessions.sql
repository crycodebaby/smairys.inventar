create or replace function private.inventory_owner_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt()->>'role','') = 'authenticated'
    and coalesce(auth.jwt()->>'is_anonymous','false') = 'false'
    and (auth.jwt()->'amr') @> '[{"method":"otp"}]'::jsonb
    and not ((auth.jwt()->'amr') @> '[{"method":"password"}]'::jsonb)
    and exists (
      select 1 from private.inventory_owner o
      join auth.users u on u.id = o.user_id
      join auth.sessions s on s.user_id = o.user_id
      where o.user_id = auth.uid() and u.email_confirmed_at is not null and not u.is_anonymous
        and s.id = case
          when auth.jwt()->>'session_id' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
          then (auth.jwt()->>'session_id')::uuid
        end
        and (s.not_after is null or s.not_after > statement_timestamp())
    );
$$;
