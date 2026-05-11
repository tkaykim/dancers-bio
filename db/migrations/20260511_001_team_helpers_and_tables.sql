-- ============================================================================
-- 20260511_001 team_helpers_and_tables
-- Helper functions for RLS + teams + team_members
-- Order: dancers/projects helpers → teams table → leads_team → team_members → RLS/triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.owns_dancer(d_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.dancers d WHERE d.id = d_id AND d.profile_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.owns_project(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_id AND p.owner_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.owns_dancer(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.owns_project(uuid) TO authenticated, anon;

CREATE TYPE team_approval_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE,
  team_name text NOT NULL,
  korean_name text,
  bio text,
  profile_img text,
  location text,
  genres text[],
  specialties text[],
  social_links jsonb,
  portfolio jsonb DEFAULT '[]'::jsonb,
  lead_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approval_status team_approval_status NOT NULL DEFAULT 'pending',
  approval_reject_reason text,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id),
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX teams_lead_profile_idx ON public.teams (lead_profile_id);
CREATE INDEX teams_approval_status_idx ON public.teams (approval_status);
CREATE INDEX teams_listing_idx ON public.teams (created_at DESC) WHERE approval_status = 'approved' AND is_active = true;
CREATE INDEX teams_genres_idx ON public.teams USING gin (genres);
CREATE INDEX teams_team_name_trgm_idx ON public.teams USING gin (team_name gin_trgm_ops);

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT team_members_name_or_profile CHECK (
    profile_id IS NOT NULL OR (display_name IS NOT NULL AND length(trim(display_name)) > 0)
  )
);

CREATE UNIQUE INDEX team_members_team_profile_unique
  ON public.team_members (team_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX team_members_team_idx ON public.team_members (team_id, sort_order);
CREATE INDEX team_members_profile_idx ON public.team_members (profile_id) WHERE profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.leads_team(t_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.teams t WHERE t.id = t_id AND t.lead_profile_id = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.leads_team(uuid) TO authenticated, anon;

CREATE TRIGGER teams_set_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.teams_force_pending_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.approval_status := 'pending';
    NEW.approval_reject_reason := NULL;
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER teams_force_pending_on_insert_trg
  BEFORE INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.teams_force_pending_on_insert();

CREATE OR REPLACE FUNCTION public.teams_guard_admin_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.approval_status := OLD.approval_status;
    NEW.approval_reject_reason := OLD.approval_reject_reason;
    NEW.approved_at := OLD.approved_at;
    NEW.approved_by := OLD.approved_by;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER teams_guard_admin_fields_trg
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.teams_guard_admin_fields();

CREATE OR REPLACE FUNCTION public.teams_add_lead_as_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.team_members (team_id, profile_id, sort_order)
  VALUES (NEW.id, NEW.lead_profile_id, 0)
  ON CONFLICT (team_id, profile_id) WHERE profile_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER teams_add_lead_as_member_trg
  AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.teams_add_lead_as_member();

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_select_all ON public.teams FOR SELECT USING (true);

CREATE POLICY teams_insert_self ON public.teams FOR INSERT WITH CHECK (
  public.is_admin() OR (
    lead_profile_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.dancers d WHERE d.profile_id = auth.uid())
  )
);

CREATE POLICY teams_update_lead ON public.teams FOR UPDATE
  USING (public.is_admin() OR lead_profile_id = auth.uid())
  WITH CHECK (public.is_admin() OR lead_profile_id = auth.uid());

CREATE POLICY teams_delete_lead ON public.teams FOR DELETE
  USING (public.is_admin() OR lead_profile_id = auth.uid());

CREATE POLICY team_members_select_all ON public.team_members FOR SELECT USING (true);

CREATE POLICY team_members_manage ON public.team_members FOR ALL
  USING (public.is_admin() OR public.leads_team(team_id))
  WITH CHECK (public.is_admin() OR public.leads_team(team_id));

CREATE OR REPLACE FUNCTION public.team_members_protect_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_lead uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT lead_profile_id INTO current_lead FROM public.teams WHERE id = OLD.team_id;
    IF current_lead = OLD.profile_id AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Cannot remove team lead from members. Transfer leadership or disband the team first.';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER team_members_protect_lead_trg
  BEFORE DELETE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.team_members_protect_lead();
