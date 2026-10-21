BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
DO $$
DECLARE p uuid:=gen_random_uuid(); a jsonb; b jsonb; inv jsonb;
BEGIN
 INSERT INTO public.players(id,browser_id,rating,coins,xp,level,games_played,wins,current_win_streak,best_win_streak)
 VALUES(p,gen_random_uuid(),1500,50,149,1,0,0,0,0);
 a:=public.settle_match(p,'qa-v15-first','bot','win',10,10,1500);
 IF (a#>>'{xp,change}')::int<>200 OR (a#>>'{breakdown,achievement}')::int<>50 OR (a#>>'{coins,change}')::int<>180 OR (a#>>'{level,new}')::int<>2 THEN RAISE EXCEPTION 'first win + XP level mismatch %',a; END IF;
 b:=public.settle_match(p,'qa-v15-first','bot','win',10,10,1500);
 IF a<>b OR (SELECT coins FROM public.players WHERE id=p)<>230 THEN RAISE EXCEPTION 'duplicate credit'; END IF;
 UPDATE public.players SET xp=1199,level=4,current_win_streak=4,best_win_streak=4,wins=4,games_played=4 WHERE id=p;
 -- Existing streak3 is not awarded again.
 INSERT INTO public.achievements(player_id,achievement_type) VALUES(p,'win_streak_3');
 a:=public.settle_match(p,'qa-v15-streak','ranked','win',10,10,1500,ARRAY['perfect_game']);
 IF (a#>>'{breakdown,achievement}')::int<>750 OR (a#>>'{xp,change}')::int<>1640 OR (a#>>'{level,new}')::int<>7 OR (a#>>'{breakdown,levelUp}')::int<>1100 THEN RAISE EXCEPTION 'stacked rewards mismatch %',a; END IF;
 IF NOT ((a->'cosmetics') ?& ARRAY['earned-copper','earned-ember','earned-crown','on-fire','flawless']) THEN RAISE EXCEPTION 'missing unlocks %',a; END IF;
 PERFORM set_config('request.jwt.claim.sub',p::text,true);
 inv:=public.sync_progression();
 IF NOT(inv->'titles' ? 'flawless') OR jsonb_array_length(inv->'skins')<>3 THEN RAISE EXCEPTION 'restore mismatch %',inv; END IF;
 PERFORM public.equip_title('flawless');
 IF (public.sync_progression()->>'selectedTitle')<>'flawless' THEN RAISE EXCEPTION 'title save'; END IF;
 BEGIN
  PERFORM public.equip_title('royal');
  RAISE EXCEPTION 'locked title accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'title locked' THEN RAISE; END IF;
 END;
 PERFORM public.equip_title(NULL);
 IF (public.sync_progression()->>'selectedTitle') IS NOT NULL THEN RAISE EXCEPTION 'unequip failed'; END IF;
 a:=public.settle_match(p,'qa-v15-repeat','private','loss',0,10,1500,ARRAY['perfect_game']);
 IF (a#>>'{breakdown,achievement}')::int<>0 OR jsonb_array_length(a->'cosmetics')<>0 THEN RAISE EXCEPTION 'achievement paid twice'; END IF;
 UPDATE public.players SET level=20 WHERE id=p;
 INSERT INTO public.achievements(player_id,achievement_type) VALUES(p,'games_100');
 inv:=public.sync_progression();
 IF jsonb_array_length(inv->'skins')<>6 OR NOT(inv->'titles' ? 'elite') THEN RAISE EXCEPTION 'legacy unlocks %',inv; END IF;
 inv:=public.sync_progression();
 IF jsonb_array_length(inv->'skins')<>6 THEN RAISE EXCEPTION 'restore duplicate'; END IF;
 IF has_function_privilege('authenticated','public.settle_match(uuid,text,text,text,integer,integer,integer,text[])','EXECUTE')
 OR has_function_privilege('anon','public.sync_progression()','EXECUTE')
 OR has_function_privilege('authenticated','public.eligible_cosmetics(uuid)','EXECUTE') THEN RAISE EXCEPTION 'unsafe permission'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: growing levels, achievement coins/XP, stacked levelups, once-only settlement, six skins, retroactive cosmetic unlocks, title restore/equip/locked rejection, permissions; fixtures rolled back' AS verification;
