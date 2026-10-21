BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
DO $$
DECLARE p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); a jsonb; b jsonb; c jsonb; oldbalance integer; i integer; rejected boolean; purchase jsonb; req uuid:=gen_random_uuid();
BEGIN
  INSERT INTO public.players(id,browser_id,rating,coins,xp,level,games_played,wins,current_win_streak,best_win_streak)
  VALUES(p,gen_random_uuid(),1500,1000,0,1,0,0,0,0),(q,gen_random_uuid(),1500,1000,0,1,0,0,0,0);
  a:=public.settle_match(p,'qa-1','bot','win',20,10,1500,ARRAY['y_sweep']);
  IF (a#>>'{coins,change}')::int<>50 OR (a#>>'{xp,change}')::int<>130 OR (a#>>'{rating,change}')::int<>16 THEN RAISE EXCEPTION 'base rewards mismatch'; END IF;
  IF NOT (a->'unlocked' ? 'first_win') OR NOT (a->'unlocked' ? 'y_sweep') THEN RAISE EXCEPTION 'unlock missing'; END IF;
  b:=public.settle_match(p,'qa-1','bot','win',20,10,1500,ARRAY['y_sweep']);
  IF a<>b THEN RAISE EXCEPTION 'duplicate result mismatch'; END IF;
  IF (SELECT games_played FROM public.players WHERE id=p)<>1 THEN RAISE EXCEPTION 'duplicate credit'; END IF;
  b:=public.settle_match(p,'qa-2','bot','win',20,10,1500);
  IF (b#>>'{breakdown,streak}')::int<>5 THEN RAISE EXCEPTION 'streak missing'; END IF;
  c:=public.settle_match(p,'qa-3','bot','win',200,0,1500);
  IF (c#>>'{breakdown,challenge}')::int<>25 OR (c#>>'{breakdown,margin}')::int<>40 THEN RAISE EXCEPTION 'challenge or margin cap mismatch'; END IF;
  IF NOT (c->'unlocked' ? 'win_streak_3') THEN RAISE EXCEPTION 'streak unlock missing'; END IF;
  a:=public.settle_match(p,'qa-4','ranked','loss',1,20,1500);
  IF (a#>>'{coins,change}')::int<>10 OR (a#>>'{after,currentWinStreak}')::int<>0 OR (a#>>'{rating,change}')::int<>-16 THEN RAISE EXCEPTION 'loss mismatch'; END IF;
  a:=public.settle_match(q,'qa-private','private','draw',12,12,1500);
  IF (a#>>'{coins,change}')::int<>20 OR (a#>>'{rating,change}')::int<>0 THEN RAISE EXCEPTION 'private draw mismatch'; END IF;
  SELECT coins INTO oldbalance FROM public.players WHERE id=p;
  purchase:=public.buy_skins(p,req,'[{"type":"dice","id":"gold"}]',300);
  IF (purchase->>'balance')::int<>oldbalance-300 THEN RAISE EXCEPTION 'purchase balance mismatch'; END IF;
  IF public.buy_skins(p,req,'[{"type":"dice","id":"gold"}]',300)<>purchase THEN RAISE EXCEPTION 'purchase not idempotent'; END IF;
  IF (SELECT coins FROM public.players WHERE id=p)<>oldbalance-300 THEN RAISE EXCEPTION 'purchase double charge'; END IF;
  BEGIN
    PERFORM public.buy_skins(p,gen_random_uuid(),'[{"type":"dice","id":"gold"}]',300);
    RAISE EXCEPTION 'owned skin charged again';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE public.players SET coins=0 WHERE id=q;
  rejected := false;
  BEGIN
    PERFORM public.buy_skins(q,gen_random_uuid(),'[{"type":"dice","id":"red"}]',300);
  EXCEPTION WHEN raise_exception THEN rejected:=true;
  END;
  IF NOT rejected OR EXISTS(SELECT 1 FROM public.player_skins WHERE player_id=q) THEN RAISE EXCEPTION 'insufficient balance not atomic'; END IF;
  FOR i IN 1..5 LOOP
    a:=public.settle_match(p,'qa-streak-'||i,'bot','win',20,10,1500);
  END LOOP;
  IF NOT (a->'unlocked' ? 'win_streak_5') OR (a#>>'{level,new}')::int<=1 THEN RAISE EXCEPTION 'five-win unlock or level missing'; END IF;
  PERFORM set_config('request.jwt.claim.sub',p::text,true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.player_skins)<>1 OR EXISTS(SELECT 1 FROM public.match_rewards WHERE player_id=q) THEN RAISE EXCEPTION 'RLS isolation failed'; END IF;
  RESET ROLE;
  IF has_function_privilege('anon','public.settle_match(uuid,text,text,text,integer,integer,integer,text[])','EXECUTE')
    OR has_function_privilege('authenticated','public.buy_skins(uuid,uuid,jsonb,integer)','EXECUTE') THEN RAISE EXCEPTION 'unsafe RPC privilege'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: rewards, score cap, streak, milestones, Elo, purchases, duplicate protection, permissions, five-win unlock, level, insufficient funds, RLS; all fixtures rolled back' AS verification;
