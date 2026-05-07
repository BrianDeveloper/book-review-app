-- 20260506_game_persistence.sql
-- Añade soporte para persistencia de estado de juegos en el servidor

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS game_states JSONB DEFAULT '{}'::jsonb;

-- Comentario para el usuario:
-- Ejecuta este SQL en tu editor de Supabase para habilitar la persistencia entre dispositivos.
