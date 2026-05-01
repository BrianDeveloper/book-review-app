import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ctstufucbrtqqpakbjjw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0c3R1ZnVjYnJ0cXFwYWtiamp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzQ3NjQsImV4cCI6MjA4NzIxMDc2NH0.8k8WwEI993MItN9xJj52G4M41z11oMCTV68FWpbLYTc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Helper para obtener la instancia de Supabase.
 * En esta arquitectura modular, simplemente exportamos la constante.
 */
export const getSupabase = () => supabase;
