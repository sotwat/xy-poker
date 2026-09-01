-- Production hardening for server-authoritative profile, achievement, and AI updates.
-- Apply once in the Supabase SQL editor before deploying the matching backend.

BEGIN;

ALTER TABLE public.ai_global_parameters
  ADD COLUMN IF NOT EXISTS weak_hand_avoidance NUMERIC(5,3) DEFAULT 1.000,
  ADD COLUMN IF NOT EXISTS pair_in_hand_scale NUMERIC(5,3) DEFAULT 1.000,
  ADD COLUMN IF NOT EXISTS queen_first_scale NUMERIC(5,3) DEFAULT 1.000,
  ADD COLUMN IF NOT EXISTS bluff_bonus_scale NUMERIC(5,3) DEFAULT 1.000,
  ADD COLUMN IF NOT EXISTS hiding_strategy NUMERIC(5,3) DEFAULT 0.300,
  ADD COLUMN IF NOT EXISTS trash_bin_rush_scale NUMERIC(5,3) DEFAULT 1.000;

DROP POLICY IF EXISTS "Allow public update global parameters" ON public.ai_global_parameters;
REVOKE UPDATE, INSERT, DELETE ON public.ai_global_parameters FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Allow public read/write" ON public.players;
DROP POLICY IF EXISTS "Users can update own profile" ON public.players;
REVOKE UPDATE, INSERT, DELETE ON public.players FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.achievements FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Anyone can report" ON public.contact_messages;
REVOKE INSERT, UPDATE, DELETE, SELECT ON public.contact_messages FROM PUBLIC, anon, authenticated;

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_nonnegative_stats;
ALTER TABLE public.players
  ADD CONSTRAINT players_nonnegative_stats
  CHECK (
    COALESCE(coins, 0) >= 0
    AND COALESCE(xp, 0) >= 0
    AND COALESCE(level, 1) >= 1
    AND COALESCE(games_played, 0) >= 0
    AND COALESCE(wins, 0) >= 0
  ) NOT VALID;
ALTER TABLE public.players VALIDATE CONSTRAINT players_nonnegative_stats;

CREATE OR REPLACE FUNCTION public.record_ranked_result(
  p_player_one UUID,
  p_player_two UUID,
  p_winner TEXT
)
RETURNS TABLE (
  p1_old INTEGER,
  p1_new INTEGER,
  p1_change INTEGER,
  p2_old INTEGER,
  p2_new INTEGER,
  p2_change INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  player_one_rating INTEGER;
  player_two_rating INTEGER;
  player_one_score NUMERIC;
  player_two_score NUMERIC;
  player_one_delta INTEGER;
  player_two_delta INTEGER;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  IF p_player_one = p_player_two OR p_winner NOT IN ('p1', 'p2', 'draw') THEN
    RAISE EXCEPTION 'invalid ranked result';
  END IF;

  -- Lock both profiles in a stable order so simultaneous rematches cannot deadlock.
  PERFORM 1
  FROM public.players
  WHERE id IN (p_player_one, p_player_two)
  ORDER BY id
  FOR UPDATE;

  SELECT rating INTO player_one_rating FROM public.players WHERE id = p_player_one;
  SELECT rating INTO player_two_rating FROM public.players WHERE id = p_player_two;
  IF player_one_rating IS NULL OR player_two_rating IS NULL THEN
    RAISE EXCEPTION 'player not found';
  END IF;

  player_one_score := CASE p_winner WHEN 'p1' THEN 1 WHEN 'p2' THEN 0 ELSE 0.5 END;
  player_two_score := 1 - player_one_score;
  player_one_delta := ROUND(32 * (player_one_score - (1 / (1 + POWER(10, (player_two_rating - player_one_rating)::NUMERIC / 400)))));
  player_two_delta := ROUND(32 * (player_two_score - (1 / (1 + POWER(10, (player_one_rating - player_two_rating)::NUMERIC / 400)))));

  UPDATE public.players SET rating = player_one_rating + player_one_delta WHERE id = p_player_one;
  UPDATE public.players SET rating = player_two_rating + player_two_delta WHERE id = p_player_two;

  RETURN QUERY SELECT
    player_one_rating,
    player_one_rating + player_one_delta,
    player_one_delta,
    player_two_rating,
    player_two_rating + player_two_delta,
    player_two_delta;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ranked_result(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ranked_result(UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.record_player_result(
  p_player_id UUID,
  p_result TEXT,
  p_reward INTEGER
)
RETURNS TABLE (old_level INTEGER, new_level INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_level INTEGER;
  next_xp INTEGER;
  resulting_level INTEGER;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  IF p_result NOT IN ('win', 'loss', 'draw') OR p_reward NOT IN (10, 20, 30) THEN
    RAISE EXCEPTION 'invalid player result';
  END IF;

  SELECT COALESCE(level, 1), COALESCE(xp, 0) + p_reward
    INTO current_level, next_xp
    FROM public.players
    WHERE id = p_player_id
    FOR UPDATE;
  IF current_level IS NULL THEN
    RAISE EXCEPTION 'player not found';
  END IF;

  resulting_level := CASE
    WHEN next_xp >= current_level * 100 + current_level * current_level * 50 THEN current_level + 1
    ELSE current_level
  END;

  UPDATE public.players
  SET xp = next_xp,
      level = resulting_level,
      games_played = COALESCE(games_played, 0) + 1,
      wins = COALESCE(wins, 0) + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      coins = COALESCE(coins, 0) + p_reward
  WHERE id = p_player_id;

  IF p_result = 'win' THEN
    INSERT INTO public.achievements (player_id, achievement_type)
    VALUES (p_player_id, 'first_win')
    ON CONFLICT (player_id, achievement_type) DO NOTHING;
  END IF;

  RETURN QUERY SELECT current_level, resulting_level;
END;
$$;

REVOKE ALL ON FUNCTION public.record_player_result(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_player_result(UUID, TEXT, INTEGER) TO service_role;

COMMIT;
