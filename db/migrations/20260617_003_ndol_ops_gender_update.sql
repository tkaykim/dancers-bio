create or replace function public.update_ops_ndol_contact(
  p_token text,
  p_id uuid,
  p_outreach_status text,
  p_note text default null,
  p_gender text default null
)
returns table (
  id uuid,
  outreach_status text,
  gender text,
  note text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ops_event_token_valid('ndol-20260618', p_token) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  if p_outreach_status not in ('pending', 'no_answer', 'unavailable', 'available') then
    raise exception 'invalid outreach status' using errcode = '22023';
  end if;

  if p_gender is not null and p_gender not in ('male', 'female', 'unknown') then
    raise exception 'invalid gender' using errcode = '22023';
  end if;

  return query
  update public.ops_ndol_contacts c
  set
    outreach_status = p_outreach_status,
    gender = coalesce(p_gender, c.gender),
    note = left(coalesce(p_note, c.note, ''), 1000),
    updated_at = now()
  where
    c.id = p_id
    and c.event_key = 'ndol-20260618'
  returning c.id, c.outreach_status, c.gender, c.note, c.updated_at;
end;
$$;

revoke all on function public.update_ops_ndol_contact(text, uuid, text, text, text) from public;
grant execute on function public.update_ops_ndol_contact(text, uuid, text, text, text) to anon, authenticated;
