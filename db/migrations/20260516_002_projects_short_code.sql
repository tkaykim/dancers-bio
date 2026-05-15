-- Lite: projects.id (UUID) 대신 사람이 읽고 공유하기 좋은 6글자 short_code 도입.
-- additive only — 기존 UUID id는 그대로 PK·FK로 유지. short_code는 보조 식별자.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS short_code varchar(6);

-- 6글자 a-z0-9 랜덤 코드 생성. 충돌 시 재시도 (최대 10회).
CREATE OR REPLACE FUNCTION generate_project_short_code()
RETURNS varchar(6)
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  code varchar(6);
  attempts int := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, (floor(random() * length(chars))::int + 1), 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM projects WHERE short_code = code) THEN
      RETURN code;
    END IF;
    attempts := attempts + 1;
    IF attempts >= 10 THEN
      RAISE EXCEPTION 'short_code generation exhausted after 10 attempts';
    END IF;
  END LOOP;
END;
$$;

-- BEFORE INSERT 트리거: short_code 미지정 시 자동 채움
CREATE OR REPLACE FUNCTION projects_set_short_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.short_code IS NULL THEN
    NEW.short_code := generate_project_short_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_set_short_code ON projects;
CREATE TRIGGER trg_projects_set_short_code
  BEFORE INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION projects_set_short_code();

-- 기존 행 backfill (NULL인 row에만)
UPDATE projects
SET short_code = generate_project_short_code()
WHERE short_code IS NULL;

-- 모두 채워졌으니 NOT NULL + UNIQUE 제약 추가
ALTER TABLE projects
  ALTER COLUMN short_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS projects_short_code_unique
  ON projects (short_code);

COMMENT ON COLUMN projects.short_code IS
  'Lite: 6글자 a-z0-9 short identifier for URLs. /projects/[id] 라우트가 UUID와 short_code 모두 수용.';
