-- 20260428_arcade_dynamics.sql
-- Sistema de Registro de Juegos, Límites Diarios y Recompensas

-- 1. Tabla de Logs de Juegos
CREATE TABLE IF NOT EXISTS public.game_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL, -- 'memory', 'trivia', etc.
    score INTEGER NOT NULL,  -- Para memorama: número de movimientos
    coins_awarded INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Seguridad RLS
ALTER TABLE public.game_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own game logs" ON public.game_logs;
CREATE POLICY "Users can view their own game logs" 
    ON public.game_logs FOR SELECT 
    USING (auth.uid() = user_id);

-- 3. Función RPC: Obtener estado actual del Arcade (Límites)
CREATE OR REPLACE FUNCTION public.get_arcade_status()
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_daily_count INTEGER;
    v_limit INTEGER := 5; -- Límite global diario
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('authenticated', false);
    END IF;

    SELECT COUNT(*) INTO v_daily_count 
    FROM public.game_logs 
    WHERE user_id = v_user_id 
    AND created_at >= (CURRENT_DATE AT TIME ZONE 'UTC');

    RETURN json_build_object(
        'authenticated', true,
        'played_today', v_daily_count,
        'daily_limit', v_limit,
        'remaining', GREATEST(0, v_limit - v_daily_count)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Función RPC: Registrar sesión de juego y otorgar monedas
CREATE OR REPLACE FUNCTION public.record_game_session(p_game_type TEXT, p_score INTEGER, p_reward INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_daily_count INTEGER;
    v_limit INTEGER := 5;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Not authenticated');
    END IF;

    -- Verificar límite
    SELECT COUNT(*) INTO v_daily_count 
    FROM public.game_logs 
    WHERE user_id = v_user_id 
    AND created_at >= (CURRENT_DATE AT TIME ZONE 'UTC');

    IF v_daily_count >= v_limit THEN
        RETURN json_build_object('success', false, 'message', 'Daily limit reached');
    END IF;

    -- Insertar log
    INSERT INTO public.game_logs (user_id, game_type, score, coins_awarded)
    VALUES (v_user_id, p_game_type, p_score, p_reward);

    -- Otorgar monedas en el perfil
    UPDATE public.profiles 
    SET coins = coins + p_reward 
    WHERE id = v_user_id;

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
