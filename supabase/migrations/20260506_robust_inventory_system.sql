-- 20260506_robust_inventory_system.sql
-- 1. Eliminar la columna provisional del perfil para mantener limpieza
ALTER TABLE public.profiles DROP COLUMN IF EXISTS inventory;

-- 2. Crear la tabla de inventario independiente y robusta
CREATE TABLE IF NOT EXISTS public.user_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    category TEXT NOT NULL, -- 'herramienta', 'material', 'consumible', 'cosmetico', 'recompensa'
    quantity INTEGER DEFAULT 1,
    is_equipped BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb, -- Para durabilidad, nivel, rareza, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own inventory" 
    ON public.user_inventory FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "System can manage inventory" 
    ON public.user_inventory FOR ALL 
    USING (auth.uid() = user_id);

-- 3. Actualizar la función de reclamo para usar la nueva tabla
CREATE OR REPLACE FUNCTION public.claim_weekly_reward(p_claim_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_reward_type TEXT;
    v_coins_to_add INTEGER;
    v_item_id TEXT;
    v_item_name TEXT;
    v_claimed_at TIMESTAMP WITH TIME ZONE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'message', 'Not authenticated'); END IF;

    SELECT reward_type, claimed_at INTO v_reward_type, v_claimed_at 
    FROM public.reward_claims 
    WHERE id = p_claim_id AND user_id = v_user_id;

    IF NOT FOUND THEN RETURN json_build_object('success', false, 'message', 'Claim not found'); END IF;
    IF v_claimed_at IS NOT NULL THEN RETURN json_build_object('success', false, 'message', 'Already claimed'); END IF;

    CASE v_reward_type
        WHEN 'gold' THEN 
            v_coins_to_add := 500; v_item_id := 'frame_gold_weekly'; v_item_name := 'Marco de Oro Semanal';
        WHEN 'silver' THEN 
            v_coins_to_add := 250; v_item_id := 'frame_silver_weekly'; v_item_name := 'Marco de Plata Semanal';
        WHEN 'bronze' THEN 
            v_coins_to_add := 100; v_item_id := 'frame_bronze_weekly'; v_item_name := 'Marco de Bronce Semanal';
        ELSE
            v_coins_to_add := 0; v_item_id := NULL;
    END CASE;

    PERFORM set_config('my.internal_call', 'true', true);

    -- 1. Añadir monedas
    UPDATE public.profiles SET coins = coins + v_coins_to_add WHERE id = v_user_id;

    -- 2. Añadir al inventario independiente (con lógica de apilamiento si fuera material)
    INSERT INTO public.user_inventory (user_id, item_id, item_name, category, metadata)
    VALUES (v_user_id, v_item_id, v_item_name, 'cosmetico', jsonb_build_object('duration_days', 7))
    ON CONFLICT (id) DO NOTHING; -- En este caso son únicos por ID de fila

    -- 3. Marcar como reclamado
    UPDATE public.reward_claims SET claimed_at = now() WHERE id = p_claim_id;

    RETURN json_build_object(
        'success', true, 
        'coins_added', v_coins_to_add, 
        'item_name', v_item_name,
        'new_total_coins', (SELECT coins FROM public.profiles WHERE id = v_user_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
