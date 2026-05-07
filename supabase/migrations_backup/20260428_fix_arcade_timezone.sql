-- 20260428_fix_arcade_timezone.sql
-- Sincroniza el reseteo de Memorama con la medianoche local del usuario

-- 1. Actualizar get_arcade_status para aceptar p_start_of_day
CREATE OR REPLACE FUNCTION public.get_arcade_status(p_start_of_day TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_daily_count INTEGER;
    v_limit INTEGER := 5;
    v_check_start TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('authenticated', false);
    END IF;

    -- Si el cliente envía el inicio de su día, lo usamos
    IF p_start_of_day IS NOT NULL THEN
        v_check_start := p_start_of_day;
    ELSE
        v_check_start := CURRENT_DATE AT TIME ZONE 'UTC';
    END IF;

    SELECT COUNT(*) INTO v_daily_count 
    FROM public.game_logs 
    WHERE user_id = v_user_id 
    AND created_at >= v_check_start;

    RETURN json_build_object(
        'authenticated', true,
        'played_today', v_daily_count,
        'daily_limit', v_limit,
        'remaining', GREATEST(0, v_limit - v_daily_count)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Actualizar record_game_session para aceptar p_start_of_day
CREATE OR REPLACE FUNCTION public.record_game_session(
    p_game_type TEXT, 
    p_score INTEGER, 
    p_reward INTEGER,
    p_start_of_day TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_daily_count INTEGER;
    v_limit INTEGER := 5;
    v_check_start TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Not authenticated');
    END IF;

    IF p_start_of_day IS NOT NULL THEN
        v_check_start := p_start_of_day;
    ELSE
        v_check_start := CURRENT_DATE AT TIME ZONE 'UTC';
    END IF;

    -- Verificar límite
    SELECT COUNT(*) INTO v_daily_count 
    FROM public.game_logs 
    WHERE user_id = v_user_id 
    AND created_at >= v_check_start;

    IF v_daily_count >= v_limit THEN
        RETURN json_build_object('success', false, 'message', 'Daily limit reached');
    END IF;

    -- Insertar log
    INSERT INTO public.game_logs (user_id, game_type, score, coins_awarded)
    VALUES (v_user_id, p_game_type, p_score, p_reward);

    -- Otorgar monedas
    UPDATE public.profiles SET coins = coins + p_reward WHERE id = v_user_id;

    RETURN json_build_object(
        'success', true, 
        'reward', p_reward, 
        'remaining', v_limit - (v_daily_count + 1),
        'new_total_coins', (SELECT coins FROM public.profiles WHERE id = v_user_id)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
