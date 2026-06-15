-- 출금신청 단톡방 공유 링크: 프로젝트 단위 짧은 코드 (일정설문 schedule_survey_code와 동일 방식).
-- /w/<settlement_share_code> 한 링크를 단톡방에 뿌리면, 로그인한 본인 댄서로 해석돼
-- 자기 정산건의 출금 신청 화면으로 연결된다. (긴 토큰 대신 짧고 깔끔한 코드)
alter table public.projects
  add column if not exists settlement_share_code text;

update public.projects
  set settlement_share_code = gen_project_survey_code()
  where settlement_share_code is null;

create unique index if not exists projects_settlement_share_code_key
  on public.projects(settlement_share_code);

alter table public.projects
  alter column settlement_share_code set default gen_project_survey_code();
