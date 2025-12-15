-- Add is_premium column to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE;
