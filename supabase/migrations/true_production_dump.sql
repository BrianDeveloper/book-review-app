-- ========================================================
-- TRUE PRODUCTION DUMP (MASTER REBUILD)
-- Espejo completo de la Base de Datos de Producción
-- ========================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    username TEXT UNIQUE,
    avatar_url TEXT,
    bio TEXT,
    coins INTEGER DEFAULT 0,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    badges JSONB DEFAULT '[]'::jsonb,
    preferences JSONB DEFAULT '{"genres": [], "goal": 0, "answered_quizzes": [], "casino_tokens": 0}'::jsonb,
    unlocked_items JSONB DEFAULT '[]'::jsonb,
    selected_frame TEXT DEFAULT 'none',
    selected_title TEXT DEFAULT 'none',
    selected_skin TEXT DEFAULT 'none',
    show_presence BOOLEAN DEFAULT true,
    game_states JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. TABLA: reviews (La tabla principal de libros)
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    rating DECIMAL DEFAULT 0,
    review_text TEXT,
    fav_quote TEXT,
    start_date DATE,
    end_date DATE,
    recommend BOOLEAN DEFAULT false,
    photo_url TEXT,
    music_link TEXT,
    music_info JSONB DEFAULT '{}'::jsonb,
    fav_character TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. TABLA: game_logs
CREATE TABLE IF NOT EXISTS public.game_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL, -- 'memory', 'trivia', etc.
    score INTEGER NOT NULL,
    coins_awarded INTEGER NOT NULL,
    time_spent INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. TABLA: trivia_questions
CREATE TABLE IF NOT EXISTS public.trivia_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic TEXT,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_index INTEGER NOT NULL,
    reward INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. TABLA: user_trivia_responses
CREATE TABLE IF NOT EXISTS public.user_trivia_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    question_id UUID REFERENCES public.trivia_questions(id) ON DELETE CASCADE,
    selected_index INTEGER,
    is_correct BOOLEAN,
    answered_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 7. TABLA: user_trivia_state (Locking)
CREATE TABLE IF NOT EXISTS public.user_trivia_state (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    current_question_id UUID REFERENCES public.trivia_questions(id),
    slot_index INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 8. TABLA: friendships
CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    addressee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(requester_id, addressee_id)
);

-- 9. TABLA: review_likes
CREATE TABLE IF NOT EXISTS public.review_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID REFERENCES public.reviews(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(review_id, user_id)
);

-- 10. TABLA: user_inventory (Sistema Robusto)
CREATE TABLE IF NOT EXISTS public.user_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    category TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    is_equipped BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 11. TABLA: reward_claims
CREATE TABLE IF NOT EXISTS public.reward_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL,
    year INTEGER NOT NULL,
    game_type TEXT NOT NULL,
    reward_type TEXT NOT NULL,
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, week_number, year, game_type)
);

-- 12. TABLA: chat_messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 13. TABLA: notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    type TEXT, -- 'friend_request', 'system', 'reward'
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 14. TABLA: store_items
CREATE TABLE IF NOT EXISTS public.store_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT,
    icon TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 15. TABLA: user_missions
CREATE TABLE IF NOT EXISTS public.user_missions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    mission_id TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    required INTEGER DEFAULT 1,
    completed BOOLEAN DEFAULT false,
    last_reset TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, mission_id)
);

-- 16. TABLAS DE SOPORTE ADICIONALES (Basado en la captura)
CREATE TABLE IF NOT EXISTS public.community_read (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), content JSONB, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());
CREATE TABLE IF NOT EXISTS public.rewarded_likes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES public.profiles(id), count INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS public.user_suggestions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES public.profiles(id), suggestion TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());

-- 17. SEGURIDAD (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;

-- 18. FUNCIONES RPC

-- Ranking Semanal
DROP FUNCTION IF EXISTS public.get_weekly_arcade_ranking(TEXT);
CREATE OR REPLACE FUNCTION public.get_weekly_arcade_ranking(p_game_type TEXT DEFAULT 'global')
RETURNS TABLE (user_id UUID, rank BIGINT, username TEXT, avatar_url TEXT, total_coins BIGINT, best_time INTEGER, games_played BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id as user_id, RANK() OVER (ORDER BY SUM(gl.coins_awarded) DESC, MIN(gl.time_spent) ASC) as rank, p.username, p.avatar_url, SUM(gl.coins_awarded)::BIGINT as total_coins, MIN(gl.time_spent)::INTEGER as best_time, COUNT(gl.id)::BIGINT as games_played
    FROM public.game_logs gl JOIN public.profiles p ON gl.user_id = p.id
    WHERE gl.created_at >= date_trunc('week', now()) AND (p_game_type = 'global' OR gl.game_type = p_game_type)
    GROUP BY p.id ORDER BY total_coins DESC LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reclamar Premio
DROP FUNCTION IF EXISTS public.claim_weekly_reward(UUID);
CREATE OR REPLACE FUNCTION public.claim_weekly_reward(p_claim_id UUID)
RETURNS JSONB AS $$
DECLARE v_user_id UUID; v_reward_type TEXT; v_coins_to_add INTEGER; v_item_id TEXT; v_item_name TEXT; v_item_icon TEXT; v_item_css TEXT; v_claimed_at TIMESTAMP WITH TIME ZONE;
BEGIN
    v_user_id := auth.uid();
    SELECT reward_type, claimed_at INTO v_reward_type, v_claimed_at FROM public.reward_claims WHERE id = p_claim_id AND user_id = v_user_id;
    IF NOT FOUND OR v_claimed_at IS NOT NULL THEN RETURN json_build_object('success', false); END IF;
    CASE v_reward_type
        WHEN 'gold' THEN v_coins_to_add := 500; v_item_id := 'frame_gold_weekly'; v_item_name := 'Marco de Oro Semanal'; v_item_icon := '🥇'; v_item_css := 'frame-gold-weekly';
        WHEN 'silver' THEN v_coins_to_add := 250; v_item_id := 'frame_silver_weekly'; v_item_name := 'Marco de Plata Semanal'; v_item_icon := '🥈'; v_item_css := 'frame-silver-weekly';
        WHEN 'bronze' THEN v_coins_to_add := 100; v_item_id := 'frame_bronze_weekly'; v_item_name := 'Marco de Bronce Semanal'; v_item_icon := '🥉'; v_item_css := 'frame-bronze-weekly';
        ELSE v_coins_to_add := 0; v_item_id := NULL;
    END CASE;
    PERFORM set_config('my.internal_call', 'true', true);
    UPDATE public.profiles SET coins = coins + v_coins_to_add WHERE id = v_user_id;
    IF v_item_id IS NOT NULL THEN INSERT INTO public.user_inventory (user_id, item_id, item_name, category, metadata) VALUES (v_user_id, v_item_id, v_item_name, 'cosmetico', jsonb_build_object('icon', v_item_icon, 'css', v_item_css)); END IF;
    UPDATE public.reward_claims SET claimed_at = now() WHERE id = p_claim_id;
    RETURN json_build_object('success', true, 'coins_added', v_coins_to_add, 'item_name', v_item_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
