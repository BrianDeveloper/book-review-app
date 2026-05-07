-- 20260506_rewards_and_inventory.sql
-- 1. Añadir el inventario de objetos exclusivos al perfil
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS inventory JSONB DEFAULT '[]'::jsonb;

-- 2. Tabla para gestionar los reclamos de premios semanales
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

-- 3. Función RPC para reclamar premios
CREATE OR REPLACE FUNCTION public.claim_weekly_reward(p_claim_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_reward_type TEXT;
    v_coins_to_add INTEGER;
    v_item_to_add JSONB;
    v_claimed_at TIMESTAMP WITH TIME ZONE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'message', 'Not authenticated'); END IF;

    -- Obtener info del reclamo
    SELECT reward_type, claimed_at INTO v_reward_type, v_claimed_at 
    FROM public.reward_claims 
    WHERE id = p_claim_id AND user_id = v_user_id;

    IF NOT FOUND THEN RETURN json_build_object('success', false, 'message', 'Claim not found'); END IF;
    IF v_claimed_at IS NOT NULL THEN RETURN json_build_object('success', false, 'message', 'Already claimed'); END IF;

    -- Definir recompensas según tipo
    CASE v_reward_type
        WHEN 'gold' THEN 
            v_coins_to_add := 500;
            v_item_to_add := jsonb_build_object('id', 'frame_gold_weekly', 'name', 'Marco de Oro Semanal', 'type', 'frame', 'duration_days', 7);
        WHEN 'silver' THEN 
            v_coins_to_add := 250;
            v_item_to_add := jsonb_build_object('id', 'frame_silver_weekly', 'name', 'Marco de Plata Semanal', 'type', 'frame', 'duration_days', 7);
        WHEN 'bronze' THEN 
            v_coins_to_add := 100;
            v_item_to_add := jsonb_build_object('id', 'frame_bronze_weekly', 'name', 'Marco de Bronce Semanal', 'type', 'frame', 'duration_days', 7);
        ELSE
            v_coins_to_add := 0;
            v_item_to_add := NULL;
    END CASE;

    -- Activar llave maestra interna
    PERFORM set_config('my.internal_call', 'true', true);

    -- Actualizar perfil: Monedas e Inventario
    UPDATE public.profiles 
    SET coins = coins + v_coins_to_add,
        inventory = inventory || jsonb_build_array(v_item_to_add)
    WHERE id = v_user_id;

    -- Marcar como reclamado
    UPDATE public.reward_claims 
    SET claimed_at = now() 
    WHERE id = p_claim_id;

    RETURN json_build_object(
        'success', true, 
        'coins_added', v_coins_to_add, 
        'item_added', v_item_to_add,
        'new_total_coins', (SELECT coins FROM public.profiles WHERE id = v_user_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
