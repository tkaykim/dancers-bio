-- M4: 비자 신청서 preferred_lang → profiles.preferred_lang 1회 백필 (docs/design-i18n-ui.md §3.9)
-- 적용: 2026-09-11 Supabase MCP apply_migration `i18n_ui_visa_preferred_lang_backfill_20260911` (코드 배포 후).
-- 대상: profiles.preferred_lang IS NULL 이고 applicant_profile_id 로 연결된 비자 신청서에 ko/en/ja 값이 있는 계정.
--       여러 건이면 가장 최근 신청서(created_at desc)의 값. 이미 값이 있는 프로필은 건드리지 않는다.
-- 사전 조회 결과: 20명 = en 16 · ja 1 · ko 3 (비자 행 21건, 값 도메인 en/ja/ko). 이미 값 있던 프로필 1명(테스트 계정).
--
-- 되돌림(적용 직후 기준 — 이후 이용자가 직접 바꾼 값이 있으면 그 계정은 제외할 것):
--   update public.profiles set preferred_lang = null where id in (
--     '1f007b77-d7b5-41f4-8973-1aa87e4d7c58','331466bb-c7cd-4b67-a168-d753255ee2ee','338cba2a-ecbf-4182-ae9e-9171a742e1ad',
--     '3e006868-faae-4d30-a651-5738e1fd38d6','58c173c3-cfaf-444d-bee0-f6b3b414f7d1','58f7975f-94ca-4ed7-876a-7020f9560013',
--     '6ecd08e1-9242-43a2-8e4f-94a6fd8fb91f','78f47e69-9292-4575-8279-5a11cd847363','8bbe2f47-27f5-46a5-b04b-d4be1f4f224b',
--     '9fb473b5-454b-461b-85c4-734e985a9849','a48dd18e-511b-4b0f-ac91-f5f160fa7f12','a77d352f-ff7c-4e17-8fab-b1c96622a796',
--     'cbcddb2e-19bf-4ca4-b4fa-ccf0f6927e0e','cf3b9431-720a-406e-b62c-0dd10fa2d3c8','d159a97f-f4c1-46b6-b8ae-dadb2b9c8e5a',
--     'fae61e89-ace7-434b-b6f2-f46299e22e96','be36dcaa-9f98-4ed5-869d-256a464a626c','249b02c7-3881-4a2a-aaf9-2f3c95f9a027',
--     '7052e32e-af5c-4ae8-a364-1020780299f2','75f4e9e4-96a6-443b-ab5a-56649a01fb96');

update public.profiles p
set preferred_lang = src.lang
from (
  select distinct on (v.applicant_profile_id)
         v.applicant_profile_id as profile_id, v.preferred_lang as lang
  from public.dancer_visa_applications v
  where v.applicant_profile_id is not null
    and v.preferred_lang in ('ko','en','ja')
  order by v.applicant_profile_id, v.created_at desc nulls last
) src
where p.id = src.profile_id
  and p.preferred_lang is null;
