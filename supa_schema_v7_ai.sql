-- supa_schema_v7_ai.sql
-- Create Global AI Parameters Table (12 Parameters - strategy.md Compliant)

DROP TABLE IF EXISTS public.ai_global_parameters;

CREATE TABLE public.ai_global_parameters (
    id BIGINT PRIMARY KEY DEFAULT 1,
    total_games BIGINT DEFAULT 0,
    ai_wins BIGINT DEFAULT 0,
    -- Core preferences
    trip_preference NUMERIC(5,3) DEFAULT 1.000,
    flush_preference NUMERIC(5,3) DEFAULT 1.000,
    straight_preference NUMERIC(5,3) DEFAULT 1.000,
    x_hand_focus NUMERIC(5,3) DEFAULT 1.000,
    bonus_aggression NUMERIC(5,3) DEFAULT 1.000,
    defensive_awareness NUMERIC(5,3) DEFAULT 0.800,
    -- Advanced heuristics from strategy.md
    pure_preference NUMERIC(5,3) DEFAULT 1.000,           -- Weight of Pure vs Normal hands
    trips_in_hand_focus NUMERIC(5,3) DEFAULT 1.000,       -- Strategy to keep Trips hidden in hand
    row3_delay_focus NUMERIC(5,3) DEFAULT 1.000,          -- Heavy penalty/bonus on delay filling row 3
    showdown_delay_focus NUMERIC(5,3) DEFAULT 1.000,      -- Penalty/bonus on delaying win-confirmed slots
    low_card_avoidance NUMERIC(5,3) DEFAULT 1.000,        -- Penalty on playing edge cards (low rank) early
    turn_order_flexibility NUMERIC(5,3) DEFAULT 1.000,    -- Flexibility for selecting first/second turn
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_single_row CHECK (id = 1)
);

-- RLS (Row Level Security) Configuration
ALTER TABLE public.ai_global_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read global parameters" 
ON public.ai_global_parameters FOR SELECT 
TO anon, authenticated 
USING (true);

CREATE POLICY "Allow public update global parameters"
ON public.ai_global_parameters FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Insert initial values
INSERT INTO public.ai_global_parameters (
    id, 
    total_games, 
    ai_wins, 
    trip_preference, 
    flush_preference, 
    straight_preference, 
    x_hand_focus, 
    bonus_aggression, 
    defensive_awareness,
    pure_preference,
    trips_in_hand_focus,
    row3_delay_focus,
    showdown_delay_focus,
    low_card_avoidance,
    turn_order_flexibility
) VALUES (
    1, 0, 0, 1.000, 1.000, 1.000, 1.000, 1.000, 0.800, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000
) ON CONFLICT (id) DO NOTHING;
