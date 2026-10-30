// Helpers d'affichage des pages finance et consultations. Les séries financières
// viennent de la base (src/data/compta.js) depuis le 2026-10-30 ; il ne reste ici que
// les années de référence du module consultations et des utilitaires de format.
export const ANNEES = [2024, 2023, 2022]

export const CONSULTATIONS = {
  2022: [978,837,1131,876,1034,1021,562,714,1083,939,1029,743],
  2023: [1136,963,1077,824,921,1007,725,597,1011,1049,1075,848],
  2024: [1085,935,945,931,931,934,685,612,976,1028,899,828],
  2025: [1145,902,1135,1029,987,980,838,707,1134,1101,993,911],
  2026: [935,1087,1208,1108,947,0,0,0,0,0,0,0],
}

// Téléconsultations (consultation vidéo d'anesthésie) — suivi au niveau global uniquement
export const TELECONSULTATIONS = {
  2022: [28,41,53,37,43,44,32,28,37,42,42,39],
  2023: [47,37,44,23,53,64,45,31,61,82,87,60],
  2024: [69,84,69,63,57,57,57,47,72,81,72,67],
  2025: [88,79,103,87,96,79,75,80,119,116,110,117],
  2026: [86,97,116,138,111,0,0,0,0,0,0,0],
}

// Données réelles Doctolib 2022→2026 (agendas SARM-1 + SARM-2). VPA/cardiologie/AKOME ignorés.
export const CONSULT_SPECIALITES = [
  {
    id: 'endoscopie',
    nom: 'Gastro / Coloscopies',
    couleur: '#534AB7',
    praticiens: [
      { id: 'ayral', nom: 'Dr Ayral', valeurs: { 2022:[56,46,53,32,56,58,41,42,62,57,75,34], 2023:[63,59,72,54,61,76,32,41,61,72,68,54], 2024:[72,66,78,74,64,51,35,36,73,76,65,63], 2025:[76,61,84,66,70,76,59,22,49,76,60,60], 2026:[88,104,83,90,74,0,0,0,0,0,0,0] } },
      { id: 'blanc', nom: 'Dr Blanc', valeurs: { 2022:[48,35,67,51,54,58,13,37,62,41,57,38], 2023:[61,28,58,52,61,57,18,29,43,38,47,33], 2024:[58,46,50,22,47,50,11,37,50,47,43,35], 2025:[58,38,39,29,38,2,18,31,43,39,33,38], 2026:[40,47,45,31,37,0,0,0,0,0,0,0] } },
      { id: 'charpy', nom: 'Dr Charpy-Debourdeau', valeurs: { 2022:[0,0,0,0,0,0,0,0,0,0,0,0], 2023:[0,0,0,0,0,0,0,0,0,0,0,0], 2024:[0,0,0,0,0,0,0,0,0,0,0,0], 2025:[0,0,0,0,0,0,0,0,0,0,0,0], 2026:[1,18,27,40,17,0,0,0,0,0,0,0] } },
      { id: 'esperance', nom: 'Mme Espérance', valeurs: { 2022:[0,0,0,0,0,0,0,0,0,0,0,0], 2023:[0,0,0,0,0,4,4,0,45,43,56,47], 2024:[55,49,49,53,41,54,40,32,53,65,51,50], 2025:[58,42,61,42,34,61,46,59,54,69,53,45], 2026:[40,45,50,55,26,0,0,0,0,0,0,0] } },
      { id: 'fedkovic', nom: 'Dr Fedkovic', valeurs: { 2022:[97,51,118,104,102,114,39,67,108,121,62,59], 2023:[91,110,119,120,111,121,72,65,131,101,72,77], 2024:[93,88,105,93,111,132,66,96,123,93,82,93], 2025:[92,105,140,126,127,102,60,79,119,125,52,94], 2026:[46,116,121,123,110,0,0,0,0,0,0,0] } },
      { id: 'garcia', nom: 'Dr Garcia', valeurs: { 2022:[49,47,60,42,64,77,32,41,72,51,76,45], 2023:[67,60,65,40,64,65,53,27,61,55,60,49], 2024:[66,33,47,54,61,54,38,26,61,73,55,42], 2025:[71,44,68,50,52,42,44,47,57,56,43,43], 2026:[50,44,57,53,54,0,0,0,0,0,0,0] } },
      { id: 'guillet', nom: 'Dr Guillet', valeurs: { 2022:[18,3,0,1,0,0,0,0,2,0,1,0], 2023:[1,0,0,0,0,0,0,0,0,0,0,0], 2024:[0,0,0,0,0,0,0,0,0,0,0,0], 2025:[0,0,0,0,0,0,0,0,0,0,0,0], 2026:[0,0,0,0,0,0,0,0,0,0,0,0] } },
      { id: 'hanslik', nom: 'Dr Hanslik', valeurs: { 2022:[49,46,52,45,49,33,30,37,31,35,41,35], 2023:[55,51,45,40,39,28,43,40,17,61,38,30], 2024:[40,34,38,31,26,35,39,6,40,40,29,36], 2025:[38,26,38,55,39,42,30,30,35,43,30,26], 2026:[38,48,50,38,23,0,0,0,0,0,0,0] } },
      { id: 'lhote', nom: 'Dr Lhote', valeurs: { 2022:[41,41,42,39,45,35,20,13,23,31,34,22], 2023:[47,47,43,39,49,50,33,17,41,30,36,36], 2024:[53,48,32,41,38,53,29,0,0,0,18,16], 2025:[37,38,40,51,34,52,37,29,56,51,38,25], 2026:[38,42,57,41,36,0,0,0,0,0,0,0] } },
      { id: 'liautard', nom: 'Dr Liautard', valeurs: { 2022:[14,17,17,13,19,18,3,16,5,11,12,8], 2023:[7,17,11,10,10,9,5,11,13,12,15,7], 2024:[6,5,3,3,1,1,0,0,0,0,0,0], 2025:[0,0,0,0,0,0,0,0,0,0,0,0], 2026:[0,0,0,0,0,0,0,0,0,0,0,0] } },
      { id: 'louvety', nom: 'Dr Louvety', valeurs: { 2022:[49,44,53,45,45,36,24,30,50,47,56,39], 2023:[52,48,38,32,47,43,56,30,59,53,49,32], 2024:[46,45,36,54,34,25,36,45,45,44,35,28], 2025:[49,45,48,34,42,25,42,30,47,55,51,32], 2026:[34,36,45,47,39,0,0,0,0,0,0,0] } },
      { id: 'monnin', nom: 'Dr Monnin', valeurs: { 2022:[19,23,21,28,24,26,12,21,22,16,9,9], 2023:[16,20,21,29,32,28,6,18,19,23,16,16], 2024:[18,29,15,31,29,4,0,0,0,0,0,0], 2025:[0,0,0,0,0,0,0,0,0,0,0,0], 2026:[0,0,0,0,0,0,0,0,0,0,0,0] } },
      { id: 'rollin', nom: 'Dr Rollin', valeurs: { 2022:[0,0,0,0,0,0,0,0,0,0,0,0], 2023:[0,0,0,0,0,0,0,0,22,44,57,57], 2024:[57,43,57,27,45,52,33,44,36,65,33,37], 2025:[39,36,35,57,19,43,47,25,42,49,42,31], 2026:[34,45,37,54,26,0,0,0,0,0,0,0] } },
      { id: 'rudler', nom: 'Dr Rudler', valeurs: { 2022:[0,0,0,0,0,0,0,0,0,0,0,0], 2023:[0,0,0,0,0,0,0,0,0,22,59,59], 2024:[55,50,53,56,39,51,43,24,49,48,41,51], 2025:[55,44,49,43,50,62,45,35,53,41,43,43], 2026:[48,56,33,43,55,0,0,0,0,0,0,0] } },
      { id: 'saloum', nom: 'Dr Saloum', valeurs: { 2022:[22,19,24,14,13,26,11,12,19,16,32,18], 2023:[37,19,32,8,20,25,22,14,27,21,20,14], 2024:[18,13,15,17,18,8,0,0,0,0,0,0], 2025:[0,0,0,0,0,0,1,0,0,0,0,0], 2026:[0,0,0,0,0,0,0,0,0,0,0,0] } },
      { id: 'suma', nom: 'Dr Suma', valeurs: { 2022:[38,36,67,34,61,53,45,53,77,22,37,31], 2023:[62,44,47,53,42,63,42,25,36,23,43,33], 2024:[55,25,15,42,29,37,32,21,33,32,50,33], 2025:[65,36,59,45,46,45,29,41,58,37,54,62], 2026:[48,50,70,38,41,0,0,0,0,0,0,0] } },
      { id: 'valats', nom: 'Dr Valats', valeurs: { 2022:[0,0,0,0,0,0,0,0,0,0,0,0], 2023:[0,0,0,0,0,0,0,0,0,0,0,0], 2024:[0,0,0,0,0,0,0,0,0,0,0,1], 2025:[69,61,59,64,63,64,57,32,54,65,51,61], 2026:[69,61,86,72,70,0,0,0,0,0,0,0] } },
      { id: 'vercambre-aufort', nom: 'Dr Vercambre', valeurs: { 2022:[34,33,48,42,45,36,34,34,70,60,52,54], 2023:[54,40,85,57,60,60,68,29,66,55,48,44], 2024:[55,45,50,45,53,38,52,28,57,68,47,50], 2025:[66,42,68,51,57,44,59,26,69,35,64,48], 2026:[50,46,67,46,58,0,0,0,0,0,0,0] } },
      { id: 'danan', nom: 'Dr Danan', valeurs: { 2022:[30,40,42,17,33,32,10,16,23,18,23,15], 2023:[24,26,24,14,14,17,21,8,22,25,27,7], 2024:[0,3,0,1,0,0,0,0,1,0,0,3], 2025:[0,0,1,0,1,0,0,0,0,0,0,0], 2026:[0,0,0,0,0,0,0,0,0,0,0,0] } },
      { id: 'boyer', nom: 'Dr Boyer', valeurs: { 2022:[43,31,47,36,38,23,12,23,43,40,36,39], 2023:[48,43,26,2,2,0,0,0,0,0,0,0], 2024:[0,0,0,0,0,0,0,0,0,0,0,0], 2025:[0,0,0,0,0,0,0,0,0,0,0,0], 2026:[0,0,0,0,0,0,0,0,0,0,0,0] } },
      { id: 'jaouen', nom: 'Dr Jaouen', valeurs: { 2022:[9,24,15,18,14,22,19,7,10,8,28,9], 2023:[32,23,23,18,23,22,18,11,22,23,18,8], 2024:[0,1,0,0,0,0,0,1,0,0,1,0], 2025:[0,0,0,0,0,1,0,0,0,0,0,0], 2026:[0,0,0,0,0,0,0,0,0,0,0,0] } },
      { id: 'montariol', nom: 'Dr Montariol', valeurs: { 2022:[20,8,21,14,15,19,18,9,16,21,20,13], 2023:[26,23,30,16,20,31,24,12,20,21,0,0], 2024:[0,0,0,0,0,1,0,0,0,0,0,0], 2025:[0,0,0,0,0,0,0,0,0,0,0,0], 2026:[0,0,0,0,0,0,0,0,0,0,0,0] } },
      { id: 'fabre', nom: 'Dr Fabre', valeurs: { 2022:[0,1,0,0,0,1,0,0,0,0,0,0], 2023:[0,0,1,0,0,0,0,1,0,0,0,0], 2024:[0,0,0,0,1,0,0,0,1,0,0,0], 2025:[0,0,0,0,0,1,0,0,0,0,0,0], 2026:[0,0,0,0,0,0,0,0,0,0,0,0] } },
      { id: 'parelon', nom: 'Dr Parelon', valeurs: { 2022:[0,0,0,0,0,0,0,0,0,0,0,0], 2023:[0,0,0,0,0,0,0,0,1,0,0,0], 2024:[0,0,0,0,0,0,0,0,0,0,0,0], 2025:[0,0,0,0,0,0,0,0,0,0,0,0], 2026:[0,0,0,0,0,0,0,0,0,0,0,0] } },
    ],
    // Bucket « non attribué » de la spécialité — chirurgie bariatrique (motif FIBRO
    // « … DR WARTHMANN / LEON »). Comptée dans le TOTAL Gastro, jamais rattachée à un
    // gastro-entérologue : les opérateurs cités sont des chirurgiens (cf. CONSULTATIONS.md §4).
    // Était auparavant un praticien `bariatrique` ; migré ici (migrerBariatrique dans
    // consultations.js fait la bascule pour les stores déjà enregistrés).
    valeurs: {
      2022:[22,22,27,19,27,32,9,13,24,22,23,20],
      2023:[21,19,24,19,25,24,10,7,22,19,19,11],
      2024:[17,11,22,2,16,20,10,6,19,13,17,10],
      2025:[20,12,11,14,9,15,5,4,13,12,8,2],
      2026:[13,11,14,1,1,0,0,0,0,0,0,0],
    },
  },
  {
    id: 'neurochirurgie',
    nom: 'Neurochirurgie',
    couleur: '#EF9F27',
    praticiens: [
      { id: 'nogues', nom: 'Dr Nogues', valeurs: { 2022:[34,26,42,18,40,29,24,13,46,29,39,16], 2023:[35,26,28,31,25,29,20,11,30,37,39,25], 2024:[29,29,10,20,27,28,26,18,39,21,36,22], 2025:[31,17,30,23,26,28,24,17,35,33,30,22], 2026:[31,28,30,29,32,0,0,0,0,0,0,0] } },
      { id: 'meyer-bisch', nom: 'Dr Meyer-Bisch', valeurs: { 2022:[27,27,36,29,20,25,10,28,34,30,24,12], 2023:[39,23,23,18,23,15,19,30,33,24,43,18], 2024:[32,25,26,26,26,26,6,26,29,24,29,22], 2025:[36,23,26,26,20,19,15,16,35,26,26,21], 2026:[27,17,25,28,18,0,0,0,0,0,0,0] } },
      { id: 'dran', nom: 'Dr Dran', valeurs: { 2022:[43,32,46,32,39,36,23,40,43,38,45,39], 2023:[59,37,45,34,45,45,23,35,43,37,45,32], 2024:[31,37,37,30,28,14,16,31,34,39,37,25], 2025:[35,24,38,27,29,32,19,24,29,23,23,25], 2026:[22,27,19,20,13,0,0,0,0,0,0,0] } },
      { id: 'rolland', nom: 'Dr Rolland', valeurs: { 2022:[0,0,0,0,0,0,0,0,0,0,0,0], 2023:[0,0,0,0,0,0,0,0,0,0,0,0], 2024:[0,0,1,10,12,7,8,21,7,18,13,16], 2025:[14,10,9,22,13,9,14,15,22,23,23,12], 2026:[16,17,17,17,11,0,0,0,0,0,0,0] } },
      { id: 'blanquet', nom: 'Dr Blanquet', valeurs: { 2022:[57,40,80,41,65,61,21,40,90,53,74,43], 2023:[57,41,48,1,3,1,0,1,2,0,0,0], 2024:[0,0,0,0,0,0,0,0,0,0,0,0], 2025:[0,0,0,0,0,0,0,0,0,0,0,0], 2026:[0,0,0,0,0,0,0,0,0,0,0,0] } },
      { id: 'gharbi', nom: 'Dr Gharbi', valeurs: { 2022:[0,0,0,0,0,0,0,0,0,0,0,0], 2023:[0,0,1,0,0,0,1,0,0,0,0,0], 2024:[0,0,0,0,0,0,0,0,0,0,0,0], 2025:[0,0,0,0,0,0,0,0,0,0,0,0], 2026:[0,0,0,0,0,0,0,0,0,0,0,0] } },
    ],
  },
  {
    id: 'viscerale',
    nom: 'Chirurgie viscérale',
    couleur: '#D85A30',
    praticiens: [
      { id: 'malgoire', nom: 'Dr Malgoire', valeurs: { 2022:[38,38,29,42,37,48,16,31,38,50,44,44], 2023:[35,35,46,47,33,47,31,22,38,42,33,30], 2024:[52,41,44,52,36,42,29,27,52,52,44,37], 2025:[56,37,51,35,38,43,41,14,50,41,59,43], 2026:[43,46,53,37,42,0,0,0,0,0,0,0] } },
      { id: 'flamein', nom: 'Dr Flamein', valeurs: { 2022:[32,35,40,47,37,48,28,29,50,43,53,44], 2023:[55,52,48,49,33,46,33,56,46,47,43,34], 2024:[68,36,41,38,27,48,35,21,42,73,42,40], 2025:[47,45,37,34,46,57,36,24,52,52,58,39], 2026:[41,44,63,34,29,0,0,0,0,0,0,0] } },
      { id: 'pissas', nom: 'Dr Pissas', valeurs: { 2022:[22,25,19,14,21,13,27,17,21,28,18,13], 2023:[27,24,21,10,20,25,11,16,25,28,18,14], 2024:[4,14,9,16,21,10,22,8,25,19,21,20], 2025:[28,22,26,28,23,25,16,17,34,26,32,15], 2026:[24,20,28,27,23,0,0,0,0,0,0,0] } },
    ],
  },
  {
    id: 'pneumologie',
    nom: 'Pneumologie',
    couleur: '#1D9E75',
    praticiens: [
      { id: 'froment', nom: 'Dr Froment', valeurs: { 2022:[1,5,2,6,5,7,4,1,3,2,6,2], 2023:[5,8,5,4,1,2,6,4,1,4,3,4], 2024:[3,5,5,1,4,5,4,3,3,5,1,1], 2025:[2,4,6,2,4,1,7,2,7,2,6,3], 2026:[2,5,2,1,2,0,0,0,0,0,0,0] } },
      { id: 'gautier-dechaud', nom: 'Dr Gautier-Déchaud', valeurs: { 2022:[3,1,2,1,4,1,5,3,1,5,4,0], 2023:[4,3,1,2,3,2,0,5,5,5,3,1], 2024:[3,2,3,2,3,2,1,0,4,4,2,3], 2025:[4,6,5,3,3,3,2,1,3,5,0,1], 2026:[1,2,4,3,2,0,0,0,0,0,0,0] } },
      { id: 'maestre', nom: 'Dr Maestre', valeurs: { 2022:[1,2,0,5,5,3,1,3,2,2,2,2], 2023:[4,1,1,4,1,2,2,1,0,1,1,0], 2024:[0,2,2,1,4,2,5,0,1,4,2,2], 2025:[3,3,1,7,2,0,0,0,2,0,0,0], 2026:[2,4,4,1,4,0,0,0,0,0,0,0] } },
      { id: 'bughin', nom: 'Dr Bughin', valeurs: { 2022:[5,2,4,1,0,1,2,0,0,0,3,0], 2023:[2,3,2,1,2,0,0,1,0,0,0,0], 2024:[0,0,0,3,1,0,1,1,1,3,1,1], 2025:[3,1,1,1,1,2,5,0,1,0,1,1], 2026:[1,6,3,3,0,0,0,0,0,0,0,0] } },
      { id: 'marcano', nom: 'Dr Marcano', valeurs: { 2022:[0,0,0,0,0,0,0,0,0,0,0,0], 2023:[0,0,0,0,0,0,0,0,0,0,0,0], 2024:[0,0,0,0,0,0,0,1,4,3,3,2], 2025:[4,1,2,3,1,5,0,3,1,2,1,1], 2026:[4,3,1,2,1,0,0,0,0,0,0,0] } },
      { id: 'demazeau', nom: 'Dr Demazeau', valeurs: { 2022:[0,0,0,0,0,0,0,0,0,0,0,0], 2023:[0,0,0,0,0,0,0,0,0,0,0,0], 2024:[0,0,0,0,0,0,0,0,0,0,0,1], 2025:[1,1,1,2,2,3,3,1,1,2,0,3], 2026:[1,2,4,3,0,0,0,0,0,0,0,0] } },
      { id: 'adam', nom: 'Dr Adam', valeurs: { 2022:[0,1,1,1,4,0,0,3,1,3,0,1], 2023:[4,0,1,0,0,1,0,0,0,0,0,0], 2024:[0,0,1,1,2,3,4,0,4,1,1,0], 2025:[0,0,0,0,1,0,1,0,0,0,1,0], 2026:[1,1,0,0,0,0,0,0,0,0,0,0] } },
    ],
  },
]

export const MOIS_COURT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
export const MOIS_LONG = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

// Présélection par défaut des filtres de période à l'arrivée sur une page (l'utilisateur reste
// libre de changer ensuite) : mois = janvier → (mois en cours − 1) ; années = [année en cours, n−1]
// si elles sont disponibles pour la page, sinon les 2 années les plus récentes disponibles (les
// données fictives s'arrêtant avant l'année en cours, on retombe alors sur les plus récentes).
// → { moisDe, moisA, years, shortcut }
export function periodeParDefaut(availableYears = []) {
  const moisA = Math.max(0, new Date().getMonth() - 1) // mois actuel − 1 (clampé à janvier)
  const an = new Date().getFullYear()
  const tri = [...new Set(availableYears)].sort((a, b) => b - a) // décroissant : pour piocher les 2 plus récentes
  const recentes = [an, an - 1].filter(y => tri.includes(y))
  const choisies = recentes.length === 2 ? recentes : tri.slice(0, 2)
  // `years` est renvoyé trié CROISSANT (ordre chronologique d'affichage) ; la plus récente = years.at(-1).
  const years = [...choisies].sort((a, b) => a - b)
  // Raccourci correspondant à « janvier → moisA » s'il en existe un, sinon « personnalisé ».
  const shortcut = moisA === 11 ? 'annee' : moisA === 5 ? 's1' : moisA === 2 ? 't1' : 'custom'
  return { moisDe: 0, moisA, years, shortcut }
}

let _masque = false
export const setMasqueMontants = v => { _masque = v }
export const getMasqueMontants = () => _masque
export const fmtEur = v => _masque ? '••• €' : Math.round(v).toLocaleString('fr-FR') + ' €'
export const fmtK = v => _masque ? '••• k€' : Math.round(v / 1000) + ' k€'
export const sum = arr => arr.reduce((a, b) => a + b, 0)
export const pct = (a, b) => b === 0 ? '0' : (((a - b) / b) * 100).toFixed(1)
export const diffLabel = (a, b, ref) => {
  const d = pct(a, b)
  return (d > 0 ? '↑ +' : '↓ ') + d + '% vs ' + ref
}
export const diffColor = (a, b, invert = false) => {
  const d = parseFloat(pct(a, b))
  if (invert) return d > 0 ? 'down' : 'up'
  return d > 0 ? 'up' : 'down'
}

// Couleur d'une série d'année selon son RANG dans la sélection (comparaison de 2 à 4 années).
// Rang 0 = année principale (la plus récente) → couleur d'accent de la page (vive).
// Rangs suivants = TEINTES DISTINCTES (plus une rampe grise indistincte) : chaque année comparée a
// sa propre couleur, choisie pour rester lisible en thème CLAIR comme SOMBRE (saturation/luminance
// moyennes). Ordre : la plus distincte d'abord (la plupart des comparaisons portent sur 2-3 années).
const NUANCES_ANNEES = ['#3B82C4', '#C2476B', '#E8912A'] // bleu · framboise · ambre
export const couleurAnnee = (rang, accent) =>
  rang === 0 ? accent : NUANCES_ANNEES[Math.min(rang - 1, NUANCES_ANNEES.length - 1)]

// Ordre d'AFFICHAGE chronologique des séries d'années (la plus ANCIENNE à gauche → la plus RÉCENTE
// à droite), pour les barres, courbes et légendes. On conserve le RANG DE RÉCENCE (rang 0 = la plus
// récente) afin que les couleurs (couleurAnnee) et styles restent attachés à l'année, pas à sa
// position : la plus récente garde la couleur d'accent, même affichée à droite.
// `years` est déjà trié croissant (cf. periodeParDefaut / PeriodeFilter) ; ce helper sécurise l'ordre
// et fournit en plus le rang de récence pour la couleur.
// Usage : ordreAffichage(years).map(({ y, rang }) => …)
export const ordreAffichage = (years) => {
  const parRecence = [...years].sort((a, b) => b - a) // index 0 = année la plus récente
  return [...years].sort((a, b) => a - b).map(y => ({ y, rang: parRecence.indexOf(y) }))
}