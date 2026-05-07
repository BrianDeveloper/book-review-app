-- 20260428_add_jokers_to_profile.sql
-- Añade el inventario de comodines al perfil del usuario

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS jokers JSONB DEFAULT '{"5050": 0, "public": 0, "ia": 0}'::jsonb;

-- Asegurar que la columna no sea nula y tenga el formato correcto para usuarios existentes
UPDATE public.profiles 
SET jokers = '{"5050": 0, "public": 0, "ia": 0}'::jsonb 
WHERE jokers IS NULL;
