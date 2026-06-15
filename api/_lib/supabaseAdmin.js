import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase avec la clé service_role.
 * Cette clé IGNORE la RLS — à utiliser uniquement dans les fonctions serverless.
 * Elle ne doit JAMAIS se retrouver dans le code front (pas de préfixe VITE_).
 */
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
)
