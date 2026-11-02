-- M9: count a Share Link view atomically (no lost counts under concurrent visits).
create function public.count_share_view(link_id text) returns integer
language sql security definer set search_path = '' as $$
  update public.share_links set views = views + 1 where id = link_id and deleted_at is null returning views;
$$;
revoke execute on function public.count_share_view(text) from public, anon, authenticated;
grant execute on function public.count_share_view(text) to service_role;
