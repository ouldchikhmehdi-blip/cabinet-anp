import { describe, it, expect } from 'vitest'
import { analyserStats, analyserEnTeteStats, detecterAgendasSARM } from './importConsultations'

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
