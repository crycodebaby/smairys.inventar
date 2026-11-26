create or replace function public.inventory_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare claims jsonb := event->'claims';
begin
  if coalesce(claims->>'client_id','') <> '' then
    claims := jsonb_set(claims,'{aud}',jsonb_build_array('authenticated','https://xywnhifzahwcmclrfsil.supabase.co/functions/v1/inventory/mcp'));
  end if;
  return jsonb_set(event,'{claims}',claims);
end;
$$;
revoke all on function public.inventory_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.inventory_access_token_hook(jsonb) to supabase_auth_admin;
