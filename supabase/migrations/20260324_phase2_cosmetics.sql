-- Migration: Phase 2 - Cosmetics & Customization
-- Adds support for Profile Frames, Titles, and Skins.

-- 1. Update profiles table with cosmetic fields
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS selected_frame TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS selected_title TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS selected_skin TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS unlocked_items JSONB DEFAULT '[]';

-- 2. Ensure RLS allows users to update their own cosmetics
-- (Already handled by existing profile update policy, but good to keep in mind)

-- 3. Comments for documentation
COMMENT ON COLUMN public.profiles.selected_frame IS 'ID of the currently equipped profile frame';
COMMENT ON COLUMN public.profiles.selected_title IS 'Text or ID of the currently equipped title';
COMMENT ON COLUMN public.profiles.selected_skin IS 'ID of the currently equipped profile skin';
COMMENT ON COLUMN public.profiles.unlocked_items IS 'List of unlocked item IDs (frames, titles, skins)';
