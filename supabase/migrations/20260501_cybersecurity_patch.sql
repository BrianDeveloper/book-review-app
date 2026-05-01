-- Migration: Cybersecurity Fortification Patch
-- This migration enables RLS on profiles and reviews, and adds a trigger to prevent direct manipulation of sensitive stats.

-- 1. Enable RLS on key tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- 2. Profiles Policies
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. THE SHIELD: Trigger to prevent user from adding coins/XP via console
CREATE OR REPLACE FUNCTION public.check_profile_update_security()
RETURNS TRIGGER AS $$
BEGIN
    -- If trying to change coins, XP, Level or unlocked_items...
    IF (OLD.coins IS DISTINCT FROM NEW.coins OR 
        OLD.xp IS DISTINCT FROM NEW.xp OR 
        OLD.level IS DISTINCT FROM NEW.level OR
        OLD.unlocked_items IS DISTINCT FROM NEW.unlocked_items) THEN
        
        -- Allow only if it is a service role, postgres, OR an internal authorized call
        IF (current_setting('role') <> 'service_role' AND current_setting('role') <> 'postgres') THEN
            IF NULLIF(current_setting('my.internal_call', true), '') IS NULL THEN
                RAISE EXCEPTION 'Acceso denegado: No puedes modificar tus estadísticas o dinero directamente. Juega limpio 🧙‍♂️';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_check_profile_update_security ON public.profiles;
CREATE TRIGGER tr_check_profile_update_security
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.check_profile_update_security();

-- 4. REVIEWS SECURITY: Prevent a user from deleting or editing what is not theirs
DROP POLICY IF EXISTS "Anyone can read reviews" ON public.reviews;
CREATE POLICY "Anyone can read reviews" ON public.reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage their own reviews" ON public.reviews;
CREATE POLICY "Users can manage their own reviews" ON public.reviews 
FOR ALL USING (auth.uid() = user_id);

-- 5. SECURE RPC: The only authorized way to update stats from the client
CREATE OR REPLACE FUNCTION public.secure_increment_stats(p_coins_delta INTEGER, p_xp_delta INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_new_coins INTEGER;
    v_new_xp INTEGER;
    v_new_level INTEGER;
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Activar llave maestra para esta transacción
    PERFORM set_config('my.internal_call', 'true', true);

    UPDATE public.profiles 
    SET coins = coins + p_coins_delta,
        xp = xp + p_xp_delta
    WHERE id = v_user_id
    RETURNING coins, xp INTO v_new_coins, v_new_xp;

    -- Level calculation (matches JS logic)
    v_new_level := floor(power(v_new_xp / 100.0, 1/1.5)) + 1;
    
    UPDATE public.profiles 
    SET level = v_new_level 
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'coins', v_new_coins,
        'xp', v_new_xp,
        'level', v_new_level
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Update existing Trivia RPC to bypass the shield
CREATE OR REPLACE FUNCTION public.submit_trivia_answer(
    p_question_id UUID,
    p_selected_index INT,
    p_start_of_day TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID;
    v_correct_index INT;
    v_reward INT;
    v_is_correct BOOLEAN;
    v_answered_today INT;
    v_profile_exists BOOLEAN;
    v_limit_check_start TIMESTAMPTZ;
BEGIN
    -- ACTIVATE INTERNAL KEY
    PERFORM set_config('my.internal_call', 'true', true);

    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'message', 'Error: Usuario no autenticado'); END IF;

    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_user_id) INTO v_profile_exists;
    IF NOT v_profile_exists THEN RETURN json_build_object('success', false, 'message', 'Error: Perfil no encontrado'); END IF;

    IF p_start_of_day IS NOT NULL THEN v_limit_check_start := p_start_of_day;
    ELSE v_limit_check_start := now() - interval '20 hours'; END IF;

    SELECT count(*) INTO v_answered_today FROM public.user_trivia_responses WHERE user_id = v_user_id AND answered_at >= v_limit_check_start;
    IF v_answered_today >= 3 THEN RETURN json_build_object('success', false, 'message', 'Límite diario alcanzado (3 preguntas por día)'); END IF;

    SELECT correct_index, reward INTO v_correct_index, v_reward FROM public.trivia_questions WHERE id = p_question_id;
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'message', 'Error: Pregunta no encontrada'); END IF;

    v_is_correct := (COALESCE(p_selected_index, -1) = v_correct_index);

    INSERT INTO public.user_trivia_responses (user_id, question_id, selected_index, is_correct)
    VALUES (v_user_id, p_question_id, p_selected_index, v_is_correct);

    IF v_is_correct THEN
        UPDATE public.profiles SET coins = coins + v_reward WHERE id = v_user_id;
        RETURN json_build_object(
            'success', true, 
            'is_correct', true, 
            'reward_added', v_reward,
            'new_total_coins', (SELECT coins FROM public.profiles WHERE id = v_user_id)
        );
    ELSE
        RETURN json_build_object(
            'success', true, 
            'is_correct', false, 
            'correct_answer_index', v_correct_index, 
            'reward_added', 0
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', 'Database Error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
