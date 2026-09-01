-- Authenticated, private match records (棋譜).
BEGIN;

CREATE TABLE IF NOT EXISTS public.game_records (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  played_at TIMESTAMPTZ NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('bot', 'ranked', 'private')),
  result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  opponent_name VARCHAR(15) NOT NULL,
  record_data JSONB NOT NULL,
  CONSTRAINT game_records_payload_size CHECK (octet_length(record_data::TEXT) <= 25000)
);

CREATE INDEX IF NOT EXISTS idx_game_records_player_played_at
  ON public.game_records (player_id, played_at DESC);

ALTER TABLE public.game_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own game records" ON public.game_records;
CREATE POLICY "Users can read own game records"
  ON public.game_records FOR SELECT
  TO authenticated
  USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "Users can delete own game records" ON public.game_records;
CREATE POLICY "Users can delete own game records"
  ON public.game_records FOR DELETE
  TO authenticated
  USING (auth.uid() = player_id);

REVOKE INSERT, UPDATE ON public.game_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.game_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_records TO service_role;

COMMIT;
