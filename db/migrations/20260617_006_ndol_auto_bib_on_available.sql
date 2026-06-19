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
  with next_bib as (
    select
      coalesce(
        max((ascii(substring(bib_code from 1 for 1)) - 65) * 30 + substring(bib_code from 3)::int),
        0
      ) + 1 as rn
    from public.ops_ndol_contacts
    where event_key = 'ndol-20260618'
      and bib_code ~ '^[A-Z]-[0-9]+$'
  )
  update public.ops_ndol_contacts c
  set
    outreach_status = p_outreach_status,
    gender = coalesce(p_gender, c.gender),
    note = left(coalesce(p_note, c.note, ''), 1000),
    bib_code = case
      when p_outreach_status = 'available' and c.bib_code is null then
        chr(65 + (((select rn from next_bib) - 1) / 30)::int)
        || '-'
        || lpad(((((select rn from next_bib) - 1) % 30) + 1)::text, 2, '0')
      else c.bib_code
    end,
    updated_at = now()
  where
    c.id = p_id
    and c.event_key = 'ndol-20260618'
  returning c.id, c.outreach_status, c.gender, c.note, c.updated_at;
end;
$$;

revoke all on function public.update_ops_ndol_contact(text, uuid, text, text, text) from public;
grant execute on function public.update_ops_ndol_contact(text, uuid, text, text, text) to anon, authenticated;
