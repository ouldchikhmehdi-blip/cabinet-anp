# Authentification SARM — Guide de configuration et de test

## Ce qui a été mis en place

- **Accès sur invitation seulement** : aucune inscription publique possible.
- **2FA TOTP obligatoire** : code 6 chiffres via Google Authenticator, Authy, ou toute app TOTP. Requis pour chaque compte, à la création et à chaque connexion.
- **Sessions sécurisées** : JWT signés par Supabase, renouvellement automatique, révocation immédiate sur désactivation.
- **Liens d'invitation** : token 256 bits, haché en base, expiration 48h, usage unique, envoi via Resend.
- **Mot de passe oublié (libre-service)** : depuis l'écran de connexion, l'associé demande un lien de réinitialisation par e-mail (envoi **natif Supabase**, voir plus bas), clique le lien, définit un nouveau mot de passe, puis se reconnecte (mot de passe + son code 2FA habituel). Aucune intervention admin.
- **Couche serveur** : les opérations sensibles (inviter, promouvoir, révoquer) passent par des fonctions Vercel `/api` avec la clé `service_role` — jamais exposée dans le front.
- **Rôle en base** : champ `role` (`admin` / `user`) dans la table `profiles`, prêt pour les permissions fines à l'étape suivante.

---

## Étape 1 — Créer le projet Supabase

1. Aller sur [supabase.com](https://supabase.com) → **New project**.
2. Choisir un nom (`sarm-dashboard`), un mot de passe de base de données fort, une région (ex. `eu-west-3` Paris).
3. Attendre la création (~2 min).

---

## Étape 2 — Configurer Supabase Auth

Dans le dashboard Supabase → **Authentication → Providers** :

1. Section **Email** : désactiver **"Enable Email Signups"** → les inscriptions directes sont bloquées.
2. Section **MFA** : activer **"Enable TOTP (Time-based One-Time Password)"**.

Dans **Authentication → URL Configuration** :
- **Site URL** : `https://sarm-dashboard.vercel.app` (ou `http://localhost:5173` en dev).
- **Redirect URLs** : ajouter `https://sarm-dashboard.vercel.app/**` et `http://localhost:5173/**` (le suffixe `/**` autorise les sous-pages, ex. le lien d'invitation `…/?invite=…` et le retour du lien de réinitialisation `…#type=recovery`).

> ⚠️ Ne PAS activer une éventuelle option « Require MFA / re-authentication for password change » : le flux « mot de passe oublié » modifie le mot de passe depuis une session de récupération AAL1. (Désactivée par défaut.)

---

## Étape 2 bis — « Continuer avec Google » (facultatif mais recommandé)

Permet à quiconque a une adresse Gmail de se connecter en un clic, sans mot de passe à
retenir. **Particulièrement utile pour les IADE**, qui n'ont pas de 2FA (cf. `IADE.md`).

### Le principe de sécurité, à comprendre avant d'activer

Google **authentifie** (il prouve qui vous êtes), l'**invitation autorise** (elle dit à quoi
vous avez droit). Les deux sont séparés :

- adresse **invitée** → le compte est créé actif, avec le rôle et les drapeaux de son invitation ;
  l'invitation encore ouverte est consommée au passage ;
- adresse **non invitée** → le compte est créé **désactivé**. Il ne lit rien, nulle part,
  et voit un écran « Ce compte n'a pas accès au dashboard SARM ».

C'est le trigger `handle_new_user` (`supabase/connexion_google.sql`) qui applique cette règle,
donc **quel que soit le chemin de création du compte**. Corollaire important : le rôle n'est
plus lu dans `raw_user_meta_data` (que le client peut renseigner) mais dans la table
`invitations`, écrite uniquement par le `service_role`.

> ⚠️ Prérequis : exécuter `supabase/connexion_google.sql` **avant** d'activer le fournisseur
> Google. Sans lui, n'importe quel compte Gmail obtiendrait un accès actif au cabinet.

### Configuration

Côté Google, tout se passe dans la **Google Auth Platform** (`console.cloud.google.com/auth`) —
l'ancien chemin *APIs & Services → Credentials* a été renommé.

1. **Audience** (`/auth/audience`) : type **External**, puis **Publier l'application**.
   Laissée en « Testing », seuls les comptes inscrits comme testeurs peuvent se connecter
   (100 maximum, à maintenir à la main) — inutilement pénible pour une équipe.
   Les scopes utilisés n'étant pas sensibles, la publication ne déclenche **aucune
   vérification** de Google.
2. **Data Access / Scopes** (`/auth/scopes`) : `openid` (à ajouter à la main),
   `.../auth/userinfo.email` et `.../auth/userinfo.profile` (présents par défaut).
   N'en ajouter aucun autre : les scopes sensibles déclenchent une validation longue.
3. **Clients** (`/auth/clients`) → **Create client** → type **Web application** :
   - *Authorized JavaScript origins* : `https://sarm-dashboard.vercel.app`
     (+ `http://localhost:5173` pour le développement) ;
   - *Authorized redirect URIs* : `https://oapebydqgsbgtwsqzpbf.supabase.co/auth/v1/callback`.
4. **Supabase → Authentication → Sign In / Providers → Google** : activer, coller le
   **Client ID** et le **Client Secret**, enregistrer.
5. Vérifier que **Redirect URLs** (étape 2) contient bien l'URL du site : c'est là que
   l'utilisateur revient après Google.

> L'écran de consentement Google affichera `oapebydqgsbgtwsqzpbf.supabase.co` tant qu'un
> domaine personnalisé n'est pas configuré côté Supabase. Sans conséquence technique,
> mais un nom de domaine reconnaissable rend une tentative d'hameçonnage plus facile à repérer.

Rien à changer côté code : les boutons sont déjà présents sur l'écran de connexion et sur
l'écran d'acceptation d'invitation (ce dernier n'apparaît que pour une adresse `@gmail.com`).

### Ce que Google ne change PAS

- **Les associés gardent leur 2FA.** Revenir de Google donne une session AAL1 ; l'écran de
  connexion enchaîne directement sur la demande du code TOTP, et la base refuse toute donnée
  du cabinet tant que l'AAL2 n'est pas atteint (`public.acces_cabinet()`).
- **Les IADE en restent dispensés** : leur module ne demande pas l'AAL2.

---

## Mot de passe oublié (réinitialisation en libre-service)

Flux **100 % natif Supabase, côté front** (aucune fonction serveur, aucune table) :

1. Écran de connexion → **« Mot de passe oublié ? »** → l'associé saisit son e-mail → `supabase.auth.resetPasswordForEmail(email, { redirectTo })`. Message **générique** affiché quoi qu'il arrive (anti-énumération + rappel « vérifiez vos spams »).
2. L'e-mail contient un lien de récupération. Au clic, `detectSessionInUrl: true` ([src/lib/supabase.js](src/lib/supabase.js)) capture le hash `#type=recovery` → session de récupération + événement `PASSWORD_RECOVERY`.
3. [AuthContext](src/auth/AuthContext.jsx) expose alors `recovery: true` (détecté en synchrone depuis le hash **et** via l'événement). [App.jsx](src/App.jsx) affiche [ResetPassword](src/auth/ResetPassword.jsx) **avant** tout routage AAL/2FA.
4. **Élévation AAL2** : Supabase exige une session **AAL2** pour changer le mot de passe quand la 2FA est activée (invariant de sécurité non désactivable). L'écran demande donc d'abord le **code TOTP** (`mfa.challenge` + `mfa.verify`) — l'associé a son téléphone — puis `supabase.auth.updateUser({ password })`. *(Conséquence sécurité : un lien de récupération volé ne suffit pas, il faut aussi le 2ᵉ facteur.)*
5. Succès → `signOut()` → retour au login. L'associé se reconnecte avec son **nouveau** mot de passe + son code TOTP **habituel** (la 2FA n'est pas réinitialisée).

**Envoi de l'e-mail** : service SMTP **par défaut de Supabase** (expéditeur générique, peut tomber en spam), **limité à ~2 e-mails/heure au niveau du projet**. Acceptable pour 8 associés occasionnels. Pour lever la limite et soigner l'expéditeur → configurer un **SMTP custom** (Authentication → Emails → SMTP Settings) **sans aucun changement de code**. Le texte de l'e-mail se personnalise dans Authentication → Email Templates → *Reset Password*.

---

## Étape 3 — Exécuter le schéma SQL

1. Aller dans **SQL Editor** du dashboard Supabase.
2. Copier-coller le contenu de `supabase/schema.sql` et exécuter.

Vérifier que les tables `profiles` et `invitations` apparaissent dans **Table Editor**.

---

## Étape 4 — Créer le premier compte administrateur

Le premier admin doit être créé manuellement car personne ne peut encore l'inviter.

1. Dashboard Supabase → **Authentication → Users → Add user**.
   - Entrer votre e-mail et un mot de passe fort.
   - Cocher **"Auto Confirm User"** (sinon l'e-mail de confirmation Supabase sera envoyé).
   - Cliquer **Create User**. → Le trigger crée automatiquement la ligne `profiles` avec `role='user'`.

2. **SQL Editor** → exécuter (remplacer l'e-mail) :
   ```sql
   update public.profiles set role = 'admin'
   where email = 'votre-email@exemple.fr';
   ```

3. À la première connexion sur le site, vous serez redirigé vers **l'écran d'enrôlement TOTP** (QR code). Scannez-le dans votre app authenticator et entrez le code. Vous accédez ensuite au dashboard.

---

## Étape 5 — Configurer Resend (envoi d'e-mails)

1. Créer un compte sur [resend.com](https://resend.com).
2. **Domains** → ajouter votre domaine et vérifier les enregistrements DNS.
3. **API Keys** → créer une clé → noter la valeur (`re_...`).

---

## Étape 6 — Variables d'environnement

### En développement local

Copier `.env.example` en `.env` et remplir :

```bash
cp .env.example .env
```

Récupérer les valeurs dans le dashboard Supabase → **Project Settings → API** :
- `VITE_SUPABASE_URL` = **Project URL**
- `VITE_SUPABASE_ANON_KEY` = **anon public**
- `SUPABASE_URL` = même valeur
- `SUPABASE_SERVICE_ROLE_KEY` = **service_role secret** (garder absolument secret)

Remplir `RESEND_API_KEY` et `INVITE_FROM_EMAIL`.

### Sur Vercel

**Project → Settings → Environment Variables** — ajouter chaque variable :

| Variable | Environnement | Note |
|---|---|---|
| `VITE_SUPABASE_URL` | Production, Preview | Exposée au build |
| `VITE_SUPABASE_ANON_KEY` | Production, Preview | Exposée au build |
| `VITE_APP_URL` | Production | `https://sarm-dashboard.vercel.app` |
| `SUPABASE_URL` | Production, Preview | Sans préfixe VITE_ |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | **Secret — ne jamais exposer** |
| `RESEND_API_KEY` | Production, Preview | Secret |
| `INVITE_FROM_EMAIL` | Production, Preview | Domaine vérifié Resend |

Après avoir ajouté les variables → **Redeploy** (le build doit relire les variables).

---

## Étape 7 — Protection interim du bundle (important)

Les données mock sont actuellement intégrées dans le bundle JS et seraient téléchargeables sans authentification. En attendant la migration des vraies données en base Supabase :

**Vercel → Project → Settings → Deployment Protection → Password Protection**
- Activer et définir un mot de passe partagé avec les utilisateurs autorisés.
- Cela protège l'ensemble du site (bundle inclus) derrière une protection HTTP Basic Auth.
- À désactiver quand les données sensibles seront en base derrière RLS.

---

## Test de bout en bout

### 1. Premier login admin
```
1. Ouvrir le site → écran de connexion (pas le dashboard)
2. Se connecter avec l'e-mail + mot de passe créés à l'étape 4
3. L'écran d'enrôlement TOTP apparaît → scanner le QR avec Google Authenticator
4. Entrer le code à 6 chiffres → accès au dashboard
5. Vérifier la présence de "Comptes" dans la sidebar gauche
```

### 2. Inviter un utilisateur
```
1. Dans "Comptes" → saisir un e-mail de test → cliquer "Envoyer l'invitation"
2. Vérifier la réception de l'e-mail (vérifier aussi les spams)
3. Cliquer le lien dans l'e-mail
4. Formulaire de création de compte → saisir un mot de passe
5. Cliquer "Créer mon compte"
6. Écran d'enrôlement TOTP → scanner → entrer le code
7. Accès au dashboard → sans entrée "Comptes" (rôle user)
```

### 3. Tester l'expiration et l'usage unique
```
- Cliquer le même lien d'invitation une 2e fois → message "Lien invalide ou expiré"
- Pour tester l'expiration 48h : modifier la date expires_at en SQL Editor puis réessayer
```

### 4. Promouvoir et révoquer
```
Depuis "Comptes" (admin) :
- Cliquer "Promouvoir admin" sur l'utilisateur de test
  → "Comptes" apparaît dans sa sidebar au prochain refresh de page
- Cliquer "Révoquer" → ses sessions sont coupées instantanément
  → Il est redirigé vers le login s'il était connecté
```

### 5. Vérifier la protection côté serveur
```bash
# Appel sans JWT → 401
curl -X POST https://sarm-dashboard.vercel.app/api/promote \
  -H "Content-Type: application/json" \
  -d '{"userId":"xxx","role":"admin"}'
# Réponse attendue : {"error":"Non authentifié."}

# Appel avec JWT non-admin → 403
curl -X POST https://sarm-dashboard.vercel.app/api/invite \
  -H "Authorization: Bearer <token-utilisateur-normal>" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@exemple.fr"}'
# Réponse attendue : {"error":"Droits insuffisants."}
```

---

## Architecture de sécurité (résumé)

```
Navigateur (front React + Vite)
│
├─ supabase.auth.signInWithPassword()   → Supabase Auth (hachage, JWT)
├─ supabase.auth.mfa.verify()           → Supabase Auth (TOTP, AAL2)
├─ supabase.from('profiles').select()   → Supabase DB + RLS (jwt requis)
│
├─ POST /api/invite   ──→ Vercel Function
├─ POST /api/accept   ──→ Vercel Function   (service_role, jamais dans le front)
├─ POST /api/promote  ──→ Vercel Function
└─ POST /api/revoke   ──→ Vercel Function
```

Ce qui est protégé côté serveur (incontournable) :
- Authentification, sessions, tokens JWT (Supabase)
- 2FA TOTP (Supabase)
- Opérations admin (service_role dans les Vercel Functions)
- Futures données en base via RLS (étape suivante)

Ce qui sera sécurisé à l'étape suivante :
- Migration des données financières de `mockData.js` vers des tables Supabase
- RLS avec exigence AAL2 pour lire les données sensibles
