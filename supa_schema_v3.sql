-- Add coins column to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0;

-- Optional: Grant some initial coins to existing users if needed?
-- UPDATE players SET coins = 1000 WHERE coins = 0;
