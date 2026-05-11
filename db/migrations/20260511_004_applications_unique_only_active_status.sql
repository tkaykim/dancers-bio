-- ============================================================================
-- 20260511_004 applications_unique_only_active_status
-- Allow re-apply after rejection/withdrawal: uniqueness only blocks pending/accepted.
-- ============================================================================

DROP INDEX IF EXISTS public.applications_unique_individual;
DROP INDEX IF EXISTS public.applications_unique_team;

CREATE UNIQUE INDEX applications_unique_individual
  ON public.applications (project_id, applicant_id)
  WHERE applicant_id IS NOT NULL
    AND archived_at IS NULL
    AND status IN ('pending', 'accepted');

CREATE UNIQUE INDEX applications_unique_team
  ON public.applications (project_id, team_id)
  WHERE team_id IS NOT NULL
    AND archived_at IS NULL
    AND status IN ('pending', 'accepted');
