BEGIN;
CREATE OR REPLACE FUNCTION public.settle_match(
  p_player uuid, p_match text, p_mode text, p_result text,
  p_score integer, p_opponent_score integer, p_opponent_rating integer,
  p_achievements text[] DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old public.players%ROWTYPE;
  receipt jsonb;
  earned text[];
  previous text[];
  next_streak integer;
  margin integer := 0;
  streak_bonus integer := 0;
  challenge integer := 0;
  base integer;
  base_xp integer;
  coin_gain integer;
  xp_gain integer;
  next_level integer;
  level_bonus integer := 0;
  old_rating integer;
  delta integer := 0;
  score_value numeric;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
  IF p_mode NOT IN ('bot','ranked','private') OR p_result NOT IN ('win','loss','draw')
    OR length(p_match) NOT BETWEEN 1 AND 100 OR p_score NOT BETWEEN 0 AND 200 OR p_opponent_score NOT BETWEEN 0 AND 200
    OR p_opponent_rating NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'invalid match'; END IF;
  SELECT * INTO old FROM public.players WHERE id = p_player FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'player not found'; END IF;
  SELECT r.receipt INTO receipt FROM public.match_rewards r WHERE player_id=p_player AND match_id=p_match;
  IF FOUND THEN RETURN receipt; END IF;
  SELECT coalesce(array_agg(achievement_type),'{}') INTO previous FROM public.achievements WHERE player_id=p_player;
  next_streak := CASE WHEN p_result='win' THEN old.current_win_streak+1 ELSE 0 END;
  base := CASE p_result WHEN 'win' THEN 30 WHEN 'draw' THEN 20 ELSE 10 END;
  base_xp := CASE p_result WHEN 'win' THEN 100 WHEN 'draw' THEN 60 ELSE 40 END;
  IF p_result='win' THEN
    margin := least(20,greatest(0,p_score-p_opponent_score));
    streak_bonus := least(5,greatest(0,next_streak-1));
    challenge := CASE WHEN (coalesce(old.wins,0)+1)%3=0 THEN 1 ELSE 0 END;
  END IF;
  coin_gain := base + margin*2 + streak_bonus*5 + challenge*25;
  xp_gain := base_xp + margin*3 + streak_bonus*10 + challenge*50;
  next_level := coalesce(old.level,1);
  WHILE coalesce(old.xp,0)+xp_gain >= next_level*100+next_level*next_level*50 LOOP next_level := next_level+1; END LOOP;
  level_bonus := (next_level-coalesce(old.level,1))*100 + (next_level/5-coalesce(old.level,1)/5)*200;
  coin_gain := coin_gain + level_bonus;
  old_rating := CASE WHEN p_mode='bot' THEN old.ai_rating ELSE old.rating END;
  IF p_mode<>'private' THEN
    score_value := CASE p_result WHEN 'win' THEN 1 WHEN 'loss' THEN 0 ELSE 0.5 END;
    delta := round(32*(score_value-1/(1+power(10, (p_opponent_rating-old_rating)::numeric/400))));
  END IF;
  UPDATE public.players SET
    coins=coalesce(coins,0)+coin_gain, xp=coalesce(xp,0)+xp_gain, level=next_level,
    games_played=coalesce(games_played,0)+1,
    wins=coalesce(wins,0)+CASE WHEN p_result='win' THEN 1 ELSE 0 END,
    current_win_streak=next_streak, best_win_streak=greatest(best_win_streak,next_streak),
    rating=CASE WHEN p_mode='ranked' THEN greatest(0,old_rating+delta) ELSE rating END,
    ai_rating=CASE WHEN p_mode='bot' THEN greatest(0,old_rating+delta) ELSE ai_rating END
  WHERE id=p_player;
  PERFORM public.award_stat_achievements(p_player,coalesce(old.games_played,0)+1,coalesce(old.wins,0)+CASE WHEN p_result='win' THEN 1 ELSE 0 END,next_streak);
  INSERT INTO public.achievements(player_id,achievement_type)
    SELECT p_player,unnest(p_achievements) ON CONFLICT(player_id,achievement_type) DO NOTHING;
  SELECT coalesce(array_agg(achievement_type),'{}') INTO earned FROM public.achievements WHERE player_id=p_player AND NOT (achievement_type=ANY(previous));
  receipt := jsonb_build_object(
    'matchId',p_match,'mode',p_mode,'result',p_result,
    'rating',jsonb_build_object('old',old_rating,'new',greatest(0,old_rating+delta),'change',greatest(0,old_rating+delta)-old_rating),
    'coins',jsonb_build_object('old',coalesce(old.coins,0),'new',coalesce(old.coins,0)+coin_gain,'change',coin_gain),
    'xp',jsonb_build_object('old',coalesce(old.xp,0),'new',coalesce(old.xp,0)+xp_gain,'change',xp_gain),
    'level',jsonb_build_object('old',coalesce(old.level,1),'new',next_level),
    'breakdown',jsonb_build_object('base',base,'margin',margin*2,'streak',streak_bonus*5,'challenge',challenge*25,'levelUp',level_bonus),
    'before',jsonb_build_object('gamesPlayed',coalesce(old.games_played,0),'wins',coalesce(old.wins,0),'currentWinStreak',old.current_win_streak),
    'after',jsonb_build_object('gamesPlayed',coalesce(old.games_played,0)+1,'wins',coalesce(old.wins,0)+CASE WHEN p_result='win' THEN 1 ELSE 0 END,'currentWinStreak',next_streak),
    'unlocked',earned,'achievements',(SELECT coalesce(jsonb_agg(achievement_type),'[]') FROM public.achievements WHERE player_id=p_player)
  );
  INSERT INTO public.match_rewards VALUES(p_player,p_match,receipt,now());
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.settle_match(uuid,text,text,text,integer,integer,integer,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_match(uuid,text,text,text,integer,integer,integer,text[]) TO service_role;
COMMIT;
