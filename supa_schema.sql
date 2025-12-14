-- Add columns to the existing players table to support gamification
-- Note: We are modifying the existing 'players' table instead of creating a new 'profiles' table
-- to preserve existing data and because 'players' is already linked to auth.users.

ALTER TABLE players ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE players ADD COLUMN IF NOT EXISTS games_played INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0;

-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL,
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(player_id, achievement_type)
);

-- Enable Row Level Security (RLS) for achievements if not already enabled (Optional but recommended)
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read achievements
CREATE POLICY "Allow public read access" ON achievements FOR SELECT USING (true);

-- Create index for faster leaderboard lookups
CREATE INDEX IF NOT EXISTS idx_players_rating ON players (rating DESC);
