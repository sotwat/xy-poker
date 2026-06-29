-- supa_schema_v6_ai.sql
-- Create Global AI Parameters Table for Collaborative Learning

CREATE TABLE IF NOT EXISTS public.ai_global_parameters (
    id BIGINT PRIMARY KEY DEFAULT 1,
    total_games BIGINT DEFAULT 0,
    ai_wins BIGINT DEFAULT 0,
    trip_preference NUMERIC(5,3) DEFAULT 1.000,
    flush_preference NUMERIC(5,3) DEFAULT 1.000,
    straight_preference NUMERIC(5,3) DEFAULT 1.000,
    x_hand_focus NUMERIC(5,3) DEFAULT 1.000,
    bonus_aggression NUMERIC(5,3) DEFAULT 1.000,
    defensive_awareness NUMERIC(5,3) DEFAULT 0.800,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_single_row CHECK (id = 1) -- Enforce single row database configuration
);

-- RLS (Row Level Security) Configuration
ALTER TABLE public.ai_global_parameters ENABLE ROW LEVEL SECURITY;

-- Anonymous users (and authenticated players) can read parameters
CREATE POLICY "Allow anonymous read global parameters" 
ON public.ai_global_parameters FOR SELECT 
TO anon, authenticated 
USING (true);

-- Anyone can update global parameters (to record collaborative learning outcomes)
-- For absolute security in production, this should ideally run via edge functions or backend service keys,
-- but allowing direct client updates via anon is a reliable lightweight path for serverless collaborative updates.
CREATE POLICY "Allow public update global parameters"
ON public.ai_global_parameters FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Insert initial parameter configuration row if not exists
INSERT INTO public.ai_global_parameters (
    id, 
    total_games, 
    ai_wins, 
    trip_preference, 
    flush_preference, 
    straight_preference, 
    x_hand_focus, 
    bonus_aggression, 
    defensive_awareness
) VALUES (
    1, 0, 0, 1.000, 1.000, 1.000, 1.000, 1.000, 0.800
) ON CONFLICT (id) DO NOTHING;
