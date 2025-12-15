
-- Create table for contact messages
CREATE TABLE IF NOT EXISTS public.contact_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('request', 'bug', 'other')),
    user_contact TEXT, -- Optional contact info (email or ID)
    message TEXT NOT NULL,
    status TEXT DEFAULT 'new' -- For admin tracking
);

-- Enable RLS
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Allow anyone (game users) to INSERT
CREATE POLICY "Anyone can report" ON public.contact_messages
    FOR INSERT
    WITH CHECK (true);

-- Allow only service role (admin) to SELECT/UPDATE/DELETE
-- (By default, no policy means no access for anon/authenticated, which is what we want for VIEWING)
-- So regular users cannot seeing other people's messages.
