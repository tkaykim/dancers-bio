-- dancer_private_info: 정규화된 은행 기관코드(금융결제원 표준 3자리).
-- 댄서 계좌등록을 자유입력 → 은행 선택(검색+드롭다운)으로 바꾸면서, 표시명(bank_name)과
-- 별개로 안정적인 코드도 함께 저장한다. 추후 펌뱅킹/오픈API(방법 B) 자동이체에 사용.
-- 비파괴(ADD COLUMN IF NOT EXISTS) — 기존 데이터·RLS 영향 없음.

alter table public.dancer_private_info
  add column if not exists bank_code text;

comment on column public.dancer_private_info.bank_code is
  '금융결제원 표준 기관코드(3자리). src/lib/banks.ts BANKS와 매핑.';
