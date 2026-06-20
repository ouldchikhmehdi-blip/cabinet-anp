# PLANNING.md — Module « Planning »

> Source de vérité du module planning. À lire avant toute intervention sur la partie planning.
>
> Le site comporte deux parties indépendantes : le **dashboard financier** (existant) et le **planning** (ce module). Ce document ne concerne que le planning.
>
> **Contexte métier** : outil d'aide à la fabrication du planning d'une équipe de 8 anesthésistes (gardes, astreintes, réanimation, bloc, vacances…), en complémentarité avec un second groupe d'anesthésie de la même clinique. Aucune donnée patient ni bancaire ici ; les personnes sont désignées par leurs initiales.
>
> **Esprit de l'outil** : un assistant (pas un robot). Il propose, tient les compteurs à jour, alerte sur les déséquilibres — mais l'humain a toujours le dernier mot. Voir §13.
>
> **Environnement du faiseur** : le faiseur de planning travaille sur ordinateur (PC Windows, grand écran). Ses écrans réservés — Base calendrier (Étape 0), Suivi des desiderata, construction du planning — sont pensés et optimisés pour un usage **desktop Windows** (grilles et tableaux larges, forte densité, impression A4/PDF), sans contrainte de responsive mobile. Seuls les écrans de **saisie des desiderata** (côté associés) restent accessibles depuis n'importe quel appareil.

---

## Fiche de règles — Planning d'anesthésie

Document de travail à relire et corriger. Il servira de cahier des charges pour l'outil.

### 1. Contexte et objectif

L'équipe d'anesthésie établit chaque année un planning d'affectation des associés sur les différents postes (bloc, réa, gardes, astreintes, etc.). L'objectif est de construire un outil (à terme un site web) qui produit un tableur type Excel modifiable au fur et à mesure, pour aider à fabriquer ce planning.

Le planning se construit en 3 phases dans l'année :

- Janvier → fin juin
- Été (fonctionnement particulier, voir §9)
- Septembre → décembre

### 2. Les acteurs

- 8 anesthésistes, désignés par leurs initiales : **EH, MP, RC, FXD, BA, FF, YC, MOC**.
- Un second groupe d'anesthésie travaille dans la même clinique. Les rôles sont complémentaires : quand notre groupe est de garde, l'autre est d'astreinte, et inversement. Le planning de l'autre groupe n'est pas modélisé.

#### Remplacer un associé / changer une initiale

Les **initiales sont l'identifiant unique** d'un associé dans tout le planning (clés des données : week-ends, vacances, réa, colonnes « en semaine », objectifs, compteurs de référence, Noël/Toussaint). Il n'existe pas d'identifiant stable distinct. Le remplacement se fait **depuis l'écran admin**, sans intervention de code ni redéploiement.

**Principe** : le changement ne vaut **que pour le prochain planning**. On **ne migre pas** les données déjà saisies ; les plannings déjà produits sont figés dans les **archives Excel** (bucket `planning-archives`), indépendantes des initiales courantes. Faire le changement **entre deux cycles** (après archivage du cycle terminé), pas en cours de cycle.

**Où vit la liste** : la liste ordonnée des associés (= ordre des colonnes) est stockée **en base**, table `planning_associes` (ligne unique `id=1`, colonne `liste` jsonb). Elle est chargée au démarrage de l'app par `src/utils/associesApi.js` → `chargerAssociesDepuisBase()`, qui mute **en place** `ASSOCIES` (`src/data/associes.js`). Le gate `siegesPrets` (`AuthContext` / `App.jsx`) garantit que la liste est appliquée **avant** l'affichage des écrans planning/comptes. Côté serveur, `api/_lib/associes.js` → `chargerAssocies()` lit la même table (repli sur la constante codée si la base est indisponible).

**Procédure (admin, dans « Gestion des comptes »)** :

1. Section **« Associés du planning »** → bouton **« Remplacer »** sur l'initiale du partant → saisir les nouvelles initiales. Appelle `POST /api/planning-remplacer-associe` qui remplace l'initiale **à la même position** dans la liste (ordre des colonnes préservé) et fait suivre un éventuel compte qui la portait encore.
2. **Supprimer définitivement** l'ancien compte (bouton « Supprimer ») → libère l'attribution.
3. **Inviter** le nouvel associé, puis lui **attribuer la nouvelle initiale** (colonne « Initiales »).
4. Démarrer le nouveau cycle : objectifs / compteurs de référence / desiderata se saisissent pour la nouvelle initiale. Le cycle précédent reste figé dans les archives Excel.

**Couleur d'affichage** : `src/pages/PlanningAffiche.jsx` → `COULEUR_ASSOCIE` associe une couleur à chaque initiale (codée). Une initiale **non listée** prend une **couleur de repli neutre** (`COULEUR_DEFAUT`) — l'app ne casse jamais. Pour une couleur dédiée à la nouvelle initiale, l'ajouter dans cette map (seul point qui demande encore une petite édition de code, purement cosmétique et optionnelle).

> Les occurrences d'initiales repérables dans `grilleSemaine.js` / `exportCalendrier.js` sont des **codes couleur ARGB** (`FF…`), pas des initiales : ne pas y toucher.

**Pré-requis base** : exécuter une fois `supabase/planning_associes.sql` (table + RLS + valeur initiale) dans Supabase. Tant que ce n'est pas fait, l'app fonctionne sur la liste codée de repli (le remplacement échouera proprement, sans rien casser).

### 3. Structure de la semaine (rôles garde / astreinte)

| Jour | Rôle de notre groupe | Type de règle |
|---|---|---|
| Lundi | Astreinte | dure (toujours) |
| Mardi | Garde | dure (toujours) |
| Mercredi | Astreinte | dure (toujours) |
| Jeudi | Garde ou astreinte | rotation (Étape 0) |
| Vendredi | Garde ou astreinte | rotation (Étape 0) |
| Samedi | Astreinte (A) par défaut | rotation (Étape 0) |
| Dimanche | Garde (G) par défaut | rotation (Étape 0) |

Le jeudi, le vendredi et les week-ends sont régis par une rotation avec l'autre groupe d'anesthésie : pour chaque jour concerné, le statut de notre groupe (garde ou astreinte) est fixé dans la base brute du calendrier (cf. Étape 0, §12), pas décidé par l'outil.

### 4. Les semaines type / trames (cœur du système)

**Une trame = une semaine type ENTIÈRE** : une grille de plusieurs **colonnes**, chaque colonne
étant une **séquence figée** de postes du **lundi au vendredi** (ex. SARM 1 → Endoscopie →
Viscérale → repos → Endoscopie). Une **cellule vide = repos** (les repos « post-week-end »,
post-garde, post-viscéral sont déjà intégrés dans les colonnes fournies ; l'outil ne les recalcule
pas). Chaque colonne encode à elle seule « ce qui doit se suivre / ce qui ne peut pas se suivre » ;
**la succession à l'intérieur d'une colonne ne change jamais**, mais **on peut intervertir les
colonnes entre associés**.

Affecter le planning d'une semaine = donner une colonne à chaque associé. **Des colonnes
spéciales sont DÉSIGNÉES par le faiseur sur chaque trame** (plutôt que devinées par contenu, plus
fiable) ; elles se remplissent automatiquement à l'affectation, d'après les étapes précédentes :

- colonne **Réa** (`rea`) → l'associé de réa (étape Réa) ;
- colonnes **Vacances** (`vacances`, **un tableau** : une ou **plusieurs** colonnes) → les associés en
  **vacances** cette semaine (étape Vacances) ; le i-ᵉ congé est placé sur la i-ᵉ colonne vacances ;
- colonne **avant le week-end** (`avantWE`) → celui qui **s'apprête à faire le week-end suivant**
  (lien avec l'étape Week-ends : ce week-end → cette colonne, qui porte tel jour off) ;
- colonne **après le week-end** (`apresWE`) → l'associé qui **revient de week-end**.

À la création d'une trame, **Réa, Vacances et Remplaçant sont pré-suggérées** : Réa = colonne tout en
« réa » ; Vacances = **toutes** les colonnes entièrement vides ; Remplaçant = les colonnes **au-delà du
8ᵉ rang** (C9, C10, C11…) non vides (postes externes). Tout reste modifiable. Les **autres colonnes** se
répartissent ensuite pour **coller aux jours off demandés** (jour off demandé = colonne dont ce jour est vide).

**Colonnes remplaçant.** Certaines trames ont en plus une ou plusieurs colonnes **remplaçant** (le ou
les remplaçants pris cette semaine-là ; c'est la colonne ajoutée à droite de la grille). Le faiseur les
**désigne et les nomme** librement (`remplacants: [{ col, nom }]`, ex. « Remplaçant 1 », « Remplaçant 2 »).
Le catalogue contient donc plusieurs variantes selon les cas : sans remplaçant, avec 1 remplaçant, avec
2 remplaçants, ou même 1 remplaçant avec une **rotation différente** (chaque variante = une trame nommée).

> **Règle Excel (planning assemblé, à venir).** Une colonne remplaçant ne tombe **jamais** sur une
> colonne d'associé : dans l'export du planning assemblé, elle apparaît en **colonne(s) supplémentaire(s)
> tout à droite** du tableau (`Date | 8 associés | Date | Groupe | Remplaçant 1 | Remplaçant 2…`).

Il n'y a **pas de rotation strictement équilibrée** : selon les jours off, une même colonne peut
revenir rapprochée pour un même associé.

**Repos = couleur vacances.** Dans les grilles de trame (écran), une case repos s'affiche avec la
couleur « congé » cyan **#00B0F0** (identique à `ARGB.conge` de l'export et aux fichiers d'origine).
Composant partagé : `src/components/planning/TrameGrille.jsx`.

**Trame principale → desiderata.** Le faiseur désigne **une trame principale** (`data.principaleId`).
Elle est affichée aux associés dans leurs desiderata (recueils **hors été**) : ils peuvent demander,
**par semaine, une colonne** (`colonnesSouhaitees: { <numSemaine>: <colIndex> }` dans les desiderata).
Seules les **colonnes au choix** sont proposées **et affichées** dans la grille montrée à l'associé
(Réa, Vacances, Remplaçant **et les colonnes avant/après week-end** sont exclues — affectées
automatiquement). Helper : `colonnesSelectionnables()` dans `src/utils/trames.js` ; la grille
([TrameGrille](src/components/planning/TrameGrille.jsx)) reçoit alors `colonnesVisibles`. Le champ
texte libre « demande de colonne » a été **supprimé** (redondant avec ce choix par semaine).

**Catalogue annuel de trames (en place).** Le faiseur apporte ses semaines type par **collage depuis
Excel** : un bloc de 5 lignes lun→ven × N colonnes = **une trame**, nommée une seule fois et
enregistrée. Catalogue libre, propre à chaque année (les structures changent selon les
chirurgiens/opérateurs). Persistance : table `planning_trames`
(`{annee, data:{ v, principaleId, trames:[{id,nom,colonnes:[{lun..ven}]}] }}`), RLS lecture-tous /
écriture-faiseur. Modèle : `src/utils/trames.js` ; API : `src/utils/tramesApi.js` ;
composant : `src/pages/PlanningTrames.jsx`. **Géré depuis la page « Suivi des desiderata »** (section
dépliable « Trames de l'année »), pour que le faiseur prépare ses trames au moment où il ouvre le
recueil de desiderata — et non plus dans l'assistant « Base calendrier ».

Plusieurs variantes coexistent dans le catalogue (fournies chaque année) :

- sans remplaçant ;
- avec remplaçant — plusieurs structures « avec remplaçant » (la trame change selon le remplaçant et ce qu'il couvre ; la colonne remplaçant est ajoutée à droite de la grille) ;
- la semaine particulière qui suit un week-end de garde ;
- variante « vendredi de garde » vs « vendredi d'astreinte ».

**Sélection de la variante** : elle dépend d'abord de la présence ou non d'un remplaçant cette semaine-là. Pendant les vacances scolaires, on prend plus de remplaçants → on est sur une version « avec remplaçant ». Quand le faiseur de planning décide de mettre un remplaçant sur une semaine, l'outil lui propose les différentes structures de remplaçant disponibles et il choisit celle qu'il veut.

Chaîne logique :

1. Quelle période ? (normale / vacances scolaires / été)
2. Y a-t-il un remplaçant cette semaine ?
3. → sélection de la matrice de semaine type
4. → affectation des personnes aux colonnes (selon desiderata + quotas + espacement)

### 5. Règles dures (à respecter absolument)

- Lundi = astreinte, mardi = garde, mercredi = astreinte (cf. §3).
- **Un seul poste à la fois** : un associé n'occupe qu'un poste à un instant donné. **Les vacances comptent comme un poste** → on ne peut pas être en réa (ni à un autre poste) une semaine de congé.
- **Repos du lendemain** :
  - après une garde → lendemain off (toujours) ;
  - après une astreinte → lendemain off (toujours) ;
  - après un viscéral le mardi → mercredi off ;
  - après un viscéral le jeudi → vendredi off.
- **Réa jamais deux semaines d'affilée (RÈGLE DURE)** : un même associé n'enchaîne **jamais** deux semaines de réanimation consécutives. L'auto ne le crée jamais (proposeur + optimiseur), l'invariante `reaConsecutive` le signale, et le bord avec les autres périodes (réa hors-plage en S-1/S+1) est pris en compte. (`src/utils/rea.js`, `invariantsRea`.)
- **Réa et week-end de garde non accolés** : une semaine de réa ne doit être ni **juste avant** un week-end de garde du même associé (réa S + garde le WE S), ni **juste après** (garde le WE S-1 → lundi de repos, donc pas de réa la semaine S). À éviter, sauf exception validée par le faiseur (relâché en tout dernier recours par l'auto).
- **Vacances et week-end de garde non accolés (RÈGLE DURE)** : un associé ne peut **jamais** être de week-end de garde **collé** à l'une de ses semaines de congé — ni le week-end **avant** (WE S-1) ni **juste après** (WE S, congé lun→ven puis ce week-end). L'auto-attribution ne le crée **jamais** (côté week-ends comme côté vacances, souhaits compris) : si tous les candidats sont collés, la case reste **vide / non pourvue** (le faiseur tranche). Seul le **faiseur peut forcer** (verrou) ; il en est alors **informé** (pastille « 🟠 vac. » côté week-ends, « 🟠 garde » côté vacances). La **réa** reste en règle molle (point précédent). (`src/utils/weekends.js`, `src/utils/vacances.js`.)
  - **Source des vacances « placées » à l'étape Week-ends** : `planning_vacances` **réuni** aux vacanciers des **grilles imposées collées** (Toussaint **et** Noël, via `vacanciersParSemaineNoel`). Ainsi, si le faiseur colle la **Toussaint avant** de faire les week-ends, ses congés sont d'emblée traités comme du **dur** par la règle ci-dessus (le week-end avant/après une semaine de vacances de Toussaint n'est jamais attribué à ce vacancier). Les **week-ends de garde** de la grille restent par ailleurs **imposés** (`weekendsGardeNoel`) et comptés dans l'équilibrage.

### 6. Règles molles (à viser, ajustables)

- **Espacement des gardes** : idéalement ≥ 10 jours entre deux gardes (au minimum une semaine).
- **Espacement des vacances** : éviter deux semaines de congé d'un même associé à **moins de 4 semaines** d'écart (« deux sur quatre »). Règle molle : l'attribution auto l'évite au maximum mais le fait si nécessaire ; sinon **pastille orange « rapprochées »** (et compteur), le faiseur arbitre. Jamais bloquant. **Un associé peut demander deux semaines d'affilée** (desiderata) : ses **souhaits sont respectés** (jamais retirés par l'espacement), l'alerte sert alors **uniquement à informer** le faiseur que c'était demandé. (`ESPACEMENT_VAC_MIN`, `src/utils/vacances.js`.)
- **Anticipation des souhaits de vacances à l'étape week-end (souple).** Dès la 1ʳᵉ passe (les week-ends sont calés **avant** que les vacances soient posées), l'auto **évite de coller un week-end de garde à une semaine de vacances SOUHAITÉE** par l'associé (S = même semaine, ou S+1 = week-end juste avant le souhait), pour ne pas se coincer ensuite au moment de poser les congés. **Souple** : jamais bloquant (≠ vacances **déjà placées**, règle **dure** — cf. §5) ; si c'est inévitable, le rapprochement va sur le **plus demandeur** (équité). Pastille **🟡 « souhait vac. »** quand un week-end reste accolé à un souhait. (`vacancesSouhaiteesParAssocie`, `proposerWeekends`/`analyserAffectation`, `src/utils/weekends.js`.)
- **Pont de jour férié vs week-end de garde (alerte).** Attribuer un week-end donne à l'associé la **colonne avant-WE** (semaine S, dont le **vendredi**) et la **colonne après-WE** (semaine S+1, dont le **lundi**). Un jour off ordinaire le lundi/vendredi **n'empêche pas** l'attribution (la colonne peut le reposer). **Exception** : si ce lundi/vendredi est un **pont de jour férié** (off accolé à un férié), être de garde ce week-end **casse le pont** → l'auto l'**évite** (souple, jamais bloquant ; si inévitable, charge le plus demandeur) et le **faiseur est alerté** (pastille **🟠 « pont férié »** + entrée « à arbitrer »). Détection via les ponts déjà calculés (`detecterPontsTous`) : un off **vendredi** → week-end de S, un off **lundi** → week-end de S-1 ; les ponts **écartés** par le faiseur sont ignorés. (`pontFerieParAssocie`, `src/pages/PlanningWeekends.jsx` ; `proposerWeekends`/`analyserAffectation`, `src/utils/weekends.js`.)
- **Astreintes** : plus de tolérance, peuvent être plus rapprochées.
- **Équité des rapprochements (qui demande plus absorbe)** : quand un rapprochement est **inévitable** (week-ends ou vacances trop proches), l'auto le charge sur l'associé ayant formulé **le plus** de desiderata (`scoreDemande` = jours off + vacances souhaitées + week-ends indispo + souhaits de colonne), de sorte que le **moins-demandeur soit protégé**. C'est un **départage** : l'équilibre du **nombre** de week-ends/vacances et les **plafonds** (objectifs) restent prioritaires. Règle commune aux étapes Week-ends, Vacances et En semaine (`scoreDemande`, `src/utils/desiderata.js`).
- **Au bloc** (viscéral ou Bloc A) : souvent off le lendemain (pas systématique).
- Ces règles se relâchent en situation dégradée (été, sous-effectif), où gardes/astreintes peuvent être rapprochées.
- **Équilibrage entre associés** : gardes, astreintes, week-ends et semaines de réa répartis à peu près également entre tous — non seulement sur l'année, mais sur chaque période (janv-juin / été / sept-déc). Ex. : éviter qu'une personne fasse 1 semaine de réa sur janv-juin pendant qu'une autre en fait 4 sur la même période. Des écarts sont acceptables, mais pas trop importants.
- **Bouton « Optimiser » (toutes les étapes)** : après « Proposer », chaque étape (Week-ends, Réa, Vacances, En semaine) offre un bouton **« Optimiser »** = recherche locale déterministe à **score lexicographique desiderata ≫ équilibre ≫ espacement**. Il part de l'état courant (proposition + ajustements manuels), respecte les **règles dures** et les **verrous**, et est **idempotent** (cliquable plusieurs fois). Utile pour **itérer entre étapes** : après avoir modifié les vacances, revenir sur Week-ends/Réa et « Optimiser » pour recaler en tenant compte des nouveaux congés. (`optimiserWeekends`/`optimiserRea` via `optimiserAssignation`, `optimiserVacances`, `optimiserSemaines`.)

### 7. Le repos du lendemain comme levier

Le repos qui suit une garde/astreinte est **déplaçable**, puisque c'est l'équipe qui décide qui prend la garde tel jour.

- Quand une personne demande un jour off précis (jour X), on cherche en priorité à lui caler une garde/astreinte (ou viscéral/bloc) le jour X-1, pour que le repos obligatoire tombe pile sur le jour off demandé. Le jour off est satisfait sans gaspiller un jour de repos.
- La demande dominante des associés, c'est « voilà où je veux poser mon repos ».

**Le week-end comme levier (attribution des week-ends, en place).** Attribuer un week-end à X le
place, via la **trame principale**, sur la colonne **avant-WE** en semaine W et **après-WE** en
semaine W+1, dont les repos sont fixes (ex. lundi off après le week-end). L'attribution automatique
des week-ends **exploite ça** : elle **évite** de donner un week-end qui rendrait impossible un jour
off demandé en S(W)/S(W+1) (la colonne ne repose pas ce jour-là) et **privilégie** un week-end dont le
repos coïncide avec le jour off souhaité (ex. veut le lundi off → week-end juste avant). Reste un
**réglage** (badge « bloque jour off » si forcé), jamais bloquant — le faiseur tranche.
Helper : `impactJourOffWE()` dans `src/utils/weekends.js`.

### 8. Vacances (hors été)

- Le nombre de semaines de vacances est une variable annuelle (distincte été / hors-été).
- **Exclusivité Pâques / février** : on ne peut pas avoir les deux → choisir l'un ou l'autre (préférence par personne).
- **Positionnement de la préférence scolaire (en place).** La préférence (`fevrier`/`paques` + `s1`/`s2`/`indifferent`, idem Toussaint) est **convertie en semaine(s) ISO concrète(s)** à partir des **vraies** semaines scolaires de la base calendrier (`calendrier.vacancesScolaires`), regroupées par période via `blocsVacancesScolaires(annee, …)` (`calendrier.js`, réutilise `blocToussaint`) : `s1` → 1ʳᵉ semaine du bloc, `s2` → 2ᵉ, **`indifferent` → UNE semaine, répartie pour équilibrer la couverture entre 1ʳᵉ et 2ᵉ** (déterministe, ordre des associés). Ces semaines sont injectées dans `souhaitParAssocie` (`semainesSouhaitScolaire` dans `vacances.js`) avant `proposerVacances`, et alimentent aussi l'alerte « souhait non réalisé ». **Ne jamais** s'appuyer sur la constante indicative `VACANCES_SCOLAIRES_2026` pour le positionnement (source = base calendrier).
- **Toussaint** : souvent une personne ne peut pas la prendre ; conditionnel selon les remplaçants trouvés.
- **Couverture minimale** :
  - chaque semaine : au moins 1 associé en vacances ;
  - en vacances scolaires : presque toujours au moins 2 ;
  - l'été : davantage.
- **« Proposer automatiquement » vs « Optimiser »** (étape Vacances).
  - *Proposer* = génération depuis zéro (glouton **déterministe**, respecte les verrous) : un point de départ reproductible (reclic → même résultat).
  - *Optimiser* = **recherche locale** (hill-climbing) sur l'état **courant** (proposition + ajustements manuels), sans tout régénérer. Tente remplacements / échanges / ajouts dans les postes libres pour réduire, **dans cet ordre d'importance** : (1) souhaits non réalisés, (2) déséquilibre entre associés, (3) congés rapprochés. Ne **touche jamais** aux verrous ni aux règles dures (refus, week-end de garde collé, capacité) et **ne diminue jamais** la couverture. **Idempotent** : cliquable plusieurs fois, s'arrête sur l'optimum local (« déjà optimal — rien à améliorer »). Helper `optimiserVacances` (`src/utils/vacances.js`).
- **Choix de trame anticipé sur la page Vacances (semaines à 2 congés).** Dès qu'une semaine a **≥ 2 associés en congé**, un badge **« 👥 2 vac. »** et un **menu déroulant** apparaissent sur sa ligne, listant **uniquement les trames à 2 colonnes vacances** (`capaciteVacances ≥ 2`, principale ★). Le choix est **partagé avec l'étape « En semaine »** : il est écrit dans le **même** `trameParSemaine` (`planning_semaines`, via `sauverSemaines`) et enregistré aussitôt. But : fixer tôt la bonne trame pour ces semaines. (`PlanningVacances.jsx`.)

### 9. Été (fonctionnement à part)

- Il existe une **maquette prédéfinie** où les vacances sont déjà réparties en colonnes, avec l'associé correspondant à chaque colonne déjà indiqué.
- Cette maquette est fournie chaque année au moment de faire le planning d'été. L'outil l'importe telle quelle et l'ajoute au planning (sur demande, ex. « donne-moi la maquette d'été »).
- Pas de rotation : maquette neuve chaque été, le choix de colonne dépendant des contraintes perso de l'année.
- Ensuite seulement, le planning est construit autour, sur les périodes hors-vacances.
- **Saisie d'été (flux à part, à coder ultérieurement)** : le faiseur met à disposition les **colonnes disponibles**, chaque associé **choisit sa colonne**, puis le faiseur **réattribue/arbitre** qui prend quelle colonne. C'est un module distinct du recueil de desiderata classique.
- **Recueil de type « été » (déjà en place)** : un recueil peut être marqué « été » à sa création par le faiseur (colonne `type` = `ete` sur `planning_recueils`). Dans « Mes desiderata », un recueil d'été **masque** les sections **Week-ends indisponibles** et **Jours off souhaités** (sans objet l'été : les week-ends sont bloqués et les congés se gèrent par colonnes). Un bandeau l'explique à l'associé.

### 10. Périodes spéciales fournies d'emblée

- Les deux dernières semaines de Noël : rotation spécifique, fournie telle quelle au démarrage (pas calculée par l'outil).
- **Vacances de la Toussaint = bloc imposé collé (comme Noël).** La Toussaint n'est plus construite automatiquement : le faiseur **colle** sa grille (jour × associés, couleurs) depuis l'onglet **Vacances** (bouton « 🍂 Coller la Toussaint », visible quand la période couvre la Toussaint). Même moteur générique que Noël (`noel.js` : `parserCollageNoel`/`bilanNoel`/`semainesImposeesNoel`/… ; stockage `planning_toussaint`, UI partagée `BlocImposeColle`). Reconnue telle quelle, intégrée au bilan annuel et exportée en bloc dédié « Toussaint » ; ses semaines deviennent imposées (cf. point suivant).
- **Semaines imposées par un bloc fourni tel quel (Noël OU Toussaint) = exclues de la construction.** Les semaines ISO couvertes par une grille imposée (`semainesImposeesNoel` dans `noel.js`, même découpage que `bilanNoel`/l'export) sont **imposées** : réa, congés, gardes de semaine et week-ends y sont déjà fixés par la grille. Les onglets **Week-ends**, **Réanimation**, **Vacances** et **En semaine** ne les **proposent ni ne les remplissent automatiquement** (retirées de la plage de construction — union Noël ∪ Toussaint —, un bandeau les signale). Le bilan annuel « En semaine » les exclut des agrégations normales puis réintègre les comptes des deux blocs via `bilanNoel` (pas de double comptage ; Noël figure aussi dans les **Compteurs de référence**).
- **Toussaint bloquée d'office dans « En semaine » (même sans grille collée).** Dans l'onglet **En semaine**, les **semaines de vacances scolaires de la Toussaint** (`blocToussaint`, réunies à la grille collée si présente) sont **toujours** exclues de la construction ET de l'arbitrage — elles sont gérées par la grille de Toussaint. Elles **apparaissent à leur place, en lignes VERROUILLÉES** (badge « 🔒 Toussaint — imposé », non éditables, jamais « à arbitrer »). (`semainesImposeesTous`, `src/pages/PlanningSemaines.jsx`.)
- **Échange de colonnes verrouillé et préservé.** En vue continue « En semaine », l'échange de deux colonnes (clic sur deux en-têtes d'associés) **verrouille** les deux colonnes et **survit à « Proposer automatiquement »**, y compris quand il porte sur une colonne **spéciale** (réa / vacances / avant-WE / après-WE) : un verrou sur une spéciale prime sur l'amont et est persisté dans la sortie du moteur. (`echangerColonnes` + `proposerSemaines`, gestion `fixes`/`verrou`.)

#### 10 bis. Référence des tiers 1+2 (planning manuel) — collage SANS reconnaissance

Le planning d'une année se fait en **trois tiers** : 1er tiers (avant l'été) et 2ᵉ tiers (été) sont faits **à la main** (le 1er tiers peut encore changer) ; le **3ᵉ tiers** (rentrée → fin d'année) est construit avec l'outil. Pour obtenir un export Excel complet au 3ᵉ tiers, le faiseur **colle d'un seul coup les tiers 1+2** (janvier → fin d'été).

- **Mécanisme distinct du bloc imposé Noël/Toussaint** : ici on **ne reconnaît rien** (pas de rôle, pas de compteur, pas de bilan). On **capture** seulement le texte et la **couleur de fond brute** de chaque cellule, et on les **reproduit telles quelles**. (`referenceGrille.js` : `parserCollageReference`/`normaliserReference` ; stockage `planning_ref` par année ; UI `ReferenceTiersColle`.)
- **Emplacement** : dans « Ouverture du planning », un panneau **visible uniquement au 3ᵉ tiers** (`estTroisiemePartie`, comme les Compteurs de référence). Collage Excel (texte + couleurs HTML) → aperçu fidèle → « Enregistrer la référence ».
- **Export du 3ᵉ tiers** : la référence tiers 1+2 est reproduite **en haut** de la feuille (helper `ecrireReference` dans `exportCalendrier.js`, 16ᵉ paramètre `referenceData`) ; le calendrier construit par l'outil démarre alors au **début du 3ᵉ tiers** (`periode.debut`) au lieu du début d'année → **chronologie continue**, sans doublon. Sans référence collée, l'export reste **inchangé** (année entière). Noël/Toussaint conservent leur rendu (blocs imposés du 3ᵉ tiers).

### 11. Entrées de l'outil

**A. Fournies par le faiseur de planning (au démarrage) :**

- les **quotas annuels** par personne (réa, gardes, astreintes…) — calcul basé sur l'année précédente, hors périmètre de l'outil. La liste exacte des compteurs/quotas à suivre est donnée au tout début et constitue du dur ;
- la **structure** : les semaines type (matrices) ;
- la **base brute du calendrier** (cf. Étape 0) : pour chaque jeudi/vendredi/samedi/dimanche, le statut de notre groupe (garde ou astreinte) selon la rotation avec l'autre groupe ; les semaines de vacances scolaires ; les jours fériés et leur statut garde/astreinte ;
- les deux semaines de Noël ;
- (l'été) la maquette de vacances.

**B. Saisies par chaque associé (desiderata) — tous facultatifs :**

- semaines de vacances souhaitées ;
- semaines où il ne veut surtout PAS de vacances (contrainte négative) ;
- jours off souhaités — saisis sur un **calendrier multi-mois** (les mois de la période sont empilés, un clic sur un jour l'ajoute/le retire) ;
- jours où il ne veut pas poser son repos ;
- préférence Pâques ou février (+ Toussaint souhaitée ou non) — **chaque période scolaire n'est proposée que si ses semaines tombent dans la période du recueil** (sinon masquée, ce qui allège l'écran) ; les périodes affichées sont déduites des **vraies** semaines scolaires (base calendrier), pas d'une constante codée en dur ;
  - **Semaines de vacances scolaires bloquées dans les autres saisies (en place).** Les congés scolaires se gèrent **uniquement** via cette préférence : pendant une semaine de vacances scolaire, l'associé **ne peut pas** sélectionner de **vacances souhaitées/refusées**, de **week-end indisponible**, de **jour off**, ni de **colonne de trame** (semaines retirées/grisées en bleu dans `SelecteurSemaines`, `WeekendsIndispo`, `SelecteurDates` et le sélecteur de colonne de la trame principale) ;
- week-ends dispo / pas dispo pour astreinte ou garde ; **option par week-end indisponible** : ne pas être **ni de garde ni d'astreinte le vendredi qui précède** (la veille du WE bloqué) — champ `weekendsVeilleIndispo` (sous-ensemble de `weekendsIndispo`), saisi dans `WeekendsIndispo.jsx` (bouton « + vendredi ») et affiché au récap. **Ce n'est pas un jour off** : l'associé travaille ce vendredi, mais sans garde ni astreinte. **Intégré comme RÈGLE DURE à l'étape « En semaine »** (cf. §12.3) ;
- éventuellement, demande d'une colonne particulière de la semaine type (ex. associé prenant des remplaçants qui veut un poste-type précis).

Tous ces champs sont **facultatifs** : certains associés n'auront rien à remplir, et c'est un cas normal à gérer.

> **Allègement visuel.** Les encarts volumineux (Vacances souhaitées, Vacances refusées, Week-ends
> indisponibles) sont **repliables** (`SectionRepliable`), **fermés par défaut** avec une ligne de
> résumé ; on déplie pour modifier. La trame principale n'affiche que les colonnes au choix.

### 12. Déroulé étape par étape (validation successive, retours en arrière possibles)

**Étape 0 — Base brute du calendrier (préliminaire).** Avant tout, le faiseur de planning met en place une base brute, via une saisie simple, intuitive et rapide :

- pour chaque jeudi / vendredi / samedi / dimanche : qui de notre groupe est de garde ou d'astreinte (rotation avec l'autre groupe d'anesthésie) ;
- les semaines de vacances scolaires (la suite en dépend : remplaçants, version « avec remplaçant », couverture vacances) ;
- les jours fériés, avec leur statut garde ou astreinte selon le jour où ils tombent.

> **Un jour férié = garde/astreinte uniquement ; le bloc opératoire ne tourne pas.** Il n'y a donc
> pas d'activité de bloc à couvrir un férié. Les fériés sont **calculés automatiquement**
> (`joursFeriesFR(annee)` dans `src/utils/calendrier.js`, Pâques/Ascension/Pentecôte mobiles inclus) ;
> aucune saisie n'est requise.

> **Cadence — l'Étape 0 est annuelle, posée une seule fois.** Elle se fait en **début d'année**, au moment d'initier le planning. Elle couvre toute l'année civile, donc les deux phases de planning suivantes (**été** et **sept-déc**, cf. §1) **réutilisent la même base** : on n'a **pas besoin** de refaire l'Étape 0 en y revenant (sauf ajustement ponctuel). Le découpage par phases concerne la **construction** du planning, pas la base de calendrier.

Puis, sur cette base :

1. **Caler les week-ends** de tout le monde (placement des A/G entre nos associés, selon desiderata) → affiché dans l'Excel → validation → étape suivante.
   - **Ponts / jours fériés (alerte précoce).** Avant cette étape, l'outil signale les **jours off
     posés autour d'un férié** (la veille, le jour même, le lendemain, ou des plages plus longues
     enchaînées) — c'est « faire le pont », source possible de déséquilibre. Détection par segments de
     jours calendaires consécutifs (sam/dim + fériés + jours off) contenant ≥1 férié ET ≥1 jour off
     (`src/utils/ponts.js`). L'alerte est visible dans le **Suivi des desiderata** (édition) et en tête
     de l'étape **Week-ends** (rappel). Le faiseur peut **écarter** un jour off de pont (bascule) :
     écarté ⇒ ce jour off est **ignoré** par l'attribution automatique des week-ends ; conservé
     (défaut) ⇒ respecté. Écartement persisté dans `data.pontsEcartes` (clés `"INI|YYYY-MM-DD"`) de
     `planning_calendrier` — pas de table dédiée. Alerte **non bloquante** : le faiseur arbitre (§13).
   - **Indispos week-end accolées à un férié.** La détection couvre aussi les **week-ends
     indisponibles accolés à un férié** : un férié un **vendredi** rend accolé le week-end de sa
     semaine, un férié un **lundi** celui de la semaine précédente (un férié **samedi/dimanche est
     ignoré** : le week-end est déjà non travaillé au bloc). Ces indispos sont **écartables** comme
     les jours off (clés `"INI|WE|<semaine>"` ; écartée ⇒ l'associé redevient plaçable ce week-end),
     et la ligne du week-end concerné porte un badge **« 🌉 »** dans l'étape Week-ends. Les associés
     en sont prévenus dès la saisie des desiderata (jours off **et** week-ends indisponibles).
2. **Positionner les vacances** de chacun (avec vérification Pâques/février).
3. **Remplir le planning en semaine** selon les desiderata (onglet « En semaine », `PlanningSemaines.jsx`).
   - **Affectation des colonnes (en place).** Selon la trame choisie pour la semaine, l'outil répartit
     les 8 associés sur les colonnes. Les colonnes **Réa / Vacances / avant-WE / après-WE** sont
     **pré-remplies** depuis les étapes précédentes (réa → associé de réa ; vacances → un congé par
     colonne vacances ; avant-WE → week-end de la semaine ; après-WE → week-end précédent) ; les colonnes **remplaçant**
     sont externes. Les colonnes **libres** sont attribuées en respectant les **souhaits de colonne**,
     les **jours off** via le **repos-levier** (placer sur une colonne dont le repos post-garde/astreinte
     tombe sur le jour off demandé), puis l'**équilibre des gardes** et l'**espacement**. Attribuer une
     colonne attribue d'emblée **sa garde/astreinte et son repos**. Modèle/algorithme : `src/utils/semaines.js`.
   - **Un associé n'occupe qu'UNE colonne (anti-doublon).** Quand un associé cumule deux rôles spéciaux
     (ex. **réa ET garde de week-end**, ou deux week-ends consécutifs où avant-WE = après-WE), il n'est
     placé qu'une fois — **priorité réa > avant-WE > après-WE** ; la colonne de travail ainsi **libérée**
     est repourvue par le moteur pour un autre associé (sinon elle serait perdue et un associé surnuméraire
     finirait « non placé » à tort). `colonnesSpeciales` (`semaines.js`) dé-doublonne via `dejaPlace`.
   - **Alerte « trame non adaptée ».** Si la trame de la semaine a **plus de colonnes vacances que de
     vacanciers** (ex. trame à 2 colonnes vacances forcée alors qu'il n'y a qu'1 congé), une colonne vacances
     reste inutilisée et un associé ne peut être placé : l'outil lève une alerte invitant à choisir une trame
     à autant de colonnes vacances que de vacanciers. La sélection **automatique** choisit déjà la bonne
     (1 colonne vacances ↔ 1 vacancier, 2 ↔ 2) ; le cas vient surtout d'un choix manuel.
   - **Veille de week-end indisponible (RÈGLE DURE).** Un associé qui a coché un week-end indisponible avec
     l'option « + vendredi » (`weekendsVeilleIndispo`) **ne peut pas** occuper, la semaine de ce week-end, une
     **colonne de service le vendredi** (garde **ou** astreinte) : l'outil lui réserve d'office une colonne
     **sans garde ni astreinte le vendredi** (il travaille normalement ce vendredi, ce n'est **pas** un jour
     off). Même mécanique que « vendredi-avant-vacances » (`interditsVendredi`, fusionnés dans `semaines.js`) :
     réservation des colonnes de service vendredi aux non-interdits en priorité, repli signalé si tous les
     candidats sont interdits. La règle ne s'applique **que si le week-end indispo n'a pas été RETIRÉ par le
     faiseur** : ni **écarté** (pont férié, `cleEcartWeekend` ∈ `pontsEcartes`), ni l'associé **forcé** sur ce
     week-end (`weekends.affectations`). Calcul `veilleWEParSemaine` (`PlanningSemaines.jsx`) → moteur ;
     violation (via repli) = alerte **bloquante** « à arbitrer » (`vendrediVeilleWE`).
   - **Pénibilité des gardes (important).** Une **garde de semaine** = jour où l'associé est sur la
     colonne de service ET le groupe est de garde : **mardi** (toujours) + **jeudi** (si la base
     calendrier le met en garde). Lundi/mercredi = astreinte (**non comptés**) ; **vendredi** = suivi à
     part (Objectifs). Viser **≥ 1 semaine (7 jours)** entre deux gardes d'un même associé (gardes de
     semaine **et** de week-end = dimanche) : en dessous, **non bloquant mais alerte** au faiseur avec
     **l'écart exact en jours** ; l'attribution privilégie ≥ 7 j et ne relâche qu'en dernier recours.
     Constante `ESPACEMENT_GARDE_JOURS = 7` (`semaines.js`).
   - **Équilibre des gardes de semaine** : à peu près **égal par période** (règle molle) et **égal sur
     l'année entière** (règle dure, à terme) — compteurs « période / année » par associé.
   - **Bouton « Optimiser » (2ᵉ passage).** Après « Proposer », une **recherche locale par échanges**
     (`optimiserSemaines`, `semaines.js`) améliore l'affectation selon un **score lexicographique** :
     **1) desiderata** (souhaits de colonne satisfaits + jours off couverts par le repos) **≫ 2) équilibre**
     des gardes de semaine **≫ 3) espacement** (gardes rapprochées + A/G vendredi + récup JF). Un échange
     n'est retenu que si sa 1ʳᵉ composante non nulle s'améliore → l'espacement ne se gagne jamais au prix
     d'un desideratum. Colonnes spéciales et **verrouillées figées** ; règle dure vendredi-avant-vacances
     respectée. **Déterministe et idempotent** (cliquable plusieurs fois, s'arrête à l'optimum local).
   - **Bouton « 🗑 Vider (sauf verrous) ».** Présent sur les **4 étapes** (week-ends, réa, vacances, en
     semaine). Efface tout le **remplissage automatique** (proposition + ajustements) en **conservant
     uniquement ce qui a été verrouillé par le faiseur**, ainsi que les décisions de cadrage hors
     affectation : **capacités de congés (`places`)** en Vacances et **trames choisies (`trameParSemaine`)**
     en Semaine. Permet de **repartir d'un état propre** puis de recliquer « Proposer » — utile quand un
     forçage ou un sur-remplissage a coincé une étape. Helpers purs `viderSaufVerrous` (un par moteur :
     `weekends.js` / `rea.js` / `vacances.js` / `semaines.js`), testés (`viderSaufVerrous.test.js`),
     déterministes. Sur « En semaine », ce bouton **remplace** l'ancien « Effacer tout » (qui effaçait aussi
     les verrous) et reste **annulable** via « Retour en arrière ».
   - **Diagnostic « associé non placé » / « colonne non pourvue ».** La cause quasi systématique est un
     **décalage entre le nombre de vacanciers d'une semaine et le nombre de colonnes vacances de sa trame**
     (pairage par index dans `colonnesSpeciales`) — typiquement une **trame forcée** (`trameParSemaine`) qui
     ne colle plus au nombre réel de congés. Ce n'est **pas** dû au choix « indifférent S1/S2 » des congés
     scolaires (`semainesSouhaitScolaire` place chaque associé sur **une seule** semaine et déduplique). Le
     décalage est signalé par les alertes **« trame non adaptée »** ; le remède est de re-proposer (au besoin
     après « Vider (sauf verrous) ») ou de choisir une trame à la bonne capacité.

Chaque étape est un point de contrôle validé avant de continuer.

> **Début de l'année : après les vacances de Noël.** Le planning d'une année commence **toujours** la
> semaine qui suit les vacances scolaires de Noël. La semaine ISO **1** (lundi fin décembre de l'année
> précédente) relève du planning de l'année d'avant et **n'apparaît jamais**. Le helper
> `premiereSemainePlanning(vacancesScolaires)` (`src/utils/calendrier.js`) renvoie la 1ʳᵉ semaine = **S1
> exclue d'office + bloc de tête en vacances scolaires (Noël), minimum S2**. Appliqué **partout** : Base
> calendrier, création de recueil (semaine de début proposée/choisissable), onglets week-end / vacances /
> réa / en semaine (plage bornée par `Math.max(recueil.semaine_debut, debutPlanning)`), et exports
> (`construireClasseur`). La fin d'année (grille de Noël) est gérée séparément.

> **Export sur l'année entière.** TOUS les exports Excel (Base calendrier, Objectifs, Week-ends, Vacances,
> Réa, En semaine, et l'onglet **Noël**) déroulent la **colonne des dates sur l'année complète** (cases
> associés vides là où il n'y a pas de données), avec en-têtes d'initiales à chaque changement de mois et
> le **bloc Noël tout à la fin**. `construireClasseur` déroule `listerSemaines(annee)` à partir de
> `premiereSemainePlanning` (après les vacances de Noël) ; le paramètre
> `periode` ne borne plus le contenu (il ne sert qu'au nom de fichier). L'export de l'onglet Noël passe par
> `exporterCalendrierExcel` (calendrier complet finissant par Noël), plus par un export Noël autonome.

> **Distinction utile** : l'Étape 0 fixe le **rôle du groupe** (sommes-nous garde ou astreinte ce jour-là). L'Étape 1 décide **quelle personne** parmi nous prend chaque créneau.

### 13. Philosophie d'interaction

- **L'humain a toujours le dernier mot.** Tout changement fait par le faiseur de planning est du dur : l'outil ne re-modifie rien autour, il ne reconstruit pas.
- À chaque changement, l'outil se contente de :
  - recalculer et afficher les **compteurs** (gardes, astreintes, réa… par personne) ;
  - **alerter** en cas de déséquilibre : quota dépassé/non atteint, écart trop grand entre associés sur une période (gardes, astreintes, week-ends, semaines de réa), deux gardes trop rapprochées, etc.
- L'outil est donc un **assistant** : il propose des placements, tient les compteurs à jour en direct, et lève des drapeaux — sans jamais décider à la place de l'humain.
- Possibilité, à tout moment, de **forcer une semaine en « avec remplaçant »** → l'outil propose les différentes structures de remplaçant disponibles, le faiseur de planning choisit, puis l'outil recalcule les compteurs et alertes sans écraser les choix manuels.

**Conflits = entre deux associés (deux colonnes), jamais sur une seule personne.** Donner à
quelqu'un ce qu'il a demandé n'est **pas** un conflit. Un **vrai conflit** est une **collision entre
deux associés** qui veulent la même chose (typiquement la **même colonne** une semaine donnée, une
seule possible) — il se construira à l'**étape d'affectation des colonnes** (à venir).

Pour les étapes actuelles (Week-ends / Vacances / Réa) :
- les desiderata d'**une seule personne** (refus, indispo, jour off, souhait de colonne) sont
  **satisfaits / évités automatiquement** par la proposition, et signalés au plus par un **badge
  discret** sur la ligne — jamais comme un « conflit » ;
- l'outil **cherche une solution** avant d'alerter : un **jour off** tombant dans une **semaine de
  vacances** de la personne est **considéré satisfait** (elle est off) ;
- le **panneau « À arbitrer »** (`src/components/planning/PanneauConflits.jsx`) ne liste que les
  **créneaux non plaçables** — une semaine où **aucun** associé n'est plaçable sans contrainte — pour
  expliquer « pourquoi non placé » ; le faiseur garde le dernier mot (rien n'est bloquant, §13).

### 14. Notation observée dans les fichiers

- **A** = Astreinte (couleur orange) · **G** = Garde (couleur jaune) · case bleue vide = vacances.
- Les chiffres accolés à un poste (ex. A7, G5, Réa3, NC11) = compteur d'occurrences de ce poste pour la personne dans l'année (système d'équité).

> ⚠️ Les couleurs des fichiers fournis ont été perdues (exports en texte brut). À récupérer depuis les vrais .xlsx si possible.

### 15. Glossaire des postes (à confirmer / compléter)

| Sigle | Hypothèse | Statut |
|---|---|---|
| Réa | Réanimation | à confirmer |
| Bloc A / Bloc B | Salles de bloc | à confirmer |
| Viscérale / CPRE | Anesthésie chirurgie viscérale / CPRE | à confirmer |
| Endoscopie | Endoscopie | à confirmer |
| Cs / SARM | Consultation — notations interchangeables ; le chiffre = n° de poste (ex. SARM 1 = Cs 1) | confirmé |
| SARM 2 VPA | 2ᵉ personne en consultation, fait les VPA l'après-midi | confirmé |
| VPA | Visite PréAnesthésique (patients opérés le lendemain) | confirmé |
| NC / Neurochir / NeuroC | Neurochirurgie — même poste, notation variable selon les années | confirmé |
| Joker | Obsolète : autrefois personne à domicile, appelée en renfort si surcharge. N'existe plus (peut revenir) | confirmé |

### 16. Paramètres suivis par personne (compteurs / quotas)

Pour chaque associé, l'outil suit un ensemble de compteurs, affichés en **Réalisé vs Objectif**. La liste exacte est fournie en entrée chaque année et peut varier légèrement. Exemple observé (MOC, 2025) :

| Paramètre | Sens |
|---|---|
| G week-end | Gardes de week-end (dimanches) |
| G vendredi | Gardes du vendredi |
| G semaines | Gardes en semaine (hors vendredi) |
| A vendredi | Astreintes du vendredi |
| Réa | Semaines de réanimation |
| Fériés J-1 | Jours fériés / veille de férié |
| Vacances | Semaines de vacances |
| Joker A/G | Joker astreinte / garde — obsolète, mais historiquement compté (ex. « 2 et 2 ») |

Remarques :

- Les gardes sont décomposées en 3 compteurs distincts : week-end, vendredi, semaine.
- D'autres années ajoutent d'autres lignes (ex. « Jeudi Astreinte » vue dans les fichiers 2026).
- Affichage **Réalisé vs Objectif** côte à côte ; un écart est signalé en rouge (= alerte de déséquilibre, cf. §13).
- Ces compteurs sont à suivre **par période** (janv-juin / été / sept-déc), pas seulement en total annuel (cf. §6).

### 17. Suivi de la saisie — tableau de bord (côté faiseur de planning)

Le faiseur de planning doit voir où en est la saisie des desiderata. Un petit tableau de bord liste les associés avec un statut :

- 🔴 **Rouge** = n'a pas encore rempli ;
- 🟢 **Vert** = desiderata transmis (y compris « rien à signaler », qui compte comme rempli).

Il sait ainsi qui relancer. Il n'a pas à attendre que tout le monde ait répondu : il peut commencer à travailler sur la base brute (Étape 0) et la structure dès le départ, puis remplir le détail au fur et à mesure que les desiderata arrivent.

**Consultation des desiderata en direct.** Pendant la construction, le faiseur de planning peut cliquer sur un associé pour afficher clairement ses desiderata (panneau qui s'ouvre), recliquer pour les masquer, et passer ainsi rapidement de l'un à l'autre — utile quand il hésite ou doit faire un ajustement.

**Export / impression.** Un bouton permet d'exporter en PDF l'ensemble des desiderata (un récapitulatif clair, une section par personne) — et, plus largement, le planning — afin de tout imprimer d'un clic. La mise en page doit être visuelle, lisible et bien organisée, pour retrouver facilement les informations de chaque associé.

**Vue « Afficher les desiderata » (calendrier mensuel dynamique).** Bouton dans Ouverture du planning, visible **uniquement pour les tiers 1 et 3** (pas l'été, `!estEteSelection`) : il ouvre un **vrai nouvel onglet plein écran** (`window.open` ; `?page=planning-affiche&recueil=…&annee=…`), **sans barre latérale** (déplaçable sur un 2ᵉ écran). On y voit un **calendrier mois par mois** (flèches ‹ › **+ badges de mois** pour sauter directement, bornés à la période) qui **reporte à la bonne date** les desiderata de **tous** les associés. **6 calques** activables indépendamment : week-ends indisponibles (+ veille « vendredi »), jours off (date exacte), souhaits de colonne (lun→ven, libellé `C{n+1}`), **vacances souhaitées**, **vacances non souhaitées** (refusées), **vacances scolaires** (préférence février/Pâques `s1`/`s2`/`indifferent` + Toussaint). **Dynamique** : chaque **associé** (couleur dédiée) et chaque calque s'affiche/se masque d'un clic ; boutons **« Tout afficher »/« Tout masquer »** pour les associés, **« Tout masquer »** pour les calques. **Repères** activables : **jours fériés** (case colorée + libellé court, ex. « Pentecôte »), **surbrillance de la période de vacances scolaires** (semaines ISO de `calendrier.vacancesScolaires`, en bleu), et deux **panneaux** ouverts au besoin — **Trame principale** (réutilise `TrameGrille`, pour lire les `C{n}`) et **Résumé vacances scolaires** (réutilise `RecapVacancesScolaires`, mêmes souhaits/conflits que l'écran Ouverture). Quand **un seul associé** est sélectionné, son **texte libre** (`commentaire`) s'affiche en bandeau au-dessus des calques (sur tous les mois). Lecture seule, pas de persistance. Fichiers : `src/pages/PlanningAffiche.jsx`, route plein écran dans `src/App.jsx` (`page === 'planning-affiche'`, faiseur), bouton dans `src/pages/PlanningSuivi.jsx`. (Export Excel de cette vue : à venir.)

> **Convention export Excel** : dans tout fichier Excel généré (Base calendrier, objectifs, planning…), le **texte de chaque cellule est centré** (horizontalement et verticalement) — libellés compris, pas seulement les valeurs. Police **Calibri 11**.
>
> **Couleur des vacances = lundi→vendredi seulement.** Le fond bleu « congé » d'une semaine de vacances ne s'applique qu'aux **jours ouvrés** (lun→ven) ; le **samedi/dimanche** d'une semaine de congé reste en **gris « week-end »** (le porteur de garde garde sa couleur G/A). Vaut pour tous les exports (moteur partagé `celluleAssocieJour`, `src/utils/grilleSemaine.js`). Les blocs imposés Noël/Toussaint, collés tels quels, ne sont pas concernés.

### 18 bis. Synchronisation du planning vers l'agenda perso (abonnement iCal)

Une fois qu'un tiers est **validé** par le faiseur (export Excel archivé, recueil `ferme`), chaque associé peut
**synchroniser SA colonne** vers son agenda personnel (iPhone/Apple, Android/Google, Outlook) depuis la page
**« Mon agenda »** (visible dès qu'une colonne lui est attribuée).

- **Mécanisme = abonnement iCal** (universel, sans OAuth) : un flux public `/api/agenda?token=…` (Vercel
  Function, lecture `service_role`) protégé par un **token** non devinable par associé (table `planning_agenda`,
  RLS « sa propre ligne »). L'associé s'abonne **une seule fois** (lien `webcal://` pour Apple, « ajouter par
  URL » pour Google/Outlook) ; les tiers validés s'ajoutent et se mettent à jour automatiquement (rafraîchi
  périodiquement par l'agenda, ~quelques heures).
- **Événements « journée entière »** : gardes, astreintes, réanimation, vacances, récup JF (jours consécutifs
  de même type fusionnés). **Pas** d'événement pour le travail ordinaire / le repos.
- **Source = celle de l'export Excel.** À la **validation** (`PlanningSemaines.valider`), on précalcule les
  événements de **chaque** associé sur la plage du tiers (`evenementsAgendaParAssocie`, réutilise
  `grilleSemaine`/`noel`) et on les stocke (`planning_agenda_evenements`, clé `annee,recueil_id`, écriture
  faiseur). Le flux ne fait que sérialiser ces données. La **dévalidation** supprime la ligne → seuls les
  tiers réellement validés sont synchronisés.
- **Les ARCHIVES font autorité** (flux iCal **et** liste « Mon agenda ») : on ne synchronise un tiers que s'il
  existe une **archive vivante** (`planning_archives`) pour son recueil. Conséquences : si le faiseur **supprime**
  l'archive d'un tiers, il disparaît de l'agenda de tous ; **sans aucune archive**, rien n'est synchronisable
  (même si de vieilles lignes d'événements subsistent). Pour un même **tiers** (clé `annee + semaine_debut +
  semaine_fin`), seule l'archive **la plus récente** est retenue (ses événements) → au plus **un agenda par
  tiers, 3 max/an** (1, 2, 3). On ne supprime pas les lignes d'événements à la suppression d'archive (un même
  recueil peut avoir plusieurs archives) : le filtrage se fait **à la lecture**, ce qui couvre aussi les lignes
  héritées.
- **Sélection par planning** : chaque tiers validé est listé (groupé par année) avec un bouton
  **Synchronisé / Désynchronisé**. L'associé choisit individuellement ce qu'il garde dans son agenda
  (opt-out via la colonne `planning_agenda.exclus` = recueil_id retirés ; un nouveau tiers validé est inclus
  par défaut). « Tout synchroniser » vide les exclusions.
- **Tout supprimer** (revenir en arrière) : la page « Mon agenda » bascule `actif=false` → le flux renvoie un
  calendrier **vide** → l'agenda abonné se vide au prochain rafraîchissement (puis l'associé peut retirer
  l'abonnement). « Réactiver » remet `actif=true` sans se réabonner (les choix par planning sont conservés).
- **Délai** : la page indique qu'après abonnement ou modification, la mise à jour peut prendre **jusqu'à ~1 h**
  (rafraîchissement géré par l'app d'agenda, non instantané).
- Aucune donnée sensible dans le flux (rôles + initiales). Fichiers : `api/agenda.js`,
  `src/pages/MonAgenda.jsx`, `src/utils/evenementsAgenda.js`, `src/utils/agendaApi.js`,
  `src/utils/agendaEvenementsApi.js`, `supabase/planning_agenda*.sql`.

### 18 ter. Planning par service (copier-coller du tableur → export par poste)

Onglet **faiseur** « Planning par service » : le faiseur fabrique le planning des tiers 1+2 dans **son propre
tableur Excel** puis **colle** une période (1 à 4 mois) dans l'outil, qui **reconnaît** tout, affiche un
**aperçu par service** et **ré-exporte** un Excel ordonné par poste. **Rien n'est calculé ni sauvegardé** ici
(découplé du moteur week-ends/réa/vacances/semaines).

- **Forme du collage** (tabulé, depuis Excel) : 1ʳᵉ colonne = **dates** (un jour par ligne) ; colonnes suivantes
  = **personnes**. En-tête de colonne = **initiales d'un associé** (EH, MP…) ou une **colonne remplaçant** ;
  chaque **cellule** = le **poste** que la personne fait ce jour-là.
- **Reconnaissance** (`parserCollageParService`, pur) :
  - en-tête = initiale d'associé (ou nom complet) → **nom complet** affiché ; sinon → **colonne remplaçant**.
  - **nom du remplaçant** : lu dans une **cellule** de la colonne (ex. dimanche « OK Dr Delbert Aurelie (Ok) »)
    et **reporté vers le bas** sur les postes des jours suivants, jusqu'au prochain nom (`extraireNomRemplacant`).
    Reconnaissance : tout « Dr … » / « Docteur … » (après nettoyage de « OK » et des parenthèses) **plus** une
    **liste de remplaçants connus** = liste en dur (`src/data/remplacants.js`, amorcée avec « Dr Delbert Aurelie »)
    **+ liste éditable par le faiseur** dans l'onglet (zone « Remplaçants connus » : ajout/retrait, persistée en
    base, table `planning_remplacants` — singleton, faiseur écrit / cf. `remplacantsApi.js`). Le matching ignore
    accents, casse, ponctuation et « Dr/Docteur ». À défaut de nom → **« Remplaçant »**. (L'en-tête peut aussi
    nommer la colonne.)
  - cellule → poste canonique via `normaliserPosteCanonique` (sans accents/casse, **VPA toujours retiré**) :
    « SARM 1/2 » ; « visc… » → Bloc A viscéral ; « NC »/« neuro » → Bloc A NC ; « bloc b »/« endoscopie » →
    Bloc B ; « réa »/« réanimation »/« USC » → USC/Réa. Non reconnu / « VPA » seul → ignoré.
  - **transposition** [date × personne → poste] en [date × **service** → personne(s)] ; plusieurs personnes sur
    un même service un même jour → jointes par « / ». Une cellule **uniquement remplaçant** s'affiche **en rouge**.
  - **récapitulatif de reconnaissance** affiché (associés reconnus, remplaçants, colonnes ignorées, nombre de
    jours, avertissements si un en-tête a une colonne sans aucun poste reconnu) — transparence pour le faiseur.
- **6 postes canoniques** (ordre `POSTES_SERVICE`, inchangé) : SARM 1, SARM 2, Bloc A viscéral, Bloc A NC,
  Bloc B, USC/Réa. C'est l'ordre des colonnes de l'**aperçu** et de l'**export**.
- **Noms complets** : champ `nom_complet` par associé, saisi dans l'onglet **Comptes** (colonne
  `profiles.nom_complet`). Repli sur l'initiale si non renseigné.
- **Export Excel** (`exporterParServiceExcel`, inchangé) : colonne Date à gauche, 6 services en colonnes,
  remplaçants en **rouge gras**. Le sélecteur d'année ne sert qu'au **nom de fichier**. Les dates sont reprises
  **verbatim** du collage (pas de détection week-end/férié : les services sont lun→ven).
- Fichiers : `src/pages/PlanningParService.jsx`, `src/utils/planningParService.js`
  (`parserCollageParService` + `normaliserPosteCanonique` + `POSTES_SERVICE`), `src/utils/exportParService.js`,
  tests `src/utils/planningParService.test.js`.

### 18. Points encore en suspens

- [ ] Récupérer les couleurs (vrais fichiers .xlsx).
- [ ] Choisir la méthode de saisie des desiderata (à discuter).

> (L'été et la liste des compteurs/quotas sont désormais traités comme des entrées fournies par le faiseur de planning, plus comme des inconnues à résoudre.)
