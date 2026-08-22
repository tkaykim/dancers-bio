-- 지원 직후 가이드 노출 + 즉시 확정 처리.
--
-- 왜: 챌린지처럼 선발 없이 전원 진행하는 공고에서, 지원자는 확정 안내 메일을
-- 최대 30분 기다려야 제작 가이드를 볼 수 있었다. 그 사이에 이탈이 발생했다.
-- 가이드 링크를 공고에 저장해 지원 직후 화면에서 바로 보여주고,
-- 선발이 없는 공고는 지원과 동시에 확정 처리한다.

alter table public.projects
  add column if not exists guide_url text,
  add column if not exists auto_accept_on_apply boolean not null default false;

comment on column public.projects.guide_url is
  '확정자에게 안내할 제작 가이드 링크. 지원 직후 화면과 메일에서 함께 쓴다.';
comment on column public.projects.auto_accept_on_apply is
  '지원 즉시 확정 처리. 챌린지처럼 선발 없이 전원 진행하는 공고용. 기본 false.';
