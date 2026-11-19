// Import des justificatifs depuis le site, sur des justificatifs INVENTÉS (noms fictifs,
// montants ronds). Jamais une ligne réelle ici (CLAUDE.md §4).
import { describe, it, expect } from 'vitest'
import { lireFichiersFacturation, comparerAvecBase, totauxImport } from './facturationImport'

const entete = (periode, associe) => [['Justificatif des honoraires'], [], [periode], [], [null, null, null, null, associe, 'TEST'], [null, null, null, null, null, 'Jean'], []]
const fac = (associe, lignes, total, periode = 'Du 01/03/2026 au 31/03/2026') => [
  ...entete(periode, associe),
  [null, null, null, null, null, null, null, null, null, 'Total', ...total],
  ['N° Dossier', 'Nom', 'Prénom', 'Date Entrée', 'Date Sortie', 'Code Acte', 'Coef', 'Date Acte', 'N° Facture', 'Date Facture', 'Mt DH', 'Mt AMO', 'Mt AMC', 'Mt Pat', 'Mt Total'],
  ...lignes,
]
const lf = (sejour, dh, amo) => [sejour, 'DUPONT', 'Alice', '01/03/2026', '01/03/2026', 'HHFE002', '1', '02/03/2026', '1', '10/03/2026', dh, amo, 0, 0, dh + amo]
const red = (associe, lignes, total, periode = 'Du 01/03/2026 au 31/03/2026') => [
  ...entete(periode, associe),
  [null, null, null, null, null, null, null, null, null, null, null, null, 'Total', null, ...total],
  ['N° Fac Red.', 'Nom', 'Prénom', 'T', 'N° Dossier', 'UFM', 'PREST', 'CCAM', 'N° Facture', 'Date Acte', 'Date Régl.', 'Deb', 'PEC', 'CC', 'Base Conv', 'Base DH', 'Tx TTC', 'Redev. HT', 'TVA', 'Redev. TTC'],
  ...lignes,
]
const lr = (sejour, conv, dh, ttc) => ['1', 'DUPONT', 'Alice', 'A', sejour, 'AMBU', 'ADA', 'HHFE002', '1', '01/02/2026', '05/03/2026', 'AMO', '100', 'T', conv, dh, '8.5', ttc / 1.2, ttc - ttc / 1.2, ttc]

const F = (associe, etab, type) => `x@y.z&${associe}&${etab}&${type}.xlsx`
const facA = { nom: F('AAAA010', 'MIL', 'FAC'), rows: fac('AAAA010', [lf('H1', 40, 60), lf('H2', 0, 100)], [40, 160, 0, 0, 200]) }
const redA = { nom: F('AAAA010', 'MIL', 'RED'), rows: red('AAAA010', [lr('H1', 100, 20, 12)], [100, 20, null, 10, 2, 12]) }
const facB = { nom: F('BBBB010', 'CLE', 'FAC'), rows: fac('BBBB010', [lf('H3', 0, 50)], [0, 50, 0, 0, 50]) }

describe('lireFichiersFacturation', () => {
  it('agrège un mois par associé × établissement, sans aucune donnée de patient', () => {
    const r = lireFichiersFacturation([facA, redA, facB, { nom: 'notes.txt', rows: [] }])
    expect(r.erreurs.join(' / ')).toBe('')
    expect([r.annee, r.mois]).toEqual([2026, 3])
    expect(r.ignores).toEqual(['notes.txt'])
    const a = r.mensuel.find(x => x.associe === 'AAAA010')
    expect(a).toMatchObject({ etablissement: 'MIL', facture_total: 200, facture_dh: 40, regle_total: 120, regle_conv: 100, regle_dh: 20, redevance_ttc: 12, nb_lignes_fac: 2, nb_lignes_red: 1 })
    expect(JSON.stringify(r.mensuel)).not.toMatch(/DUPONT|Alice|H1/)
    expect(totauxImport(r.mensuel)).toEqual({ facture: 250, regle: 120, redevance: 12, dh: 40 })
  })

  it('refuse deux mois mélangés', () => {
    const avril = { nom: F('BBBB010', 'MIL', 'FAC'), rows: fac('BBBB010', [lf('H9', 0, 10)], [0, 10, 0, 0, 10], 'Du 01/04/2026 au 30/04/2026') }
    const r = lireFichiersFacturation([facA, avril])
    expect(r.mensuel).toEqual([])
    expect(r.erreurs[0]).toMatch(/plusieurs mois \(mars 2026, avril 2026\)/)
  })

  it('refuse un fichier dont le total ne recolle pas, ou au nom d\'un autre associé', () => {
    const faux = { nom: F('AAAA010', 'MIL', 'FAC'), rows: fac('AAAA010', [lf('H1', 40, 60)], [40, 60, 0, 0, 999]) }
    expect(lireFichiersFacturation([faux]).erreurs[0]).toMatch(/Mt Total/)
    const autre = { nom: F('CCCC010', 'MIL', 'FAC'), rows: facA.rows }
    expect(lireFichiersFacturation([autre]).erreurs[0]).toMatch(/au nom de AAAA010/)
  })

  it('refuse deux FAC pour le même associé et établissement', () => {
    const doublon = { ...facA, nom: F('AAAA010', 'MIL', 'FAC(1)') }
    expect(lireFichiersFacturation([facA, doublon]).erreurs[0]).toMatch(/Deux fichiers FAC/)
  })

  it('dit quand rien n\'est un justificatif', () => {
    expect(lireFichiersFacturation([{ nom: 'a.pdf', rows: [] }]).erreurs[0]).toMatch(/Aucun justificatif/)
  })
})

describe('comparerAvecBase', () => {
  const ligne = (annee, mois, associe, etablissement) => ({ annee, mois, associe, etablissement })
  it('distingue remplacés, conservés, oubliés probables et fichiers partiels', () => {
    const imp = lireFichiersFacturation([facA, redA, facB])
    const base = [
      ligne(2026, 2, 'AAAA010', 'MIL'), ligne(2026, 2, 'BBBB010', 'CLE'), ligne(2026, 2, 'DDDD010', 'MIL'),
      ligne(2026, 3, 'AAAA010', 'MIL'), ligne(2026, 3, 'EEEE010', 'MIL'),
    ]
    const c = comparerAvecBase(imp, base)
    expect(c.dejaImporte).toBe(true)
    expect(c.remplaces).toEqual(['AAAA010|MIL'])
    expect(c.conserves).toEqual(['EEEE010|MIL'])
    expect(c.manquants).toEqual(['DDDD010|MIL'])
    expect(c.partiels).toEqual([{ cle: 'BBBB010|CLE', manque: 'RED' }])
  })
  it('compare janvier à décembre de l\'année précédente', () => {
    const c = comparerAvecBase({ annee: 2027, mois: 1, mensuel: [] }, [ligne(2026, 12, 'AAAA010', 'MIL')])
    expect(c.precedent).toEqual({ annee: 2026, mois: 12 })
    expect(c.manquants).toEqual(['AAAA010|MIL'])
    expect(c.dejaImporte).toBe(false)
  })
})
