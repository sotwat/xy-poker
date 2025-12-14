-- Add username column to players table for custom display names
ALTER TABLE players ADD COLUMN IF NOT EXISTS username TEXT;

-- (Optional) Migration to populate existing usernames from some source if possible, 
-- but for now we leave them null and UI will handle defaults.
