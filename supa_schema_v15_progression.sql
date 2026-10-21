BEGIN;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS selected_title text;
CREATE TABLE public.progression_cosmetics (
  id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('dice','card','board','title')),
  name text NOT NULL, level integer, achievement text,
  CHECK ((level IS NULL) <> (achievement IS NULL))
);
CREATE TABLE public.achievement_rewards (id text PRIMARY KEY, coins integer NOT NULL CHECK(coins>0), xp integer NOT NULL CHECK(xp>0));
ALTER TABLE public.progression_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read cosmetic catalog" ON public.progression_cosmetics FOR SELECT USING (true);
CREATE POLICY "Read reward catalog" ON public.achievement_rewards FOR SELECT USING (true);
GRANT SELECT ON public.progression_cosmetics, public.achievement_rewards TO anon, authenticated;
GRANT ALL ON public.progression_cosmetics, public.achievement_rewards TO service_role;
INSERT INTO public.progression_cosmetics (id,kind,name,level,achievement) VALUES
('earned-copper','dice','Copper',5,NULL),
('earned-cobalt','card','Cobalt Foil',10,NULL),
('earned-champion','board','Champion Table',20,NULL),
('earned-ember','dice','Ember',NULL,'win_streak_5'),
('earned-crown','card','Crown',NULL,'perfect_game'),
('earned-veteran','board','Veteran Table',NULL,'games_100'),
('challenger','title','Challenger',3,NULL),
('regular','title','Regular',10,NULL),
('elite','title','Elite',20,NULL),
('first-blood','title','First Blood',NULL,'first_win'),
('on-fire','title','On Fire',NULL,'win_streak_5'),
('royal','title','Royal',NULL,'x_win_royal_flush'),
('flawless','title','Flawless',NULL,'perfect_game'),
('veteran','title','Veteran',NULL,'games_100');
INSERT INTO public.achievement_rewards (id,coins,xp) VALUES
('x_win_royal_flush',500,1000),
('straight_flush_x',250,500),
('x_win_four_of_a_kind',50,100),
('x_win_full_house',50,100),
('x_win_straight',50,100),
('x_win_flush',50,100),
('x_win_three_of_a_kind',50,100),
('x_win_two_pair',50,100),
('x_win_one_pair',50,100),
('x_win_high_card',50,100),
('y_win_pure_straight_flush',250,500),
('y_win_three_of_a_kind',50,100),
('y_win_straight_flush',50,100),
('y_win_pure_straight',50,100),
('y_win_flush',50,100),
('y_win_pure_one_pair',50,100),
('y_win_straight',50,100),
('y_win_one_pair',50,100),
('y_win_high_card',50,100),
('games_10',100,200),
('games_50',250,500),
('games_100',500,1000),
('games_500',1500,3000),
('wins_10',150,300),
('wins_50',400,800),
('wins_100',800,1600),
('win_streak_3',100,200),
('win_streak_5',250,500),
('win_streak_10',750,1500),
('first_win',50,100),
('first_draw',50,100),
('close_win',50,100),
('score_30',50,100),
('bonus_3',50,100),
('bonus_5',50,100),
('no_bonus_win',50,100),
('hidden_three_win',50,100),
('y_sweep',250,500),
('perfect_game',500,1000);
CREATE FUNCTION public.eligible_cosmetics(p_player uuid) RETURNS SETOF public.progression_cosmetics
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.* FROM public.progression_cosmetics c JOIN public.players p ON p.id=p_player
 WHERE p.level>=c.level OR EXISTS (SELECT 1 FROM public.achievements a WHERE a.player_id=p_player AND a.achievement_type=c.achievement)
$$;
REVOKE ALL ON FUNCTION public.eligible_cosmetics(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_cosmetics(uuid) TO service_role;
CREATE FUNCTION public.sync_progression() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE who uuid := auth.uid(); result jsonb;
BEGIN
 IF who IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 PERFORM 1 FROM public.players WHERE id=who FOR UPDATE;
 INSERT INTO public.player_skins(player_id,kind,skin_id)
 SELECT who,kind,id FROM public.eligible_cosmetics(who) WHERE kind<>'title' ON CONFLICT DO NOTHING;
 SELECT jsonb_build_object(
  'level',p.level,'selectedTitle',p.selected_title,
  'achievements',(SELECT coalesce(jsonb_agg(achievement_type),'[]') FROM public.achievements WHERE player_id=who),
  'skins',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'skin_id',skin_id)),'[]') FROM public.player_skins WHERE player_id=who),
  'titles',(SELECT coalesce(jsonb_agg(id),'[]') FROM public.eligible_cosmetics(who) WHERE kind='title')
 ) INTO result FROM public.players p WHERE id=who;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.sync_progression() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sync_progression() TO authenticated;
CREATE FUNCTION public.equip_title(p_title text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE who uuid := auth.uid();
BEGIN
 IF who IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 PERFORM 1 FROM public.players WHERE id=who FOR UPDATE;
 IF p_title IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.eligible_cosmetics(who) WHERE kind='title' AND id=p_title) THEN RAISE EXCEPTION 'title locked'; END IF;
 UPDATE public.players SET selected_title=p_title WHERE id=who;
 RETURN p_title;
END $$;
REVOKE ALL ON FUNCTION public.equip_title(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.equip_title(text) TO authenticated;
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
  achievement_coins integer := 0;
  achievement_xp integer := 0;
  achievement_items jsonb;
  cosmetics_before text[];
  cosmetic_unlocks jsonb;
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
  SELECT coalesce(array_agg(id),'{}') INTO cosmetics_before FROM public.eligible_cosmetics(p_player);
  next_streak := CASE WHEN p_result='win' THEN old.current_win_streak+1 ELSE 0 END;
  base := CASE p_result WHEN 'win' THEN 30 WHEN 'draw' THEN 20 ELSE 10 END;
  base_xp := CASE p_result WHEN 'win' THEN 100 WHEN 'draw' THEN 60 ELSE 40 END;
  IF p_result='win' THEN
    margin := least(20,greatest(0,p_score-p_opponent_score));
    streak_bonus := least(5,greatest(0,next_streak-1));
    challenge := CASE WHEN (coalesce(old.wins,0)+1)%3=0 THEN 1 ELSE 0 END;
  END IF;
  PERFORM public.award_stat_achievements(p_player,coalesce(old.games_played,0)+1,coalesce(old.wins,0)+CASE WHEN p_result='win' THEN 1 ELSE 0 END,next_streak);
  INSERT INTO public.achievements(player_id,achievement_type)
    SELECT p_player,unnest(p_achievements) ON CONFLICT(player_id,achievement_type) DO NOTHING;
  SELECT coalesce(array_agg(achievement_type),'{}') INTO earned FROM public.achievements WHERE player_id=p_player AND NOT (achievement_type=ANY(previous));
  SELECT coalesce(sum(r.coins),0),coalesce(sum(r.xp),0),coalesce(jsonb_agg(jsonb_build_object('id',r.id,'coins',r.coins,'xp',r.xp)),'[]')
  INTO achievement_coins,achievement_xp,achievement_items FROM public.achievement_rewards r WHERE r.id=ANY(earned);
  coin_gain := base + margin*2 + streak_bonus*5 + challenge*25 + achievement_coins;
  xp_gain := base_xp + margin*3 + streak_bonus*10 + challenge*50 + achievement_xp;
  next_level := coalesce(old.level,1);
  WHILE coalesce(old.xp,0)+xp_gain >= next_level*100+next_level*next_level*50 LOOP next_level := next_level+1; END LOOP;
  level_bonus := 25*(next_level*(next_level+1)-coalesce(old.level,1)*(coalesce(old.level,1)+1)) + (next_level/5-coalesce(old.level,1)/5)*200;
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
  INSERT INTO public.player_skins(player_id,kind,skin_id)
  SELECT p_player,kind,id FROM public.eligible_cosmetics(p_player) WHERE kind<>'title' ON CONFLICT DO NOTHING;
  SELECT coalesce(jsonb_agg(id),'[]') INTO cosmetic_unlocks FROM public.eligible_cosmetics(p_player) WHERE NOT(id=ANY(cosmetics_before));
  receipt := jsonb_build_object(
    'matchId',p_match,'mode',p_mode,'result',p_result,
    'rating',jsonb_build_object('old',old_rating,'new',greatest(0,old_rating+delta),'change',greatest(0,old_rating+delta)-old_rating),
    'coins',jsonb_build_object('old',coalesce(old.coins,0),'new',coalesce(old.coins,0)+coin_gain,'change',coin_gain),
    'xp',jsonb_build_object('old',coalesce(old.xp,0),'new',coalesce(old.xp,0)+xp_gain,'change',xp_gain),
    'level',jsonb_build_object('old',coalesce(old.level,1),'new',next_level),
    'breakdown',jsonb_build_object('base',base,'margin',margin*2,'streak',streak_bonus*5,'challenge',challenge*25,'levelUp',level_bonus,'achievement',achievement_coins),
    'before',jsonb_build_object('gamesPlayed',coalesce(old.games_played,0),'wins',coalesce(old.wins,0),'currentWinStreak',old.current_win_streak),
    'after',jsonb_build_object('gamesPlayed',coalesce(old.games_played,0)+1,'wins',coalesce(old.wins,0)+CASE WHEN p_result='win' THEN 1 ELSE 0 END,'currentWinStreak',next_streak),
    'cosmetics',cosmetic_unlocks,'achievementRewards',achievement_items,'unlocked',earned,'achievements',(SELECT coalesce(jsonb_agg(achievement_type),'[]') FROM public.achievements WHERE player_id=p_player)
  );
  INSERT INTO public.match_rewards VALUES(p_player,p_match,receipt,now());
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.settle_match(uuid,text,text,text,integer,integer,integer,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_match(uuid,text,text,text,integer,integer,integer,text[]) TO service_role;

COMMIT;
