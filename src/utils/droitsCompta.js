// Qui peut ajouter les consultations Doctolib et tenir « Règles virements » (import du relevé,
// règles, classement des lignes) : l'admin et le rôle Compta (supabase/role_compta.sql).
export const peutGererCompta = (profile) =>
  profile?.role === 'admin' || (profile?.is_compta === true && profile?.is_iade !== true)
