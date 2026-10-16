-- Run in the project's SQL editor; then deploy the matching ranking client.
BEGIN;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Remove every SELECT/ALL policy: permissive policies combine with OR.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'players' AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.players', p.policyname);
  END LOOP;
END $$;
CREATE POLICY "Read own account" ON public.players
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
REVOKE SELECT ON public.players FROM PUBLIC, anon;
GRANT SELECT ON public.players TO authenticated, service_role;

-- Intentionally owner-executed: exposes only the three public ranking fields.
CREATE OR REPLACE VIEW public.public_players WITH (security_barrier = true) AS
  SELECT id, username, rating FROM public.players;
REVOKE ALL ON public.public_players FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_players TO anon, authenticated, service_role;
COMMIT;
