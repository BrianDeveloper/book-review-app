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
        
        -- ...allow only if it comes from the system (service_role / rpc with security definer)
        IF (current_setting('role') <> 'service_role' AND current_setting('role') <> 'postgres') THEN
            RAISE EXCEPTION 'Acceso denegado: No puedes modificar tus estadísticas o dinero directamente. Juega limpio 🧙‍♂️';
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
-- This function is SECURITY DEFINER, meaning it bypasses RLS and the trigger above
-- because it runs as the database owner.
CREATE OR REPLACE FUNCTION public.secure_increment_stats(p_coins_delta INTEGER, p_xp_delta INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_new_coins INTEGER;
    v_new_xp INTEGER;
    v_new_level INTEGER;
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

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
