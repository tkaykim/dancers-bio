-- ============================================================================
-- 20260511_002 alter_existing_tables_for_teams_mvp
-- careers/projects/applications/dancers schema changes for team support
-- ============================================================================

ALTER TABLE public.careers
  ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  ALTER COLUMN dancer_id DROP NOT NULL;
ALTER TABLE public.careers
  ADD CONSTRAINT careers_owner_xor CHECK (
    (dancer_id IS NOT NULL AND team_id IS NULL) OR
    (dancer_id IS NULL AND team_id IS NOT NULL)
  );
CREATE INDEX careers_team_id_idx ON public.careers (team_id) WHERE team_id IS NOT NULL;

ALTER TABLE public.projects
  ADD COLUMN recruitment_count integer NOT NULL DEFAULT 1 CHECK (recruitment_count >= 1),
  ADD COLUMN allow_team_apply boolean NOT NULL DEFAULT false,
  ADD COLUMN agreed_pay integer CHECK (agreed_pay IS NULL OR agreed_pay >= 0),
  ADD COLUMN posted_by_admin_id uuid REFERENCES public.profiles(id);
CREATE INDEX projects_posted_by_admin_idx ON public.projects (posted_by_admin_id) WHERE posted_by_admin_id IS NOT NULL;

ALTER TABLE public.applications
  ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN anonymized_at timestamptz,
  ALTER COLUMN applicant_id DROP NOT NULL;
ALTER TABLE public.applications
  ADD CONSTRAINT applications_applicant_xor CHECK (
    (applicant_id IS NOT NULL AND team_id IS NULL) OR
    (applicant_id IS NULL AND team_id IS NOT NULL)
  );
CREATE UNIQUE INDEX applications_unique_individual
  ON public.applications (project_id, applicant_id)
  WHERE applicant_id IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX applications_unique_team
  ON public.applications (project_id, team_id)
  WHERE team_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX applications_team_id_idx ON public.applications (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX applications_project_status_active_idx
  ON public.applications (project_id, status) WHERE archived_at IS NULL;

ALTER TABLE public.dancers
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN archived_at timestamptz;
