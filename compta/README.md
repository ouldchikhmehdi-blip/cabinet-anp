# Compta — classement des relevés bancaires de la SARM

Deux chemins, un seul moteur (`moteur.js`, module pur sans dépendance) :

- **Dashboard** (`sarm-dashboard.vercel.app`, page « Règles virements ») : import d'un relevé
  OFX ou CSV natif BNP depuis le navigateur, classement sous RLS, file d'attente à arbitrer, dictionnaire de
  règles modifiable, reclassement rétroactif. Les pages finance (Vue globale, Chiffre
  d'affaires, Dépenses, Virements associés, Remplaçants, Salariés CDI) lisent les
  lignes classées de la table `compta_transactions` (`src/data/compta.js`).
- **Script local** (`classer.js`) : même classement, sorties CSV + rapport dans
  `~/partage/compta/classe/` (hors dépôt), sans réseau. Et `importer.js` pour pousser un relevé
  en base depuis le mini PC.

**Source de vérité des règles : la table `compta_regles` (un document JSON).** `regles.json`
dans ce dossier est la graine (premier chargement) et l'export (bouton « Exporter regles.json »
de la page) : après un arbitrage fait dans le dashboard, ré-exporter et committer pour que le
script local et le dépôt suivent.

## Interdits (cf. `CLAUDE.md` § 4)

- `regles.json`, `classer.js`, `classer.test.js` et ce README ne contiennent **que des motifs,
  des noms de tiers et des statuts**. Jamais de montant réel, de libellé réel ni de ligne
  bancaire, ni ici ni dans un commit, un mock ou une doc.
- Les relevés (`*.ofx`, `*.csv`, `*.xlsx`) et les sorties restent dans `~/partage/compta/`.
  Le `.gitignore` les refuse dans `compta/`.

## Usage mensuel

**Depuis le dashboard (admin, 2FA)** : « Règles virements » → « Importer un relevé (OFX ou CSV BNP) » →
lire la file d'attente → pour chaque ligne, « Cette ligne » (classement manuel, figé) ou
« Règle sur ce tiers » (règle explicite, rejouée sur toutes les lignes) ou « Ajouter à la
liste » (nom de salarié / remplaçant) → « Exporter regles.json » → remplacer `compta/regles.json`
et committer.

**Depuis le mini PC** (sans ouvrir le dashboard) :

```sh
# classement hors ligne, CSV + rapport
node compta/classer.js ~/partage/compta/<fichier>.ofx [--annee 2026]
# import en base (règles lues dans compta_regles ; --regles-locales pousse d'abord regles.json)
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node compta/importer.js ~/partage/compta/<fichier>.ofx [--annee 2026] [--regles-locales]
```

Dans les deux cas : lire `rapport.md` ou la file d'attente, arbitrer, ajouter la règle,
relancer. Le script **ne devine jamais** : pas de catégorie « Autre » par défaut. Rejouer un
même fichier est sans risque (dédoublonnage par `FITID`, lignes manuelles préservées).

**Première mise en service** (une fois) : exécuter `supabase/compta.sql` dans le SQL Editor
Supabase, puis amorcer règles + lignes avec `importer.js … --regles-locales`.

Sorties :

| Fichier | Contenu |
|---|---|
| `releve-<nom>-classe.csv` | toutes les lignes du fichier : `date;montant;type;libelle;tiers;groupe;categorie;associe;regle;alerte;fitid` |
| `a-arbitrer.csv` | le sous-ensemble sans règle sûre |
| `rapport.md` | période, totaux par catégorie / mois / associé, alertes, à arbitrer, contrôle d'intégrité (somme des catégories = total) |
| `grand-livre.csv` | cumul de tous les imports, trié par date, dédoublonné |

CSV : séparateur `;`, virgule décimale, UTF-8 avec BOM (s'ouvre directement dans Excel en français).

## Comment le script lit une ligne

Chaque ligne donne `type` (le `NAME` de l'OFX = le libellé court du CSV : `VIR SEPA RECU`,
`PRLV SEPA`, `FACTURE CARTE`…) et `memo` (le `MEMO` de l'OFX, tronqué vers 70 caractères ;
dans le CSV, le libellé long privé du libellé court, complet). Identifiant : `FITID` de
l'OFX ; pour le CSV, `bnp-<empreinte(date|montant|libellé)>-<rang>`, stable d'un export à
l'autre. Le memo est découpé en `tiers`, `motif`, `beneficiaire` :

- virement reçu `/FRM <tiers> /EID …` → tiers ;
- virement émis `/MOTIF <motif> /BEN <bénéficiaire> /REFDO …` → motif + bénéficiaire ;
- prélèvement `<créancier> ECH/… ID EMETTEUR/…` → tiers.

Ordre d'application, la première règle qui matche gagne :

1. **Règles explicites** de `regles.json` (`regles[]`) : honoraires clinique, virements
   permanents, prélèvements connus, fournisseurs connus, et les tiers « connus mais non
   tranchés » qui vont volontairement en « À arbitrer » avec une alerte.
2. **Virements reçus** : caisse / mutuelle (regex `caisses_tiers_payant`) et montant ≤
   `tiers_payant_montant_max` → Tiers payant ; SELARL ou associé → Remboursement reçu ;
   remplaçant MAR connu ou motif `REMB…` → Remboursement reçu ; sinon à arbitrer.
3. **Salaires** (`SALAIRE…`) : nom dans `iade_cdi` → Salaire IADE CDI ; dans `iade_cdd` →
   Remplaçant IADE (CDD) ; inconnu → à arbitrer.
4. **Remplaçants** (`REMPLA…`, `RMPLA`, `REMPLACANT`, `REMPLACEMENT`) : nom dans
   `mar_remplacants` → Remplaçant MAR ; motif `HOTEL` avancé par un associé → Frais de
   remplaçant ; inconnu → à arbitrer.
5. **Associés** : le **bénéficiaire fait foi** ; s'il est tronqué (`SELARL DU DOCTEU`), repli
   sur le nom du motif ; si motif et bénéficiaire nomment deux associés, imputation au
   bénéficiaire et alerte. Sous-catégorie d'après le motif : `RELIQUAT`, `MOINS DONNE` /
   `MOINS VERSE` / `TROP PERCU`, `RCP`, `AVANCE` / `REMB`, `COMPL…`.
6. **Cartes** : commerçant dans `commercants_carte` → Vie du groupe ; sinon à arbitrer.
7. Tout le reste → **À arbitrer**.

## Ajouter ou modifier une règle

- **Nouveau fournisseur prélevé** : ajouter dans `regles[]`
  `{ "id": "...", "quand": { "type": "^PRLV", "tiers": "^NOM DU CREANCIER" }, "categorie": "..." }`.
  Champs possibles dans `quand` : `type`, `tiers`, `memo`, `beneficiaire` (regex, insensibles à
  la casse), `sens` (`credit` / `debit`), `montant_min`, `montant_max`.
- **Nouveau salarié IADE** : son nom (regex, majuscules sans accent) dans `iade_cdi` ou `iade_cdd`.
- **Nouveau remplaçant MAR** : vérifier qu'il est bien médecin anesthésiste, puis `mar_remplacants`.
- **Nouvel associé** : `associes` (initiales → regex du nom tel qu'il apparaît à la banque,
  variantes d'orthographe comprises).
- **Nouvelle catégorie** : l'ajouter d'abord dans `taxonomie`, sinon le chargement refuse la règle.
- Une règle explicite peut porter `"associe": "EH"` pour imputer la ligne à un associé.
- **Règle sur une seule ligne** : `"quand": { "fitid": "…" }` (identifiant visible dans le
  grand livre). Sert aux arbitrages ponctuels qu'on ne veut pas généraliser (ex. un virement
  au motif vague) ; survit aux réimports et marche dans le script comme dans la base.
- Les motifs saisis à la main à la banque ont des coquilles (SALAIRZ, QALAIRE, REMOLA,
  REM0LA, COMOLEMENT…) : le moteur les tolère ; en ajouter une seule fois dans `moteur.js`
  avec un test, pas une règle par coquille.
- Après toute modification du fichier : `npx vitest run compta src/data` et `npm run lint`,
  puis relancer le classement ; si le dashboard est en service, recharger le fichier par
  « Charger regles.json » (ou `importer.js --regles-locales`) pour que la base suive. Les tests n'utilisent que des noms fictifs ; en ajouter un si la règle est
  structurelle (nouvelle famille, nouveau champ), pas pour chaque nom.

## Tables Supabase (`supabase/compta.sql`)

| Table | Contenu | Lecture | Écriture |
|---|---|---|---|
| `compta_regles` | une ligne, `doc` jsonb = le dictionnaire | `acces_cabinet()` | `is_admin()` |
| `compta_transactions` | une ligne par FITID : date, montant, type, libellé, tiers, groupe, catégorie, associé, règle, alerte, `manuel` | `acces_cabinet()` | `is_admin()` |
| `compta_soldes` | solde d'en-tête du CSV BNP par date, ancre du calcul des soldes de fin de mois (le LEDGERBAL de l'OFX n'est pas repris, cf. ci-dessous) | `acces_cabinet()` | `is_admin()` |

Aucune fonction serverless (plan Vercel 12/12) : tout passe par le client Supabase sous RLS.
`manuel = true` fige une ligne classée à la main : le reclassement ne la touche plus.

## Solde : celui de l'OFX est faux, celui du CSV fait foi (vérifié le 2026-10-30)

Le LEDGERBAL de l'OFX BNP (au 06/11/2025) et le solde d'en-tête du CSV (au 16/10/2026)
diffèrent d'un écart à six chiffres alors que les mouvements entre les deux sont complets. Témoin
externe : un seul prélèvement d'intérêts débiteurs en 22 mois (juillet 2025, pour le
2e trimestre). Ancré sur le CSV, le compte est à découvert 3 jours en mai 2025, ce qui
explique ce prélèvement ; ancré sur l'OFX, il ne l'est jamais. Le moteur ignore donc le
solde OFX (`parserReleve` → `solde: null`). Une ligne `compta_soldes` du 2025-11-06 a été
insérée avant ce constat ; elle est inerte (l'ancre la plus récente prime) et peut être
supprimée : `delete from compta_soldes where date = '2025-11-06';`

## Décisions de classement (2026-10-30)

- Virements permanents mensuels = reversement aux associés ; le second virement du mois
  (référence `ZZ1…`) reste en alerte tant qu'il n'est pas confirmé sur le relevé BNP.
- Motif `REMPLA…` = remplaçant MAR payé en honoraires ; motif `SALAIRE…` = salarié.
- AGMF Prévoyance concerne les associés ; APIVIA et CEP Tréso Santé les salariés.
- `RCP DR …` = remboursement à chaque associé de sa prime de responsabilité civile.
- CPAM de l'Hérault : ≤ 500 € = tiers payant ; au-delà = « Versements CPAM hors tiers
  payant » (permanence des soins, forfaits, aides).
- Prélèvements « SG-SOCIETE GENERALE » = épargne salariale (arbitré par drmoc dans la page le
  2026-10-30, règle `sg-societe-generale-epargne-salariale`).
- Laissés à la comptable (règle « à arbitrer » volontaire) : autre libellé Société Générale, Clinique du
  Millénaire (petits prélèvements), SAS Millénaire Clinique, Infogem, SIE, remises de
  chèques, chèques émis.
- Complété le même jour avec le CSV 2025-2026 : Clémentville = honoraires clinique ;
  ADSPL = « Autres cotisations patronales » (cotisation conventionnelle des professions
  libérales) ; notaire Lexnot (promesse de vente WEKO) = groupe « Investissements » ›
  « Acquisition immobilière », hors charges courantes ; AG2R Prévoyance, Siaci, Aatlantide
  reçus = « Remboursement reçu » ; Benbakhti, Planche, Bouery, Fanjaud = IADE CDD ;
  Hammani = MAR ; « REGULARISATION 2025 » = Régularisation ; les trois reliquats tronqués du
  11/04/2025 = Fedide, Chouki, Coisel (déduits par symétrie, validé par drmoc).
