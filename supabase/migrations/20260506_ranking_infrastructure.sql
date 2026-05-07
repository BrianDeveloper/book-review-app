-- 20260506_ranking_infrastructure.sql
-- 1. Añadir columna de tiempo a los logs de juego
ALTER TABLE public.game_logs 
ADD COLUMN IF NOT EXISTS time_spent INTEGER DEFAULT 0; -- en segundos

-- 2. Función RPC actualizada para registrar sesión con tiempo
DROP FUNCTION IF EXISTS public.record_game_session(TEXT, INTEGER, INTEGER, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION public.record_game_session(
    p_game_type TEXT, 
    p_score INTEGER, 
    p_reward INTEGER,
    p_time_spent INTEGER DEFAULT 0,
    p_start_of_day TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_daily_count INTEGER;
    v_check_start TIMESTAMPTZ;
BEGIN
    PERFORM set_config('my.internal_call', 'true', true);
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'message', 'Not authenticated'); END IF;
    
    IF p_start_of_day IS NOT NULL THEN v_check_start := p_start_of_day;
    ELSE v_check_start := CURRENT_DATE AT TIME ZONE 'UTC'; END IF;
    
    SELECT COUNT(*) INTO v_daily_count FROM public.game_logs WHERE user_id = v_user_id AND created_at >= v_check_start;
    IF v_daily_count >= 5 THEN RETURN json_build_object('success', false, 'message', 'Limit reached'); END IF;
    
    INSERT INTO public.game_logs (user_id, game_type, score, coins_awarded, time_spent) 
    VALUES (v_user_id, p_game_type, p_score, p_reward, p_time_spent);
    
    UPDATE public.profiles SET coins = coins + p_reward WHERE id = v_user_id;
    
    RETURN json_build_object('success', true, 'reward', p_reward, 'new_total_coins', (SELECT coins FROM public.profiles WHERE id = v_user_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Función RPC para obtener el Ranking Semanal
CREATE OR REPLACE FUNCTION public.get_weekly_arcade_ranking(p_game_type TEXT DEFAULT 'global')
RETURNS TABLE (
    rank BIGINT,
    username TEXT,
    avatar_url TEXT,
    total_coins BIGINT,
    best_time INTEGER,
    games_played BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        RANK() OVER (ORDER BY SUM(gl.coins_awarded) DESC, MIN(gl.time_spent) ASC) as rank,
        p.username,
        p.avatar_url,
        SUM(gl.coins_awarded)::BIGINT as total_coins,
        MIN(gl.time_spent)::INTEGER as best_time,
        COUNT(gl.id)::BIGINT as games_played
    FROM public.game_logs gl
    JOIN public.profiles p ON gl.user_id = p.id
    WHERE gl.created_at >= date_trunc('week', now())
    AND (p_game_type = 'global' OR gl.game_type = p_game_type)
    GROUP BY p.id
    ORDER BY total_coins DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
