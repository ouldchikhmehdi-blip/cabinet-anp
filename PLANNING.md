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

### 4. Les semaines type (cœur du système)

Une **semaine type** est une matrice Jour × Colonne :

- Lignes = lundi à vendredi.
- Colonnes = des « postes-types » ; chaque colonne donne une séquence de rôles sur la semaine (ex. lundi Viscérale → mardi Réa → mercredi … ).

Le travail du planning consiste à affecter chaque personne à une colonne pour la semaine donnée. La personne hérite alors de la séquence de cette colonne.

Plusieurs variantes existent, fournies chaque année (elles changent selon les chirurgiens/opérateurs) :

- sans remplaçant ;
- avec remplaçant — il existe plusieurs structures « avec remplaçant » (le planning change selon le remplaçant et ce qu'il couvre) ;
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
- **Repos du lendemain** :
  - après une garde → lendemain off (toujours) ;
  - après une astreinte → lendemain off (toujours) ;
  - après un viscéral le mardi → mercredi off ;
  - après un viscéral le jeudi → vendredi off.

### 6. Règles molles (à viser, ajustables)

- **Espacement des gardes** : idéalement ≥ 10 jours entre deux gardes (au minimum une semaine).
- **Astreintes** : plus de tolérance, peuvent être plus rapprochées.
- **Au bloc** (viscéral ou Bloc A) : souvent off le lendemain (pas systématique).
- Ces règles se relâchent en situation dégradée (été, sous-effectif), où gardes/astreintes peuvent être rapprochées.
- **Équilibrage entre associés** : gardes, astreintes, week-ends et semaines de réa répartis à peu près également entre tous — non seulement sur l'année, mais sur chaque période (janv-juin / été / sept-déc). Ex. : éviter qu'une personne fasse 1 semaine de réa sur janv-juin pendant qu'une autre en fait 4 sur la même période. Des écarts sont acceptables, mais pas trop importants.

### 7. Le repos du lendemain comme levier

Le repos qui suit une garde/astreinte est **déplaçable**, puisque c'est l'équipe qui décide qui prend la garde tel jour.

- Quand une personne demande un jour off précis (jour X), on cherche en priorité à lui caler une garde/astreinte (ou viscéral/bloc) le jour X-1, pour que le repos obligatoire tombe pile sur le jour off demandé. Le jour off est satisfait sans gaspiller un jour de repos.
- La demande dominante des associés, c'est « voilà où je veux poser mon repos ».

### 8. Vacances (hors été)

- Le nombre de semaines de vacances est une variable annuelle (distincte été / hors-été).
- **Exclusivité Pâques / février** : on ne peut pas avoir les deux → choisir l'un ou l'autre (préférence par personne).
- **Toussaint** : souvent une personne ne peut pas la prendre ; conditionnel selon les remplaçants trouvés.
- **Couverture minimale** :
  - chaque semaine : au moins 1 associé en vacances ;
  - en vacances scolaires : presque toujours au moins 2 ;
  - l'été : davantage.

### 9. Été (fonctionnement à part)

- Il existe une **maquette prédéfinie** où les vacances sont déjà réparties en colonnes, avec l'associé correspondant à chaque colonne déjà indiqué.
- Cette maquette est fournie chaque année au moment de faire le planning d'été. L'outil l'importe telle quelle et l'ajoute au planning (sur demande, ex. « donne-moi la maquette d'été »).
- Pas de rotation : maquette neuve chaque été, le choix de colonne dépendant des contraintes perso de l'année.
- Ensuite seulement, le planning est construit autour, sur les périodes hors-vacances.
- **Saisie d'été (flux à part, à coder ultérieurement)** : le faiseur met à disposition les **colonnes disponibles**, chaque associé **choisit sa colonne**, puis le faiseur **réattribue/arbitre** qui prend quelle colonne. C'est un module distinct du recueil de desiderata classique.
- **Recueil de type « été » (déjà en place)** : un recueil peut être marqué « été » à sa création par le faiseur (colonne `type` = `ete` sur `planning_recueils`). Dans « Mes desiderata », un recueil d'été **masque** les sections **Week-ends indisponibles** et **Jours off souhaités** (sans objet l'été : les week-ends sont bloqués et les congés se gèrent par colonnes). Un bandeau l'explique à l'associé.

### 10. Périodes spéciales fournies d'emblée

- Les deux dernières semaines de Noël : rotation spécifique, fournie telle quelle au démarrage (pas calculée par l'outil).

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
- jours off souhaités ;
- jours où il ne veut pas poser son repos ;
- préférence Pâques ou février (+ Toussaint souhaitée ou non) ;
- week-ends dispo / pas dispo pour astreinte ou garde ;
- éventuellement, demande d'une colonne particulière de la semaine type (ex. associé prenant des remplaçants qui veut un poste-type précis).

Tous ces champs sont **facultatifs** : certains associés n'auront rien à remplir, et c'est un cas normal à gérer.

### 12. Déroulé étape par étape (validation successive, retours en arrière possibles)

**Étape 0 — Base brute du calendrier (préliminaire).** Avant tout, le faiseur de planning met en place une base brute, via une saisie simple, intuitive et rapide :

- pour chaque jeudi / vendredi / samedi / dimanche : qui de notre groupe est de garde ou d'astreinte (rotation avec l'autre groupe d'anesthésie) ;
- les semaines de vacances scolaires (la suite en dépend : remplaçants, version « avec remplaçant », couverture vacances) ;
- les jours fériés, avec leur statut garde ou astreinte selon le jour où ils tombent.

> **Cadence — l'Étape 0 est annuelle, posée une seule fois.** Elle se fait en **début d'année**, au moment d'initier le planning. Elle couvre toute l'année civile, donc les deux phases de planning suivantes (**été** et **sept-déc**, cf. §1) **réutilisent la même base** : on n'a **pas besoin** de refaire l'Étape 0 en y revenant (sauf ajustement ponctuel). Le découpage par phases concerne la **construction** du planning, pas la base de calendrier.

Puis, sur cette base :

1. **Caler les week-ends** de tout le monde (placement des A/G entre nos associés, selon desiderata) → affiché dans l'Excel → validation → étape suivante.
2. **Positionner les vacances** de chacun (avec vérification Pâques/février).
3. **Remplir le planning en semaine** selon les desiderata.

Chaque étape est un point de contrôle validé avant de continuer.

> **Distinction utile** : l'Étape 0 fixe le **rôle du groupe** (sommes-nous garde ou astreinte ce jour-là). L'Étape 1 décide **quelle personne** parmi nous prend chaque créneau.

### 13. Philosophie d'interaction

- **L'humain a toujours le dernier mot.** Tout changement fait par le faiseur de planning est du dur : l'outil ne re-modifie rien autour, il ne reconstruit pas.
- À chaque changement, l'outil se contente de :
  - recalculer et afficher les **compteurs** (gardes, astreintes, réa… par personne) ;
  - **alerter** en cas de déséquilibre : quota dépassé/non atteint, écart trop grand entre associés sur une période (gardes, astreintes, week-ends, semaines de réa), deux gardes trop rapprochées, etc.
- L'outil est donc un **assistant** : il propose des placements, tient les compteurs à jour en direct, et lève des drapeaux — sans jamais décider à la place de l'humain.
- Possibilité, à tout moment, de **forcer une semaine en « avec remplaçant »** → l'outil propose les différentes structures de remplaçant disponibles, le faiseur de planning choisit, puis l'outil recalcule les compteurs et alertes sans écraser les choix manuels.

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

> **Convention export Excel** : dans tout fichier Excel généré (Base calendrier, objectifs, planning…), le **texte de chaque cellule est centré** (horizontalement et verticalement) — libellés compris, pas seulement les valeurs. Police **Calibri 11**.

### 18. Points encore en suspens

- [ ] Récupérer les couleurs (vrais fichiers .xlsx).
- [ ] Choisir la méthode de saisie des desiderata (à discuter).

> (L'été et la liste des compteurs/quotas sont désormais traités comme des entrées fournies par le faiseur de planning, plus comme des inconnues à résoudre.)
