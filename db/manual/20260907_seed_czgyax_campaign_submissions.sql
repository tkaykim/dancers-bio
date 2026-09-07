-- Run after reviewed migration + deployment approval. No external sends or Apify calls.
-- Idempotent: existing review decisions and publication settings are preserved.
begin;
do $$
declare project uuid := '3e694210-9e9c-433c-bec8-8293ea9f51f1'; actor uuid; participant uuid;
begin
  select owner_id into actor from public.projects where id=project;
  if actor is null then raise exception 'Project owner missing'; end if;
  if not exists(select 1 from public.campaign_submission_settings where project_id=project) then
    perform public.campaign_submission_mutate(project,actor,'configure',jsonb_build_object(
      'version',0,'enabled',true,'board_id','402c84ef-ed1d-41a3-96dc-875cbf6028c4','deadline','2026-09-13T14:59:00Z','client_visible',false));
  end if;
  perform public.campaign_submission_mutate(project,actor,'sync','{}');
  select id into participant from public.campaign_participants where project_id=project and board_member_id='be2f980e-b762-4fce-9fcd-b08ae099c8ae'
    and dancer_id='844ac891-f38b-4646-be51-6d3887ca2f57' and ig_handle='diakang__';
  if participant is null then raise exception 'Riwoo mapping requires review'; end if;
  perform public.campaign_submission_mutate(project,actor,'submit',jsonb_build_object('participant_id',participant,'short_code','Dc-2MpLTvXV','url','https://www.instagram.com/reel/Dc-2MpLTvXV/'));
  select id into participant from public.campaign_participants where project_id=project and board_member_id='6764a249-5372-4bf4-add7-15cd0ca5e9ee'
    and dancer_id='05ef704a-730e-4117-83cb-6f53e0f1712c' and ig_handle='yeojin1009';
  if participant is null then raise exception 'Yeojin mapping requires review'; end if;
  perform public.campaign_submission_mutate(project,actor,'submit',jsonb_build_object('participant_id',participant,'short_code','Dc-VMVeyzqt','url','https://www.instagram.com/reel/Dc-VMVeyzqt/'));
end $$;
commit;
