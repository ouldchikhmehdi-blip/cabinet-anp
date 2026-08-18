# IADE.md — Module « Congés IADE »

> Fichier de référence du module congés des infirmiers anesthésistes (IADE). Il **fait foi** :
> le lire avant toute intervention sur les comptes IADE, les demandes de congés ou leur RLS.
>
> Schéma + RLS : **`supabase/iade_conges.sql`** · Auth générale : `AUTH.md` · Planning : `PLANNING.md`

---

## 1. À quoi ça sert

Les IADE salariés du SARM ont besoin de **poser leurs congés**, et quelqu'un doit **les valider**.
Ils n'ont rien à faire dans le dashboard financier ni dans le planning des associés : leur compte
est donc un **compte restreint**, cloisonné côté écran **et** côté base.

Trois populations :

| Qui | Drapeau | Ce qu'il voit |
|---|---|---|
| **Agent IADE** | `profiles.is_iade` | Uniquement « Mes congés » et « Congés de l'équipe ». Rien d'autre. |
| **Gestionnaire des IADE** | `profiles.is_gestion_iade` | Les demandes (valider / refuser), le calendrier, le récap par agent. |
| **Faiseur de planning** | `profiles.is_faiseur` | Idem gestionnaire : les congés IADE conditionnent le planning. |
| **Admin** | `profiles.role = 'admin'` | Idem, plus la création des comptes (onglet « Comptes »). |

Fonction SQL de référence : **`public.peut_gerer_iade()`** = gestionnaire IADE **ou** faiseur **ou** admin.

---

## 2. Cycle de vie d'une demande

```
Agent IADE                          Gestion (gestionnaire · faiseur · admin)
──────────                          ────────────────────────────────────────
« Mes congés »
  motif + du/au + précision
  → Envoyer                 ──────► « Demandes IADE » : demande à traiter
                                      ├─ Valider  → statut = validee
                                      └─ Refuser  → statut = refusee (+ motif)
  ◄── voit la réponse et le motif dans « Demandes traitées »
```

- Tant que la demande est **`en_attente`**, l'agent peut la **retirer** (bouton « Retirer »).
- Une fois **décidée**, elle est **figée pour l'agent** (RLS) ; seule la gestion peut revenir dessus
  (« Refuser finalement » / « Valider finalement » dans l'historique).
- `decide_par` et `decide_le` sont posés **par un trigger en base**, jamais par le client.
- **Pas de solde de congés** : on enregistre des périodes, on ne décompte pas de quota.
  Les jours ouvrés affichés sont **calculés** (hors samedi/dimanche et jours fériés français).

---

## 3. Écrans

| Page | Fichier | Qui y accède |
|---|---|---|
| **Mes congés** | `src/pages/IadeMesConges.jsx` | Agent IADE |
| **Congés de l'équipe** / **Absences IADE** | `src/pages/IadeCalendrier.jsx` | Agent IADE · gestion |
| **Demandes IADE** | `src/pages/IadeGestion.jsx` | Gestion uniquement |
| **Aperçu compte IADE** | `src/pages/IadeApercu.jsx` | Gestion uniquement |

**Aperçu compte IADE** : voir l'application telle qu'un agent la voit (ses deux écrans, pour
l'agent choisi dans la liste) **sans créer de second compte** et **sans pouvoir agir à sa place**.
C'est la même page `IadeMesConges` rendue avec la prop `apercu={{ userId, nom }}` : formulaire
et boutons inertes. Une personne de la gestion dispose donc des deux perspectives depuis
son propre compte : celle qui valide (« Demandes IADE ») et celle de l'agent (« Aperçu »).

Composant partagé : `src/components/iade/CalendrierConges.jsx` — bandeau mensuel
(une ligne par agent absent, une colonne par jour ; `●` validé, `○` en attente).

Logique métier pure (testée) : `src/utils/iadeConges.js` — types de congé, jours ouvrés,
chevauchements, validation de saisie, découpage du mois.
Accès Supabase : `src/utils/iadeCongesApi.js`.

---

## 4. Modèle de données

**`profiles`** (colonnes ajoutées) : `is_iade`, `is_gestion_iade`.
Contrainte **`profiles_iade_exclusif`** : un compte IADE est forcément `role='user'`,
**ni** faiseur, **ni** gestionnaire IADE, **ni** titulaire d'initiales d'associé.

**`invitations`** (colonne ajoutée) : `is_iade` — permet d'inviter directement un IADE.

**`iade_conges`** — une ligne = une absence demandée :

| Colonne | Rôle |
|---|---|
| `user_id` | l'agent (FK `auth.users`) |
| `date_debut` · `date_fin` | période, **bornes incluses** (`date_fin >= date_debut`) |
| `type_conge` | `conges` · `rtt` · `sans_solde` · `formation` · `enfant_malade` · `autre` |
| `commentaire` | précision libre de l'agent (facultatif) |
| `statut` | `en_attente` · `validee` · `refusee` |
| `motif_reponse` | commentaire de la décision, visible par l'agent |
| `decide_par` · `decide_le` | posés par le trigger `iade_conges_decision` |

> ⚠️ Les listes `type_conge` et `statut` sont dupliquées côté front dans
> `src/utils/iadeConges.js` (`TYPES_CONGE`, `STATUTS`) : **modifier les deux ensemble**.

---

## 5. Sécurité — ce qui est garanti par la base

1. **Un IADE ne lit aucune donnée du cabinet.** Les tables `planning_*` et
   `planning_consultations` étaient en `select using (true)` pour tout compte authentifié :
   `iade_conges.sql` les repasse en `using ( not public.is_iade() )`, bucket
   `planning-archives` compris. Le cloisonnement n'est donc pas seulement visuel.
   > ⚠️ Réexécuter un `supabase/planning_*.sql` restaure `using (true)` :
   > **relancer `iade_conges.sql` ensuite** (il est idempotent).
2. **Un IADE ne peut pas se valider lui-même** : il n'écrit que sa propre ligne, et
   seulement tant qu'elle est `en_attente` (policy `iade_conges_update_self`) ;
   le trigger refuse en plus tout changement de statut hors `peut_gerer_iade()`.
3. **Le calendrier d'équipe ne fuit rien de sensible** : les IADE ne lisent pas la table,
   ils appellent la fonction `public.iade_calendrier(debut, fin)` (SECURITY DEFINER) qui
   renvoie *nom, dates, type, statut* — **ni commentaire, ni motif de refus, ni demande refusée**.
4. **Un IADE ne peut pas devenir admin** : le drapeau est posé par le serverless
   (`/api/accept` d'après l'invitation), la contrainte `profiles_iade_exclusif` bloque le cumul,
   et `/api/promote` renvoie une erreur explicite.
5. **Connexion simple (sans 2FA) pour les IADE — et pourquoi c'est sûr.**
   Un IADE se connecte avec **e-mail + mot de passe seulement** : pas d'application
   d'authentification à installer. Ce choix ne fragilise pas le cabinet, parce que
   l'exigence de 2FA a été **déplacée dans la base** (`supabase/securite_aal2.sql`) :

   | | 2FA exigée par la base ? |
   |---|---|
   | Consultations, planning, trames, archives, desiderata, agendas | **oui** (`est_aal2()`) |
   | `is_admin()` et `is_faiseur()` — donc toutes les écritures du cabinet | **oui** |
   | `profiles` (sa propre ligne) et liste des initiales | non — nécessaires avant le TOTP |
   | Module congés IADE (`iade_conges`, `iade_calendrier()`) | non — c'est la zone « simple » |

   Conséquence : un mot de passe d'IADE volé donne accès **aux congés de l'équipe IADE
   et à rien d'autre** — même en appelant l'API directement, hors de l'interface.
   Et le mouvement a **renforcé** le reste : avant, la 2FA n'était vérifiée que par
   l'écran, donc un jeton obtenu avec le seul mot de passe d'un associé (avant la saisie
   du code) pouvait déjà lire consultations et planning via l'API. Ce n'est plus le cas.

   **Connexion Google.** Un IADE avec une adresse Gmail se connecte d'un clic
   (« Continuer avec Google »), sans mot de passe ni code : il n'a même pas besoin
   d'ouvrir le lien d'invitation, la première connexion Google consomme l'invitation
   posée à son nom. Une adresse **non invitée** qui tente le même bouton obtient un
   compte **désactivé** qui ne lit rien (cf. `AUTH.md § Étape 2 bis`).

   Ce qu'un compte IADE compromis expose, à connaître : les **noms, dates et motifs**
   d'absence de l'équipe IADE (le motif « enfant malade » est une donnée personnelle).
   Si un jour cela paraît trop, la 2FA se réactive pour eux en supprimant le test
   `profile?.is_iade` dans le routage de `src/App.jsx` — rien d'autre à changer.

---

## 6. Mise en service

1. **Base** — ✅ **fait le 2026-08-17** sur le projet Supabase `SARM dashboard`
   (migrations `iade_conges` et `iade_conges_revoke_trigger_function`).
   Sur un nouvel environnement : exécuter **`supabase/iade_conges.sql`** dans
   SQL Editor, après `schema.sql` et `planning.sql`. Tant que ce n'est pas fait,
   l'onglet « Comptes » affiche un bandeau orange et les options IADE restent grisées.
2. **Désigner le gestionnaire** — onglet « Comptes » → ligne de la personne → colonne
   « Congés IADE » → cocher **Gestion**. (Le faiseur de planning a l'accès d'office.)
3. **Créer les comptes IADE** — onglet « Comptes » → « Inviter un nouvel utilisateur » →
   rôle **« IADE (congés uniquement) »** + nom complet → « Générer l'invitation ».
   L'agent reçoit **automatiquement un e-mail** expliquant la marche à suivre
   (modèle dans `api/_lib/emails.js`, fonction `emailInvitationIade`) : création du
   compte, connexion Google si adresse Gmail, **aucun code de sécurité**, invitation
   à le faire depuis son téléphone. Le lien reste affiché à l'écran pour un envoi
   manuel si l'e-mail ne part pas.
   > Les associés reçoivent un message **différent** (`emailInvitationAssocie`), qui
   > détaille l'enrôlement de la double authentification. Ne pas mélanger les deux :
   > un IADE qui lit une procédure 2FA cherchera une étape qui n'existe pas chez lui.
4. **Nommer les agents** — renseigner leur **Nom complet** dans la ligne du compte :
   c'est ce nom qui apparaît dans le calendrier et les demandes (sinon, la partie
   gauche de l'e-mail est utilisée).

Transformer un compte existant en compte IADE : cocher **Agent** dans la colonne
« Congés IADE » (impossible s'il est admin, faiseur ou associé — retirer d'abord ces droits).

## 6 bis. Départ d'un IADE (démission)

Onglet « Comptes », deux gestes possibles sur sa ligne :

| Geste | Effet | Quand |
|---|---|---|
| **Révoquer** | Sessions coupées immédiatement, `status='disabled'`. Il ne peut plus se connecter ni rien déposer. **Ses congés restent** en base et dans l'historique. | Départ, suspension, doute sur le mot de passe |
| **Supprimer** | Le compte est effacé, et **ses congés partent avec** (cascade). Irréversible. | Nettoyage définitif, une fois l'historique inutile |

Recommandation : **révoquer** au départ (on garde la trace de qui était absent quand),
et ne supprimer que plus tard si l'on veut effacer ses données.
Un compte révoqué apparaît « (désactivé) » dans le récapitulatif par agent.

---

## 7. Endpoints

| Route | Qui | Rôle |
|---|---|---|
| `POST /api/invite` | admin | `{ email, role, isIade }` — invitation, e-mail adapté si IADE |
| `POST /api/accept` | invité | applique `is_iade` d'après l'invitation, via les métadonnées |
| `POST /api/iade-attribuer` | admin | `{ userId, isIade, isGestionIade }` — pose les drapeaux, refuse les cumuls |

Le reste (dépôt, validation, calendrier) passe **directement par Supabase sous RLS** —
pas de fonction serverless, donc pas de `service_role` en jeu.

---

## 8. Pistes non retenues (à ce stade)

- **Solde / quota de congés par agent** (CP, RTT restants) : écarté, on n'enregistre que des dates.
- **Notification e-mail** à l'agent lors de la décision : tout se lit dans l'app.
- **Saisie d'une absence par la gestion pour un agent** : la RLS l'autorise déjà
  (`iade_conges_insert`), l'écran ne l'expose pas encore.
