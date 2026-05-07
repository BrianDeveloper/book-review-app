-- 20260428_fix_trivia_rewards.sql
-- Actualiza las recompensas de trivia para que coincidan con el nuevo diseño:
-- Fácil: 10, Media: 25, Difícil: 50

UPDATE public.trivia_questions
SET reward = 25
WHERE reward = 20 OR reward = 25; -- Asegurar 25 para media

UPDATE public.trivia_questions
SET reward = 50
WHERE reward = 40 OR reward = 50; -- Asegurar 50 para difícil

UPDATE public.trivia_questions
SET reward = 10
WHERE reward = 10; -- Asegurar 10 para fácil (por si acaso)
