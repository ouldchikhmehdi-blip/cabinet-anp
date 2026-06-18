# CONSULTATIONS.md — Module Consultations (SARM)

> Fichier de contexte dédié **uniquement** à l'onglet **Consultations** du dashboard SARM.
> Quand l'utilisateur parle de « consultations », **se concentrer sur ce module** et **lire ce fichier
> en premier**. Il fait foi pour tout ce qui touche aux données de consultation, à leur import et à
> leur affichage. (Pour le reste : `CLAUDE.md` à la racine ; pour le planning : `PLANNING.md`.)

---

## 1. Présentation

L'onglet **Consultations** (`src/pages/Consultations.jsx`) suit le **nombre de consultations
d'anesthésie** réalisées par le cabinet, par mois, par année et par opérateur (chirurgien/spécialiste
pour qui on fait la pré-anesthésie). Source : **exports Doctolib**.

C'est un **dénombrement d'activité** (nombre de consultations), pas des montants financiers. Ces données
ne sont **pas** des CSV bancaires : elles peuvent être manipulées normalement (≠ règle §4 de `CLAUDE.md`).

---

## 2. Règle d'or — le « dur » vs l'« affiné »

- **Le DUR (non négociable)** : le **total mensuel de consultations** = **somme des agendas Doctolib
  `SARM-1` + `SARM-2`**. C'est la réponse à « combien de consultations a-t-on faites tel mois ? ».
  Stocké dans `CONSULTATIONS[année]` (12 valeurs/an). **Toujours exact.**
- **L'AFFINÉ (approximation assumée)** : la **répartition par opérateur** est reconstruite depuis le
  détail Doctolib. Elle recolle au dur à **~98 %** (résidu ≤ ~260/an), le petit reste demeure dans le
  total global mais sans détail. **On affine au mieux, on ne se bat pas pour le dernier %.**

`CONSULTATIONS[année]` (le total global) est **indépendant** de la somme des spécialités. La page
n'exige pas que `somme(spécialités) == global`. Donc le total reste juste quoi qu'il arrive sur le détail.

---

## 3. Agendas Doctolib & règles de classement

Les exports Doctolib distinguent plusieurs **agendas** (colonnes) et plusieurs **motifs** (lignes).

| Agenda Doctolib | Traitement |
|---|---|
| **SARM-1** | **Compté** (à nous) |
| **SARM-2** | **Compté** (à nous) |
| **AKOME** | **Ignoré** (autres opérateurs, pas à nous) |
| **Cardiologie - CPA** | **Ignoré** (cardiologie) |

Constat structurant : **chaque opérateur/motif vit dans un seul agenda**. Nos opérateurs (Fedkovic,
Ayral, Garcia…) sont 100 % SARM ; les opérateurs AKOME (Lanfrey, Warthmann en pré-anesthésie, Dubar,
Léon, Delbos, Klein, Pons, Pasquier, Chauvat, Freycon-Tardy, Clementy, Piot, Raczka, Bayoud, Nader…)
sont 100 % AKOME. On peut donc **trier par nom** dans l'export détaillé.

**Motifs toujours ignorés**, quel que soit l'agenda :
- **VPA** (quelle que soit la case) ;
- toute la **cardiologie** (« Consultation pré-opératoire de cardiologie - DR … », « avec un Cardiologue ») ;
- **TAVI** (« CS TAVI »…) ;
- **échos dobu** (« Consultation Echos dobu… ») ;
- opérateurs confirmés non-nôtres : Constans, Denève, Francois, Cyteval, Serres-Cousine.

**Téléconsultations** (« Consultation vidéo d'anesthésie ») : **jamais attribuées à un opérateur**
(impossible de tracer qui). Comptées **à part**, comme une catégorie en soi → `TELECONSULTATIONS`.
Elles sont **incluses** dans le total global (elles sont bookées en SARM-1/2).

---

## 4. Modèle de données

Tout est dans **`src/data/mockData.js`** (exports lus par la couche `src/data/consultations.js`) :

- **`CONSULTATIONS`** — `{ [année]: number[12] }` — total global mensuel = SARM-1 + SARM-2 (le dur).
- **`TELECONSULTATIONS`** — `{ [année]: number[12] }` — téléconsultations vidéo (sous-ensemble du global).
- **`CONSULT_SPECIALITES`** — `Array` de spécialités :
  ```js
  {
    id: 'endoscopie',
    nom: 'Gastro / Coloscopies',
    couleur: '#534AB7',
    praticiens: [
      { id: 'fedkovic', nom: 'Dr Fedkovic', valeurs: { 2022:[…12…], 2023:[…], 2024:[…], 2025:[…] } },
      …
    ],
    // valeurs?: { [année]: number[12] }  ← bucket « non attribué » optionnel (consults de la
    //                                       spécialité sans praticien précis), ADDITIONNÉ aux praticiens
  }
  ```
- **Total d'une spécialité** = somme des `praticiens` + bucket `valeurs` (cf. `specMensuel()` dans la page).

### Spécialités & opérateurs actuels (données réelles 2022→2026)
- **Gastro / Coloscopies** (`endoscopie`, #534AB7) : Ayral, Blanc, Charpy-Debourdeau, Espérance, Fedkovic,
  Garcia, Guillet, Hanslik, Lhote, Liautard, Louvety, Monnin, Rollin, Rudler, Saloum, Suma, Valats,
  Vercambre, Danan, Boyer, Jaouen, Montariol, Fabre, Parelon, **Chir. bariatrique** (motif FIBRO Warthmann/Léon, rattaché ici).
- **Neurochirurgie** (`neurochirurgie`, #EF9F27) : Nogues, Meyer-Bisch, Dran, Rolland, Blanquet, Gharbi.
- **Chirurgie viscérale** (`viscerale`, #D85A30) : Malgoire, Flamein, Pissas.
- **Pneumologie** (`pneumologie`, #1D9E75) : Froment, Gautier-Déchaud, Maestre, Bughin, Marcano, Demazeau, Adam.

> Les opérateurs « (a été supprimé) » dans Doctolib (ex. Monnin, Saloum, Liautard, Guillet, Danan…)
> sont conservés : ils ont un **historique réel** avant leur départ.

---

## 5. Données : ordres de grandeur (réel Doctolib)
- Total global : **2022 = 10 947 · 2023 = 11 233 · 2024 = 10 789 · 2025 = 11 862 · 2026 = 5 285** *(jan→mai, année en cours)*.
- Téléconsultations : **3 592** au total (dont 548 en 2026).
- ~98 % attribué à un opérateur ; résidu (fourre-tout + bruit) ≤ 260/an, dans le global sans détail.
- **2026 est partiel** : seuls janvier→mai sont remplis (juin→déc = 0 en attendant le prochain export).

---

## 6. Fichiers du module

| Fichier | Rôle |
|---|---|
| `src/data/mockData.js` | **Données réelles** : `CONSULTATIONS`, `TELECONSULTATIONS`, `CONSULT_SPECIALITES`. |
| `src/data/consultations.js` | Couche d'accès : store localStorage (clé **`sarm:consult:v2`**), init depuis le mock, `reconcilier()`, `appliquerImport()`, `ajouterPraticien()`, `definirMasquePraticien()`, `cibles()`, `resetConsultData()`. |
| `src/data/consultationsReglesDefaut.js` | Règles d'import par défaut (motif/nom → cible). |
| `src/utils/importConsultations.js` | Parsing CSV : `analyserCSV` (format RDV) et **`analyserStats`** (format tableau croisé Doctolib : somme des colonnes choisies, ex. SARM-1 + SARM-2), normalisation des noms, matching tolérant. |
| `src/components/ImportConsultations.jsx` | UI d'import (upload CSV, choix colonnes, classement des clés inconnues, aperçu, validation). |
| `src/components/GestionPraticiens.jsx` | Ajout / masquage de praticiens d'une spécialité. |
| `src/pages/Consultations.jsx` | La page (KPIs, graphiques, comparaison multi-années, sélecteur spécialité, pills praticiens). |

---

## 7. Stockage (localStorage) & rafraîchissement

- Les données vivent dans **localStorage** (`sarm:consult:v2`), initialisées depuis `mockData.js` puis
  **réconciliées** (`reconcilier()` ajoute les spécialités/praticiens nouveaux sans écraser les valeurs
  déjà importées ; migre Pneumologie `valeurs` → `praticiens`).
- **Changer la baseline mock ne suffit pas** pour un utilisateur ayant déjà un store : `reconcilier`
  n'écrase pas les valeurs existantes. Pour forcer le rechargement de la nouvelle base : **incrémenter
  la version de la clé** (`sarm:consult:v2` → `v3`) — méthode déjà utilisée pour basculer du fictif au réel.
- `resetConsultData()` existe mais **n'est branché à aucun bouton** (reset manuel via console si besoin).

---

## 8. Import d'un nouvel export Doctolib

Format attendu (« statistiques », tableau croisé) :
- 1ʳᵉ colonne vide ou = libellé du motif ; colonnes suivantes = agendas (`SARM-1`, `SARM-2`, `AKOME`,
  `Cardiologie - CPA`) ; séparateur `;`.
- Lignes = un motif chacune (le mois/l'année sont dans l'en-tête ou choisis à l'import selon l'export).

Procédure via l'UI (`ImportConsultations.jsx`) : upload → choisir les colonnes **SARM-1 + SARM-2** →
classer les clés inconnues (praticien / spécialité / téléconsult / global / **ignorer**) → aperçu →
valider. Les règles de classement sont mémorisées (`sarm:consult-regles`).

**Ajouter une année (ex. 2026)** : importer le nouvel export ; `CONSULTATIONS[2026]` apparaîtra et la
page le détectera automatiquement (`anneesDispos` = union de `ANNEES` et des clés de `CONSULTATIONS`).
Pas besoin de modifier `ANNEES` (variable partagée par les autres onglets financiers).

---

## 9. Fonctionnalités de la page

- **5 KPIs** : Consultations (année principale), Consultations (réf. + écart %), Téléconsultations
  (part % + écart), Cumul à ce jour, Moyenne mensuelle.
- **Comparaison de 2 à 4 années** (filtre `PeriodeFilter` partagé) ; par défaut les 2 années les plus
  récentes disponibles (2025/2024). Couleurs : année principale vive (#1D9E75), autres en dégradé gris.
- **Graphiques** : barres mensuelles + cumul (toutes les années cochées).
- **Sélecteur de spécialités** : carte par spécialité (total + nb praticiens).
- **Pills praticiens** : « Tous » (empilé, année principale), vue agrégée (1 courbe comparable
  année/année), 1 praticien (comparaison multi-années), plusieurs (courbes superposées). Bucket
  « non attribué » affiché en vue « Tous » si présent.
- Praticiens **masqués** : retirés du détail mais **conservés dans les totaux**.

---

## 10. Pièges connus / décisions

- **Dr Charpy-Debourdeau** : absente des exports détaillés 2022→2025 (pas de colonne) → 2022→2025 à
  **0** dans le détail, mais réintégrée car elle **apparaît dans le détail 2026** (vraies données).
  Son volume 2022→2025 reste compté dans le **total global** (juste pas ventilé sur elle).
- **Génération** : le script de build lit les exports « totaux » (SARM-1+SARM-2 → global) et « détail
  par motif » (→ opérateurs/téléconsult), réintègre l'année et **retire automatiquement tout opérateur
  entièrement à zéro** sur toutes les années.
- **Opérateurs à 0 sur les premières années** (Valats, Rollin, Rudler, Espérance…) : **réel**, ils ont
  commencé plus tard / étaient libellés autrement. (Un opérateur **entièrement** à zéro = à retirer.)
- **Ne jamais réintroduire de données fictives** : les anciennes valeurs inventées (« pour voir le
  rendu ») ont été **entièrement remplacées** par le réel. Ne pas en rajouter.

---

## 11. Rappels pour l'assistant
- Répondre en **français**.
- Total mensuel = **SARM-1 + SARM-2** (le dur). Détail opérateurs = approximation assumée.
- **Ignorer** : AKOME, cardiologie, VPA, TAVI, échos dobu, et les opérateurs non-nôtres listés §3.
- **Téléconsultations** = catégorie à part, jamais rattachées à un opérateur.
- Données **réelles** (pas fictives) ; ne pas recréer de fausses valeurs.
- `npm run lint` à **0** + `npm run build` OK après chaque intervention (cf. `CLAUDE.md` §8).
- Pousser uniquement sur demande explicite (« pousse »).
