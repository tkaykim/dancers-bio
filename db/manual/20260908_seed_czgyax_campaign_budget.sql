-- Historical operating-budget reference, not a receivable, payment or new fee agreement.
begin;
do $$
declare project uuid := '3e694210-9e9c-433c-bec8-8293ea9f51f1'; actor uuid; item record; person uuid;
begin
  select owner_id into actor from public.projects where id=project;
  if not exists(select 1 from public.campaign_budget_settings where project_id=project) then
    perform public.campaign_budget_mutate(project,actor,'configure',jsonb_build_object('version',0,'total_amount',10000000,'operations_reserve',null,
      'basis','2026-09-05 운영 기록의 클라이언트 고정 예산 1,000만원 기준입니다. 부가세 포함 여부와 운영비·예비비 배분은 재확인이 필요합니다.'));
  end if;
  for item in select * from (values
    ('418f0c84-e9b9-403b-92a0-f51cdebe5dd4'::uuid,300000),
    ('a601708e-fc26-43b1-aad9-fa0f90393abb'::uuid,300000),
    ('d4ab4c71-9374-492f-8404-e57615792121'::uuid,100000),
    ('bc71b227-7b38-48f5-b56c-e54ef9dccc94'::uuid,100000)
  ) as sources(app_id,amount) loop
    select p.id into person from public.campaign_participants p join public.applications a on a.id=p.application_id
      where p.project_id=project and p.application_id=item.app_id and p.active and a.proposed_fee=item.amount and a.proposed_fee_currency='KRW';
    if person is null then raise exception 'Budget source mapping requires review'; end if;
    if not exists(select 1 from public.campaign_budget_fees where participant_id=person) then
      perform public.campaign_budget_mutate(project,actor,'fee',jsonb_build_object('participant_id',person,'version',0,'amount',item.amount,'status','estimate',
        'note','2026-09-05 확정 안내 기록의 금액과 현재 지원서 희망 단가를 대조했습니다. 최신 합의 내용과 세금 기준을 확인한 뒤 합의 완료로 변경해 주세요.'));
    end if;
  end loop;
end $$;
commit;
