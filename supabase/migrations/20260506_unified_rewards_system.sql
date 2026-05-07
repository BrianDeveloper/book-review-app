-- ========================================================
-- MASTER MIGRATION: REWARDS AND ROBUST INVENTORY SYSTEM
-- Fecha: 2026-05-06
-- ========================================================

-- 1. LIMPIEZA DE COLUMNAS OBSOLETAS (Si existen)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS inventory;

-- 2. TABLA DE INVENTARIO ROBUSTO
-- Maneja objetos, cosméticos y materiales de forma escalable
CREATE TABLE IF NOT EXISTS public.user_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    category TEXT NOT NULL, -- 'herramienta', 'material', 'cosmetico', 'recompensa'
    quantity INTEGER DEFAULT 1,
    is_equipped BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb, -- Almacena icono, CSS, durabilidad, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS para seguridad
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios pueden ver su propio inventario" 
    ON public.user_inventory FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "El sistema puede gestionar el inventario" 
    ON public.user_inventory FOR ALL 
    USING (auth.uid() = user_id);

-- 3. TABLA DE RECLAMOS DE PREMIOS SEMANALES
-- Gestiona qué premios ha ganado el usuario y si ya han sido reclamados
CREATE TABLE IF NOT EXISTS public.reward_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL,
    year INTEGER NOT NULL,
    game_type TEXT NOT NULL, -- 'global', 'memory', 'trivia'
    reward_type TEXT NOT NULL, -- 'gold', 'silver', 'bronze'
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, week_number, year, game_type)
);

-- Habilitar RLS para reward_claims
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver sus reclamos"
    ON public.reward_claims FOR SELECT
    USING (auth.uid() = user_id);

-- 4. FUNCIÓN PARA OBTENER EL RANKING SEMANAL (Motor de la Arcade)
DROP FUNCTION IF EXISTS public.get_weekly_arcade_ranking(TEXT);

CREATE OR REPLACE FUNCTION public.get_weekly_arcade_ranking(p_game_type TEXT DEFAULT 'global')
RETURNS TABLE (
    user_id UUID,
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
        p.id as user_id,
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

-- 5. FUNCIÓN UNIFICADA PARA RECLAMAR PREMIOS
-- Procesa monedas, objetos y marca el reclamo como finalizado
DROP FUNCTION IF EXISTS public.claim_weekly_reward(UUID);

CREATE OR REPLACE FUNCTION public.claim_weekly_reward(p_claim_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_reward_type TEXT;
    v_coins_to_add INTEGER;
    v_item_id TEXT;
    v_item_name TEXT;
    v_item_icon TEXT;
    v_item_css TEXT;
    v_claimed_at TIMESTAMP WITH TIME ZONE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'message', 'No autenticado'); END IF;

    -- 1. Validar existencia y estado del reclamo
    SELECT reward_type, claimed_at INTO v_reward_type, v_claimed_at 
    FROM public.reward_claims 
    WHERE id = p_claim_id AND user_id = v_user_id;

    IF NOT FOUND THEN RETURN json_build_object('success', false, 'message', 'Reclamo no encontrado'); END IF;
    IF v_claimed_at IS NOT NULL THEN RETURN json_build_object('success', false, 'message', 'Premio ya reclamado anteriormente'); END IF;

    -- 2. Definir Recompensas según Medalla
    CASE v_reward_type
        WHEN 'gold' THEN 
            v_coins_to_add := 500; v_item_id := 'frame_gold_weekly'; v_item_name := 'Marco de Oro Semanal'; v_item_icon := '🥇'; v_item_css := 'frame-gold-weekly';
        WHEN 'silver' THEN 
            v_coins_to_add := 250; v_item_id := 'frame_silver_weekly'; v_item_name := 'Marco de Plata Semanal'; v_item_icon := '🥈'; v_item_css := 'frame-silver-weekly';
        WHEN 'bronze' THEN 
            v_coins_to_add := 100; v_item_id := 'frame_bronze_weekly'; v_item_name := 'Marco de Bronce Semanal'; v_item_icon := '🥉'; v_item_css := 'frame-bronze-weekly';
        ELSE
            v_coins_to_add := 0; v_item_id := NULL;
    END CASE;

    -- Permitir actualizaciones internas
    PERFORM set_config('my.internal_call', 'true', true);

    -- 3. Acreditar Monedas
    UPDATE public.profiles SET coins = coins + v_coins_to_add WHERE id = v_user_id;

    -- 4. Entregar Objeto al Inventario (si aplica)
    IF v_item_id IS NOT NULL THEN
        INSERT INTO public.user_inventory (user_id, item_id, item_name, category, metadata)
        VALUES (v_user_id, v_item_id, v_item_name, 'cosmetico', jsonb_build_object('icon', v_item_icon, 'css', v_item_css, 'duration_days', 7));
    END IF;

    -- 5. Finalizar Reclamo
    UPDATE public.reward_claims SET claimed_at = now() WHERE id = p_claim_id;

    RETURN json_build_object(
        'success', true, 
        'coins_added', v_coins_to_add, 
        'item_name', v_item_name,
        'new_total_coins', (SELECT coins FROM public.profiles WHERE id = v_user_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
