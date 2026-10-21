BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
DO $$
DECLARE p uuid:=gen_random_uuid(); a jsonb; b jsonb;
BEGIN
 INSERT INTO public.players(id,browser_id,rating,coins,xp,level,games_played,wins,current_win_streak,best_win_streak)
 VALUES(p,gen_random_uuid(),1500,50,149,1,0,0,0,0);
 a:=public.settle_match(p,'qa-level-2','bot','loss',0,10,1500);
 IF (a#>>'{level,new}')::int<>2 OR (a#>>'{breakdown,levelUp}')::int<>100 OR (a#>>'{coins,new}')::int<>160 OR (a#>>'{xp,change}')::int<>40 THEN RAISE EXCEPTION 'level 2 mismatch'; END IF;
 b:=public.settle_match(p,'qa-level-2','bot','loss',0,10,1500);
 IF a<>b OR (SELECT coins FROM public.players WHERE id=p)<>160 THEN RAISE EXCEPTION 'duplicate level credit'; END IF;
 UPDATE public.players SET level=4,xp=1199 WHERE id=p;
 a:=public.settle_match(p,'qa-level-5','private','draw',10,10,1500);
 IF (a#>>'{level,new}')::int<>5 OR (a#>>'{breakdown,levelUp}')::int<>300 OR (a#>>'{coins,change}')::int<>320 THEN RAISE EXCEPTION 'level 5 mismatch'; END IF;
 a:=public.settle_match(p,'qa-no-level','ranked','win',10,10,1500);
 IF (a#>>'{breakdown,levelUp}')::int<>0 OR (a#>>'{coins,change}')::int<>30 THEN RAISE EXCEPTION 'unchanged level mismatch'; END IF;
 UPDATE public.players SET level=4,xp=5000 WHERE id=p;
 a:=public.settle_match(p,'qa-multiple-levels','bot','loss',0,10,1500);
 IF (a#>>'{level,new}')::int<>10 OR (a#>>'{breakdown,levelUp}')::int<>1000 OR (a#>>'{coins,change}')::int<>1010 THEN RAISE EXCEPTION 'multiple levels mismatch'; END IF;
 b:=public.settle_match(p,'qa-level-2','bot','loss',0,10,1500);
 IF (b#>>'{coins,new}')::int<>160 THEN RAISE EXCEPTION 'historical receipt changed'; END IF;
 IF has_function_privilege('authenticated','public.settle_match(uuid,text,text,text,integer,integer,integer,text[])','EXECUTE') THEN RAISE EXCEPTION 'unsafe permission'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: level 2/5/10, all crossed levels, unchanged level, duplicate credit, historical receipt, permissions; fixtures rolled back' AS verification;
