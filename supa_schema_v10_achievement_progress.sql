-- Server-authoritative cumulative achievement progress and winning streaks.
-- Apply after supa_schema_v9_game_records.sql.

BEGIN;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS current_win_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_win_streak INTEGER NOT NULL DEFAULT 0;

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
    AND current_win_streak >= 0
    AND best_win_streak >= current_win_streak
  ) NOT VALID;
ALTER TABLE public.players VALIDATE CONSTRAINT players_nonnegative_stats;

CREATE OR REPLACE FUNCTION public.award_stat_achievements(
  p_player_id UUID,
  p_games INTEGER,
  p_wins INTEGER,
  p_streak INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.achievements (player_id, achievement_type)
  SELECT p_player_id, candidate.achievement_type
  FROM (VALUES
    ('first_win', p_wins >= 1),
    ('games_10', p_games >= 10),
    ('games_50', p_games >= 50),
    ('games_100', p_games >= 100),
    ('games_500', p_games >= 500),
    ('wins_10', p_wins >= 10),
    ('wins_50', p_wins >= 50),
    ('wins_100', p_wins >= 100),
    ('win_streak_3', p_streak >= 3),
    ('win_streak_5', p_streak >= 5),
    ('win_streak_10', p_streak >= 10)
  ) AS candidate(achievement_type, earned)
  WHERE candidate.earned
  ON CONFLICT (player_id, achievement_type) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.award_stat_achievements(UUID, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_stat_achievements(UUID, INTEGER, INTEGER, INTEGER)
  TO service_role;

-- Existing totals are trustworthy, so award their cumulative milestones immediately.
SELECT public.award_stat_achievements(
  id,
  COALESCE(games_played, 0),
  COALESCE(wins, 0),
  current_win_streak
)
FROM public.players;

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
  next_games INTEGER;
  next_wins INTEGER;
  next_streak INTEGER;
  next_best_streak INTEGER;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  IF p_result NOT IN ('win', 'loss', 'draw') OR p_reward NOT IN (10, 20, 30) THEN
    RAISE EXCEPTION 'invalid player result';
  END IF;

  SELECT
      COALESCE(level, 1),
      COALESCE(xp, 0) + p_reward,
      COALESCE(games_played, 0) + 1,
      COALESCE(wins, 0) + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      CASE WHEN p_result = 'win' THEN current_win_streak + 1 ELSE 0 END,
      best_win_streak
    INTO current_level, next_xp, next_games, next_wins, next_streak, next_best_streak
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
  next_best_streak := GREATEST(next_best_streak, next_streak);

  UPDATE public.players
  SET xp = next_xp,
      level = resulting_level,
      games_played = next_games,
      wins = next_wins,
      current_win_streak = next_streak,
      best_win_streak = next_best_streak,
      coins = COALESCE(coins, 0) + p_reward
  WHERE id = p_player_id;

  PERFORM public.award_stat_achievements(p_player_id, next_games, next_wins, next_streak);

  RETURN QUERY SELECT current_level, resulting_level;
END;
$$;

REVOKE ALL ON FUNCTION public.record_player_result(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_player_result(UUID, TEXT, INTEGER)
  TO service_role;

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
  p1_games INTEGER;
  p2_games INTEGER;
  p1_wins INTEGER;
  p2_wins INTEGER;
  p1_streak INTEGER;
  p2_streak INTEGER;
  p1_best_streak INTEGER;
  p2_best_streak INTEGER;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  IF p_player_one = p_player_two OR p_winner NOT IN ('p1', 'p2', 'draw') THEN
    RAISE EXCEPTION 'invalid ranked result';
  END IF;

  PERFORM 1
  FROM public.players
  WHERE id IN (p_player_one, p_player_two)
  ORDER BY id
  FOR UPDATE;

  SELECT
      rating,
      COALESCE(games_played, 0) + 1,
      COALESCE(wins, 0) + CASE WHEN p_winner = 'p1' THEN 1 ELSE 0 END,
      CASE WHEN p_winner = 'p1' THEN current_win_streak + 1 ELSE 0 END,
      best_win_streak
    INTO player_one_rating, p1_games, p1_wins, p1_streak, p1_best_streak
    FROM public.players
    WHERE id = p_player_one;
  SELECT
      rating,
      COALESCE(games_played, 0) + 1,
      COALESCE(wins, 0) + CASE WHEN p_winner = 'p2' THEN 1 ELSE 0 END,
      CASE WHEN p_winner = 'p2' THEN current_win_streak + 1 ELSE 0 END,
      best_win_streak
    INTO player_two_rating, p2_games, p2_wins, p2_streak, p2_best_streak
    FROM public.players
    WHERE id = p_player_two;
  IF player_one_rating IS NULL OR player_two_rating IS NULL THEN
    RAISE EXCEPTION 'player not found';
  END IF;

  player_one_score := CASE p_winner WHEN 'p1' THEN 1 WHEN 'p2' THEN 0 ELSE 0.5 END;
  player_two_score := 1 - player_one_score;
  player_one_delta := ROUND(32 * (player_one_score - (1 / (1 + POWER(10, (player_two_rating - player_one_rating)::NUMERIC / 400)))));
  player_two_delta := ROUND(32 * (player_two_score - (1 / (1 + POWER(10, (player_one_rating - player_two_rating)::NUMERIC / 400)))));
  p1_best_streak := GREATEST(p1_best_streak, p1_streak);
  p2_best_streak := GREATEST(p2_best_streak, p2_streak);

  UPDATE public.players
  SET rating = player_one_rating + player_one_delta,
      games_played = p1_games,
      wins = p1_wins,
      current_win_streak = p1_streak,
      best_win_streak = p1_best_streak
  WHERE id = p_player_one;
  UPDATE public.players
  SET rating = player_two_rating + player_two_delta,
      games_played = p2_games,
      wins = p2_wins,
      current_win_streak = p2_streak,
      best_win_streak = p2_best_streak
  WHERE id = p_player_two;

  PERFORM public.award_stat_achievements(p_player_one, p1_games, p1_wins, p1_streak);
  PERFORM public.award_stat_achievements(p_player_two, p2_games, p2_wins, p2_streak);

  RETURN QUERY SELECT
    player_one_rating,
    player_one_rating + player_one_delta,
    player_one_delta,
    player_two_rating,
    player_two_rating + player_two_delta,
    player_two_delta;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ranked_result(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ranked_result(UUID, UUID, TEXT)
  TO service_role;

COMMIT;
