-- 20260506_migrate_cosmetics_to_inventory.sql

DO $$
DECLARE
    r RECORD;
    item_id_val TEXT;
    v_item_name TEXT;
    v_is_equipped BOOLEAN;
BEGIN
    -- 1. Iterar sobre todos los perfiles que tengan items desbloqueados
    FOR r IN SELECT id, unlocked_items, selected_frame, selected_title, selected_skin FROM public.profiles WHERE unlocked_items IS NOT NULL AND jsonb_array_length(unlocked_items) > 0 LOOP
        
        -- 2. Por cada item en el array unlocked_items
        FOR item_id_val IN SELECT jsonb_array_elements_text(r.unlocked_items) LOOP
            
            -- Determinar nombre genérico si no lo conocemos (el frontend lo refinará con el catálogo)
            v_item_name := 'Objeto Migrado (' || item_id_val || ')';
            
            -- Determinar si está equipado actualmente
            v_is_equipped := (item_id_val = r.selected_frame OR item_id_val = r.selected_title OR item_id_val = r.selected_skin);
            
            -- 3. Insertar en user_inventory si no existe ya
            -- Evitamos duplicados basándonos en user_id e item_id
            IF NOT EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = r.id AND item_id = item_id_val) THEN
                INSERT INTO public.user_inventory (user_id, item_id, item_name, category, is_equipped, metadata)
                VALUES (
                    r.id, 
                    item_id_val, 
                    v_item_name, 
                    'cosmetico', 
                    v_is_equipped, 
                    jsonb_build_object('migrated', true)
                );
            END IF;
            
        END LOOP;
    END LOOP;
END $$;
