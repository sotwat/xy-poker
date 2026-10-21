BEGIN;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS ai_rating integer NOT NULL DEFAULT 1500;
CREATE TABLE IF NOT EXISTS public.match_rewards (
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  match_id text NOT NULL,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, match_id)
);
ALTER TABLE public.match_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own rewards" ON public.match_rewards FOR SELECT TO authenticated USING (player_id = (SELECT auth.uid()));
GRANT SELECT ON public.match_rewards TO authenticated;
GRANT ALL ON public.match_rewards TO service_role;

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
    'breakdown',jsonb_build_object('base',base,'margin',margin*2,'streak',streak_bonus*5,'challenge',challenge*25),
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

BEGIN;
CREATE TABLE IF NOT EXISTS public.player_skins (
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('dice','card','board')),
  skin_id text NOT NULL,
  PRIMARY KEY(player_id,kind,skin_id)
);
ALTER TABLE public.player_skins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own skins" ON public.player_skins FOR SELECT TO authenticated USING(player_id=(SELECT auth.uid()));
GRANT SELECT ON public.player_skins TO authenticated;
GRANT ALL ON public.player_skins TO service_role;
CREATE TABLE IF NOT EXISTS public.skin_purchases (
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  request_id uuid NOT NULL, receipt jsonb NOT NULL, PRIMARY KEY(player_id,request_id)
);
ALTER TABLE public.skin_purchases ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.skin_purchases TO service_role;
CREATE OR REPLACE FUNCTION public.buy_skins(p_player uuid,p_request uuid,p_items jsonb,p_cost integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE balance integer; receipt jsonb; item jsonb; item_count integer;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
  SELECT coalesce(coins,0) INTO balance FROM public.players WHERE id=p_player FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'player not found'; END IF;
  SELECT s.receipt INTO receipt FROM public.skin_purchases s WHERE player_id=p_player AND request_id=p_request;
  IF FOUND THEN RETURN receipt; END IF;
  item_count := jsonb_array_length(p_items);
  IF item_count NOT BETWEEN 1 AND 10 OR p_cost NOT IN (100*item_count,300) THEN RAISE EXCEPTION 'invalid purchase'; END IF;
  IF balance<p_cost THEN RAISE EXCEPTION 'Insufficient coins'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.player_skins VALUES(p_player,item->>'type',item->>'id');
  END LOOP;
  UPDATE public.players SET coins=balance-p_cost WHERE id=p_player;
  receipt := jsonb_build_object('items',p_items,'balance',balance-p_cost);
  INSERT INTO public.skin_purchases VALUES(p_player,p_request,receipt);
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.buy_skins(uuid,uuid,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buy_skins(uuid,uuid,jsonb,integer) TO service_role;
COMMIT;
