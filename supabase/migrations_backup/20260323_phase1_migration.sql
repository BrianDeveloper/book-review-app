-- Phase 1 Migration: XP, Level and Chat
-- Run this in your Supabase SQL Editor

-- 1. Add XP and Level to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;

-- 2. Create Chat Messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 4. Policies for Chat Messages
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read their own messages' AND tablename = 'chat_messages') THEN
        CREATE POLICY "Users can read their own messages" 
        ON public.chat_messages FOR SELECT 
        USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can send messages' AND tablename = 'chat_messages') THEN
        CREATE POLICY "Users can send messages" 
        ON public.chat_messages FOR INSERT 
        WITH CHECK (auth.uid() = sender_id);
    END IF;
END $$;

-- 5. Enable Realtime (This might need manual toggle in some Supabase setups, but this SQL often works)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    END IF;
END $$;
