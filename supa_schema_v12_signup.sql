BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.players (id, username, created_at, browser_id)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', now(), gen_random_uuid()::text)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

COMMIT;
