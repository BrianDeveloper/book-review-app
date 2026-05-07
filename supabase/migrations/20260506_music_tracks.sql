-- ==========================================
-- MUSIC TRACKS SCHEMA & STORAGE BUCKET
-- ==========================================

-- 1. Create table for Music Tracks
CREATE TABLE IF NOT EXISTS public.music_tracks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL, -- The path in the 'music' storage bucket (e.g., 'chillhop_1.mp3')
    is_exclusive BOOLEAN DEFAULT FALSE, -- Prepared for future reward system
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;

-- Everyone can read the tracks
CREATE POLICY "Anyone can view music tracks" 
-- Only authenticated users (or admins) can insert/update
CREATE POLICY "Admins can insert music tracks" 
    ON public.music_tracks FOR ALL 
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- 2. Create the Storage Bucket for MP3s (If it doesn't exist)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('music', 'music', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for 'music' bucket
-- Allow public access to read files
CREATE POLICY "Public access to music bucket" 
    ON storage.objects FOR SELECT 
    USING (bucket_id = 'music');

-- Allow authenticated users to upload/modify
CREATE POLICY "Auth users can manage music" 
    ON storage.objects FOR ALL 
    USING (bucket_id = 'music' AND auth.role() = 'authenticated')
    WITH CHECK (bucket_id = 'music' AND auth.role() = 'authenticated');
