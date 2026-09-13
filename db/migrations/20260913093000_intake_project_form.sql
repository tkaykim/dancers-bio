-- The existing registration form submits reviewed fields in one transaction.
-- Source screenshots never become project attachments.
create function public.register_project_intake_form(
  p_id uuid, p_revision integer, p_actor uuid, p_project jsonb,
  p_schedules jsonb default '[]', p_attachments jsonb default '[]'
) returns table(project_id uuid, created boolean)
language plpgsql security invoker set search_path=public as $$
declare job project_intake_jobs; p projects; pid uuid; item jsonb; idx integer := 0;
begin
  if not exists(select 1 from profiles where id=p_actor and is_admin) then raise exception 'admin required'; end if;
  select * into job from project_intake_jobs where id=p_id for update;
  if not found then raise exception 'not found'; end if;
  if job.project_id is not null then return query select job.project_id, false; return; end if;
  if job.revision<>p_revision or job.result is null or job.status not in ('processing','review','failed') then raise exception 'stale review'; end if;
  p := jsonb_populate_record(null::projects, p_project);
  if p.status::text not in ('draft','open') or p.title is null or length(p.title) not between 1 and 120
    or p.description is null or length(p.description) not between 10 and 2000 then raise exception 'invalid project'; end if;
  insert into projects(owner_id,title,description,visibility,status,category,genre_id,region_id,region_text,
    pay_type,pay_amount,recruitment_count,recruitment_unlimited,application_deadline,is_standing_pool,
    posted_by_label,collect_applicant_fee,collect_casting_details,selection_rounds,round_labels,round_messages,
    auto_accept_on_apply,allow_team_apply)
  values(p_actor,p.title,p.description,p.visibility,p.status,p.category,p.genre_id,p.region_id,p.region_text,
    p.pay_type,p.pay_amount,p.recruitment_count,p.recruitment_unlimited,p.application_deadline,p.is_standing_pool,
    p.posted_by_label,p.collect_applicant_fee,p.collect_casting_details,p.selection_rounds,p.round_labels,p.round_messages,
    false,false) returning id into pid;
  insert into recruitment_channels(project_id,name,channel_type,manager_label,created_by)
    values(pid,'기본 모집','general','프로젝트 관리자',p_actor);
  for item in select value from jsonb_array_elements(p_schedules) loop
    insert into project_schedules(project_id,label,starts_at,ends_at,location,time_tbd,sort_order,created_by)
      values(pid,item->>'label',(item->>'starts_at')::timestamptz,(item->>'ends_at')::timestamptz,
        item->>'location',(item->>'time_tbd')::boolean,idx,p_actor);
    idx := idx+1;
  end loop;
  idx := 0;
  for item in select value from jsonb_array_elements(p_attachments) loop
    insert into project_attachments(project_id,file_name,storage_path,mime_type,size_bytes,sort_order,created_by)
      values(pid,item->>'name',item->>'path',item->>'mime',(item->>'size')::bigint,idx,p_actor);
    idx := idx+1;
  end loop;
  -- Keep an active rendering lease alive: the worker finishes cards separately.
  update project_intake_jobs set project_id=pid,
    status=case when status='processing' then 'processing' else 'registered' end,
    updated_at=now() where id=p_id;
  return query select pid,true;
end $$;
revoke all on function public.register_project_intake_form(uuid,integer,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.register_project_intake_form(uuid,integer,uuid,jsonb,jsonb,jsonb) to service_role;
