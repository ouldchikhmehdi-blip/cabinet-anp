# CLAUDE.md — Dashboard financier SARM

> Fichier de contexte pour Claude Code. Le but : donner à l'assistant tout le contexte du projet pour qu'il produise du code prêt à coller et des docs claires, sans tout réexpliquer à chaque session.
>
> **Docs de référence à lire avant de toucher l'auth ou la DB : `AUTH.md` (setup + tests complets) et `supabase/schema.sql` (schéma + RLS). Elles font foi.**
>
> **Le site a deux parties indépendantes : le _dashboard financier_ (décrit ci-dessous) et le _planning_ (aide à la fabrication du planning d'anesthésie). Avant toute intervention sur le planning, lire `PLANNING.md` à la racine — il fait foi pour ce module.**
>
> **Onglet _Consultations_ → tout est dans `CONSULTATIONS.md` (racine), qui fait foi : le lire avant toute intervention sur les consultations. Ses données sont _réelles_ (Doctolib 2022→2026).**

---

## 1. Présentation du projet

Tableau de bord financier privé pour **SARM** (Service Anesthésie Réanimation Millénaire), cabinet d'anesthésie-réanimation organisé en **8 associés à parts égales**.

- **Dossier / repo** : `cabinet-anp`
- **Hébergement** : Vercel (`sarm-dashboard.vercel.app`) — ancien domaine `cabinet-anp-b32k.vercel.app` encore actif
- **Dev** : VS Code, en local (`http://localhost:5173`)
- **Public** : strictement les 8 associés. **Accès sur invitation seulement, aucune inscription publique.**

### Pages du dashboard (`src/pages/`)
- `VueGlobale.jsx` — Vue globale
- `ChiffreAffaires.jsx` — Chiffre d'affaires
- `Consultations.jsx` — Consultations
- `Depenses.jsx` — Dépenses
- `ReglesVirements.jsx` — Règles virements
- `RemplacantsIADE.jsx` — Remplaçants IADE
- `RemplacantsMAR.jsx` — Remplaçants MAR
- `Retrocessions.jsx` — Rétrocessions
- `SalariesCDI.jsx` — Salariés CDI
- `Tresorerie.jsx` — Trésorerie
- `AdminUsers.jsx` — Gestion des accès (entrée **« Comptes »** dans la sidebar, **admins uniquement**)

Fonctionnalités transverses : **filtres par période** et **comparaison année vs année**.

---

## 2. Stack technique (figée)

### Frontend
- **React 19 + Vite** — SPA, **JSX sans TypeScript**
- **Recharts** — graphiques · **Lucide React** — icônes
- **CSS inline + variables CSS** — pas de framework CSS (ni Tailwind, ni autre)

### Auth & DB
- **Supabase Auth** — email/password + **TOTP 2FA obligatoire** (AAL2)
- **Supabase PostgreSQL** — tables `profiles` + `invitations`, **RLS** (schéma : `supabase/schema.sql`)

### Backend / API
- **Vercel Functions** (`/api`) pour les opérations sensibles, avec clé `service_role` côté serveur :
  `/api/invite` · `/api/accept` · `/api/promote` · `/api/revoke`
- **Resend** — envoi des e-mails d'invitation

### Hébergement
- **Vercel** — front + fonctions serverless (`vercel.json`)
- **Accès MCP Vercel** (Claude Code) : serveur déclaré dans `.mcp.json` (`https://mcp.vercel.com`, OAuth, sans secret committé). Claude peut donc lire/agir sur Vercel (déploiements, logs de build/runtime, projets). Équipe **« SARM's projects »** `team_I6GzlV55DLnD2JuWePgCpOlf` · projet **`sarm-dashboard`** `prj_qiWMciweUPN567QPSXM5wU1ig69v` (le projet actif ; `cabinet-anp` `prj_sya4JWd19z4wIC5zpH1gDSuOtWbV` est l'ancien). L'auth OAuth est locale à la machine (à refaire si la session MCP se déconnecte).

---

## 3. Arborescence du projet

```
cabinet-anp/
├── .claude/                      # config Claude Code
├── api/                          # Vercel Functions : invite / accept / promote / revoke
├── dist/                         # build (généré)
├── public/
├── src/
│   ├── assets/
│   ├── auth/                     # logique d'auth (Supabase, MFA, gardes de route)
│   ├── components/
│   │   ├── BoutonExport.jsx
│   │   ├── GestionPraticiens.jsx
│   │   ├── ImportConsultations.jsx
│   │   ├── KpiCard.jsx
│   │   ├── PeriodeFilter.jsx
│   │   ├── SelecteurCategorie.jsx
│   │   └── Sidebar.jsx
│   ├── data/                     # ⚠️ DONNÉES FICTIVES uniquement
│   │   ├── categories.js
│   │   ├── consultations.js
│   │   ├── consultationsReglesDefaut.js
│   │   └── mockData.js
│   ├── lib/                      # client Supabase, utilitaires
│   ├── pages/                    # voir §1
│   ├── utils/
│   ├── App.jsx · App.css · index.css · main.jsx
├── supabase/
│   └── schema.sql                # schéma DB + triggers + RLS
├── .env                          # secrets locaux (NON committé) — modèle : .env.example
├── AUTH.md                       # guide setup + tests de l'authentification
├── CLAUDE.md                     # ce fichier
├── vercel.json · vite.config.js · eslint.config.js · index.html · README.md
└── package.json
```

---

## 4. Règle critique sur les données — À NE JAMAIS ENFREINDRE

- Données financières **aujourd'hui fictives**, dans `src/data/` (`mockData.js`, etc.). Pas encore en base.
- Les **vraies données = CSV de comptes bancaires**. **JAMAIS collées dans Claude / Claude Code**, ni dans un chat, un prompt ou un commit public.
- Données réelles : uniquement via le backend sécurisé (Supabase Storage + PostgreSQL), jamais via l'IA.
- Besoin d'un exemple de structure CSV → **données factices anonymisées** seulement.
- ⚠️ **Les mock data sont actuellement dans le bundle JS** et téléchargeables sans auth. Protection intérimaire en place : **Vercel Deployment Protection (mot de passe HTTP Basic)** sur tout le site, à désactiver une fois les données réelles en base derrière RLS.

---

## 5. Modèle de données & sécurité Supabase

Schéma de référence : **`supabase/schema.sql`**.

**Enums**
- `user_role` : `admin` | `user` (`user` = lecture seule)
- `user_status` : `active` | `disabled`

**Table `profiles`** (1 ligne par `auth.users`)
- `id` (uuid, FK `auth.users`, `on delete cascade`), `email`, `role` (défaut `user`), `status` (défaut `active`), `created_at`, `updated_at`
- Index sur `role` et `status` · trigger `touch_updated_at` qui met à jour `updated_at`
- **Création gérée par trigger** `handle_new_user` (voir plus bas) — **pas d'INSERT/DELETE client**

**Table `invitations`**
- `token_hash` : **seul le hash est stocké**, jamais le token brut · `expires_at` (now()+48h, posé par le serverless) · `used_at` (non null ⇒ consommée → **usage unique**) · `invited_by`
- Index unique partiel : **au plus une invitation active par e-mail** (`where used_at is null`)
- **Aucune écriture client** : toutes les écritures passent par le `service_role` dans les fonctions `/api`

**RLS (activée sur les deux tables)**
- `is_admin()` : fonction **`SECURITY DEFINER`** (bypass RLS pour éviter la récursion), réservée à `authenticated` ; utilisée dans les policies au lieu d'une sous-requête directe
- `profiles` SELECT : sa propre ligne **ou** admin · `profiles` UPDATE : **admins uniquement** (défense en profondeur ; les vraies opérations passent par le `service_role` qui ignore la RLS)
- `invitations` SELECT : **admins uniquement** (écran d'audit)

**Sécurité du rôle (anti-élévation de privilèges)**
- Le rôle est lu dans `raw_user_meta_data.role`, **posé par le serverless** lors de `admin.createUser`. Un client **ne peut pas** créer un `auth.users` sans `service_role`, donc **ne peut pas s'auto-attribuer un rôle**. Défaut : `user`.

**Premier admin** : créé **manuellement** (Auth → Users, « Auto Confirm User »), puis en SQL :
`update public.profiles set role='admin' where email='...';` — TOTP enrôlé à la 1ʳᵉ connexion.

---

## 6. Flux d'authentification (résumé)

```
Front (React + Vite)
├─ supabase.auth.signInWithPassword()   → Supabase Auth (JWT)
├─ supabase.auth.mfa.verify()           → TOTP obligatoire (AAL2)
├─ supabase.from('profiles').select()   → DB + RLS (JWT requis)
├─ POST /api/invite   → Vercel Function ┐
├─ POST /api/accept   → Vercel Function │  service_role,
├─ POST /api/promote  → Vercel Function │  jamais dans le front
└─ POST /api/revoke   → Vercel Function ┘
```

- Connexion → si pas de TOTP enrôlé, **écran d'enrôlement QR code** → app authenticator → code 6 chiffres → dashboard.
- `revoke` coupe les sessions **instantanément** (redirection login).
- Détails complets (setup Supabase, Resend, env, scénarios de test, curl) : **`AUTH.md`**.

---

## 7. Variables d'environnement

Modèle dans `.env.example`. Ne **jamais** committer `.env`.

| Variable | Côté | Note |
|---|---|---|
| `VITE_SUPABASE_URL` | front (build) | Project URL Supabase |
| `VITE_SUPABASE_ANON_KEY` | front (build) | anon public |
| `VITE_APP_URL` | front (build) | URL du site (prod) |
| `SUPABASE_URL` | serveur | sans préfixe `VITE_` |
| `SUPABASE_SERVICE_ROLE_KEY` | serveur | **secret — jamais exposé** |
| `RESEND_API_KEY` | serveur | secret |
| `INVITE_FROM_EMAIL` | serveur | domaine vérifié Resend |

Après ajout/modif des variables sur Vercel → **Redeploy** (le build relit les variables).

---

## 8. Conventions de livraison

- Code **prêt à coller**, avec **chemin exact** (`src/pages/...`, `src/auth/...`, `api/...`).
- Respecter la stack : **React 19 + Vite, JSX sans TypeScript, CSS inline + variables CSS** (pas de Tailwind / Next / TS sans validation).
- **Réutiliser les composants existants** (`KpiCard`, `PeriodeFilter`, `Sidebar`…) plutôt que d'en recréer.
- Jamais de secret dans le code front ou un commit ; `service_role` et `RESEND_API_KEY` restent côté serveur (`/api`).
- Changements **incrémentaux et testables** ; fournir une **doc claire** (étapes, env, commandes).
- **Qualité du code — lint toujours propre.** `npm run lint` doit rester **à zéro problème** (zéro erreur, zéro avertissement). Toute intervention laisse le lint vert : corriger ses propres signalements avant de livrer, et ne jamais introduire de nouvelle erreur/avertissement. Si un cas est intentionnel et légitime, le neutraliser par un `// eslint-disable-next-line <règle>` **ciblé et commenté** (jamais de désactivation globale). `npm run build` doit aussi passer.

---

## 9. État d'avancement

> Scaffolding présent ; vérifier `AUTH.md` + `schema.sql` pour l'état réel et ce qui reste à brancher.

- [x] Dashboard complet (toutes pages, filtres, comparaison annuelle) — données fictives `src/data/`
- [x] Stack figée + scaffolding auth (`src/auth/`, `src/lib/`, `api/`, `schema.sql`, `AdminUsers.jsx`, `AUTH.md`)
- [x] Architecture sécurité définie : invitation-only, TOTP AAL2, service_role côté serveur, RLS
- [x] Schéma SQL prêt (`supabase/schema.sql`) : enums, triggers, `is_admin()`, policies
- [ ] Schéma **exécuté** dans un projet Supabase (tables `profiles`/`invitations` visibles + RLS active)
- [ ] Auth de bout en bout testée (login → TOTP → dashboard)
- [ ] Vercel Functions opérationnelles (`invite`/`accept`/`promote`/`revoke`)
- [ ] **Resend configuré** (clé + domaine vérifié)
- [ ] **Déploiement Vercel** + variables d'env + protection mot de passe intérimaire
- [ ] **Migration `src/data/*` (mock) → tables Supabase** + RLS avec exigence **AAL2** pour les données sensibles
- [ ] Suppression de la protection intérimaire Vercel une fois les données en base

---

## 10. Rappels pour l'assistant

- Répondre en **français**.
- Ne jamais demander de coller des données bancaires réelles.
- Sécurité **toujours côté serveur** (RLS + Vercel Functions), jamais uniquement front.
- Lire `AUTH.md` et `supabase/schema.sql` avant de toucher à l'auth ou à la DB.
- Rôles : `admin` (accès complet) / `user` (lecture seule).
- Rester dans la stack figée ; toute déviation se propose et se valide, ne s'impose pas.
- **Laisser le lint vert** : `npm run lint` à **0 problème** après chaque intervention (cf. §8).

---

## 11. Méthode de travail et communication

1. **Poser des questions, ne pas présumer.** Si quelque chose n'est pas clair, demander **avant d'écrire la moindre ligne**. Ne jamais faire de suppositions tacites sur l'intention, l'architecture ou les exigences. En cas d'exécution sans surveillance, choisir l'interprétation la plus raisonnable, poursuivre et **noter la supposition** plutôt que de bloquer le développement.
2. **Adapter la complexité au problème.** Implémenter la solution la plus simple pour les problèmes simples, des solutions plus élaborées pour les problèmes complexes. Éviter la sur-ingénierie et la flexibilité inutile.
3. **Ne pas toucher au code non lié**, mais **signaler** tout code défectueux ou toute anomalie de conception découverte, pour le traiter séparément.
4. **Signaler clairement les incertitudes.** En cas de doute, revenir au point 1. Si pertinent, mener une expérience simple, localisée et à faible risque, puis soumettre l'hypothèse et les résultats pour discussion. *La confiance sans certitude est plus nuisible que la reconnaissance d'une lacune.*
5. **Suggestions bienvenues.** Proposer une meilleure approche, ou une solution à impact durable plutôt qu'un simple changement tactique.
