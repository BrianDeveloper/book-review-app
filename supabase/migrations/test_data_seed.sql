-- ========================================================
-- TEST DATA SEED (DATOS DE PRUEBA)
-- Poblado de base de datos para entorno de test
-- ========================================================

-- 1. Usuarios de Prueba en PROFILES
-- Nota: En un entorno real de Supabase, estos usuarios deben existir primero en AUTH.
-- Pero para pruebas de UI y Ranking, esto funcionará si ya estás logueado con otro usuario
-- o si simplemente quieres ver datos en el panel.
INSERT INTO public.profiles (id, username, avatar_url, coins, xp, level)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Lector_Leyenda', 'https://ui-avatars.com/api/?name=LL&background=gold', 5000, 2500, 10),
    ('00000000-0000-0000-0000-000000000002', 'Bibliotecario_Pro', 'https://ui-avatars.com/api/?name=BP&background=silver', 2500, 1200, 5),
    ('00000000-0000-0000-0000-000000000003', 'Novato_Entusiasta', 'https://ui-avatars.com/api/?name=NE&background=brown', 500, 150, 1)
ON CONFLICT (id) DO NOTHING;

-- 2. Reseñas de Prueba
INSERT INTO public.reviews (user_id, title, author, rating, review_text, fav_quote, recommend, photo_url)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Cien años de soledad', 'Gabriel García Márquez', 5, 'Una obra maestra absoluta de la literatura.', 'Muchos años después, frente al pelotón de fusilamiento...', true, 'https://images-na.ssl-images-amazon.com/images/I/8179uBA8zBL.jpg'),
    ('00000000-0000-0000-0000-000000000002', '1984', 'George Orwell', 4.5, 'Inquietante y relevante incluso hoy.', 'El Gran Hermano te vigila.', true, 'https://images-na.ssl-images-amazon.com/images/I/71kbeSsh9LL.jpg')
ON CONFLICT DO NOTHING;

-- 3. Logs de Juego (Para poblar el Ranking Semanal)
-- Usamos 'now()' para que cuenten para esta semana
INSERT INTO public.game_logs (user_id, game_type, score, coins_awarded, time_spent, created_at)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'global', 2000, 1000, 90, now()),
    ('00000000-0000-0000-0000-000000000002', 'global', 1500, 750, 110, now()),
    ('00000000-0000-0000-0000-000000000003', 'global', 500, 250, 180, now());

-- 4. Preguntas de Trivia de Prueba
INSERT INTO public.trivia_questions (topic, question, options, correct_index, reward)
VALUES 
    ('Literatura', '¿Quién escribió "Don Quijote de la Mancha"?', '["Miguel de Cervantes", "Lope de Vega", "Quevedo", "Góngora"]', 0, 50),
    ('Ciencia Ficción', '¿En qué año se desarrolla la novela "1984"?', '["1948", "1984", "2024", "1999"]', 1, 30)
ON CONFLICT DO NOTHING;

-- 5. Objetos en la Tienda
INSERT INTO public.store_items (id, name, price, category, icon)
VALUES 
    ('frame_vintage', 'Marco Vintage', 1000, 'cosmetico', '📜'),
    ('frame_cyberpunk', 'Marco Cyberpunk', 1500, 'cosmetico', '⚡'),
    ('title_legend', 'Título: Leyenda', 2000, 'titulo', '🏆')
ON CONFLICT (id) DO NOTHING;
