# IADE.md — Module « Congés IADE »

> Fichier de référence du module congés **et heures supplémentaires** des infirmiers
> anesthésistes (IADE). Il **fait foi** : le lire avant toute intervention sur les comptes
> IADE, les demandes de congés, les heures sup ou leur RLS.
>
> Schéma + RLS : **`supabase/iade_conges.sql`** et **`supabase/iade_heures_sup.sql`**
> · Auth générale : `AUTH.md` · Planning : `PLANNING.md`

---

## 1. À quoi ça sert

Les IADE salariés du SARM ont besoin de **poser leurs congés**, et quelqu'un doit **les valider**.
Ils n'ont rien à faire dans le dashboard financier ni dans le planning des associés : leur compte
est donc un **compte restreint**, cloisonné côté écran **et** côté base.

Trois populations :

| Qui | Drapeau | Ce qu'il voit |
|---|---|---|
| **Agent IADE** | `profiles.is_iade` | « Mes congés », « Mes heures sup » et « Congés de l'équipe ». Rien d'autre. |
| **MAR (associé)** | aucun drapeau — voir ci-dessous | « Heures sup à valider » : uniquement les déclarations **qui le désignent**. |
| **Gestionnaire des IADE** | `profiles.is_gestion_iade` | Les demandes (valider / refuser), les heures sup, le calendrier, le récap par agent. |
| **Faiseur de planning** | `profiles.is_faiseur` | Idem gestionnaire : les congés IADE conditionnent le planning. |
| **Admin** | `profiles.role = 'admin'` | Idem, plus la création des comptes (onglet « Comptes »). |

Fonction SQL de référence : **`public.peut_gerer_iade()`** = gestionnaire IADE **ou** faiseur **ou** admin.

**« MAR » n'est pas un nouveau drapeau.** C'est `public.acces_cabinet()`, qui vaut déjà
« compte actif, 2FA vérifiée, non-IADE » — soit exactement les associés. Ne pas en créer un
autre : deux définitions du même rôle finiraient par diverger.

---

## 2. Cycle de vie d'une demande

```
Agent IADE                          Gestion (gestionnaire · faiseur · admin)
──────────                          ────────────────────────────────────────
« Mes congés »
  1. choisir la nature : CP ou récup. jour férié
  2. cliquer les jours dans le calendrier
  3. Envoyer                ──────► « Congés IADE » : jours à traiter
                                      ├─ Valider  → statut = validee
                                      └─ Refuser  → statut = refusee (+ motif)
  ◄── voit la réponse et le motif dans « Jours traités »
```

- **Une ligne = un jour**, avec sa nature : **congé payé** (`cp`) ou **récupération d'un jour
  férié travaillé** (`recup_ferie`). C'est la seule distinction demandée.
- **Aucun motif n'est demandé à l'agent** : la raison d'un congé ne regarde pas l'employeur.
  Seule la **réponse** de la gestion peut être commentée (`motif_reponse`).
- Les jours envoyés ensemble partagent un **`lot`** : l'écran de gestion les regroupe en plages
  contiguës de même nature, donc une semaine de congés se valide **d'un seul clic** — sans perdre
  la possibilité de répondre jour par jour.
- Tant qu'un jour est **`en_attente`**, l'agent peut le **retirer** (bouton « Retirer »).
- Une fois **décidé**, il est **figé pour l'agent** (RLS) ; seule la gestion peut revenir dessus
  (« Refuser finalement » / « Valider finalement » dans l'historique).
- `decide_par` et `decide_le` sont posés **par un trigger en base**, jamais par le client.
- Un jour **refusé peut être reposé** (l'index unique ignore les lignes refusées) ; un jour
  en attente ou validé ne peut pas être posé deux fois.
- **Pas de solde de congés** : on compte les jours posés, on ne décompte pas de quota.
- Les **jours passés ne sont pas cliquables** : une demande porte sur des jours à venir.

---

## 3. Écrans

| Page | Fichier | Qui y accède |
|---|---|---|
| **Mes congés** | `src/pages/IadeMesConges.jsx` | Agent IADE |
| **Mes heures sup** | `src/pages/IadeMesHeuresSup.jsx` | Agent IADE |
| **Congés de l'équipe** (agent) / **Congés équipe** (gestion) | `src/pages/IadeCalendrier.jsx` | Agent IADE · gestion |
| **Planning IADE** (lecture seule) | `src/pages/IadePlanning.jsx` | Agent IADE **et** tout associé (cf. § 12) |
| **Heures sup à valider** | `src/pages/HeuresSupAValider.jsx` | **Tout associé** (MAR) |
| **Congés, HS et rempla** (5 onglets, cf. ci-dessous) | `src/pages/IadeGestion.jsx` | Gestion uniquement |
| **Aperçu compte IADE** | `src/pages/IadeApercu.jsx` | Gestion uniquement |

**Congés, HS et rempla** — renommé et découpé en onglets le 2026-08-26 (avant : un seul
long défilement de six sections), un cinquième — « Créneaux » — ajouté le 2026-09-03. Une
problématique à la fois : on ouvre cet écran pour traiter **une** chose, le reste est du
bruit à ce moment-là.

| Onglet | Contenu | Pastille |
|---|---|---|
| **Congés** | demandes à traiter · calendrier des absences · récap par agent · jours traités | jours en attente |
| **Heures sup** | `HeuresSupGestion` : ajout par la gestion, décisions, liste de l'année | déclarations en attente |
| **Créneaux** | les salles qui ne tournent pas, à la demi-journée (cf. § 14) | — |
| **Rempla** | chercher, puis nommer les remplaçants (cf. § 13) | — |
| **Synthèse comptable** | `SyntheseMensuelle` (d'après le dashboard) **et** `RecapPlanningColle` (d'après le fichier du planning collé, cf. § 10) | — |

Le sélecteur d'**année** et les bandeaux d'erreur / de succès restent au-dessus des onglets :
ils valent pour toute la page. Les données (jours, heures sup, agents) sont chargées **une
seule fois pour l'année** — changer d'onglet ne relance aucune requête. Les pastilles
n'affichent rien quand il n'y a rien à traiter : un « 0 » permanent ne veut plus rien dire.
Le **calendrier d'équipe reste dans « Congés »** : on l'ouvre pour savoir qui est absent, les
heures sup n'y sont qu'en second plan.

**Aperçu compte IADE** : voir l'application telle qu'un agent la voit, pour l'agent choisi
dans la liste, **sans créer de second compte** et **sans pouvoir agir à sa place**. Trois
onglets : **Mes congés**, **Mes heures sup**, **Congés de l'équipe**. Ce sont les mêmes pages
`IadeMesConges` et `IadeMesHeuresSup` rendues avec la prop `apercu={{ userId, nom }}` :
calendriers, champs et boutons inertes. Une personne de la gestion dispose donc des deux
perspectives depuis son propre compte : celle qui valide (« Congés IADE ») et celle de
l'agent (« Aperçu »).

Le quatrième écran d'un agent, **Sync agenda**, n'est pas repris dans l'aperçu : la gestion
l'ouvre directement depuis sa propre navigation.

> ⚠️ **Tout écran ajouté à `iadeAgentItems` (Sidebar.jsx) doit l'être aussi dans
> `IadeApercu.jsx`**, sinon l'aperçu ment par omission — il a affiché deux écrans sur trois
> pendant un temps, ce qui donnait à croire qu'un agent n'avait accès qu'à ceux-là.

Composants :

| Fichier | Rôle |
|---|---|
| `src/components/iade/CalendrierSaisie.jsx` | Grille mensuelle **cliquable** où l'agent pose ses jours (cases larges, pensées pour le doigt sur téléphone) |
| `src/components/iade/CalendrierConges.jsx` | Bandeau mensuel en lecture seule : une ligne par agent, une colonne par jour |
| `src/components/iade/SyntheseMensuelle.jsx` | Export texte du mois pour la comptable (cf. § 3 bis) |

Dans les deux, chaque case porte l'**abréviation de la nature** (`CP` / `RF`) et prend la
**couleur du statut** (ambre = demandé, vert = validé) : les deux informations se lisent
sans dépendre de la seule couleur.

Logique métier pure (testée, 29 tests) : `src/utils/iadeConges.js` — natures de jour,
regroupement en plages contiguës (`plages`), validation de la sélection, découpage du mois
en grille (`grilleMois`).
Accès Supabase : `src/utils/iadeCongesApi.js`.

> ⚠️ `SyntheseMensuelle` est un composant séparé **volontairement** : inline dans
> `IadeGestion`, ce bloc faisait échouer le compilateur React (« existing memoization
> could not be preserved ») et désoptimisait toute la page. Ne pas le réintégrer.

---

## 3 bis. Synthèse mensuelle pour la comptable

Chaque mois, la personne qui valide doit transmettre les congés à la comptable.
L'écran « Congés, HS et rempla » porte pour cela un onglet **« Synthèse comptable »** :
on choisit un mois (l'année est celle du sélecteur en haut de page),
on clique **« Copier le texte »**, on colle dans un e-mail. Rien à mettre en forme.

Le texte produit (fonction pure `syntheseMensuelle()`, testée) :

```
SARM — Service Anesthésie Réanimation Millénaire
Congés et heures supplémentaires IADE — Septembre 2026

CONGÉS VALIDÉS

Amar Sophie — 2 jours
  Congés payés (2) : lun. 14/09, mar. 15/09

Dupont Marie — 7 jours
  Congés payés (5) : lun. 07/09, mar. 08/09, mer. 09/09, jeu. 10/09, ven. 11/09
  Récup. de jours fériés (2) :
    récup. du 14 juillet 2026 (Fête nationale) (1) : jeu. 17/09
    récup. du 8 mai 2026 (Victoire 1945) (1) : ven. 18/09

Total du mois : 9 jours — 7 congés payés · 2 récup. de jours fériés

HEURES SUPPLÉMENTAIRES VALIDÉES

Dupont Marie — 6 h : mer. 09/09 (4 h), mer. 23/09 (2 h)

Total du mois : 6 h pour 1 agent.

Édité le 02/10/2026 depuis le dashboard SARM.
```

Règles, à ne pas modifier sans y réfléchir :

- **Un seul texte, congés ET heures sup.** La paie a besoin des deux ; deux exports séparés
  se seraient désynchronisés au premier oubli.
- **Seules les lignes `validee` sortent.** Ce qui est en attente n'est pas accordé :
  l'envoyer en paie serait une erreur. Les lignes refusées n'y sont évidemment pas non plus.
- Ce qui reste **en attente** sur le mois — jours de congé comme déclarations d'heures —
  est compté et affiché **au-dessus** du texte, en avertissement, jamais dans le texte.
- Dates listées **une par une** avec le jour de la semaine (`lun. 07/09`), pas en plages :
  la comptable saisit des jours, une plage l'obligerait à les recompter.
- Agents triés par nom ; un agent supprimé entre-temps apparaît en « Agent inconnu »
  plutôt que de disparaître silencieusement du décompte.

---

## 3 quater. De quel jour férié la récup provient — ajouté le 2026-08-27

Une récup envoyée à la comptable comme « récup. de jour férié » est **inexploitable** : elle
doit savoir **lequel**. Sans ce champ, elle rappelait la gestion, agent par agent, pour une
information que **seul l'agent** possède — et que personne ne pouvait reconstituer après coup
sans deviner. La colonne **`iade_conges.ferie`** la capte donc **à la saisie**.

**Ce qui est stocké est la DATE du férié, pas son nom.** Le nom se déduit
(`joursFeriesFR()`, `src/utils/calendrier.js`, qui calcule aussi les fériés mobiles via
Pâques). Rien n'est tapé à la main : « Victoire 1945 » ne peut pas devenir « 8 mai » chez
l'un et « 8/05 » chez l'autre, et une faute de frappe ne peut pas exister.

**À la saisie** (`IadeMesConges` + `CalendrierSaisie`) : choisir la nature « Récup. jour
férié » fait apparaître la liste des fériés — **année en cours et année précédente, du plus
récent au plus ancien**. Tant qu'aucun n'est choisi, **le calendrier ne se clique pas**, et
l'écran dit pourquoi. Empêcher le geste vaut mieux que le refuser après vingt clics.
Le férié fait partie de la « nature active » comme le type : en changer puis cliquer d'autres
jours permet de poser, **dans le même envoi**, des récups de fériés différents.

Les fériés **pas encore passés restent proposés**, marqués « à venir » : un agent inscrit au
planning du 25 décembre pose sa récup avant de l'avoir travaillé. Les cacher l'aurait bloqué
sans explication.

**Trois verrous, du plus proche de l'agent au plus profond :**

| Où | Ce qui est empêché |
|---|---|
| Écran | le calendrier reste inerte tant que le férié n'est pas désigné |
| `verifierSelection()` (testé) | une récup sans férié, un férié qui n'est pas un vrai férié français, un férié accroché à un CP |
| Base — `iade_conges_recup_precise` et `iade_conges_ferie_sur_recup` | les mêmes règles, y compris depuis un client bricolé : la RLS protège l'accès, pas le contenu |

La contrainte de présence est posée **`not valid`** : la **seule** récup antérieure au champ
(2026-08-29, en base) survit telle quelle, mais **aucun insert ni update** ne passe désormais
sans son férié. Ces lignes héritées s'affichent « Récup. jour férié (origine non précisée) » —
le dire franchement plutôt que laisser croire à un défaut d'affichage.

**Le férié entre dans la clé de regroupement de `plages()`.** Deux récups de fériés différents
posées côte à côte seraient sinon fondues en une seule ligne qui n'en nommerait qu'un —
exactement l'information qu'on cherche à ne plus perdre.

**Dans la synthèse comptable**, les récups se ventilent **par férié récupéré** (cf. § 3 bis) :
la comptable lit « ces deux jours récupèrent le 8 mai » sans rien demander à personne.

**Migration** : `iade_conges_ferie_recupere`, appliquée en production le 2026-08-27 —
colonne, deux contraintes, et la RPC `iade_calendrier()` recréée pour exposer `ferie`
(l'infobulle du calendrier d'équipe nomme l'origine comme partout ailleurs).
7 contrôles passés en transaction annulée.

---

## 3 ter. Heures supplémentaires

Deux chemins d'entrée, et un seul aboutissement : une fois validées, les heures partent
dans la **synthèse comptable** (§ 3 bis) et s'inscrivent dans le **planning** (§ 11).

**Chemin 1 — l'agent déclare.** Écran « Mes heures sup » : il indique le jour, le nombre
d'heures, et **désigne le MAR qui les lui a demandées**. La ligne naît `en_attente`. Ce MAR
reçoit un e-mail et la valide (ou la refuse) depuis « Heures sup à valider ». Tant que
personne n'a tranché, l'agent peut corriger ou retirer sa déclaration.

**Chemin 2 — la gestion ajoute.** Onglet « Heures sup » de l'écran « Congés, HS et rempla » :
la gestion choisit un agent, un jour, un nombre d'heures. La ligne naît **déjà `validee`** —
c'est le trigger qui l'impose, pas le front. L'agent est **informé** par e-mail ; il n'a rien
à approuver.

**Répondre depuis l'e-mail, sans se connecter.** L'e-mail du MAR porte, pour chaque jour,
deux boutons **Valider** / **Refuser**. Ils ouvrent une page de confirmation (`api/hs-decision.js`)
qui affiche la déclaration et demande un dernier clic — ni mot de passe, ni 2FA. L'agent est
prévenu par e-mail comme si la décision avait été prise dans l'app.

> ⚠️ **Pourquoi une page de confirmation et pas un lien qui décide directement.**
> Les filtres anti-phishing d'Outlook et de Gmail **visitent** les liens des messages entrants
> pour les inspecter. Un lien qui déciderait en `GET` serait déclenché tout seul, sans que
> personne n'ait cliqué. Ici le `GET` ne fait que lire ; seul le `POST` du formulaire décide.
> **Ne jamais transformer ce lien en action directe.**

L'autorisation est le **`jeton`** de la déclaration (une URL-capacité, comme pour l'abonnement
iCal). Deux verrous : la RPC `iade_hs_decider_par_jeton()` n'est exécutable que par
`service_role` — donc seulement depuis notre serverless, qui tient le jeton du lien ; et le
marqueur `app.hs_jeton` qu'elle pose ne donne rien à lui seul, la RLS bloquant toujours un
tiers qui le poserait à la main. Le jeton **ne sort jamais vers le client** : seul
`api/iade-notify.js` le lit, pour écrire le lien dans un message adressé au MAR désigné.

**Revenir sur une décision : jusqu'à la fin du mois SUIVANT le jour concerné.**
Des heures du 14/09 se corrigent jusqu'au 31/10. Ce n'est **pas** « la fin du mois du jour » :
des heures faites le 30/09 et déclarées le 1er octobre auraient eu une fenêtre déjà fermée.
La règle vit dans `public.iade_hs_fin_fenetre()` et est appliquée par le trigger ; le front
(`finFenetre()`) et la page e-mail ne font que l'anticiper pour l'afficher.
**La gestion IADE n'y est pas soumise** : c'est elle qui rattrape ce qui se découvre tard.
Une **première** décision n'est jamais bloquée, même très tardive — sinon une déclaration
oubliée deviendrait impossible à traiter.

Décisions de conception, à ne pas défaire sans y réfléchir :

- **La gestion peut trancher en secours** une déclaration adressée à un MAR qui ne répond
  pas. Sans cette porte, une déclaration resterait bloquée indéfiniment si le MAR désigné
  part en vacances — juste avant la paie. Le bloc de gestion le dit à l'écran : c'est un
  recours, pas le circuit normal.
- **Le MAR désigné décide, il ne réécrit pas.** La RLS lui ouvre l'`update`, mais le trigger
  refuse toute modification de `heures`, `jour`, `user_id`, `origine` ou `mar_id` de sa part.
  Sinon « valider » pourrait vouloir dire « valider autre chose que ce qui a été déclaré ».
- **Heures entières** (`check heures between 1 and 24`). C'est la forme déjà employée dans
  le planning (« 10 HS »). Les demi-heures ont été écartées explicitement.
- **Une seule ligne par agent et par jour** (index unique partiel, hors refus) : sans cela,
  deux déclarations le même jour se cumuleraient silencieusement en paie.
- **Aucun nouveau drapeau de rôle** : le MAR, c'est `acces_cabinet()` (cf. § 1).

Deux RPC, parce que la RLS de `profiles` ne suffit pas :

| RPC | Pour qui | Pourquoi |
|---|---|---|
| `iade_mars()` | agent, gestion | Un IADE ne peut pas lire les comptes des associés — il lui faut pourtant leurs **noms** pour désigner qui a demandé les heures. N'expose que `id` + `nom`. |
| `iade_hs_pour_mar(annee)` | MAR | Un associé non gestionnaire ne peut pas lire les profils des agents. La RPC joint le nom de l'agent **aux seules lignes qui le désignent**. |

**Ce que l'agent voit** (et que la gestion retrouve dans « Aperçu compte IADE »)**.** Sur « Mes heures sup », en plus de ses déclarations : un **cumul mois
par mois** (validées / en attente / refusées) et le mois en **calendrier**, chaque jour portant
« +Xh » à la couleur de son statut. Les heures **refusées** sont comptées en nombre de
déclarations, jamais en heures : elles ne sont pas dues, les additionner donnerait un total
trompeur. Côté gestion, le calendrier d'équipe affiche aussi les heures sup — mais **pas**
dans « Congés de l'équipe » vu par les agents : les heures d'un agent ne regardent pas ses
collègues.

Fichiers : `supabase/iade_heures_sup.sql` · `src/utils/iadeHeuresSup{,Api}.js` ·
`src/pages/IadeMesHeuresSup.jsx` · `src/pages/HeuresSupAValider.jsx` ·
`src/components/iade/{HeuresSupGestion,RecapHeuresSup}.jsx` ·
`api/iade-notify.js` · `api/hs-decision.js`

> ⚠️ `HeuresSupGestion` et `RecapHeuresSup` sont des composants séparés pour la même raison
> que `SyntheseMensuelle` : un bloc de cette taille inline dans la page désoptimise tout le
> reste. Ne pas les réintégrer.

**Pas de bouton d'action dans l'e-mail de l'agent, et c'est délibéré** : lui donner « Valider »
reviendrait à le laisser valider ses propres heures. Son e-mail l'informe de la décision, il
n'en prend aucune.

**Les six e-mails des heures sup** (tous par `/api/iade-notify`, sauf le dernier) :

| Événement | Déclencheur | Destinataire | Gabarit | Boutons |
|---|---|---|---|---|
| **Déclaration** | l'agent | le **MAR désigné** | `emailHsDeclarees` | oui |
| **Correction** | l'agent | le **MAR désigné** (le nouveau, s'il a changé) | `emailHsCorrigees` | oui |
| **Réattribution** | l'agent | le MAR **abandonné** | `emailHsSansSuite` (`cause: 'reassignation'`) | non |
| **Retrait** | l'agent | le **MAR désigné** | `emailHsSansSuite` (`cause: 'retrait'`) | non |
| **Décision** | le MAR, ou la gestion en secours | l'**agent** | `emailHsDecidees` | non |
| **Ajout par la gestion** | la gestion | l'**agent** (informé, rien à approuver) | `emailHsAjoutees` | non |

Ajouté le 2026-08-25 : correction, réattribution et retrait ne prévenaient personne. Le MAR
gardait dans sa boîte un message annonçant des heures qui avaient changé — ou qui n'existaient
plus — sans que rien ne le lui dise.

- **Réattribution et retrait notifient AVANT l'écriture** (même règle que le retrait d'un
  congé) : après, la ligne porte le nouveau MAR, ou n'existe plus. Ordre respecté dans
  `IadeMesHeuresSup.jsx`.
- **Changer de MAR renouvelle le `jeton`.** Le laisser tel quel laisserait à celui qu'on
  abandonne des boutons « Valider / Refuser » toujours actifs sur des heures qui ne le
  regardent plus — le jeton est une URL-capacité, il ne se périme pas tout seul. Le MAR
  abandonné reçoit son message « sans suite », le nouveau reçoit son propre lien.
- L'agent ne peut corriger ou retirer que **tant que personne n'a décidé** (RLS
  `statut = 'en_attente'`) : ces trois e-mails ne peuvent donc jamais contredire une
  décision déjà prise.

---

## 4. Modèle de données

**`profiles`** (colonnes ajoutées) : `is_iade`, `is_gestion_iade`.
Contrainte **`profiles_iade_exclusif`** : un compte IADE est forcément `role='user'`,
**ni** faiseur, **ni** gestionnaire IADE, **ni** titulaire d'initiales d'associé.

**`invitations`** (colonne ajoutée) : `is_iade` — permet d'inviter directement un IADE.

**`iade_conges`** — **une ligne = un jour posé** :

| Colonne | Rôle |
|---|---|
| `user_id` | l'agent (FK `auth.users`) |
| `jour` | le jour posé (une seule date, pas de période) |
| `type_conge` | `cp` (congé payé) · `recup_ferie` (récupération d'un jour férié) |
| `ferie` | **le jour férié récupéré** (date). Obligatoire sur une `recup_ferie`, interdit ailleurs — cf. § 3 quater |
| `lot` | identifiant de l'envoi : les jours cliqués ensemble le partagent |
| `statut` | `en_attente` · `validee` · `refusee` |
| `motif_reponse` | commentaire **de la décision**, visible par l'agent |
| `decide_par` · `decide_le` | posés par le trigger `iade_conges_decision` |

Index unique partiel **`iade_conges_jour_unique`** sur `(user_id, jour) where statut <> 'refusee'` :
un même jour ne se pose qu'une fois, mais un refus peut être re-demandé.

> ⚠️ Les listes `type_conge` et `statut` sont dupliquées côté front dans
> `src/utils/iadeConges.js` (`TYPES_CONGE`, `STATUTS`) : **modifier les deux ensemble**.
>
> ℹ️ Le modèle précédent (une ligne = une **période**, avec un motif libre et six types de
> congé) a été abandonné le 2026-08-24. `supabase/iade_conges.sql` supprime la table de
> l'ancien format **si elle est vide**, et **refuse de tourner** si elle contient des lignes,
> plutôt que de les convertir à l'aveugle.

**`iade_heures_sup`** — **une ligne = un jour, un nombre d'heures entier** :

| Colonne | Rôle |
|---|---|
| `user_id` | l'agent (FK `auth.users`) |
| `jour` | le jour concerné |
| `heures` | entier, `between 1 and 24` |
| `origine` | `iade` (déclarée par l'agent) · `gestion` (ajoutée, née validée) |
| `mar_id` | le MAR qui a demandé les heures — **obligatoire si `origine = 'iade'`** (contrainte `iade_heures_sup_mar_requis`) ; c'est lui qui valide |
| `commentaire` | précision libre de celui qui saisit |
| `statut` | `en_attente` · `validee` · `refusee` |
| `motif_reponse` | commentaire **de la décision**, visible par l'agent |
| `decide_par` · `decide_le` | posés par le trigger `iade_heures_sup_decision` |

Index unique partiel **`iade_heures_sup_jour_unique`** sur `(user_id, jour) where statut <> 'refusee'`.

> ⚠️ Les bornes d'heures et la liste `origine` sont dupliquées côté front dans
> `src/utils/iadeHeuresSup.js` (`MIN_HEURES`, `MAX_HEURES`, `ORIGINES`) : **modifier les
> deux ensemble**. Le `statut`, lui, est partagé avec les congés (`STATUTS`).

---

## 5. Sécurité — ce qui est garanti par la base

1. **Un IADE ne lit aucune donnée du cabinet.** Les tables `planning_*` et
   `planning_consultations` sont en `select using ( public.acces_cabinet() )` —
   soit **2FA + compte actif + non-IADE** — posé par `supabase/connexion_google.sql`,
   bucket `planning-archives` compris. Le cloisonnement n'est donc pas seulement visuel.
   > ⚠️ Réexécuter un `supabase/planning_*.sql` restaure `using (true)` :
   > **relancer `securite_aal2.sql` puis `connexion_google.sql` ensuite** (ils sont idempotents).
   > `iade_conges.sql` ne touche volontairement plus à ces politiques : le relancer seul
   > affaiblirait la sécurité au lieu de la rétablir.
2. **Un IADE ne peut pas se valider lui-même** : il n'écrit que sa propre ligne, et
   seulement tant qu'elle est `en_attente` (policy `iade_conges_update_self`) ;
   le trigger refuse en plus tout changement de statut hors `peut_gerer_iade()`.
3. **Le calendrier d'équipe ne fuit rien de sensible** : les IADE ne lisent pas la table,
   ils appellent la fonction `public.iade_calendrier(debut, fin)` (SECURITY DEFINER) qui
   renvoie *nom, jour, nature, statut* — **ni motif de refus, ni jour refusé**.
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

   Ce qu'un compte IADE compromis expose, à connaître : les **noms et dates** d'absence de
   l'équipe IADE, et la nature des jours (CP / récupération). Depuis l'abandon des motifs
   (2026-08-24), plus aucune donnée personnelle sensible n'y transite — un congé « enfant
   malade » ne se distingue plus d'un congé payé.
   Si un jour cela paraît trop, la 2FA se réactive pour eux en supprimant le test
   `profile?.is_iade` dans le routage de `src/App.jsx` — rien d'autre à changer.

---

## 6. Mise en service

1. **Base** — ✅ **fait le 2026-08-17**, modèle « jour par jour » appliqué le **2026-08-24**,
   sur le projet Supabase `SARM dashboard` (migrations `iade_conges`,
   `iade_conges_revoke_trigger_function`, `iade_conges_jour_par_jour`).
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
| `POST /api/iade-notify` | agent · MAR · gestion | `{ type, lot?, ids? }` — **toutes** les notifications IADE : congés (`pose`/`retrait`/`decision`) et heures sup (`hs_declaration`/`hs_modification`/`hs_reassignation`/`hs_retrait`/`hs_decision`/`hs_ajout`) |
| `GET\|POST /api/hs-decision` | **personne d'authentifié** | `?jeton=…&action=valider\|refuser` — décider depuis l'e-mail. Le GET **affiche**, le POST décide (cf. § 3 ter). |

Le **dépôt, la validation et le calendrier** passent **directement par Supabase sous RLS**
(pas de `service_role`). Seul l'**envoi des e-mails** de notification passe par le serverless
(il lui faut le `service_role` pour lire l'adresse du destinataire).

`iade-notify` **relit toujours les lignes en base** avant d'écrire un e-mail, et pour les
types adressés au MAR (`hs_declaration`, `hs_modification`, `hs_reassignation`, `hs_retrait`)
il restreint la relecture à `user_id = <appelant>` : un agent ne peut pas déclencher d'e-mail
sur la déclaration d'un collègue. Pour `decision`, il n'accepte que le **MAR désigné** ou la
gestion.

---

## 8. Pistes non retenues (à ce stade)

- **Solde / quota de congés par agent** (CP restants, compteur de récupérations dues) :
  écarté pour l'instant, on compte les jours posés sans les décompter d'un droit.
  Le modèle « une ligne = un jour, avec sa nature » rend ce calcul possible plus tard
  sans nouvelle migration.
- **Demi-journées** : non gérées, l'unité est le jour.
- **Saisie d'une absence par la gestion pour un agent** : la RLS l'autorise déjà
  (`iade_conges_insert`), l'écran ne l'expose pas encore.

> La piste « notification e-mail » (autrefois écartée) est désormais **implémentée** —
> voir § 9 ci-dessous.

---

## 9. Notifications e-mail (via Gmail)

Ajoutées le 2026-08-19. Envoi best-effort par **Gmail SMTP** (`api/_lib/mailer.js`,
cf. `AUTH.md § Étape 5`) — une notification qui échoue **ne bloque jamais** le congé.
Endpoint unique **`/api/iade-notify`** ; le front l'appelle après chaque mouvement
(`src/utils/iadeCongesApi.js` → `notifierConges`).

| Événement | Déclencheur | Destinataire | Gabarit (`emails.js`) |
|---|---|---|---|
| **Pose** d'un lot | l'agent | le(s) **gestionnaire(s)** (`is_gestion_iade` actifs) | `emailCongesPoses` |
| **Retrait / modif** de jours | l'agent | le(s) **gestionnaire(s)** | `emailCongesRetires` |
| **Décision** (validation **ou** refus) | la gestion | l'**agent** concerné | `emailCongesDecides` |

Garde-fous :

- Le serveur **relit toujours les jours en base** (jamais le contenu envoyé par le client) :
  ça valide l'appartenance du lot / des ids à l'appelant (pose, retrait) et garantit un
  e-mail fidèle à l'état réel. Les adresses des destinataires ne sont **jamais** renvoyées
  au client.
- **Destinataires = uniquement `is_gestion_iade`** (ni faiseur, ni admin), et c'est
  **dynamique** : réattribuer le rôle « Gestion » suffit, rien à changer dans le code.
- Le **retrait notifie AVANT la suppression** (sinon les lignes n'existent plus à relire) :
  ordre respecté dans `IadeMesConges.jsx`.
- Le refus embarque le **motif** (`motif_reponse`) dans l'e-mail à l'agent.

## 10. Planning collé — récap gestion & sync agenda IADE

Ajouté le 2026-08-19. Deux écrans **100 % côté client** (aucune donnée envoyée au
serveur, aucune écriture DB), branchés sur le fichier **visuel du planning IADE**
(généré hors-app : `vault/Projects/outils-planning/`). L'utilisateur copie tout le
tableau d'un mois depuis ce fichier et le colle ; le parsing lit les colonnes
séparées par tabulations. **Rien n'est codé en dur** : noms d'IADE lus dans
l'en-tête, noms de remplaçants lus comme texte libre.

| Écran | Page | Accès | Ce que ça fait |
|---|---|---|---|
| **Récap planning** | `src/components/iade/RecapPlanningColle.jsx` | `peutGererIade` (gestion / faiseur / admin) | colle le mois → récap congés (+ remplaçant / HS du même jour), remplaçants hors congé, heures sup ; export `.txt` |
| **Sync agenda** | `src/pages/IadeAgendaPerso.jsx` | comptes **IADE** (+ gestion) | colle le mois → clique son nom → s'abonne au flux iCal vivant (Apple / Google / Outlook), cf. §10 bis |

> **Le 2026-08-26, « Récap planning » a cessé d'être une page** : c'est un bloc de l'onglet
> **Synthèse comptable** (§ 3), sous « D'après le fichier du planning ». Il y voisine la
> synthèse tirée du dashboard : même geste — préparer le récapitulatif d'un mois à
> transmettre —, seule la source diffère. L'entrée de menu a disparu ; l'ancien identifiant
> de page `iade-recap-planning` renvoie vers l'écran de gestion, pour ceux qui l'auraient
> gardé ouvert.

Logique partagée : **`src/utils/planningColle.js`** (`analyserEntete`, `listerIades`,
`genererRecapTexte`, `genererIcs`), testée dans `planningColle.test.js`.

Garde-fous :

- **Congé = pas de travail** : dans l'agenda, un jour marqué « Congé » devient une
  journée entière « Congé » ; le poste affiché ce jour-là (pour le remplaçant) **ne
  crée aucun événement** de travail pour l'IADE.
- Le compte IADE atteint « Sync agenda » via `PAGES_IADE` (shell cloisonné dans
  `App.jsx`) ; le reste de l'app lui reste fermé.
- Données de planning (noms de salariés, postes) : le **parsing** se fait dans le
  navigateur ; seuls les **événements de l'agenda** de l'IADE connecté (ses postes /
  congés) sont stockés pour l'abonnement (ci-dessous), sous sa propre ligne RLS.

### 10 bis. Abonnement iCal vivant (« Sync agenda »)

Ajouté le 2026-08-19. Même principe que l'abonnement MAR (`api/agenda.js`), mais
**isolé** (aucune modification du code MAR). L'IADE colle un mois, clique son nom :
ses événements sont stockés et il s'abonne **une seule fois** ; l'agenda se met à jour
tout seul (rafraîchi par l'app cliente, jusqu'à ~1 h). Les mois se **cumulent**
(recoller un mois le met à jour, les autres restent).

| Brique | Fichier | Rôle |
|---|---|---|
| Table | `supabase/iade_agenda.sql` | `user_id` PK, `token` (URL-capacité), `actif`, `data` (événements cumulés). RLS « chacun sa ligne », **sans AAL2** (comptes IADE en AAL1). |
| Flux public | `api/agenda-iade.js` | `GET /api/agenda-iade?token=…` → ICS via service_role. Token inconnu / `actif=false` → calendrier **vide**. Événements **à l'heure** (congé / poste sans horaire = journée entière). |
| API client | `src/utils/iadeAgendaApi.js` | charger / activer (fusion par mois) / désactiver / vider — RLS `user_id = auth.uid()`. |
| Extraction | `src/utils/planningColle.js` | `extraireEvenementsIade` (JSON stockable) → réutilisé par le `.ics` téléchargé **et** par le flux. |
| UI | `src/pages/IadeAgendaPerso.jsx` | choisir sa colonne (ou coller un mois) → bloc d'abonnement Apple / Google / Outlook + activer/désactiver + copier l'adresse. |

**Depuis le 2026-08-26, l'agent désigne SA COLONNE et n'a plus rien à coller.** Un clic sur
sa colonne du planning publié (`iade_agenda.colonne`) et le flux **recalcule ses événements
à chaque appel** depuis `iade_planning` — tous les mois à la fois, corrections de la
republication nocturne comprises. La fenêtre publiée va de **62 jours en arrière à la fin de
l'année suivante**.

| Brique | Fichier | Rôle |
|---|---|---|
| Conversion | `api/_lib/evenementsPlanning.js` | lignes `iade_planning` → événements (mêmes règles que l'extraction d'un mois collé), testée |
| Suggestion | `src/utils/iadeAgenda.js` | rapproche `nom_complet` d'une colonne — **jamais imposé**, et rien n'est proposé si c'est ambigu |

- **`colonne` l'emporte sur `data`.** Laisser les deux vivantes mettrait deux vérités dans
  le même agenda. L'écran le dit quand une colonne est choisie ; « Ce n'est pas ma colonne »
  la retire et `data` redevient la source.
- **La suggestion ne vaut pas décision** : c'est l'agent qui clique. Se tromper de colonne
  remplirait son agenda avec les journées d'un collègue — et deux colonnes plausibles
  (`Marion`, `PAULINE>sabrina`) ne produisent aucune suggestion.
- **Une journée d'heures sup sans poste** (« +10h » sur un jour OFF, ça existe) donne un
  événement « Heures sup +10h » en journée entière : sinon une journée travaillée
  n'apparaîtrait nulle part.
- Le **congé n'affiche pas le poste** : celui du planning est là pour le remplaçant.

**⚠️ Mise en service** : exécuter `supabase/iade_agenda.sql` dans Supabase (SQL Editor)
**avant** usage — sans la table, l'activation échoue et le flux renvoie un agenda vide.
`gen_random_uuid()` et `public.touch_updated_at()` sont déjà présents (schéma de base).

#### Conformité du `.ics` — corrigé le 2026-08-27

Symptôme : sur **Google Agenda et Outlook**, l'abonnement s'ajoutait sans erreur et
**aucune journée n'apparaissait** ; sur Apple, tout marchait. Les deux flux du site
(`api/agenda.js` pour les associés, `api/agenda-iade.js` pour les IADE) étaient touchés.

Le flux servait bien ses 119 événements — le défaut était dans la forme du `.ics` :
**`DTSTAMP` manquait**, alors que RFC 5545 § 3.6.1 en fait une propriété **obligatoire**
d'un `VEVENT`. Apple la supplée ; Google et Outlook jettent l'événement **en silence**,
un par un, sans jamais rien afficher ni signaler. C'est ce qui rendait la panne si
déroutante : le calendrier apparaissait, avec son nom, définitivement vide.

Toute la fabrication du `.ics` est passée dans **`api/_lib/ics.js`** (testé), qui répare
aussi trois pièges du même genre :

| Piège | Ce qu'il coûtait |
|---|---|
| `DTSTAMP` absent | **la panne** — Google/Outlook rejettent chaque événement |
| Ligne > 75 octets non repliée (§ 3.1) | une note un peu longue casse l'analyse, chez Outlook tout le calendrier avec |
| Heure sans fuseau (`DTSTART:…T080000`) | chaque client l'interprète dans **son** fuseau ; on déclare `TZID=Europe/Paris` + un `VTIMEZONE` |
| `BEGIN:VEVENT` sans son `END` | un seul bloc non refermé invalide le calendrier **entier** — `evenement()` renvoie un bloc complet ou `null`, jamais un fragment |

`DTSTAMP` vaut la **dernière écriture de la source** (`updated_at`, ou le `maj` le plus
récent des lignes de `iade_planning`), pas l'instant courant : un `DTSTAMP` qui bouge à
chaque requête ferait rejouer tout l'agenda à chaque rafraîchissement, pour rien.

**Côté écran** (`src/utils/lienAgenda.js`, partagé par les deux pages), deux autres causes
de « rien ne s'affiche » qui n'ont rien à voir avec le flux :

- **Outlook** — `outlook.live.com` ne connaît que les comptes **personnels**. Avec un
  compte **professionnel Microsoft 365**, la page demande une connexion qui n'existe pas.
  Les deux liens sont désormais proposés (`outlook.office.com` pour le professionnel).
- **Google et Outlook s'abonnent depuis un ORDINATEUR, Apple depuis le téléphone.** Leurs
  applications mobiles n'ajoutent pas d'agenda par adresse — la fonction n'y existe pas.
  Un agent qui tente l'abonnement sur son téléphone ne voit strictement rien se passer :
  pas un agenda vide, **pas d'agenda du tout**. C'est ce qu'a vécu Nicolas. Apple fait
  exception parce que `webcal://` est géré par iOS lui-même, au niveau du système.
- **`?cid=` ajoute sur le compte Google ACTIF du navigateur**, pas forcément celui de
  l'agent ; et sur le téléphone, un agenda ajouté arrive **décoché** dans les paramètres
  de l'app. Ces deux points sont des **étapes du mode d'emploi**, pas un dépannage.

#### Règle de rédaction des consignes aux agents

**Une consigne donnée à un agent est une certitude, jamais une hypothèse.** Écrire
« essaie sur le téléphone, et si ça ne marche pas prends un ordinateur » fait porter le
diagnostic à l'agent, qui n'a aucun moyen de le mener : il conclut que l'outil est cassé.
Chaque bloc de plateforme s'ouvre donc sur **l'appareil à utiliser** (`s.ouSeFait`), puis
déroule des **étapes numérotées** qui vont jusqu'à « tes journées sont là ». Ce qui est
conditionnel pour nous doit être rendu déterministe pour l'agent : les deux Outlook ne se
présentent pas comme « prends le bon », mais comme un choix tranché par une chose qu'il
sait avec certitude — la fin de sa propre adresse e-mail.
- Le délai annoncé était faux : **~1 h sur Apple**, mais **jusqu'à 24 h** sur Google et
  Outlook, qui rafraîchissent bien plus lentement les abonnements externes. En revanche
  l'ajout initial, lui, doit remplir l'agenda **tout de suite** — sinon c'est une panne.

---

## 11. Redescente dans le planning Excel (Dropbox)

Décidé le 2026-08-24. Le fichier de référence de l'équipe est un **`.xlsx` sur Dropbox**,
**en lecture seule** pour les IADE et les MAR. L'écriture reste dans le dashboard, réservée
au rôle **gestion IADE**. Raison : Dropbox ne sait pas co-éditer un `.xlsx` — deux
enregistrements simultanés produisent une « copie en conflit », et avec une dizaine de
personnes c'est hebdomadaire.

La chaîne tourne sur le mini PC (hors de ce dépôt, dans `~/vault/Projects/outils-planning/`) :

```
dashboard (Supabase)  →  sync_planning.py  →  convertir_mois.py  →  rclone  →  Dropbox
   congés validés          conges-valides.json   Planning-IADE-…-visuel.xlsx
   heures sup validées
```

- Seules les lignes **`validee`** descendent. Les congés s'affichent « Congé CP » /
  « Congé récup. » en rouge, les heures sup « **+Xh** » en orange, dans la colonne
  « Congé / HS » **à côté** du poste — qui reste visible, pour que le remplaçant sache où aller.
- **Le congé prime** si un jour porte les deux : la colonne ne tient qu'une annotation.
  Le cas est **signalé** en fin de génération plutôt que passé sous silence.
- L'appariement se fait sur le **prénom** (`profiles.nom_complet` → en-tête de colonne du
  fichier). Toute ligne qui ne trouve pas sa case est **nommée** dans la sortie, et
  l'envoi Dropbox est **annulé** — une disparition silencieuse avait déjà effacé un mois
  entier d'un agent.
- Base injoignable → arrêt **sans envoi** : mieux vaut le fichier d'hier qu'un fichier neuf
  où les congés auraient disparu.

Détail d'exploitation et configuration : `outils-planning/LISEZ-MOI.md` § 5.

---

## 12. Onglet « Planning IADE » — le même écran pour les agents et les MAR

Décidé le 2026-08-25. Jusqu'ici, savoir qui était au bloc supposait d'ouvrir le fichier
Dropbox. L'onglet **Planning IADE** met ce même planning dans le dashboard, **en lecture
seule**, avec **un seul écran pour tout le monde** : agents IADE et associés MAR voient la
même page, les mêmes données. Deux écrans auraient fini par afficher deux vérités.

**Le fichier Excel fait foi.** Les tables ne sont qu'un **miroir** : personne n'écrit
dedans depuis l'application — pas même la gestion IADE. Une correction se fait dans le
fichier, sinon les deux versions divergent et plus personne ne sait laquelle croire.

### Le chemin de la donnée

```
Planning IADE 2026.xlsx (vault, mini PC)     ← le fichier fait foi
   └─ convertir_mois.py        → fichier visuel .xlsx + planning-iade.json (même passage)
        ├─ rclone copyto       → Dropbox (lecture seule, 19 membres)
        └─ pousser_planning.py → Supabase : iade_planning, iade_planning_jour, iade_planning_maj
                                    └─ onglet « Planning IADE » (agents + MAR)
```

Le `.json` est produit **au même passage** que le fichier visuel, volontairement : deux
lectures séparées du fichier source finiraient par diverger. Le tout tourne dans le cron
de 5h du mini PC (`publier-dropbox.sh`).

### Écran et fichiers

| Quoi | Fichier |
|---|---|
| Page (grille du mois) | `src/pages/IadePlanning.jsx` |
| Logique pure (couleurs, colonnes, index par jour) — testée | `src/utils/iadePlanning.js` |
| Lecture Supabase (aucune écriture) | `src/utils/iadePlanningApi.js` |
| Tables, RLS | `supabase/iade_planning.sql` |
| Publication depuis le mini PC | `vault/Projects/outils-planning/pousser_planning.py` |

- **Grille du mois**, et rien d'autre : une ligne par jour, une colonne par IADE **dans
  l'ordre du fichier** (pas alphabétique : l'équipe cherche la colonne là où elle est dans
  le fichier), couleurs des postes identiques à celles de l'Excel, jours de vacances
  scolaires en jaune, jour courant marqué d'un liseré à gauche. Un **espace vide sépare les
  semaines**, comme la ligne vide du fichier : sans elle, le mois se lit comme un seul bloc.
- Sur les fonds jaunes, l'encre est **imposée en sombre** (`#2C2C2A`) : le jaune ne change
  pas avec le thème, le texte ne doit pas changer non plus — en mode sombre,
  `var(--color-text)` y devenait illisible.
- **Chaque IADE occupe DEUX colonnes**, comme dans le fichier visuel : ses **horaires**,
  et une colonne **« Congé / HS »** à côté — congé en **rouge plein** (`#E24A3B`, la
  couleur du fichier), heures sup sur le **beige** (`#F4D8B8`). L'en-tête tient sur deux
  lignes, le nom coiffant ses deux colonnes. Repris le 2026-08-26 : l'annotation était un
  badge de 9 px dans un coin de la case, invisible sur un mois entier — or c'est
  précisément ce qu'on vient chercher. **Le poste n'est jamais effacé** : c'est celui que
  le remplaçant vient couvrir.
- `natureNote()` range les écritures irrégulières du fichier (« Congé », « conge »,
  « +10h », « HS ») en deux natures ; `libelleNote()` garde le libellé du congé tel quel
  (« Congé CP », « Congé récup. » quand la nature est connue) et aère le nombre d'heures
  (`+10 h`), qui se lisait comme un horaire.
- **« À jour au … »** est affiché en haut : un planning figé par un cron en panne doit se
  voir, pas se deviner.

### Sécurité

- Lecture : `public.is_iade() or public.acces_cabinet()` — les agents (sans 2FA, comptes
  restreints) et les associés (2FA exigée par la RLS).
- Écriture : **aucune politique**. Seule la clé de service, sur le mini PC, écrit — elle
  contourne la RLS. Cette clé vit dans `~/.config/planning-iade/env` (`chmod 600`),
  **jamais dans le vault ni dans le dépôt**.
- Republication par **fusion puis ménage** (`maj < horodatage du passage`) : la table n'est
  jamais vidée, personne ne tombe sur un planning vide pendant la republication nocturne.

---

## 13. Onglet « Rempla » — chercher, puis nommer les remplaçants

Ajouté le 2026-08-26. Troisième onglet de « Congés, HS et rempla » (§ 3), réservé à la
gestion. Il suit l'ordre dans lequel les choses se passent vraiment :

1. **on désigne les jours** où il manque quelqu'un — au calendrier, ou en partant des
   **suggestions tirées des congés posés** ;
2. **on copie le mail** de recherche et on l'envoie ;
3. **on inscrit le nom** de celui qui a répondu, on valide, et il apparaît dans le
   **planning IADE**.

### Le calendrier

Un clic ouvre une recherche sur le jour, un deuxième en demande un **second** sur le même
jour (deux remplaçants, pas plus — `check rang between 1 and 2`), un troisième remet le jour
à zéro. **Maj + clic** étend depuis le dernier jour cliqué : une semaine d'absence se pose en
deux gestes. Les jours où un IADE est absent portent un **liseré** : c'est là qu'il faut
quelqu'un neuf fois sur dix.

> ⚠️ Le troisième clic **n'efface jamais un besoin nommé ou pourvu** (`actionClicJour`) : le
> clic de trop est la faute la plus facile à faire, il ne doit pas coûter un nom qu'on a mis
> trois jours à trouver. Ceux-là se retirent explicitement, dans la liste.

### Les suggestions

`suggestionsDepuisConges()` propose les plages de congés **demandés comme validés** — on
cherche un remplaçant avant de valider, pas après — en ne gardant que les jours qui ne
portent encore aucun besoin. Une plage entièrement couverte disparaît de la liste.

### Le mail

`texteMailRempla()` produit le texte à copier-coller : qui nous sommes, les dates (jours
consécutifs regroupés, « — 2 remplaçants » quand il en faut deux), le lieu des vacations
(endoscopies digestives) et le tarif (30 € brut de l'heure). **Aucune coordonnée**, par choix
explicite : elles s'ajoutent à la main avant l'envoi. Le texte est **modifiable dans l'écran**
avant d'être copié ; « Régénérer » revient à la version calculée. La portée (mois affiché ou
année entière) vaut pour la liste **et** pour le mail.

### Le nom, et le planning

« Valider » passe la ligne en `pourvu` et le nom s'affiche aussitôt dans la colonne
**Remplaçants** de l'onglet « Planning IADE », en **couleur primaire**, avec l'infobulle
« saisi dans l'onglet Rempla, pas encore dans le fichier ». Les noms déjà présents dans
l'Excel ne sont pas répétés (comparaison insensible à la casse et aux espaces).

> ⚠️ **Ces lignes ne sont pas écrasées par la republication nocturne.** `iade_planning*` est
> le miroir du fichier Excel ; `iade_remplacements` appartient au dashboard, et
> `pousser_planning.py` n'y touche pas. C'est le seul endroit où le planning affiché n'est
> pas strictement le fichier — d'où le marquage visuel, qui doit rester.

### Tout se défait

C'est la partie du module qui bouge le plus : un remplaçant se décommande, un congé est
annulé, on change d'avis. Rien n'est irréversible.

- **Dévalider conserve le nom** (`devaliderBesoin`) : la même personne revient souvent,
  la retaper à chaque hésitation serait une punition.
- Retirer un jour ne touche pas les autres ; aucune suppression en cascade.
- Un `pourvu` porte forcément un nom (`check statut <> 'pourvu' or nom is not null`) : sans
  ça, le planning afficherait une case vide en prétendant que le jour est couvert.
- Chaque écriture repose sur une relecture depuis la base : deux personnes peuvent
  travailler dessus en même temps.

### Sécurité

Lecture : `is_iade() or acces_cabinet()` — les remplaçants figurent déjà dans le planning que
tout le monde consulte, les cacher ici serait une fausse pudeur. Écriture : `peut_gerer_iade()`
seule. `cree_par` / `maj_par` sont posés par un **trigger**, jamais par le client, et la
fonction de trigger est **révoquée de l'API REST** (elle n'a rien à faire en `/rest/v1/rpc/`).

Fichiers : `supabase/iade_remplacements.sql` · `src/utils/iadeRempla{,Api}.js` ·
`src/components/iade/{RemplaGestion,CalendrierRempla}.jsx` · `src/pages/IadePlanning.jsx`
(fusion à l'affichage).

---

## 14. Onglet « Créneaux » — les salles qui ne tournent pas

Ajouté le 2026-09-03. Troisième onglet de « Congés, HS et rempla » (§ 3), réservé à la
gestion. Il remplace les deux colonnes **vides et manuelles** du fichier visuel
(« Salles Bloc B », « Absence Bloc A ») que personne ne remplissait.

Une ligne = **une salle, un jour, un moment**. La gestion note qu'un créneau saute, dit
quelle salle et — facultatif — quel opérateur est absent. Deux salles fermées le
même matin font deux lignes ; rien n'interdit « Bloc B le matin » et « Endoscopie
l'après-midi » le même jour.

> **La saisie se fait par lot, parce que l'information arrive par lot.** Un opérateur
> annonce ses absences d'un bloc (« je ne suis pas là les 12, 15 et du 20 au 22 »). On
> clique ses jours sur le calendrier — **Maj + clic** étend depuis le dernier jour cliqué —,
> on nomme la salle, le moment et l'opérateur **une seule fois**, et tout part en une
> insertion. Un jour déjà noté ne fait pas échouer le lot : il est écarté, signalé, et les
> autres passent — le cas courant quand l'opérateur renvoie sa liste complétée.

> ⚠️ **C'est le seul endroit du module IADE qui descend à la demi-journée.** Congés et
> heures sup comptent en journées, délibérément (§ 8). Ici la demi-journée est le fait
> métier lui-même : une salle ferme souvent le matin seulement, et l'agent libéré travaille
> l'après-midi. Ne pas « harmoniser » en journées, ce serait perdre l'information utile.

| Brique | Fichier | Rôle |
|---|---|---|
| Table, RLS | `supabase/iade_creneaux_fermes.sql` | `(jour, moment, salle)` unique ; `moment ∈ journee/matin/apres_midi` ; trigger de traçabilité qui nettoie aussi les espaces |
| Logique pure | `src/utils/iadeCreneaux.js` | tri d'un jour, salles déjà saisies, compte des demi-journées, sélection multiple (`basculerJour`, `resumeJours`), contrôles de saisie (`verifierCreneau`, `verifierLot`) — testée |
| Accès Supabase | `src/utils/iadeCreneauxApi.js` | lecture par année ou par période, ajout d'un lot (`ajouterCreneaux`), correction, retrait |
| Calendrier | `src/components/iade/CalendrierCreneaux.jsx` | sélection multiple ; les jours déjà fermés sont teintés et comptés |
| Écran | `src/components/iade/CreneauxGestion.jsx` | saisie par lot, liste du mois ou de l'année, correction et retrait ligne par ligne |

- **Les contrôles refusent l'incohérent** : la même salle deux fois sur le même moment, une
  journée entière quand une demi-journée est déjà posée, une demi-journée déjà comprise
  dans une journée entière. Le message dit quoi faire, pas seulement que c'est refusé.
- **Une plage est bornée à 62 jours** (`MAX_JOURS_LOT`) : au-delà, c'est un Maj + clic à
  l'autre bout de l'année, pas une intention.
- **La correction reste au jour près** : en mode « Corriger », le calendrier passe à un seul
  jour et un clic ailleurs déplace le créneau au lieu d'en ajouter un.
- **Les salles déjà saisies sont proposées à la frappe** (`datalist`) : personne ne devrait
  retaper « Endoscopie 2 » vingt fois ni en inventer l'orthographe.
- Le compte affiché est en **demi-journées** (une journée entière en vaut deux) : c'est
  l'unité dans laquelle la gestion raisonne pour savoir où elle a du monde en trop.

**Dans le planning** (§ 12), une colonne **« Créneaux en moins »** à droite des remplaçants
affiche « Bloc B — matin (Dr Martin) ». Journée entière en **rouge**, demi-journée en
**brun** : la nuance se lit sans relire le texte. Comme les remplaçants, ces lignes
appartiennent au dashboard — la republication nocturne du miroir Excel ne les touche pas.

Lecture : `is_iade() or acces_cabinet()`. Écriture : `peut_gerer_iade()` seule.
