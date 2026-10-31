// Tests du détail des recettes, sur des lignes de relevé INVENTÉES (montants ronds).
import { describe, it, expect } from 'vitest'
import { sourceDe, nomCaisse, familleCaisse, detailRecettes, versementsDe, SOURCES } from './recettes'
import { calculerSeries } from './compta'

const t = (date, categorie, montant, tiers = '', libelle = '') => ({ date, categorie, montant, tiers, libelle })
const LIGNES = [
  t('2026-01-10', 'Honoraires clinique', 1000, 'COMPTE MEDECINS MILLENAIRE'),
  t('2026-01-12', 'Honoraires clinique', 100, 'CLINIQUE CLEMENTVILLE'),
  t('2026-01-15', 'Tiers payant consultations', 40, 'C.P.A.M. DE L HERAULT'),
  t('2026-01-16', 'Tiers payant consultations', 20, 'CPAM DE L HERAULT'),
  t('2026-01-17', 'Tiers payant consultations', 30, 'MSA DU LANGUEDOC'),
  t('2026-02-03', 'Tiers payant consultations', 10, 'MUTUELLE GENERALE EDUCATION NATIONALE'),
  t('2026-02-04', 'Tiers payant consultations', 5, 'MGEN'),
  t('2026-02-05', 'Tiers payant consultations', 7, 'YVELIN SAS'),
  t('2026-02-20', 'Versements CPAM hors tiers payant', 300, 'C.P.A.M. DE L HERAULT'),
  t('2026-02-21', 'Remboursement reçu', 999, 'AG2R PREVOYANCE'),
  t('2026-02-22', 'Reversement mensuel', -500, 'SELARL'),
  t('2025-12-30', 'Honoraires clinique', 2000, 'COMPTE MEDECINS MILLENAIRE'),
]

describe('sources et caisses', () => {
  it('range chaque ligne du CA dans sa source, et rien d\'autre', () => {
    expect(LIGNES.map(sourceDe)).toEqual(['millenaire', 'clementville', 'tiersPayant', 'tiersPayant', 'tiersPayant', 'tiersPayant', 'tiersPayant', 'tiersPayant', 'cpamHorsTp', null, null, 'millenaire'])
  })
  it('regroupe les variantes d\'un même payeur', () => {
    expect(nomCaisse('C.P.A.M. DE L HERAULT')).toBe('CPAM DE L HERAULT')
    expect(nomCaisse('COMPTES PRINCIPAL CPAM HERAU')).toBe('CPAM DE L HERAULT')
    expect(nomCaisse('C P A M DU GARD')).toBe('CPAM DU GARD')
    expect(nomCaisse('MUTUELLE GENERALE EDUCATION NATIONALE')).toBe('MGEN')
    expect(nomCaisse('C.N.M.S.S. AGENCE COMPTABLE')).toBe('CNMSS')
  })
  it('range les caisses par famille', () => {
    expect(familleCaisse('C.P.A.M. NIMES')).toBe('cpam')
    expect(familleCaisse('CGSS REGLEMENTS')).toBe('cpam')
    expect(familleCaisse('MSA GRAND SUD')).toBe('msa')
    expect(familleCaisse('CAISSE GENERALE DE SECURITE SOCIALE MSA GUADELOUPE')).toBe('msa')
    expect(familleCaisse('CAMIEG')).toBe('speciaux')
    expect(familleCaisse('L ASS MALADIE DES MINES')).toBe('speciaux')
    expect(familleCaisse('SECURITE SOCIALE MGP')).toBe('speciaux')
    expect(familleCaisse('YVELIN SAS')).toBe('autres')
  })
})

describe('detailRecettes', () => {
  const d = detailRecettes(LIGNES, 2026)
  it('découpe le CA mensuel par source, et la somme des sources = series.CA', () => {
    expect(d.parSource.millenaire.slice(0, 2)).toEqual([1000, 0])
    expect(d.parSource.clementville[0]).toBe(100)
    expect(d.parSource.tiersPayant.slice(0, 2)).toEqual([90, 22])
    expect(d.parSource.cpamHorsTp[1]).toBe(300)
    expect(d.total).toEqual(calculerSeries(LIGNES).CA[2026])
    expect(Object.keys(d.parSource)).toEqual(SOURCES.map(s => s.id))
  })
  it('détaille le tiers payant par famille puis par caisse, triées par montant', () => {
    expect(d.familles.map(f => f.id)).toEqual(['cpam', 'msa', 'speciaux', 'autres'])
    const cpam = d.familles[0]
    expect(cpam.caisses).toEqual([{ nom: 'CPAM DE L HERAULT', mois: [60, ...Array(11).fill(0)], n: 2 }])
    expect(d.familles[2].caisses[0]).toMatchObject({ nom: 'MGEN', n: 2 })
    expect(d.familles[2].mois[1]).toBe(15)
  })
  it('liste les virements derrière une case', () => {
    expect(versementsDe(LIGNES, { annee: 2026, mois: 0, source: 'tiersPayant' })).toHaveLength(3)
    expect(versementsDe(LIGNES, { annee: 2026, mois: 1, famille: 'speciaux' }).map(x => x.montant)).toEqual([10, 5])
    expect(versementsDe(LIGNES, { annee: 2026, mois: 0, caisse: 'CPAM DE L HERAULT' })).toHaveLength(2)
    expect(versementsDe(LIGNES, { annee: 2026, mois: 1, source: 'millenaire' })).toHaveLength(0)
  })
})
