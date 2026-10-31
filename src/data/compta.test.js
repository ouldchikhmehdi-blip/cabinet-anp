// Séries des pages finance, sur des lignes INVENTÉES (jamais de ligne bancaire réelle).
import { describe, it, expect } from 'vitest'
import { feuillesReleve, reglesDeCategorie, calculerSeries, soldesFinDeMois } from './compta'

const t = (date, montant, categorie, extra = {}) => ({
  fitid: `${date}-${montant}-${categorie}`, date, montant, type: '', libelle: extra.libelle || '', tiers: extra.tiers || '',
  groupe: extra.groupe || groupeDe(categorie), categorie, associe: extra.associe || '', regle: '', alerte: '', manuel: false,
})
const GROUPES = {
  'Honoraires clinique': 'Recettes', 'Tiers payant consultations': 'Recettes', 'Reversement mensuel': 'Associés',
  "Complément d'honoraires": 'Associés', 'Remboursement RCP': 'Associés', 'Remplaçant MAR': 'Remplaçants',
  'Remplaçant IADE (CDD)': 'Remplaçants', 'Salaire IADE CDI': 'Salariés', 'URSSAF': 'Charges sociales et fiscales',
  'Banque': 'Fonctionnement', 'À arbitrer': 'À arbitrer',
}
const groupeDe = c => GROUPES[c]

const DOC = { associes: { AA: 'ALPHA', BB: 'BRAVO' }, iade_cdi: ['DURAND', 'MARTIN'], iade_cdd: [], mar_remplacants: [], regles: [], taxonomie: {} }

const LIGNES = [
  t('2025-01-05', 10000, 'Honoraires clinique'),
  t('2025-01-06', 30, 'Tiers payant consultations'),
  t('2025-01-10', -1600, 'Reversement mensuel'),
  t('2025-01-12', -500, "Complément d'honoraires", { associe: 'AA' }),
  t('2025-01-13', -100, 'Remboursement RCP', { associe: 'BB' }),
  t('2025-02-01', -900, 'Remplaçant MAR'),
  t('2025-02-02', -300, 'Remplaçant IADE (CDD)'),
  t('2025-02-03', -2000, 'Salaire IADE CDI', { libelle: '/MOTIF SALAIRE DURAND /BEN DURAND JEAN', tiers: 'DURAND JEAN' }),
  t('2025-02-04', -1500, 'URSSAF'),
  t('2025-02-05', -5, 'Banque'),
  t('2025-03-01', -42, 'À arbitrer'),
]

describe('calculerSeries', () => {
  const S = calculerSeries(LIGNES, [], DOC)

  it('au moins deux années, la plus récente en premier', () => {
    expect(S.ANNEES).toEqual([2025, 2024])
    expect(S.CA[2024]).toEqual(Array(12).fill(0))
  })
  it('CA = recettes d\'activité ; charges hors associés et hors à arbitrer', () => {
    expect(S.CA[2025][0]).toBe(10030)
    expect(S.CHARGES[2025][1]).toBe(900 + 300 + 2000 + 1500 + 5)
    expect(S.CHARGES[2025][2]).toBe(0)
    expect(S.NON_CLASSE[2025][2]).toBe(42)
  })
  it('rétrocessions ramenées par associé (2 associés dans le doc)', () => {
    expect(S.RETRO_FIXE[2025][0]).toBe(800)
    expect(S.RETRO_VARIABLE[2025][0]).toBe(250)
    expect(S.RETRO_PAR_ASSOCIE[2025].AA).toMatchObject({ fixe: 800, complement: 500, total: 1300 })
    expect(S.RETRO_PAR_ASSOCIE[2025].BB).toMatchObject({ fixe: 800, rcp: 100, total: 900 })
  })
  it('remplaçants, entrées, sorties', () => {
    expect(S.REMPL_MAR[2025][1]).toBe(900)
    expect(S.REMPL_IADE[2025][1]).toBe(300)
    expect(S.SALAIRES_CDI[2025][1]).toBe(2000)
    expect(S.ENTREES[2025][0]).toBe(10030)
    expect(S.SORTIES[2025][0]).toBe(2200)
  })
  it('salariés CDI : une carte par nom du doc, coût depuis les virements', () => {
    expect(S.SALARIES.map(s => s.nom)).toEqual(['Durand', 'Martin'])
    expect(S.SALARIES[0].couts[2025]).toBe(2000)
    expect(S.SALARIES[1].couts[2025]).toBe(0)
  })
  it('dépenses : une série par sous-catégorie non vide', () => {
    expect(S.DEPENSES.map(d => d.id)).toEqual(['URSSAF', 'Banque'])
    expect(S.DEPENSES[0].montants[2025][1]).toBe(1500)
  })
  it('moisActuel = dernier mois avec des lignes', () => {
    expect(S.moisActuel(2025)).toBe(2)
  })
  it('soldes inconnus sans ancre', () => {
    expect(S.SOLDES[2025]).toEqual(Array(12).fill(null))
  })
})

describe('soldesFinDeMois', () => {
  it('reconstitue les fins de mois avant et après l\'ancre', () => {
    const lignes = [t('2025-01-10', 100, 'Honoraires clinique'), t('2025-02-10', -30, 'Banque'), t('2025-03-10', 50, 'Honoraires clinique')]
    const s = soldesFinDeMois(2025, lignes, [{ date: '2025-02-20', solde: 1000 }])
    expect(s[0]).toBe(1030)   // fin janvier : 1000 − (−30)
    expect(s[1]).toBe(1000)
    expect(s[2]).toBe(1050)
    expect(s[11]).toBe(1050)
  })
})

describe('reglesDeCategorie', () => {
  const doc = {
    commercants_carte: 'CAFE EXEMPLE|AU BUREAU',
    regles: [
      { id: 'mutuelle-a', quand: { type: '^PRLV', tiers: '^MUTUELLE A' }, categorie: 'Mutuelle' },
      { id: 'autre', quand: { type: '^PRLV', tiers: '^AUTRE' }, categorie: 'Banque' },
      { id: 'mutuelle-b', quand: { sens: 'debit', beneficiaire: '^MUT ?B' }, categorie: 'Mutuelle' },
      { id: 'grosse', quand: { sens: 'credit', tiers: '^C\\.P\\.A\\.M', montant_min: 500.01 }, categorie: 'CPAM' },
    ],
  }
  it('liste les règles de la catégorie, dans l\'ordre, en clair', () => {
    expect(reglesDeCategorie(doc, 'Mutuelle')).toEqual([
      { id: 'mutuelle-a', titre: 'MUTUELLE A', detail: 'Prélèvement de « MUTUELLE A »' },
      { id: 'mutuelle-b', titre: 'MUT B', detail: 'Virement à « MUT B »' },
    ])
    expect(reglesDeCategorie(doc, 'CPAM')[0].detail).toBe('Opération de « C.P.A.M », à partir de 500.01 €')
  })
  it('ajoute la famille carte pour la vie du groupe ; rien sans doc', () => {
    expect(reglesDeCategorie(doc, 'Vie du groupe et réceptions')).toEqual([
      { id: 'carte-connue', titre: 'Paiements carte', detail: 'chez CAFE EXEMPLE, AU BUREAU' },
    ])
    expect(reglesDeCategorie(null, 'Mutuelle')).toEqual([])
    expect(reglesDeCategorie(doc, 'Remboursement reçu').map(r => r.id)).toEqual(['remboursement-associe', 'remboursement-remplacant', 'remboursement-motif'])
  })
})

describe('feuillesReleve', () => {
  const L = [
    t('2026-02-10', -50, 'Banque', { libelle: 'FRAIS EXEMPLE' }),
    t('2025-03-02', 200, 'Honoraires clinique'),
    t('2025-01-15', 100, 'Honoraires clinique', { libelle: 'VIR EXEMPLE', tiers: 'CLINIQUE EXEMPLE' }),
    t('2025-12-01', 999, 'Honoraires clinique'),
    t('2025-02-01', -30, 'Banque'),
  ]
  it('une feuille par année, filtre, période, tri et ligne TOTAL', () => {
    const f = feuillesReleve(L, { years: [2026, 2025], de: 0, a: 5, filtre: x => x.categorie === 'Honoraires clinique' })
    expect(f.map(x => x.nom)).toEqual(['2025', '2026'])
    expect(f[0].lignes.map(l => l.Date)).toEqual(['15/01/2025', '02/03/2025', 'TOTAL'])
    expect(f[0].lignes[0]).toMatchObject({ Libellé: 'VIR EXEMPLE', Tiers: 'CLINIQUE EXEMPLE', Montant: 100, Catégorie: 'Honoraires clinique' })
    expect(f[0].lignes.at(-1)).toMatchObject({ Libellé: '2 lignes', Montant: 300 })
    expect(f[1].lignes).toEqual([])
  })
  it('sans filtre : tout le relevé, montants signés', () => {
    const f = feuillesReleve(L, { years: [2025, 2026] })
    expect(f[0].lignes.at(-1).Montant).toBe(100 + 200 + 999 - 30)
    expect(f[1].lignes[0].Montant).toBe(-50)
  })
})
