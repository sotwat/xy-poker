-- 1. Create a function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.players (id, username, created_at, browser_id)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', now(), '00000000-0000-0000-0000-000000000000')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger (if not exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Backfill missing players for existing auth users
INSERT INTO public.players (id, username, browser_id)
SELECT id, raw_user_meta_data->>'full_name', '00000000-0000-0000-0000-000000000000'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.players);
