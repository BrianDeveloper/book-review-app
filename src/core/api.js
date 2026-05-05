import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Error: Supabase credentials are missing! Check your environment variables.');
}

export const supabase = (SUPABASE_URL && SUPABASE_KEY) 
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

/**
 * Helper para obtener la instancia de Supabase.
 * En esta arquitectura modular, simplemente exportamos la constante.
 */
export const getSupabase = () => supabase;
