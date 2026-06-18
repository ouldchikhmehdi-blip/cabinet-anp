import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    'Variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY manquantes. ' +
    'Copiez .env.example en .env et renseignez vos clés Supabase.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    persistSession:      true,   // session conservée dans localStorage
    autoRefreshToken:    true,   // renouvellement silencieux du token
    detectSessionInUrl:  true,   // nécessaire pour capturer le lien de récupération de mot de passe (hash #type=recovery)
  },
})
