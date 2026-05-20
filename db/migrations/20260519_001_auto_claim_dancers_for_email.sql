-- Auto-claim pre-curated dancers (e.g. from grigoent agency-pool migration)
-- whose social_links.source_email matches the calling user's auth.users.email.
-- Invoked from the web app after first successful login.

CREATE OR REPLACE FUNCTION public.auto_claim_dancers_for_email()
RETURNS TABLE(claimed_dancer_id uuid, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
BEGIN
  IF v_user IS NULL THEN
    RETURN;
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_user;
  IF v_email IS NULL OR length(v_email) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.dancers d
  SET profile_id = v_user
  WHERE d.profile_id IS NULL
    AND lower(d.social_links->>'source_email') = lower(v_email)
  RETURNING d.id, d.slug;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_claim_dancers_for_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_claim_dancers_for_email() TO authenticated;

COMMENT ON FUNCTION public.auto_claim_dancers_for_email()
  IS 'Claim any pre-curated dancers whose social_links.source_email matches the caller''s auth.users.email. Called from the app after first successful login.';
