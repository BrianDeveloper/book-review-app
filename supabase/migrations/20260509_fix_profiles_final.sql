-- MIGRATION: Ensure profiles schema and fix RLS
-- Date: 2026-05-09

-- 1. Asegurar que la tabla existe y tiene todas las columnas necesarias
DO $$ 
BEGIN
    -- Verificar y añadir columnas si no existen (evita errores si ya están)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='show_presence') THEN
        ALTER TABLE public.profiles ADD COLUMN show_presence BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='game_states') THEN
        ALTER TABLE public.profiles ADD COLUMN game_states JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='selected_frame') THEN
        ALTER TABLE public.profiles ADD COLUMN selected_frame TEXT DEFAULT 'none';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='selected_title') THEN
        ALTER TABLE public.profiles ADD COLUMN selected_title TEXT DEFAULT 'none';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='selected_skin') THEN
        ALTER TABLE public.profiles ADD COLUMN selected_skin TEXT DEFAULT 'none';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='role') THEN
        ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'user';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='jokers') THEN
        ALTER TABLE public.profiles ADD COLUMN jokers JSONB DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='last_seen') THEN
        ALTER TABLE public.profiles ADD COLUMN last_seen TIMESTAMP WITH TIME ZONE DEFAULT now();
    END IF;
END $$;

-- 2. Asegurar RLS habilitado
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Limpiar políticas antiguas para evitar conflictos
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.profiles;
DROP POLICY IF EXISTS "Enable update for users based on id" ON public.profiles;

-- 4. Crear políticas definitivas y robustas
-- SELECT: Cualquiera puede ver perfiles (necesario para ránkings y amigos)
CREATE POLICY "Public profiles are viewable by everyone" 
    ON public.profiles FOR SELECT 
    USING (true);

-- INSERT: Un usuario solo puede insertar su propio perfil
-- Importante: Usamos (auth.uid() = id) para asegurar que el ID coincida con el usuario autenticado
CREATE POLICY "Users can insert their own profile" 
    ON public.profiles FOR INSERT 
    WITH CHECK (auth.uid() = id);

-- UPDATE: Un usuario solo puede actualizar su propio perfil
CREATE POLICY "Users can update their own profile" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 5. Otorgar permisos básicos a roles de Supabase (por si acaso)
GRANT ALL ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- 6. Asegurar que las otras tablas mencionadas en el error tengan RLS básico
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" 
    ON public.notifications FOR SELECT 
    USING (auth.uid() = user_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own friendships" ON public.friendships;
CREATE POLICY "Users can manage their own friendships" 
    ON public.friendships FOR ALL 
    USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
