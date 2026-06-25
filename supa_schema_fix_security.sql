-- Drop the overly permissive UPDATE policy
DROP POLICY IF EXISTS "Users can update own profile" ON players;

-- Create a more restrictive UPDATE policy (none, as all updates should happen via service_role)
-- If users later need to update username, we can add a column-restricted policy or RPC.
CREATE POLICY "Users can update own profile" 
ON players 
FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (false); -- Effectively disables direct client updates for now to prevent cheating

-- Fix the handle_new_user trigger to use a random browser_id instead of all 0s
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.players (id, username, created_at, browser_id)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', now(), gen_random_uuid()::text)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill existing bad browser_ids with random UUIDs
UPDATE public.players 
SET browser_id = gen_random_uuid()::text 
WHERE browser_id = '00000000-0000-0000-0000-000000000000';
