# Compta — classement des relevés bancaires de la SARM

Script local qui lit un relevé OFX du compte BNP de la SARM, classe chaque ligne d'après
`regles.json` et produit des CSV + un rapport dans `~/partage/compta/classe/` (hors dépôt).
Rien ici ne touche au dashboard : la page « Règles virements » et les tables Supabase sont un
lot ultérieur (cf. `CLAUDE.md` § 9).

## Interdits (cf. `CLAUDE.md` § 4)

- `regles.json`, `classer.js`, `classer.test.js` et ce README ne contiennent **que des motifs,
  des noms de tiers et des statuts**. Jamais de montant réel, de libellé réel ni de ligne
  bancaire, ni ici ni dans un commit, un mock ou une doc.
- Les relevés (`*.ofx`, `*.csv`, `*.xlsx`) et les sorties restent dans `~/partage/compta/`.
  Le `.gitignore` les refuse dans `compta/`.

## Usage mensuel

1. Déposer l'export OFX du mois dans `~/partage/compta/` (export BNP natif ; le CSV et le
   XLSX d'ofxconverter sont à éviter, surtout le XLSX dont les dates sont au format américain).
2. Lancer, depuis la racine du dépôt :

   ```sh
   node compta/classer.js ~/partage/compta/<fichier>.ofx            # tout le fichier
   node compta/classer.js ~/partage/compta/<fichier>.ofx --annee 2026
   ```

3. Lire `~/partage/compta/classe/rapport.md` :
   - « Lignes classées mais à vérifier » : classées, mais avec un doute signalé (divergence
     motif / bénéficiaire, bénéficiaire tronqué, second virement permanent…).
   - « À arbitrer » : aucune règle sûre ne couvre la ligne. **Le script ne devine jamais** :
     pas de catégorie « Autre » par défaut.
4. Pour chaque ligne arbitrée, ajouter la règle (voir ci-dessous) et relancer. Le
   `grand-livre.csv` cumule tous les imports et se dédoublonne par `FITID` : relancer le même
   fichier ne crée pas de doublon.

Sorties :

| Fichier | Contenu |
|---|---|
| `releve-<nom>-classe.csv` | toutes les lignes du fichier : `date;montant;type;libelle;tiers;groupe;categorie;associe;regle;alerte;fitid` |
| `a-arbitrer.csv` | le sous-ensemble sans règle sûre |
| `rapport.md` | période, totaux par catégorie / mois / associé, alertes, à arbitrer, contrôle d'intégrité (somme des catégories = total) |
| `grand-livre.csv` | cumul de tous les imports, trié par date, dédoublonné |

CSV : séparateur `;`, virgule décimale, UTF-8 avec BOM (s'ouvre directement dans Excel en français).

## Comment le script lit une ligne

Chaque ligne OFX donne `type` (le `NAME` BNP : `VIR SEPA RECU`, `PRLV SEPA`, `FACTURE CARTE`…)
et `memo`. Le memo est découpé en `tiers`, `motif`, `beneficiaire` :

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
- Après toute modification : `npx vitest run compta` et `npm run lint`, puis relancer le
  classement. Les tests n'utilisent que des noms fictifs ; en ajouter un si la règle est
  structurelle (nouvelle famille, nouveau champ), pas pour chaque nom.

## Décisions de classement (2026-10-30)

- Virements permanents mensuels = reversement aux associés ; le second virement du mois
  (référence `ZZ1…`) reste en alerte tant qu'il n'est pas confirmé sur le relevé BNP.
- Motif `REMPLA…` = remplaçant MAR payé en honoraires ; motif `SALAIRE…` = salarié.
- AGMF Prévoyance concerne les associés ; APIVIA et CEP Tréso Santé les salariés.
- `RCP DR …` = remboursement à chaque associé de sa prime de responsabilité civile.
- CPAM de l'Hérault : ≤ 500 € = tiers payant ; au-delà = « Versements CPAM hors tiers
  payant » (permanence des soins, forfaits, aides).
- Laissés à la comptable (règle « à arbitrer » volontaire) : Société Générale, Clinique du
  Millénaire (petits prélèvements), SAS Millénaire Clinique, Clinique Clémentville, Infogem,
  SIE, remises de chèques.
