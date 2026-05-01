-- Phase 3 Migration: Community, Ranking and Missions
-- This completes the social and competitive features.

-- 1. Friendships Table
CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    addressee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT unique_friendship UNIQUE(requester_id, addressee_id),
    CONSTRAINT requester_not_addressee CHECK (requester_id <> addressee_id)
);

-- 2. Review Likes Table
CREATE TABLE IF NOT EXISTS public.review_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID REFERENCES public.reviews(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT unique_review_user_like UNIQUE(review_id, user_id)
);

-- 3. User Missions Table
CREATE TABLE IF NOT EXISTS public.user_missions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    mission_id TEXT NOT NULL, -- e.g., 'daily_review', 'first_friend'
    progress INTEGER DEFAULT 0,
    required INTEGER DEFAULT 1,
    completed BOOLEAN DEFAULT false,
    reward_coins INTEGER DEFAULT 0,
    reward_xp INTEGER DEFAULT 0,
    last_reset TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT unique_user_mission UNIQUE(user_id, mission_id)
);

-- 4. Enable RLS
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_missions ENABLE ROW LEVEL SECURITY;

-- 5. Policies
-- Friendships
DROP POLICY IF EXISTS "Users can read their own friendships" ON public.friendships;
CREATE POLICY "Users can read their own friendships" ON public.friendships FOR SELECT 
    USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "Users can send friend requests" ON public.friendships;
CREATE POLICY "Users can send friend requests" ON public.friendships FOR INSERT 
    WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Users can respond to friend requests" ON public.friendships;
CREATE POLICY "Users can respond to friend requests" ON public.friendships FOR UPDATE 
    USING (auth.uid() = addressee_id)
    WITH CHECK (auth.uid() = addressee_id);

-- Review Likes
DROP POLICY IF EXISTS "Anyone can read likes" ON public.review_likes;
CREATE POLICY "Anyone can read likes" ON public.review_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can like reviews" ON public.review_likes;
CREATE POLICY "Authenticated users can like reviews" ON public.review_likes FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike reviews" ON public.review_likes;
CREATE POLICY "Users can unlike reviews" ON public.review_likes FOR DELETE 
    USING (auth.uid() = user_id);

-- User Missions
DROP POLICY IF EXISTS "Users can read their own missions" ON public.user_missions;
CREATE POLICY "Users can read their own missions" ON public.user_missions FOR SELECT 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own missions" ON public.user_missions;
CREATE POLICY "Users can update their own missions" ON public.user_missions FOR UPDATE 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own missions" ON public.user_missions;
CREATE POLICY "Users can insert their own missions" ON public.user_missions FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Public Profile Access for Leaderboard
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

-- 7. RPC: Increment User Stats (for mission rewards)
CREATE OR REPLACE FUNCTION public.increment_user_stats(user_id UUID, add_coins INTEGER, add_xp INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles 
    SET coins = coins + add_coins,
        xp = xp + add_xp
    WHERE id = user_id;
    
    -- Level up logic could also be here if needed, 
    -- but usually handled by existing triggers or client-side feedback.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Realtime
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.review_likes;
    END IF;
END $$;