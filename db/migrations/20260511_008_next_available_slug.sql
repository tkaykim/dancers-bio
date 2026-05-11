-- ============================================================================
-- 20260511_008 next_available_slug()
-- 충돌 회피 슬러그 생성 헬퍼. base가 비어있거나 점유돼 있으면 -2, -3, ...
-- ============================================================================

CREATE OR REPLACE FUNCTION public.next_available_slug(
  base text,
  target_table text,
  exclude_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate text;
  n int := 2;
  taken boolean;
  cleaned text;
BEGIN
  cleaned := lower(regexp_replace(coalesce(base, ''), '[^a-z0-9-]+', '', 'gi'));
  cleaned := regexp_replace(cleaned, '-+', '-', 'g');
  cleaned := regexp_replace(cleaned, '^-+|-+$', '', 'g');
  IF cleaned = '' OR cleaned IS NULL THEN
    RETURN NULL;
  END IF;
  IF length(cleaned) > 35 THEN
    cleaned := substring(cleaned from 1 for 35);
    cleaned := regexp_replace(cleaned, '-+$', '', 'g');
  END IF;
  candidate := cleaned;

  LOOP
    IF target_table = 'dancers' THEN
      SELECT EXISTS(
        SELECT 1 FROM public.dancers
        WHERE slug = candidate
          AND (exclude_id IS NULL OR id <> exclude_id)
      ) INTO taken;
    ELSIF target_table = 'teams' THEN
      SELECT EXISTS(
        SELECT 1 FROM public.teams
        WHERE slug = candidate
          AND (exclude_id IS NULL OR id <> exclude_id)
      ) INTO taken;
    ELSE
      RAISE EXCEPTION 'unknown target_table: %', target_table;
    END IF;
    EXIT WHEN NOT taken;
    candidate := cleaned || '-' || n::text;
    n := n + 1;
    EXIT WHEN n > 9999;
  END LOOP;
  RETURN candidate;
END$$;

GRANT EXECUTE ON FUNCTION public.next_available_slug(text, text, uuid) TO authenticated, anon;
