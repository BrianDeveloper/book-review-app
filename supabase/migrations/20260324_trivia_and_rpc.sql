-- Phase 2: Trivia System and RPC
-- Run this in your Supabase SQL Editor

-- 1. Create Trivia Questions table
CREATE TABLE IF NOT EXISTS public.trivia_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic TEXT NOT NULL,
    question TEXT NOT NULL,
    options JSONB NOT NULL, -- Array of strings
    correct_index INTEGER NOT NULL,
    reward INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Create User Trivia Responses table
CREATE TABLE IF NOT EXISTS public.user_trivia_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    question_id UUID REFERENCES public.trivia_questions(id) ON DELETE CASCADE NOT NULL,
    selected_index INTEGER NOT NULL,
    is_correct BOOLEAN NOT NULL,
    answered_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Ensure columns exist (in case table already existed from previous session)
ALTER TABLE public.user_trivia_responses ADD COLUMN IF NOT EXISTS selected_index INTEGER;
ALTER TABLE public.user_trivia_responses ADD COLUMN IF NOT EXISTS is_correct BOOLEAN DEFAULT false;
ALTER TABLE public.user_trivia_responses ALTER COLUMN is_correct SET NOT NULL;
ALTER TABLE public.user_trivia_responses ALTER COLUMN selected_index SET NOT NULL;

-- 3. Enable RLS
ALTER TABLE public.trivia_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trivia_responses ENABLE ROW LEVEL SECURITY;

-- 4. Policies
DROP POLICY IF EXISTS "Everyone can read trivia questions" ON public.trivia_questions;
CREATE POLICY "Everyone can read trivia questions" ON public.trivia_questions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can read their own responses" ON public.user_trivia_responses;
CREATE POLICY "Users can read their own responses" ON public.user_trivia_responses FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own responses" ON public.user_trivia_responses;
CREATE POLICY "Users can insert their own responses" ON public.user_trivia_responses FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. RPC: Submit Trivia Answer (to prevent client-side cheating and handle rewards)
DROP FUNCTION IF EXISTS public.submit_trivia_answer(UUID, INTEGER);
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

    -- 7. Otorgar recompensas si es correcto
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
