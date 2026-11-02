-- L1 Library: soft-delete the caller's own synced Presentation. Sync's reads already filter deleted_at is null.
-- Returns true when a row was deleted, false when there was nothing to delete (not found, not yours, already deleted).
create function public.delete_presentation(p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  update public.presentations
    set deleted_at = now()
    where id = p_id and owner_id = (select auth.uid()) and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke execute on function public.delete_presentation(uuid) from public, anon;
grant execute on function public.delete_presentation(uuid) to authenticated;
