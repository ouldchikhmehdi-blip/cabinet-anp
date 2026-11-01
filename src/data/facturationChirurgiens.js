// ============================================================
// facturationChirurgiens.js — qui est qui dans le facturé par chirurgien.
//
// Le script compta/facturation.js enregistre, par mois, le facturé par chirurgien
// sous la clé « NOM Prenom » (colonne med0 des exports d'actes), ou sous un bucket
// « __… » quand aucun chirurgien n'a pu être retrouvé. Ce module relie ces clés aux
// spécialités et praticiens de l'onglet Consultations (src/data/mockData.js) pour
// naviguer de la même façon : spécialité → praticiens. Un chirurgien absent d'ici
// est affiché tel quel dans « Autres chirurgiens (à classer) », jusqu'à ce que
// drmoc dise où il va.
// ============================================================

// Nom de famille (majuscules, tel que dans med0) → { spec, id, nom } du praticien de Consultations,
// ou { spec, bucket } pour compter dans le total d'une spécialité sans praticien (bucket `valeurs`).
// Les ids reprennent ceux de CONSULT_SPECIALITES (test : facturationChirurgiens.test.js).
export const CHIRURGIENS = {
  // Gastro / coloscopies
  AYRAL: { spec: 'endoscopie', id: 'ayral', nom: 'Dr Ayral' },
  BLANC: { spec: 'endoscopie', id: 'blanc', nom: 'Dr Blanc' },
  CHARPY: { spec: 'endoscopie', id: 'charpy', nom: 'Dr Charpy-Debourdeau' },
  ESPERANCE: { spec: 'endoscopie', id: 'esperance', nom: 'Mme Espérance' },
  FEDKOVIC: { spec: 'endoscopie', id: 'fedkovic', nom: 'Dr Fedkovic' },
  GARCIA: { spec: 'endoscopie', id: 'garcia', nom: 'Dr Garcia' },
  GUILLET: { spec: 'endoscopie', id: 'guillet', nom: 'Dr Guillet' },
  HANSLIK: { spec: 'endoscopie', id: 'hanslik', nom: 'Dr Hanslik' },
  LHOTE: { spec: 'endoscopie', id: 'lhote', nom: 'Dr Lhote' },
  LIAUTARD: { spec: 'endoscopie', id: 'liautard', nom: 'Dr Liautard' },
  LOUVETY: { spec: 'endoscopie', id: 'louvety', nom: 'Dr Louvety' },
  MONNIN: { spec: 'endoscopie', id: 'monnin', nom: 'Dr Monnin' },
  ROLLIN: { spec: 'endoscopie', id: 'rollin', nom: 'Dr Rollin' },
  RUDLER: { spec: 'endoscopie', id: 'rudler', nom: 'Dr Rudler' },
  SALOUM: { spec: 'endoscopie', id: 'saloum', nom: 'Dr Saloum' },
  SUMA: { spec: 'endoscopie', id: 'suma', nom: 'Dr Suma' },
  VALATS: { spec: 'endoscopie', id: 'valats', nom: 'Dr Valats' },
  'VERCAMBRE AUFORT': { spec: 'endoscopie', id: 'vercambre-aufort', nom: 'Dr Vercambre' },
  VERCAMBRE: { spec: 'endoscopie', id: 'vercambre-aufort', nom: 'Dr Vercambre' },
  DANAN: { spec: 'endoscopie', id: 'danan', nom: 'Dr Danan' },
  BOYER: { spec: 'endoscopie', id: 'boyer', nom: 'Dr Boyer' },
  JAOUEN: { spec: 'endoscopie', id: 'jaouen', nom: 'Dr Jaouen' },
  MONTARIOL: { spec: 'endoscopie', id: 'montariol', nom: 'Dr Montariol' },
  FABRE: { spec: 'endoscopie', id: 'fabre', nom: 'Dr Fabre' },
  PARELON: { spec: 'endoscopie', id: 'parelon', nom: 'Dr Parelon' },
  // Neurochirurgie
  NOGUES: { spec: 'neurochirurgie', id: 'nogues', nom: 'Dr Nogues' },
  'MEYER-BISCH': { spec: 'neurochirurgie', id: 'meyer-bisch', nom: 'Dr Meyer-Bisch' },
  DRAN: { spec: 'neurochirurgie', id: 'dran', nom: 'Dr Dran' },
  ROLLAND: { spec: 'neurochirurgie', id: 'rolland', nom: 'Dr Rolland' },
  BLANQUET: { spec: 'neurochirurgie', id: 'blanquet', nom: 'Dr Blanquet' },
  GHARBI: { spec: 'neurochirurgie', id: 'gharbi', nom: 'Dr Gharbi' },
  // Chirurgie viscérale
  MALGOIRE: { spec: 'viscerale', id: 'malgoire', nom: 'Dr Malgoire' },
  FLAMEIN: { spec: 'viscerale', id: 'flamein', nom: 'Dr Flamein' },
  PISSAS: { spec: 'viscerale', id: 'pissas', nom: 'Dr Pissas' },
  // Pneumologie
  FROMENT: { spec: 'pneumologie', id: 'froment', nom: 'Dr Froment' },
  'GAUTIER-DECHAUD': { spec: 'pneumologie', id: 'gautier-dechaud', nom: 'Dr Gautier-Déchaud' },
  MAESTRE: { spec: 'pneumologie', id: 'maestre', nom: 'Dr Maestre' },
  BUGHIN: { spec: 'pneumologie', id: 'bughin', nom: 'Dr Bughin' },
  MARCANO: { spec: 'pneumologie', id: 'marcano', nom: 'Dr Marcano' },
  DEMAZEAU: { spec: 'pneumologie', id: 'demazeau', nom: 'Dr Demazeau' },
  ADAM: { spec: 'pneumologie', id: 'adam', nom: 'Dr Adam' },
  // Chirurgie bariatrique : comptée dans le total Gastro, dans son bucket « non attribué »
  // (jamais sur un gastro-entérologue, cf. CONSULTATIONS.md, motif FIBRO) — décision drmoc 2026-10-31.
  LEON: { spec: 'endoscopie', bucket: 'Chir. bariatrique' },
  WARTHMANN: { spec: 'endoscopie', bucket: 'Chir. bariatrique' },
}

// Spécialités, dans l'ordre d'affichage. Les quatre premières = celles de Consultations (mêmes ids
// et couleurs) ; `autres` n'existe que pour la facturation. `bucketNom` : libellé du bucket
// « non attribué » de la spécialité (somme des entrées `bucket` de CHIRURGIENS).
export const SPECIALITES = [
  { id: 'endoscopie', nom: 'Gastro / Coloscopies', couleur: '#534AB7', bucketNom: 'Chir. bariatrique (Léon, Warthmann) et YYYY400 sans gastro identifié' },
  { id: 'neurochirurgie', nom: 'Neurochirurgie', couleur: '#EF9F27' },
  { id: 'viscerale', nom: 'Chirurgie viscérale', couleur: '#D85A30', bucketNom: 'YYYY400 sans chirurgien identifié' },
  { id: 'pneumologie', nom: 'Pneumologie', couleur: '#1D9E75' },
  { id: 'autres', nom: 'Autres chirurgiens (à classer)', couleur: '#7A8B99', aClasser: true },
]

// Buckets du script : affichés comme des pseudo-spécialités sans praticien, après les vraies.
export const BUCKETS = [
  { id: '__consultations', nom: 'Consultations', couleur: '#8C8C86', note: 'consultations et avis facturés, sans séjour opératoire' },
  { id: '__reanimation', nom: 'Réanimation / USC', couleur: '#0E7490', note: 'actes de réanimation et de soins intensifs (YYYY015, YYYY020), surveillance après chirurgie cardiaque avec CEC (YYYY108) et dialyses (JVJ…), quel que soit le séjour' },
  { id: '__sejour_inconnu', nom: 'Séjour non retrouvé', couleur: '#B4B2A9', note: 'séjour absent des exports d\'actes (souvent un acte de l\'année précédente)' },
  { id: '__a_arbitrer', nom: 'À arbitrer', couleur: '#C2476B', note: 'plusieurs chirurgiens possibles, nom de chirurgien illisible, ou séjour où seul un anesthésiste est noté' },
]

// « VERCAMBRE AUFORT Lucile » → « VERCAMBRE AUFORT » (les mots tout en majuscules)
export const nomFamille = (cle) => String(cle || '').split(' ').filter(m => m.length > 1 && m === m.toUpperCase()).join(' ')

/** L'entrée CHIRURGIENS (praticien de Consultations, ou bucket de spécialité) d'une clé du script, ou null. */
export function praticienDe(cle) {
  if (!cle || cle.startsWith('__')) return null
  return CHIRURGIENS[nomFamille(cle)] || null
}

// « GALLET DE SANTERRE Philippe » → « Dr Gallet de Santerre » (nom lisible d'un chirurgien non classé)
export const libelleChirurgien = (cle) => {
  const fam = nomFamille(cle)
  const t = fam.toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase()).replace(/ De /g, ' de ')
  return `Dr ${t}`
}

/**
 * Construit les spécialités de la page (même forme que CONSULT_SPECIALITES :
 * { id, nom, couleur, praticiens: [{ id, nom, valeurs: {y: [12]} }] } ou { …, valeurs }) depuis
 * les séries du store : parChirurgien[y][cle] = [12]. Les chirurgiens non classés deviennent
 * chacun un praticien de « Autres chirurgiens (à classer) » ; les entrées `bucket` vont dans
 * `valeurs` de leur spécialité (comptées dans son total, sans praticien).
 */
export function specialitesFacturation(parChirurgien, annees) {
  const vide = () => Array(12).fill(0)
  // `cles` : clés du script (« NOM Prenom », __bucket) derrière chaque praticien, et `clesValeurs`
  // derrière le total sans praticien d'une spécialité — pour aller chercher les actes à exporter
  const specs = SPECIALITES.map(s => ({ ...s, praticiens: [], valeurs: {}, clesValeurs: [] }))
  const parId = Object.fromEntries(specs.map(s => [s.id, s]))
  const prats = new Map() // id praticien → objet
  const ajouter = (spec, id, nom, y, serie, cle) => {
    if (!prats.has(id)) {
      const p = { id, nom, valeurs: {}, cles: [] }
      prats.set(id, p); parId[spec].praticiens.push(p)
    }
    const p = prats.get(id)
    if (!p.cles.includes(cle)) p.cles.push(cle)
    p.valeurs[y] ||= vide()
    for (let m = 0; m < 12; m++) p.valeurs[y][m] += serie[m] || 0
  }
  const buckets = BUCKETS.map(b => ({ ...b, valeurs: {}, clesValeurs: [b.id] }))
  const noterCle = (sp, cle) => { if (!sp.clesValeurs.includes(cle)) sp.clesValeurs.push(cle) }
  for (const y of annees) {
    for (const [cle, serie] of Object.entries(parChirurgien[y] || {})) {
      // `__spec_<id>` : total d'une spécialité sans praticien identifié (YYYY400 du script)
      const specSans = cle.match(/^__spec_(.+)$/)
      if (specSans && parId[specSans[1]]) {
        noterCle(parId[specSans[1]], cle)
        const v = (parId[specSans[1]].valeurs[y] ||= vide())
        for (let m = 0; m < 12; m++) v[m] += serie[m] || 0
        continue
      }
      if (cle.startsWith('__')) {
        const b = buckets.find(x => x.id === cle)
        if (b) b.valeurs[y] = serie.slice()
        continue
      }
      const p = praticienDe(cle)
      if (p && p.bucket) {
        noterCle(parId[p.spec], cle)
        const v = (parId[p.spec].valeurs[y] ||= vide())
        for (let m = 0; m < 12; m++) v[m] += serie[m] || 0
      } else if (p) ajouter(p.spec, p.id, p.nom, y, serie, cle)
      else ajouter('autres', 'autre:' + cle, libelleChirurgien(cle), y, serie, cle)
    }
  }
  // Ordre stable : praticiens classés par facturé décroissant (toutes années), puis nom
  const total = (p) => Object.values(p.valeurs).flat().reduce((s, v) => s + v, 0)
  // Un chirurgien à 0 € sur toutes les années (lignes annulées, ou remis à zéro après un meilleur
  // rattachement) n'est pas affiché
  for (const s of specs) s.praticiens = s.praticiens.filter(p => total(p) !== 0).sort((a, b) => total(b) - total(a) || a.nom.localeCompare(b.nom))
  // Bucket affiché s'il porte un montant (un ancien bucket remis à 0 € disparaît)
  return [...specs, ...buckets.filter(b => Object.values(b.valeurs).flat().some(v => v !== 0))]
}

/**
 * Clés du script derrière une sélection de la page : la spécialité entière (praticiens + total sans
 * praticien), ou seulement les praticiens choisis (ids). Sert à l'export des actes.
 */
export function clesSelection(spec, idsPraticiens = []) {
  const prats = (spec.praticiens || []).filter(p => !idsPraticiens.length || idsPraticiens.includes(p.id))
  const cles = prats.flatMap(p => p.cles || [])
  if (!idsPraticiens.length) cles.push(...(spec.clesValeurs || []))
  return [...new Set(cles)]
}

const MOIS_NOMS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const dateFr = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')

/** Spécialité et libellé lisibles d'une clé du script (praticien, total sans praticien ou bucket). */
export function decrireCle(cle) {
  const bucket = BUCKETS.find(b => b.id === cle)
  if (bucket) return { specialite: bucket.nom, praticien: '' }
  const specSans = /^__spec_(.+)$/.exec(cle || '')
  if (specSans) {
    const sp = SPECIALITES.find(x => x.id === specSans[1])
    return { specialite: sp?.nom || specSans[1], praticien: '(sans praticien identifié)' }
  }
  const p = praticienDe(cle)
  const sp = SPECIALITES.find(x => x.id === (p?.spec || 'autres'))
  return { specialite: sp?.nom || '', praticien: p?.nom || libelleChirurgien(cle) }
}

/**
 * Lignes d'actes (facturation_actes) → feuilles Excel, une par année : date, séjour, code, montants,
 * praticien et spécialité lisibles, et une ligne TOTAL. Aucun nom de patient (il n'est pas en base).
 */
export function feuillesActes(actes, annees) {
  return [...annees].sort((x, y) => y - x).map(annee => {
    const lignes = actes.filter(r => r.annee === annee).map(r => {
      const { specialite, praticien } = decrireCle(r.chirurgien)
      return {
        Mois: MOIS_NOMS[r.mois - 1], 'Date acte': dateFr(r.date_acte), 'Date facture': dateFr(r.date_facture),
        'N° séjour': r.sejour, 'Code acte': r.code, Coef: r.coef, Spécialité: specialite, Praticien: praticien,
        Associé: r.associe, Établissement: r.etablissement,
        'Mt DH': r.dh, 'Mt AMO': r.amo, 'Mt AMC': r.amc, 'Mt Pat': r.pat, 'Mt Total': r.total, Motif: r.motif,
      }
    })
    if (lignes.length) {
      const somme = (k) => Math.round(lignes.reduce((s, l) => s + l[k], 0) * 100) / 100
      lignes.push({ Mois: 'TOTAL', 'Date acte': '', 'Date facture': '', 'N° séjour': `${lignes.length} actes`, 'Code acte': '', Coef: '', Spécialité: '', Praticien: '', Associé: '', Établissement: '',
        'Mt DH': somme('Mt DH'), 'Mt AMO': somme('Mt AMO'), 'Mt AMC': somme('Mt AMC'), 'Mt Pat': somme('Mt Pat'), 'Mt Total': somme('Mt Total'), Motif: '' })
    }
    return { nom: `Actes ${annee}`, lignes }
  })
}
