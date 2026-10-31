// Tests du moteur de facturation sur des justificatifs INVENTÉS (noms fictifs, montants ronds).
// Jamais une ligne réelle ici (CLAUDE.md §4).
import { describe, it, expect } from 'vitest'
import {
  nomFichier, lireJustificatif, indexerSejours, lireActes, attribuer, agreger,
  normaliserChirurgien, versDate, BUCKETS,
} from './facturationMoteur.js'

// Feuille FAC fictive, même disposition que les exports de la clinique (en-tête en ligne 9)
const fac = (lignes, total) => [
  ['Justificatif des honoraires '],
  [],
  ['Du 01/03/2026 au 31/03/2026'],
  [],
  [null, null, null, null, 'TEST010', 'TEST'],
  [null, null, null, null, null, 'Jean'],
  [],
  [null, null, null, null, null, null, null, null, null, 'Total', ...total],
  ['N° Dossier', 'Nom', 'Prénom', 'Date Entrée', 'Date Sortie', 'Code Acte', 'Coef', 'Date Acte', 'N° Facture', 'Date Facture', 'Mt DH', 'Mt AMO', 'Mt AMC', 'Mt Pat', 'Mt Total'],
  ...lignes,
  [],
]
const lf = (sejour, code, dh, amo, pat, nom = 'DUPONT') => [sejour, nom, 'Alice', '01/03/2026', '01/03/2026', code, '1', '02/03/2026', '1', '10/03/2026', dh, amo, 0, pat, dh + amo + pat]

const red = (lignes, total) => [
  ['Justificatif des honoraires '], [], ['Du 01/03/2026 au 31/03/2026'], [],
  [null, null, null, null, 'TEST010', 'TEST'], [null, null, null, null, null, 'Jean'], [],
  [null, null, null, null, null, null, null, null, null, null, null, null, 'Total', null, ...total],
  ['N° Fac Red.', 'Nom', 'Prénom', 'T', 'N° Dossier', 'UFM', 'PREST', 'CCAM', 'N° Facture', 'Date Acte', 'Date Régl.', 'Deb', 'PEC', 'CC', 'Base Conv', 'Base DH', 'Tx TTC', 'Redev. HT', 'TVA', 'Redev. TTC'],
  ...lignes,
]
const lr = (sejour, conv, dh, ttc) => ['1', 'DUPONT', 'Alice', 'A', sejour, 'AMBU', 'ADA', 'HHFE002', '1', '01/02/2026', '05/03/2026', 'AMO', '100', 'T', conv, dh, '8.5', ttc / 1.2, ttc - ttc / 1.2, ttc]

describe('nomFichier', () => {
  it('lit associé, établissement et type, avec ou sans suffixe (1)', () => {
    expect(nomFichier('x@y.z&TEST010&MIL&FAC.xlsx')).toEqual({ associe: 'TEST010', etablissement: 'MIL', type: 'FAC' })
    expect(nomFichier('x@y.z&TEST010&CLE&RED(1).xlsx')).toEqual({ associe: 'TEST010', etablissement: 'CLE', type: 'RED' })
    expect(nomFichier('rapport.xlsx')).toBeNull()
  })
})

describe('versDate', () => {
  it('accepte Date, numéro de série Excel et jj/mm/aaaa', () => {
    expect(versDate(new Date(2026, 2, 11, 23, 59))).toBe('2026-03-11')
    expect(versDate(46092)).toBe('2026-03-11')
    expect(versDate('11/03/2026')).toBe('2026-03-11')
    expect(versDate('')).toBe('')
  })
})

describe('lireJustificatif', () => {
  it('lit un FAC : période, associé, lignes, total contrôlé', () => {
    const j = lireJustificatif(fac([lf('H1', 'HHFE002', 40, 60, 0), lf('X2', 'CSCPA', 10, 0, 30)], [50, 60, 0, 30, 140]))
    expect(j.type).toBe('FAC')
    expect([j.annee, j.mois, j.associe, j.nbLignes]).toEqual([2026, 3, 'TEST010', 2])
    expect(j.total).toEqual({ dh: 50, amo: 60, amc: 0, pat: 30, total: 140 })
    expect(j.lignes[0]).toMatchObject({ sejour: 'H1', code: 'HHFE002', total: 100, date: '2026-03-10', dateActe: '2026-03-02' })
  })
  it('refuse un FAC dont la somme des lignes ne recolle pas au total', () => {
    expect(() => lireJustificatif(fac([lf('H1', 'HHFE002', 40, 60, 0)], [50, 60, 0, 0, 110]))).toThrow(/≠ total/)
  })
  it('lit un RED : base conv, base DH, redevance', () => {
    const j = lireJustificatif(red([lr('H1', 60, 0, 6), lr('H2', 0, 100, 12)], [60, 100, null, 15, 3, 18]))
    expect(j.type).toBe('RED')
    expect(j.total).toMatchObject({ conv: 60, dh: 100, redevTtc: 18 })
    expect(j.lignes[1]).toMatchObject({ sejour: 'H2', code: 'HHFE002', date: '2026-03-05' })
  })
  it('refuse le mauvais type et un fichier sans en-tête', () => {
    expect(() => lireJustificatif(fac([], [0, 0, 0, 0, 0]), { type: 'RED' })).toThrow(/RED attendu/)
    expect(() => lireJustificatif([['rien'], []])).toThrow(/En-tête/)
  })
})

describe('indexerSejours / attribuer', () => {
  const index = indexerSejours([
    { sejour: 'H1', nom: 'VERCAMBRE AUFORT', prenom: 'Lucile' },
    { sejour: 'H1', nom: 'ABBAL', prenom: 'Bertrand' },     // anesthésiste : ignoré
    { sejour: 'H3', nom: 'ABBAL', prenom: 'Bertrand' },     // séjour sans chirurgien
    { sejour: 'H4', nom: 'NOGUES', prenom: 'Laurent' },
    { sejour: 'H4', nom: 'DRAN', prenom: 'Gregory' },       // deux chirurgiens
  ])
  it('normalise les noms et exclut les anesthésistes', () => {
    expect([...index.get('H1')]).toEqual(['VERCAMBRE AUFORT Lucile'])
    expect(index.get('H3').size).toBe(0)
    expect(normaliserChirurgien(' méyer-bisch ', 'VINCENT')).toBe('MEYER-BISCH Vincent')
  })
  it('attribue au chirurgien ou au bon bucket', () => {
    expect(attribuer({ sejour: 'H1', code: 'HHFE002' }, index).cle).toBe('VERCAMBRE AUFORT Lucile')
    expect(attribuer({ sejour: 'H1', code: 'CSCPA' }, index).cle).toBe(BUCKETS.consultations)
    expect(attribuer({ sejour: 'X9', code: 'ZZLP025' }, index).cle).toBe(BUCKETS.consultations)
    expect(attribuer({ sejour: 'H2', code: 'HHFE002' }, index).cle).toBe(BUCKETS.sejourInconnu)
    expect(attribuer({ sejour: 'H3', code: 'YYYY015' }, index).cle).toBe(BUCKETS.sansChirurgien)
    expect(attribuer({ sejour: 'H4', code: 'LDFA002' }, index).cle).toBe(BUCKETS.aArbitrer)
  })
  it('lireActes lit les colonnes par nom', () => {
    const actes = lireActes([['sejo.sejo_num_sej', 'pati.pati_nom_usu', 'med0.mede_nom_usu', 'med0.mede_prenom'], ['H1', 'DUPONT', 'NOGUES', 'Laurent'], [null]])
    expect(actes).toEqual([{ sejour: 'H1', nom: 'NOGUES', prenom: 'Laurent' }])
  })
})

describe('agreger', () => {
  const index = indexerSejours([{ sejour: 'H1', nom: 'NOGUES', prenom: 'Laurent' }, { sejour: 'H3', nom: 'ABBAL', prenom: 'B' }])
  const jf = { ...lireJustificatif(fac([lf('H1', 'HHFE002', 40, 60, 0), lf('H1', 'HHFE002', 0, 20, 0), lf('X2', 'CSCPA', 10, 0, 30), lf('H3', 'YYYY015', 0, 96, 0), lf('H9', 'LDFA002', 0, 50, 0)], [50, 226, 0, 30, 306])), associe: 'TEST010', etablissement: 'MIL', fichier: 'f.xlsx' }
  const jr = { ...lireJustificatif(red([lr('H1', 60, 0, 6), lr('H2', 0, 100, 12)], [60, 100, null, 15, 3, 18])), associe: 'TEST010', etablissement: 'MIL', fichier: 'r.xlsx' }
  const r = agreger([jf, jr], index)
  it('fusionne FAC et RED du même mois × associé × établissement', () => {
    expect(r.mensuel).toHaveLength(1)
    expect(r.mensuel[0]).toMatchObject({ annee: 2026, mois: 3, associe: 'TEST010', etablissement: 'MIL', facture_total: 306, facture_dh: 50, regle_total: 160, regle_conv: 60, regle_dh: 100, redevance_ttc: 18, nb_lignes_fac: 5, nb_lignes_red: 2, fichier_fac: 'f.xlsx', fichier_red: 'r.xlsx' })
  })
  it('agrège par chirurgien et par bucket, avec séjours distincts', () => {
    const par = Object.fromEntries(r.chirurgiens.map(c => [c.chirurgien, c]))
    expect(par['NOGUES Laurent']).toMatchObject({ montant: 120, nb_lignes: 2, nb_sejours: 1 })
    expect(par[BUCKETS.consultations].montant).toBe(40)
    expect(par[BUCKETS.sansChirurgien].montant).toBe(96)
    expect(par[BUCKETS.sejourInconnu].montant).toBe(50)
  })
  it('met de côté tout sauf les consultations, et contrôle attribué + buckets = facturé', () => {
    expect(r.misDeCote.map(l => l.bucket).sort()).toEqual([BUCKETS.sansChirurgien, BUCKETS.sejourInconnu].sort())
    expect(r.controle[0]).toMatchObject({ mois: '2026-3', facture: 306, attribue: 120 })
  })
  it('refuse deux FAC pour le même mois × associé × établissement', () => {
    expect(() => agreger([jf, { ...jf, fichier: 'g.xlsx' }], index)).toThrow(/Deux fichiers FAC/)
  })
})
