-- 20260428_fix_rpc_timezone_v2.sql
-- Actualiza la función RPC para que acepte el inicio del día del cliente
-- Esto garantiza que el contador se resetee exactamente a la medianoche del usuario.

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
    -- 1. Obtener usuario actual
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Error: Usuario no autenticado');
    END IF;

    -- 2. Verificar existencia de perfil
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_user_id) INTO v_profile_exists;
    IF NOT v_profile_exists THEN
        RETURN json_build_object('success', false, 'message', 'Error: Perfil no encontrado');
    END IF;

    -- 3. Determinar el inicio del día para el conteo
    -- Si el cliente envía uno, lo usamos. Si no, usamos las últimas 20 horas como fallback.
    IF p_start_of_day IS NOT NULL THEN
        v_limit_check_start := p_start_of_day;
    ELSE
        v_limit_check_start := now() - interval '20 hours';
    END IF;

    -- 4. Verificar límite diario
    SELECT count(*) INTO v_answered_today
    FROM public.user_trivia_responses
    WHERE user_id = v_user_id 
    AND answered_at >= v_limit_check_start;

    IF v_answered_today >= 3 THEN
        RETURN json_build_object('success', false, 'message', 'Límite diario alcanzado (3 preguntas por día)');
    END IF;

    -- 5. Obtener pregunta
    SELECT correct_index, reward INTO v_correct_index, v_reward
    FROM public.trivia_questions
    WHERE id = p_question_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Error: Pregunta no encontrada');
    END IF;

    -- 6. Procesar respuesta
    v_is_correct := (COALESCE(p_selected_index, -1) = v_correct_index);

    -- 7. Registrar respuesta
    INSERT INTO public.user_trivia_responses (user_id, question_id, selected_index, is_correct)
    VALUES (v_user_id, p_question_id, p_selected_index, v_is_correct);

    -- 8. Otorgar recompensas
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
