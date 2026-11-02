-- B3 Sync: versioned save of a Presentation. A stale save is refused (and reports the cloud version), never overwritten.
-- Returns {"status":"saved","version":n} or {"status":"conflict","version":<current cloud version>}.
-- Raises 'pro_required' (42501) for non-Pro callers and 'not_found_or_not_owner' (42501) when the row is not the caller's.
create function public.save_presentation(p_id uuid, p_base_version integer, p_data jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v integer;
begin
  if uid is null or not exists (
    select 1 from public.subscriptions s
    where s.user_id = uid and s.status = 'active' and s.current_period_end > now()
  ) then
    raise exception 'pro_required' using errcode = '42501';
  end if;

  if p_base_version = 0 then
    insert into public.presentations (id, owner_id, data) values (p_id, uid, p_data)
      on conflict (id) do nothing returning version into v;
    if v is not null then
      return jsonb_build_object('status', 'saved', 'version', v);
    end if;
  end if;

  update public.presentations
    set data = p_data, version = version + 1, updated_at = now()
    where id = p_id and owner_id = uid and version = p_base_version
    returning version into v;
  if v is not null then
    return jsonb_build_object('status', 'saved', 'version', v);
  end if;

  select version into v from public.presentations where id = p_id and owner_id = uid;
  if v is null then
    raise exception 'not_found_or_not_owner' using errcode = '42501';
  end if;
  return jsonb_build_object('status', 'conflict', 'version', v);
end;
$$;
revoke execute on function public.save_presentation(uuid, integer, jsonb) from public, anon;
grant execute on function public.save_presentation(uuid, integer, jsonb) to authenticated;
