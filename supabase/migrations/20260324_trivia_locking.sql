-- Migration: Trivia Locking Mechanism
-- This ensures questions are non-skippable and unique for each user session.

-- 1. Table to store the currently assigned (but not yet answered) question
CREATE TABLE IF NOT EXISTS public.user_trivia_state (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    current_question_id UUID REFERENCES public.trivia_questions(id),
    slot_index INTEGER DEFAULT 0, -- 0, 1, or 2 (which question of the day)
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. RLS
ALTER TABLE public.user_trivia_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own trivia state" ON public.user_trivia_state;
CREATE POLICY "Users can manage their own trivia state" ON public.user_trivia_state
    FOR ALL USING (auth.uid() = user_id);

-- 3. Update the submit_trivia_answer RPC to clear the state upon successful submission
CREATE OR REPLACE FUNCTION public.submit_trivia_answer(p_question_id UUID, p_selected_index INTEGER)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID;
    v_correct_index INTEGER;
    v_reward INTEGER;
    v_is_correct BOOLEAN;
    v_answered_today INTEGER;
    v_profile_exists BOOLEAN;
BEGIN
    -- 1. Verificar autenticación
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Error: Usuario no autenticado en Supabase');
    END IF;

    -- 2. Verificar existencia de perfil
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_user_id) INTO v_profile_exists;
    IF NOT v_profile_exists THEN
        RETURN json_build_object('success', false, 'message', 'Error: Perfil de usuario no encontrado');
    END IF;

    -- 3. Verificar límite diario (3 preguntas)
    SELECT count(*) INTO v_answered_today
    FROM public.user_trivia_responses
    WHERE user_id = v_user_id AND answered_at >= CURRENT_DATE;

    IF v_answered_today >= 3 THEN
        RETURN json_build_object('success', false, 'message', 'Límite diario alcanzado (3 preguntas por día)');
    END IF;

    -- 4. Obtener pregunta y validar
    SELECT correct_index, reward INTO v_correct_index, v_reward
    FROM public.trivia_questions
    WHERE id = p_question_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Error: Pregunta no encontrada (ID inválido)');
    END IF;

    -- 5. Procesar respuesta
    v_is_correct := (COALESCE(p_selected_index, -1) = v_correct_index);

    -- 6. Registrar respuesta
    INSERT INTO public.user_trivia_responses (user_id, question_id, selected_index, is_correct)
    VALUES (v_user_id, p_question_id, p_selected_index, v_is_correct);

    -- 7. IMPORTANTE: Limpiar el estado de "pregunta activa" para este usuario
    DELETE FROM public.user_trivia_state WHERE user_id = v_user_id;

    -- 8. Otorgar recompensas si es correcto
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
