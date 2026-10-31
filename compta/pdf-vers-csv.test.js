// Lecture des relevés PDF BNP, sur un texte INVENTÉ au format de `pdftotext -layout`.
import { describe, it, expect } from 'vitest'
import { lirePdf, controler, versCsv } from './pdf-vers-csv.js'
import { parserCsvBnp } from './moteur.js'

const sp = n => ' '.repeat(n)
// Colonnes : date à 20, libellé à 40, date de valeur à 116, débit finissant avant la colonne C (169), crédit après
const op = (date, lib, montant, credit) => `${sp(20)}${date}${sp(12)}${lib.padEnd(76)}${date}${credit ? sp(42) + montant.padStart(14) : sp(16) + montant.padStart(14)}`
const TEXTE = [
  `${sp(14)}Relevé N° : 24001`,
  `${sp(9)}Solde au 31 DÉCEMBRE :${sp(47)}Crédit :${sp(12)}1 100,00${sp(27)}Solde au 10 JANVIER :`,
  `${sp(34)}- 100,00${sp(36)}Débit      :${sp(12)}250,00${sp(38)}+ 750,00`,
  `${sp(21)}D  ATE${sp(29)}N  ATURE DES OPERATIONS${sp(42)}D  ATE DE${sp(15)}D  EBIT${sp(17)}C`,
  `${sp(39)}VIREMENTS RECUS`,
  op('02.01.24', 'VIR SEPA RECU /FRM CAISSE EXEMPLE /EID', '1 100,00', true),
  `${sp(40)}0000123 /RNF 0000123`,
  `${sp(39)}PAIEMENTS PAR CARTES`,
  op('03.01.24', 'DU 030124 RESTO TEST', '50,00', false),
  `${sp(39)}VIREMENTS EMIS`,
  op('04.01.24', 'VIREMENT SEPA EMIS /MOTIF SALAIRE DURAND', '200,00', false),
  `${sp(40)}/BEN DURAND JEAN /REFDO /REF`,
  `${sp(39)}Sous total...${sp(50)}- 200,00`,
  `${sp(81)}TOTAL DES OPERATIONS${sp(48)}250,00${sp(12)}1 100,00`,
  `${sp(39)}Solde créditeur au 10.01.2024${sp(90)}750,00`,
].join('\n')

describe('pdf-vers-csv', () => {
  const releves = lirePdf(TEXTE)
  it('lit opérations, sens, libellés sur plusieurs lignes et soldes', () => {
    expect(releves).toHaveLength(1)
    const [r] = releves
    expect(r).toMatchObject({ soldeDebut: -100, soldeFin: 750, totalDebit: 250, totalCredit: 1100 })
    expect(r.ops.map(o => [o.date, o.montant, o.credit])).toEqual([['2024-01-02', 1100, true], ['2024-01-03', 50, false], ['2024-01-04', 200, false]])
    expect(r.ops[2].libelle).toBe('VIREMENT SEPA EMIS /MOTIF SALAIRE DURAND /BEN DURAND JEAN /REFDO /REF')
  })
  it('contrôle des totaux et des soldes : juste, puis faux si une ligne manque', () => {
    expect(controler(releves)).toEqual([])
    const amputé = [{ ...releves[0], ops: releves[0].ops.slice(1) }]
    expect(controler(amputé).length).toBeGreaterThan(0)
  })
  it('CSV au format BNP, relu par le moteur ; --avant écarte les dates suivantes', () => {
    const { csv, gardees, ecartees } = versCsv(releves, { avant: '2024-01-04' })
    expect([gardees, ecartees]).toEqual([2, 1])
    const { lignes, solde } = parserCsvBnp(csv)
    expect(solde).toBeNull()
    expect(lignes.map(l => [l.date, l.montant, l.type])).toEqual([['2024-01-02', 1100, 'VIR SEPA RECU'], ['2024-01-03', -50, 'FACTURE CARTE']])
    expect(lignes[1].memo).toBe('DU 030124 RESTO TEST')
  })
})
