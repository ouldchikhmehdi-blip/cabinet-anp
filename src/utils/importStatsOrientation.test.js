import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { analyserStats, analyserEnTeteStats, detecterAgendasSARM } from './importConsultations'
import { REGLES_DEFAUT } from '../data/consultationsReglesDefaut'

// Export réel Doctolib — agendas en LIGNES, motifs en colonnes (cf. capture du 2026-08-13).
const CSV_AGENDAS_EN_LIGNES = [
  ";Consultation vidéo d'anesthésie;Pré-anesthésie avant Intervention avec le Dr AYRAL Jean;Pré-anesthésie avant Intervention avec le Dr FEDKOVIC Yvan;Consultation pré-opératoire de cardiologie - DR RICHARD GAETAN;Pré-anesthésie avant Intervention avec le Dr SUMA Constance",
  'SARM-1;113;60;60;0;21',
  'Cardiologie - CPA;0;0;0;51;0',
  'SARM-2;0;46;44;0;45',
  'AKOME;6;0;0;0;33',
].join('\n')

// Même contenu, orientation historique : agendas en COLONNES, motifs en lignes.
const CSV_AGENDAS_EN_COLONNES = [
  ';SARM-1;Cardiologie - CPA;SARM-2;AKOME',
  "Consultation vidéo d'anesthésie;113;0;0;6",
  'Pré-anesthésie avant Intervention avec le Dr AYRAL Jean;60;0;46;0',
  'Pré-anesthésie avant Intervention avec le Dr FEDKOVIC Yvan;60;0;44;0',
  'Consultation pré-opératoire de cardiologie - DR RICHARD GAETAN;0;51;0;0',
  'Pré-anesthésie avant Intervention avec le Dr SUMA Constance;21;0;45;33',
].join('\n')

const REGLES = [
  { cle: 'AYRAL Jean',      action: 'praticien', specId: 'endoscopie', pratId: 'ayral' },
  { cle: 'FEDKOVIC Yvan',   action: 'praticien', specId: 'endoscopie', pratId: 'fedkovic' },
  { cle: 'SUMA Constance',  action: 'praticien', specId: 'endoscopie', pratId: 'suma' },
  { cle: 'RICHARD GAETAN',  action: 'ignorer' },
]
const CONFIG = { mois: 6, annee: 2026 }   // juillet 2026

describe('detecterAgendasSARM', () => {
  it('retient les agendas SARM et écarte tout le reste', () => {
    const r = detecterAgendasSARM(['SARM-1', 'Cardiologie - CPA', 'SARM-2', 'AKOME'])
    expect(r.inclus).toEqual(['SARM-1', 'SARM-2'])
    expect(r.exclus).toEqual(['Cardiologie - CPA', 'AKOME'])
  })

  it('tolère les variantes d’écriture et un éventuel SARM-3', () => {
    const r = detecterAgendasSARM(['SARM 1', 'sarm-3', 'Akome'])
    expect(r.inclus).toEqual(['SARM 1', 'sarm-3'])
    expect(r.exclus).toEqual(['Akome'])
  })
})

describe('analyserEnTeteStats — détection sans saisie', () => {
  it('reconnaît les agendas quand ils sont en lignes', () => {
    const r = analyserEnTeteStats(CSV_AGENDAS_EN_LIGNES)
    expect(r.orientation).toBe('agendas-lignes')
    expect(r.inclus).toEqual(['SARM-1', 'SARM-2'])
    expect(r.exclus).toEqual(['Cardiologie - CPA', 'AKOME'])
  })

  it('reconnaît les agendas quand ils sont en colonnes', () => {
    const r = analyserEnTeteStats(CSV_AGENDAS_EN_COLONNES)
    expect(r.orientation).toBe('agendas-colonnes')
    expect(r.inclus).toEqual(['SARM-1', 'SARM-2'])
    expect(r.exclus).toEqual(['Cardiologie - CPA', 'AKOME'])
  })
})

describe('analyserStats — les deux orientations donnent le même résultat', () => {
  // Attendu (SARM-1 + SARM-2 uniquement) :
  //   vidéo    113 + 0  = 113  → téléconsultation
  //   AYRAL     60 + 46 = 106
  //   FEDKOVIC  60 + 44 = 104
  //   SUMA      21 + 45 =  66
  //   cardio     0 + 0  =   0  → ligne à zéro, ignorée
  //   total global      = 389   (les 6 + 33 de l'agenda AKOME ne sont PAS comptés)
  for (const [nom, csv] of [['lignes', CSV_AGENDAS_EN_LIGNES], ['colonnes', CSV_AGENDAS_EN_COLONNES]]) {
    it(`agendas en ${nom} : ne compte que SARM-1 + SARM-2`, () => {
      const r = analyserStats(csv, CONFIG, REGLES)

      expect(r.fileAttente).toEqual([])                    // tout est classé par les règles
      expect(r.agrege.global[2026][6]).toBe(389)
      expect(r.agrege.teleconsultations[2026][6]).toBe(113)
      expect(r.agrege.praticiens.endoscopie.ayral[2026][6]).toBe(106)
      expect(r.agrege.praticiens.endoscopie.fedkovic[2026][6]).toBe(104)
      expect(r.agrege.praticiens.endoscopie.suma[2026][6]).toBe(66)
      expect(r.inclus).toEqual(['SARM-1', 'SARM-2'])
    })
  }

  it('n’exige aucune sélection de colonnes dans la config', () => {
    // CONFIG ne contient que { mois, annee } : la règle SARM s'applique d'elle-même.
    expect(analyserStats(CSV_AGENDAS_EN_LIGNES, CONFIG, REGLES).agrege.global[2026][6]).toBe(389)
  })

  it('exclut bien AKOME : sans lui le total serait différent', () => {
    const r = analyserStats(CSV_AGENDAS_EN_LIGNES, CONFIG, REGLES)
    // AKOME porte 6 (vidéo) + 33 (SUMA) = 39 consultations, absentes du total.
    expect(r.agrege.global[2026][6]).toBe(389)
    expect(r.agrege.global[2026][6]).not.toBe(389 + 39)
  })
})

// ── Export Doctolib RÉEL (66 motifs, 4 agendas), avec les règles par défaut du projet ──
// Garde-fou de bout en bout : si un import réel redemande une saisie ou change de total,
// ce test tombe.
describe('export Doctolib réel — import sans aucune saisie', () => {
  const csvReel = readFileSync(
    new URL('./__fixtures__/doctolib-stats-agendas-lignes.csv', import.meta.url), 'utf8',
  )

  it('détecte les agendas sans rien demander', () => {
    const t = analyserEnTeteStats(csvReel)
    expect(t.orientation).toBe('agendas-lignes')
    expect(t.inclus).toEqual(['SARM-1', 'SARM-2'])
    expect(t.exclus).toEqual(['Cardiologie - CPA', 'AKOME'])
  })

  it('classe TOUS les motifs avec les règles par défaut (file d’attente vide)', () => {
    const r = analyserStats(csvReel, CONFIG, REGLES_DEFAUT)
    expect(r.fileAttente).toEqual([])
  })

  it('totalise exactement la somme brute SARM-1 + SARM-2', () => {
    const r = analyserStats(csvReel, CONFIG, REGLES_DEFAUT)

    // Contrôle indépendant du parseur : somme brute des deux lignes SARM du fichier.
    const brut = csvReel.trim().split('\n')
      .filter(l => /^SARM-[12];/.test(l))
      .flatMap(l => l.split(';').slice(1).map(Number))
      .reduce((a, b) => a + b, 0)

    expect(r.agrege.global[2026][6]).toBe(brut)
    expect(r.agrege.global[2026][6]).toBe(1157)
    expect(r.agrege.teleconsultations[2026][6]).toBe(113)
  })

  it('ne laisse rien en « non ventilé » : tout retombe sur un praticien ou une spécialité', () => {
    const r = analyserStats(csvReel, CONFIG, REGLES_DEFAUT)
    const somme = o => Object.values(o).reduce((a, v) => a + (v[2026]?.[6] || 0), 0)
    const ventile =
      Object.values(r.agrege.praticiens).reduce((a, prats) => a + somme(prats), 0) +
      somme(r.agrege.specialites)

    expect(ventile + r.agrege.teleconsultations[2026][6]).toBe(r.agrege.global[2026][6])
  })

  it('rattache la chirurgie bariatrique (motif FIBRO, sans nom extractible)', () => {
    const r = analyserStats(csvReel, CONFIG, REGLES_DEFAUT)
    expect(r.agrege.praticiens.endoscopie.bariatrique[2026][6]).toBe(6)
  })
})
