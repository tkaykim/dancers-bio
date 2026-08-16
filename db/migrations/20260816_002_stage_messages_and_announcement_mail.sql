-- ============================================================================
-- 20260816_002 stage_messages_and_announcement_mail
--
-- ① 공고별 단계 안내 메일 문구
--    projects.round_messages jsonb — 라운드 번호(문자열) → { body, note }
--      body : 인사말 아래 본문 문단 (줄바꿈 = 문단 구분). 비우면 기본 문구.
--      note : 경고 박스 아래 붙는 공고별 추가 안내. 비우면 없음.
--    ⚠ "최종 합격이 아니다" 경고 박스는 코드 고정이라 여기서 덮어쓸 수 없다.
--       공고마다 지울 수 있게 하면 오해 방지라는 기능의 목적이 무너진다.
--
-- ② 공지 메일 발송 이력
--    project_announcements 는 지금까지 인앱 + 웹푸시만 보냈다.
--    메일 발송은 운영자가 명시적으로 누를 때만 일어나고, 그 결과를 여기 남긴다.
--    중복 발송 방지는 project_notification_log(channel='announce_<id>') 가 맡는다.
-- ============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS round_messages jsonb;

COMMENT ON COLUMN public.projects.round_messages IS
  '단계 안내 메일의 공고별 문구. {"1":{"body":"...","note":"..."}}. 경고 문구는 코드 고정이라 덮어쓸 수 없다.';

ALTER TABLE public.project_announcements
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_audiences text[];

COMMENT ON COLUMN public.project_announcements.email_sent_at IS
  '마지막 메일 발송 시각. NULL 이면 아직 메일로 보낸 적 없음(인앱·푸시만).';
COMMENT ON COLUMN public.project_announcements.email_audiences IS
  '메일을 보낸 대상 키. 상태(pending/rejected/all) 또는 단계(round:1 …, final).';
