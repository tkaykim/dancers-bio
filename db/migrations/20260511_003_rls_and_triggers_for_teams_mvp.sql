-- ============================================================================
-- 20260511_003 rls_and_triggers_for_teams_mvp
-- Updated RLS for careers/applications/projects/project_sessions
-- New triggers: prevent_self_application, auto_close_on_full, projects_set_admin_actor
-- ============================================================================

DROP POLICY IF EXISTS careers_owner_manage ON public.careers;
DROP POLICY IF EXISTS careers_select ON public.careers;
CREATE POLICY careers_select ON public.careers
  FOR SELECT USING (
    is_public = true OR public.is_admin()
    OR (dancer_id IS NOT NULL AND public.owns_dancer(dancer_id))
    OR (team_id IS NOT NULL AND public.leads_team(team_id))
  );
CREATE POLICY careers_manage ON public.careers
  FOR ALL
  USING (public.is_admin()
         OR (dancer_id IS NOT NULL AND public.owns_dancer(dancer_id))
         OR (team_id IS NOT NULL AND public.leads_team(team_id)))
  WITH CHECK (public.is_admin()
              OR (dancer_id IS NOT NULL AND public.owns_dancer(dancer_id))
              OR (team_id IS NOT NULL AND public.leads_team(team_id)));

DROP POLICY IF EXISTS applications_select ON public.applications;
DROP POLICY IF EXISTS applications_insert ON public.applications;
DROP POLICY IF EXISTS applications_update ON public.applications;
DROP POLICY IF EXISTS applications_delete_admin ON public.applications;

CREATE POLICY applications_select ON public.applications
  FOR SELECT USING (
    public.is_admin()
    OR (applicant_id IS NOT NULL AND applicant_id = auth.uid())
    OR (team_id IS NOT NULL AND public.leads_team(team_id))
    OR public.owns_project(project_id)
  );

CREATE POLICY applications_insert ON public.applications
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR (
      source = 'apply'
      AND (
        (applicant_id IS NOT NULL AND applicant_id = auth.uid()
         AND EXISTS (SELECT 1 FROM public.dancers d WHERE d.profile_id = auth.uid()))
        OR (team_id IS NOT NULL AND public.leads_team(team_id))
      )
      AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = applications.project_id
          AND p.visibility = 'public'
          AND p.status = 'open'
          AND p.deleted_at IS NULL
          AND (team_id IS NULL OR p.allow_team_apply = true)
      )
    )
    OR (
      source = 'direct_proposal'
      AND public.owns_project(project_id)
      AND (team_id IS NULL OR EXISTS (
        SELECT 1 FROM public.projects p WHERE p.id = applications.project_id AND p.allow_team_apply = true
      ))
    )
  );

CREATE POLICY applications_update ON public.applications
  FOR UPDATE
  USING (public.is_admin()
         OR (applicant_id IS NOT NULL AND applicant_id = auth.uid())
         OR (team_id IS NOT NULL AND public.leads_team(team_id))
         OR public.owns_project(project_id))
  WITH CHECK (public.is_admin()
              OR (applicant_id IS NOT NULL AND applicant_id = auth.uid())
              OR (team_id IS NOT NULL AND public.leads_team(team_id))
              OR public.owns_project(project_id));

CREATE POLICY applications_delete_admin ON public.applications
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS projects_insert ON public.projects;
DROP POLICY IF EXISTS projects_select ON public.projects;

CREATE POLICY projects_insert ON public.projects
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR (owner_id = auth.uid()
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.can_create_project))
  );

CREATE POLICY projects_select ON public.projects
  FOR SELECT USING (
    owner_id = auth.uid() OR public.is_admin()
    OR (
      status <> 'draft' AND deleted_at IS NULL
      AND (visibility = 'public'
           OR EXISTS (
             SELECT 1 FROM public.applications a
             WHERE a.project_id = projects.id
               AND ((a.applicant_id IS NOT NULL AND a.applicant_id = auth.uid())
                    OR (a.team_id IS NOT NULL AND public.leads_team(a.team_id)))
           ))
    )
  );

DROP POLICY IF EXISTS project_sessions_select ON public.project_sessions;

CREATE POLICY project_sessions_select ON public.project_sessions
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_sessions.project_id
        AND (p.owner_id = auth.uid()
             OR (p.status <> 'draft' AND p.deleted_at IS NULL
                 AND (p.visibility = 'public'
                      OR EXISTS (
                        SELECT 1 FROM public.applications a
                        WHERE a.project_id = p.id
                          AND ((a.applicant_id IS NOT NULL AND a.applicant_id = auth.uid())
                               OR (a.team_id IS NOT NULL AND public.leads_team(a.team_id)))
                      ))))
    )
  );

CREATE OR REPLACE FUNCTION public.applications_prevent_self()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  project_owner uuid;
  team_lead uuid;
BEGIN
  SELECT owner_id INTO project_owner FROM public.projects WHERE id = NEW.project_id;
  IF project_owner IS NULL THEN RETURN NEW; END IF;
  IF NEW.applicant_id IS NOT NULL AND NEW.applicant_id = project_owner THEN
    RAISE EXCEPTION 'Cannot apply to or propose for your own project (applicant equals project owner).';
  END IF;
  IF NEW.team_id IS NOT NULL THEN
    SELECT lead_profile_id INTO team_lead FROM public.teams WHERE id = NEW.team_id;
    IF team_lead = project_owner THEN
      RAISE EXCEPTION 'Cannot apply to or propose for a project where your team lead owns the project.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER applications_prevent_self_trg
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_prevent_self();

CREATE OR REPLACE FUNCTION public.applications_auto_close_project()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  needed integer;
  accepted_count integer;
  current_status project_status;
BEGIN
  IF NEW.status <> 'accepted' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'accepted' THEN RETURN NEW; END IF;
  SELECT recruitment_count, status INTO needed, current_status
    FROM public.projects WHERE id = NEW.project_id;
  IF current_status NOT IN ('open', 'draft') THEN RETURN NEW; END IF;
  SELECT count(*) INTO accepted_count
    FROM public.applications
    WHERE project_id = NEW.project_id AND status = 'accepted' AND archived_at IS NULL;
  IF accepted_count >= needed THEN
    UPDATE public.projects SET status = 'closed', updated_at = now() WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER applications_auto_close_project_trg
  AFTER INSERT OR UPDATE OF status ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_auto_close_project();

CREATE OR REPLACE FUNCTION public.projects_set_admin_actor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.owner_id <> auth.uid() AND public.is_admin() THEN
    NEW.posted_by_admin_id := auth.uid();
  ELSIF NEW.owner_id = auth.uid() THEN
    NEW.posted_by_admin_id := NULL;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER projects_set_admin_actor_trg
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_set_admin_actor();
