-- 공고 게시 → 핏 맞는 댄서에게 인앱/푸시 알림 (MVP).
-- enum 값은 트랜잭션 안전을 위해 별도 마이그레이션(007a)에서 먼저 추가됨.

-- 멱등 로그: 같은 공고×수신자×채널 중복발송 방지
CREATE TABLE IF NOT EXISTS public.project_notification_log (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'match',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, recipient_id, channel)
);
ALTER TABLE public.project_notification_log ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.project_notification_log IS '공고 매칭 알림 발송 멱등 로그(공고×수신자×채널). service-role만 기록. RLS 정책 없음=일반 접근 차단.';

-- 발송 대상 댄서(profile_id) — 장르 일치 보수적 매칭. owner 게이트 없음(시스템 발송용).
-- ⚠ 댄서 genres 는 영문/혼합("Hip Hop"/"hiphop"/"kpop"…), 프로젝트 장르는 genres 테이블(label_ko/en/slug).
--   라벨 직매칭이 안 되므로 양쪽을 정규화(소문자+영숫자/한글만)해 비교한다.
CREATE OR REPLACE FUNCTION public.dancers_to_notify_for_project(p_id uuid)
RETURNS TABLE(profile_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tokens text[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT lower(regexp_replace(x, '[^a-zA-Z0-9가-힣]', '', 'g'))
    FROM unnest(ARRAY[g.label_ko, g.label_en, g.slug]) AS x
    WHERE x IS NOT NULL AND length(x) > 0
  )
  INTO v_tokens
  FROM public.projects p
  JOIN public.genres g ON g.id = p.genre_id
  WHERE p.id = p_id;

  IF v_tokens IS NULL OR array_length(v_tokens, 1) IS NULL THEN
    RETURN;  -- 장르 미지정 공고는 매칭 안 함(스팸 방지)
  END IF;

  RETURN QUERY
  SELECT DISTINCT d.profile_id
  FROM public.dancers d
  WHERE d.profile_id IS NOT NULL
    AND d.approval_status = 'approved'
    AND coalesce(d.is_active, true) = true
    AND d.genres IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM unnest(d.genres) AS dg
      WHERE lower(regexp_replace(dg, '[^a-zA-Z0-9가-힣]', '', 'g')) = ANY(v_tokens)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.project_id = p_id AND a.dancer_id = d.id
        AND a.status IN ('pending','accepted') AND a.archived_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = p_id AND (p.owner_dancer_id = d.id OR d.profile_id = p.owner_id)
    )
  LIMIT 1000;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dancers_to_notify_for_project(uuid) FROM anon, authenticated;

-- (007a, 먼저 적용) ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'project_posted_match';
