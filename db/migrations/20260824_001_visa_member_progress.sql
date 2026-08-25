-- 외국인 회원용 비자 진행 현황.
-- 프로그램 본 단계는 ① 오디션·레벨테스트 ② 계약·등록 결제
-- ③ 1차 기본 서류 ④ 2차 세부 서류·출입국 심사 ⑤ 발급 완료로 고정한다.

alter table public.dancer_visa_applications
  add column if not exists applicant_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists contract_status text not null default 'not_started',
  add column if not exists basic_documents_status text not null default 'not_started',
  add column if not exists detailed_documents_status text not null default 'not_started',
  add column if not exists visa_issued_at timestamptz;

alter table public.dancer_visa_applications
  drop constraint if exists dancer_visa_applications_contract_status_check,
  drop constraint if exists dancer_visa_applications_basic_documents_status_check,
  drop constraint if exists dancer_visa_applications_detailed_documents_status_check;

alter table public.dancer_visa_applications
  add constraint dancer_visa_applications_contract_status_check
    check (contract_status in ('not_started', 'preparing', 'sent', 'signed')),
  add constraint dancer_visa_applications_basic_documents_status_check
    check (basic_documents_status in ('not_started', 'requested', 'collecting', 'reviewing', 'complete')),
  add constraint dancer_visa_applications_detailed_documents_status_check
    check (detailed_documents_status in ('not_started', 'requested', 'collecting', 'reviewing', 'submitted'));

create index if not exists dancer_visa_applications_applicant_profile_idx
  on public.dancer_visa_applications (applicant_profile_id, created_at desc)
  where applicant_profile_id is not null;

-- 이미 가입한 외국인 신청자는 인증 이메일로 한 번 연결한다.
-- 국적이 구조화 데이터로 명확한 외국인인 경우에만 연결한다.
update public.dancer_visa_applications as application
set applicant_profile_id = profile.id
from public.profiles as profile
join auth.users as account on account.id = profile.id
cross join public.dancer_private_info as private_info
where application.applicant_profile_id is null
  and private_info.dancer_id = application.dancer_id
  and account.email is not null
  and account.email_confirmed_at is not null
  and lower(application.email) = lower(account.email)
  and upper(coalesce(nullif(trim(private_info.nationality_code), ''), '')) <> 'KR'
  and (
    private_info.is_korean_national is false
    or (
      private_info.is_korean_national is null
      and nullif(trim(private_info.nationality_code), '') is not null
      and upper(private_info.nationality_code) <> 'KR'
    )
  );

-- 로그인 후 마이페이지에 처음 들어온 기존 신청자를 안전하게 연결한다.
-- 호출자는 자기 인증 이메일과 일치하는 명시적 외국인 신청만 가져갈 수 있다.
create or replace function public.claim_my_visa_applications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_count integer := 0;
  account_email text := '';
begin
  if auth.uid() is null then
    return 0;
  end if;

  -- JWT는 이메일 변경 직후 오래된 값을 가질 수 있으므로 Auth 정본을 다시 읽는다.
  -- 이메일 인증이 끝난 계정만 기존 신청을 연결할 수 있다.
  select lower(coalesce(account.email, ''))
  into account_email
  from auth.users as account
  where account.id = auth.uid()
    and account.email_confirmed_at is not null;

  if account_email = '' then
    return 0;
  end if;

  update public.dancer_visa_applications as application
  set applicant_profile_id = auth.uid()
  where application.applicant_profile_id is null
    and lower(application.email) = account_email
    and exists (
      select 1
      from public.dancer_private_info as private_info
      where private_info.dancer_id = application.dancer_id
        and upper(coalesce(nullif(trim(private_info.nationality_code), ''), '')) <> 'KR'
        and (
          private_info.is_korean_national is false
          or (
            private_info.is_korean_national is null
            and nullif(trim(private_info.nationality_code), '') is not null
            and upper(private_info.nationality_code) <> 'KR'
          )
        )
    );

  get diagnostics claimed_count = row_count;
  return claimed_count;
end;
$$;

revoke all on function public.claim_my_visa_applications() from public, anon;
grant execute on function public.claim_my_visa_applications() to authenticated;

-- 신청 테이블은 내부 메모와 운영 메타데이터를 포함하므로 기존 RLS default deny를 유지한다.
-- 회원 화면은 인증을 확인한 서버 컴포넌트가 applicant_profile_id로 한 건만 선별한다.

comment on column public.dancer_visa_applications.applicant_profile_id is
  '로그인 회원과 연결된 외국인 비자 신청. 인증 이메일이 일치하고 구조화 국적이 외국인일 때만 claim 가능.';
comment on column public.dancer_visa_applications.contract_status is
  'not_started|preparing|sent|signed. 전속계약 작성·서명 상태.';
comment on column public.dancer_visa_applications.basic_documents_status is
  'not_started|requested|collecting|reviewing|complete. 여권·기본 인적·경력 증빙 등 1차 서류 상태.';
comment on column public.dancer_visa_applications.detailed_documents_status is
  'not_started|requested|collecting|reviewing|submitted. 세부 보완·출입국 접수 상태.';
comment on column public.dancer_visa_applications.visa_issued_at is
  '한국 출입국 당국의 비자 발급이 확인된 시각.';
comment on column public.dancer_visa_applications.case_stage is
  'application_received|triage_submitted|audition_scheduled|audition_complete|training|monthly_evaluation|contract_and_payment|visa_documents|visa_documents_basic|visa_documents_detailed|visa_submitted|complete|on_hold';
