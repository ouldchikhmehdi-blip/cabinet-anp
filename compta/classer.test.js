// Tests du classement compta sur des lignes INVENTÉES (noms fictifs, montants ronds).
// Jamais de ligne bancaire réelle ici (CLAUDE.md §4).
import { describe, it, expect } from 'vitest'
import {
  parserOfx, analyserLibelle, preparerRegles, classer, classerTout,
  versCsv, depuisCsv, fusionnerGrandLivre, rapport,
} from './classer.js'
import { parserCsvBnp, parserReleve, fusionner, empreinte, planifierImport } from './moteur.js'
import reglesReelles from './regles.json' with { type: 'json' }

// Jeu de règles de test : même structure que regles.json, noms fictifs.
const REGLES = preparerRegles({
  ...reglesReelles,
  associes: { AA: 'ALPHA', BB: 'BRAVO', CC: 'CHARLIE' },
  iade_cdi: ['DURAND', 'MARTIN'],
  iade_cdd: ['PETIT'],
  mar_remplacants: ['EXEMPLE', 'ROMAN[- ]?GIL'],
  commercants_carte: 'RESTO TEST',
})

const stmt = (type, memo, montant, date = '20250115', fitid = `id-${memo.length}-${montant}`) => `
<STMTTRN>
<TRNTYPE>${montant > 0 ? 'CREDIT' : 'DEBIT'}
<DTPOSTED>${date}010000.000
<TRNAMT>${montant.toFixed(2)}
<FITID>${fitid}
<NAME>${type}
<MEMO>${memo}
</STMTTRN>`

const ligne = (type, memo, montant) => ({ type, memo, montant, date: '2025-01-15', fitid: 'x' })
const cat = (type, memo, montant) => classer(ligne(type, memo, montant), REGLES)

describe('parserOfx', () => {
  it('lit les champs utiles d\'un bloc STMTTRN', () => {
    const [l] = parserOfx(stmt('VIR SEPA RECU', '/FRM CAISSE TEST /EID 000', 31.5, '20250203', 'abc'))
    expect(l).toEqual({ date: '2025-02-03', montant: 31.5, type: 'VIR SEPA RECU', memo: '/FRM CAISSE TEST /EID 000', fitid: 'abc' })
  })
})

describe('analyserLibelle', () => {
  it('virement reçu : tiers après /FRM, sans /EID', () => {
    expect(analyserLibelle('/FRM CAISSE TEST /EID 123 /RNF 0').tiers).toBe('CAISSE TEST')
  })
  it('virement émis : motif et bénéficiaire, sans /REFDO', () => {
    expect(analyserLibelle('/MOTIF SALAIRE DURAND /BEN DURAND JEAN /REFDO ABC')).toEqual({ tiers: 'DURAND JEAN', motif: 'SALAIRE DURAND', beneficiaire: 'DURAND JEAN' })
  })
  it('prélèvement : tiers avant ECH/', () => {
    expect(analyserLibelle('FOURNISSEUR X ECH/020125 ID EMETTEUR/FR00').tiers).toBe('FOURNISSEUR X')
  })
})

describe('classer — recettes', () => {
  it('Compte Médecins Millénaire → Honoraires clinique', () => {
    expect(cat('VIR SEPA RECU', '/FRM COMPTE MEDECINS MILLENAIRE /EID 1', 10000)).toMatchObject({ groupe: 'Recettes', categorie: 'Honoraires clinique' })
  })
  it('petit virement d\'une caisse → Tiers payant', () => {
    expect(cat('VIR SEPA RECU', '/FRM C.P.A.M. DE TESTVILLE /EID 1', 31.5)).toMatchObject({ categorie: 'Tiers payant consultations' })
    expect(cat('VIR SEPA RECU', '/FRM MUTUELLE TEST /EID 1', 60)).toMatchObject({ categorie: 'Tiers payant consultations' })
  })
  it('gros virement d\'une caisse → À arbitrer avec alerte', () => {
    expect(cat('VIR SEPA RECU', '/FRM C.P.A.M. DE TESTVILLE /EID 1', 2000)).toMatchObject({ categorie: 'À arbitrer' })
  })
  it('CPAM de l\'Hérault : petit montant = tiers payant, gros montant = versements hors tiers payant', () => {
    expect(cat('VIR SEPA RECU', '/FRM C.P.A.M. DE L HERAULT /EID 1', 31.5).categorie).toBe('Tiers payant consultations')
    expect(cat('VIR SEPA RECU', '/FRM C.P.A.M. DE L HERAULT /EID 1', 2000).categorie).toBe('Versements CPAM hors tiers payant')
  })
  it('virement reçu d\'une SELARL d\'associé → Remboursement reçu imputé', () => {
    expect(cat('VIR SEPA RECU', '/FRM SELARL DU DR ALPHA /EID 1', 500)).toMatchObject({ categorie: 'Remboursement reçu', associe: 'AA' })
  })
  it('virement reçu d\'un remplaçant MAR connu → Remboursement reçu', () => {
    expect(cat('VIR SEPA INST RECU', '/FRM EXEMPLE PAUL /EID 1', 900)).toMatchObject({ categorie: 'Remboursement reçu', regle: 'remboursement-remplacant' })
  })
  it('virement reçu d\'un inconnu → À arbitrer', () => {
    expect(cat('VIR SEPA RECU', '/FRM SOCIETE INCONNUE /EID 1', 1234)).toMatchObject({ categorie: 'À arbitrer' })
  })
})

describe('classer — associés', () => {
  it('complément d\'honoraires imputé au bénéficiaire', () => {
    expect(cat('VIR SEPA INST EMIS', '/MOTIF COMPLETEMENT HONORAIRES ALPHA /BEN SELARL DU DR ALPHA /REFDO 1', -5000))
      .toMatchObject({ groupe: 'Associés', categorie: 'Complément d\'honoraires', associe: 'AA', alerte: '' })
  })
  it('divergence motif / bénéficiaire : bénéficiaire fait foi, alerte posée', () => {
    const r = cat('VIR SEPA INST EMIS', '/MOTIF COMPLETEMENT HONORAIRES BRAVO /BEN SELARL DU DR ALPHA /REFDO 1', -2500)
    expect(r.associe).toBe('AA')
    expect(r.alerte).toMatch(/BB/)
  })
  it('bénéficiaire tronqué : repli sur le motif', () => {
    expect(cat('VIREMENT SEPA EMIS', '/MOTIF RELIQUAT 2024 BRAVO /BEN SELARL DU DOCTEU /REFDO', -5000))
      .toMatchObject({ categorie: 'Reliquat exercice précédent', associe: 'BB' })
  })
  it('bénéficiaire tronqué et motif sans nom : catégorie lue, associé « ? »', () => {
    expect(cat('VIREMENT SEPA EMIS', '/MOTIF RELIQUAT 2024 /BEN SELARL DU DOCTEU /REFDO', -2000))
      .toMatchObject({ categorie: 'Reliquat exercice précédent', associe: '?' })
  })
  it('RCP, régularisation, frais avancés, hôtel de remplaçant', () => {
    expect(cat('VIR SEPA INST EMIS', '/MOTIF RCP DR ALPHA /BEN SELARL DU DR ALPHA', -1200).categorie).toBe('Remboursement RCP')
    expect(cat('VIR SEPA INST EMIS', '/MOTIF MOINS DONNE 2024 REMBOURSEMENT CHARLIE /BEN SELARL DU DR CHARLIE', -5000).categorie).toBe('Régularisation')
    expect(cat('VIR SEPA INST EMIS', '/MOTIF REMBOURSEMENT AVANCE CADEAUX /BEN SELARL DU DR CHARLIE', -1000).categorie).toBe('Remboursement de frais avancés')
    expect(cat('VIR SEPA INST EMIS', '/MOTIF AVANCE HOTELCREMPACANT PAR DR CHARLIE /BEN SELARL DU DR CH', -150))
      .toMatchObject({ categorie: 'Frais de remplaçant', associe: 'CC' })
  })
  it('virements permanents → Reversement mensuel, le second en alerte', () => {
    expect(cat('VIREMENT FAVEUR TIERS', 'VR.PERMANENT VIREMENT SDF', -80000)).toMatchObject({ categorie: 'Reversement mensuel', associe: '', alerte: '' })
    expect(cat('VIREMENT FAVEUR TIERS', 'VR.PERMANENT ZZ1ABC', -80000).alerte).toMatch(/confirmer/)
  })
  it('virement à un associé avec motif inconnu → À arbitrer, associé conservé', () => {
    expect(cat('VIR SEPA INST EMIS', '/MOTIF CADEAU NOEL /BEN SELARL DU DR ALPHA', -300)).toMatchObject({ categorie: 'À arbitrer', associe: 'AA' })
  })
})

describe('classer — salariés et remplaçants', () => {
  it('SALAIRE + nom CDI → Salaire IADE CDI', () => {
    expect(cat('VIR SEPA INST EMIS', '/MOTIF SALAIRE DURAND /BEN DURAND JEAN', -3000)).toMatchObject({ groupe: 'Salariés', categorie: 'Salaire IADE CDI' })
  })
  it('SALAIRE + nom CDD → Remplaçant IADE (CDD), y compris « RELIQUAT SALAIRE »', () => {
    expect(cat('VIREMENT SEPA EMIS', '/MOTIF SALAIRE PETIT /BEN PETIT LUC', -600)).toMatchObject({ categorie: 'Remplaçant IADE (CDD)' })
    expect(cat('VIREMENT SEPA EMIS', '/MOTIF RELIQUAT SALAIRE PETIT /BEN PETIT LUC', -30)).toMatchObject({ categorie: 'Remplaçant IADE (CDD)' })
  })
  it('SALAIRE + nom inconnu → À arbitrer', () => {
    expect(cat('VIR SEPA INST EMIS', '/MOTIF SALAIRE NOUVEAU /BEN NOUVEAU X', -1000)).toMatchObject({ categorie: 'À arbitrer', regle: 'salaire' })
  })
  it('REMPLA + MAR connu → Remplaçant MAR (variantes d\'orthographe)', () => {
    for (const m of ['/MOTIF REMPLA DR EXEMPLE /BEN EXEMPLE PAUL', '/MOTIF RMPLA DR EXEMPLE /BEN EXEMPLE PAUL',
      '/MOTIF REMPLA SDF DR EXEMPLE /BEN EXEMPLE PAUL', '/MOTIF EXEMPLE REMPLA /BEN EXEMPLE PAUL',
      '/MOTIF REMPLACEMENT DR ROMAN /BEN M FRANCOIS ROMAN-GIL']) {
      expect(cat('VIR SEPA INST EMIS', m, -900).categorie, m).toBe('Remplaçant MAR')
    }
  })
  it('REMPLA + nom inconnu → À arbitrer', () => {
    expect(cat('VIR SEPA INST EMIS', '/MOTIF REMPLA DR INCONNU /BEN INCONNU X', -900)).toMatchObject({ categorie: 'À arbitrer', regle: 'rempla' })
  })
})

describe('classer — charges et fonctionnement', () => {
  it('prélèvements connus', () => {
    expect(cat('PRLV SEPA', 'URSSAF DE TESTLAND ECH/020125 ID EMETTEUR/FR0', -15000).categorie).toBe('URSSAF')
    expect(cat('PRLV SEPA', 'GIE AG2R TEST ECH/020125', -5000).categorie).toBe('Retraite complémentaire')
    expect(cat('PRLV SEPA', 'AGMF PREVOYANCE ECH/020125', -3000)).toMatchObject({ groupe: 'Associés', categorie: 'Prévoyance associés' })
    expect(cat('PRLV SEPA B2B', 'DGFIP IMPOT ECH/150125', -400).categorie).toBe('Impôts et taxes')
    expect(cat('PRLV SEPA', 'A2 EXPERTISE ECH/020125', -370).categorie).toBe('Expert-comptable')
    expect(cat('PRLV SEPA', 'BNP PARIBAS ECH/020125', -5).categorie).toBe('Banque')
    expect(cat('COMMISSIONS', 'FACTURE NUMERO 1', -120).categorie).toBe('Banque')
    expect(cat('INTERETS ET COMMISSIONS', '', -40).categorie).toBe('Banque')
  })
  it('règle explicite avec associé imputé', () => {
    const R2 = preparerRegles({ ...reglesReelles, associes: { AA: 'ALPHA' }, regles: [{ id: 'loyer-alpha', quand: { sens: 'debit', beneficiaire: '^SCI TEST' }, categorie: 'Remboursement de frais avancés', associe: 'AA' }] })
    expect(classer(ligne('VIR SEPA INST EMIS', '/MOTIF LOYER /BEN SCI TEST', -500), R2)).toMatchObject({ categorie: 'Remboursement de frais avancés', associe: 'AA', regle: 'loyer-alpha' })
  })
  it('règle posée sur une seule ligne (fitid) : ne touche que cette ligne', () => {
    const R2 = preparerRegles({ ...reglesReelles, associes: { AA: 'ALPHA' }, regles: [{ id: 'une-ligne', quand: { fitid: 'id-cible' }, categorie: "Complément d'honoraires", associe: 'AA' }] })
    const l = { type: 'VIREMENT SEPA EMIS', memo: '/MOTIF SELARL X /BEN SELARL DU DOCTEU', montant: -2500, date: '2025-11-10' }
    expect(classer({ ...l, fitid: 'id-cible' }, R2)).toMatchObject({ categorie: "Complément d'honoraires", associe: 'AA', regle: 'une-ligne' })
    expect(classer({ ...l, fitid: 'autre' }, R2).categorie).toBe('À arbitrer')
  })
  it('prélèvement inconnu → À arbitrer', () => {
    expect(cat('PRLV SEPA', 'NOUVEAU FOURNISSEUR ECH/020125', -99).categorie).toBe('À arbitrer')
  })
  it('Société Générale : prélèvement SG = épargne salariale (arbitré le 2026-10-30) ; autre libellé → À arbitrer', () => {
    expect(cat('PRLV SEPA', 'SG-SOCIETE GENERALE ECH/020125', -1000)).toMatchObject({ categorie: 'Épargne salariale', regle: 'sg-societe-generale-epargne-salariale' })
    expect(cat('PRLV SEPA', 'BANQUE SOCIETE GENERALE ECH/020125', -1000)).toMatchObject({ categorie: 'À arbitrer', regle: 'societe-generale' })
  })
  it('carte : commerçant connu → Vie du groupe, inconnu → À arbitrer', () => {
    expect(cat('FACTURE CARTE', 'DU 090125 RESTO TEST MONTPELLIER CARTE 4974XXXX', -200).categorie).toBe('Vie du groupe et réceptions')
    expect(cat('FACTURE CARTE', 'DU 090125 MAGASIN X CARTE 4974XXXX', -50).categorie).toBe('À arbitrer')
  })
})

describe('CSV natif BNP', () => {
  const CSV = '\uFEFFSARM TEST;SARM TEST;****0000;16/10/2026;;12 345,67\n' +
    '15/01/2026;VIREMENT;VIR SEPA RECU;VIR SEPA RECU /FRM CAISSE TEST /EID 1 /RNF 2;15/01/2026;31,50\n' +
    '15/01/2026;VIREMENT INSTANTANE EMIS;VIR SEPA INST EMIS;VIR SEPA INST EMIS /MOTIF SALAIRE DURAND /BEN DURAND JEAN /REFDO X;15/01/2026;-1 234,56\n' +
    '15/01/2026;VIREMENT;VIR SEPA RECU;VIR SEPA RECU /FRM CAISSE TEST /EID 1 /RNF 2;15/01/2026;31,50\n'

  it('lit le solde d\'en-tête, la date, le montant français, le type et le memo', () => {
    const { lignes, solde } = parserCsvBnp(CSV)
    expect(solde).toEqual({ date: '2026-10-16', solde: 12345.67 })
    expect(lignes).toHaveLength(3)
    expect(lignes[1]).toMatchObject({ date: '2026-01-15', montant: -1234.56, type: 'VIR SEPA INST EMIS', memo: '/MOTIF SALAIRE DURAND /BEN DURAND JEAN /REFDO X' })
  })
  it('identifiant stable d\'un export à l\'autre, distinct pour deux lignes identiques', () => {
    const a = parserCsvBnp(CSV).lignes, b = parserCsvBnp(CSV).lignes
    expect(a.map(l => l.fitid)).toEqual(b.map(l => l.fitid))
    expect(a[0].fitid).not.toBe(a[2].fitid)
    expect(a[0].fitid).toMatch(/^bnp-[0-9a-f]{14}-0$/)
    expect(empreinte('x')).toBe(empreinte('x'))
  })
  it('parserReleve reconnaît le format au contenu', () => {
    expect(parserReleve(CSV).format).toBe('csv-bnp')
    expect(parserReleve(stmt('VIR SEPA RECU', '/FRM X /EID 1', 10)).format).toBe('ofx')
    // le solde LEDGERBAL de l'OFX BNP n'est pas fiable : jamais repris comme ancre
    expect(parserReleve('<OFX><LEDGERBAL><BALAMT>100.00\n<DTASOF>20251106</LEDGERBAL>' + stmt('VIR SEPA RECU', '/FRM X /EID 1', 10)).solde).toBeNull()
  })
})

describe('fusion OFX tronqué / CSV complet', () => {
  const ofx = [{ fitid: 'ofx-1', date: '2025-10-01', montant: -5000, type: 'VIREMENT SEPA EMIS', memo: '/MOTIF RELIQUAT 2024 /BEN SELARL DU DOCTEU' }]
  const csv = [
    { fitid: 'bnp-a-0', date: '2025-10-01', montant: -5000, type: 'VIREMENT SEPA EMIS', memo: '/MOTIF RELIQUAT 2024 /BEN SELARL DU DOCTEUR ALPHA /REFDO Z' },
    { fitid: 'bnp-b-0', date: '2025-10-02', montant: -5000, type: 'VIREMENT SEPA EMIS', memo: '/MOTIF RELIQUAT 2024 /BEN SELARL DU DOCTEUR BRAVO' },
  ]
  it('même date + montant + libellé préfixe = même opération, enrichie du libellé complet', () => {
    const r = fusionner(ofx, csv)
    expect(r.nouvelles.map(l => l.fitid)).toEqual(['bnp-b-0'])
    expect(r.enrichies).toHaveLength(1)
    expect(r.enrichies[0].existante.fitid).toBe('ofx-1')
  })
  it('une ligne connue n\'absorbe qu\'une seule ligne importée', () => {
    const r = fusionner(ofx, [csv[0], { ...csv[0], fitid: 'bnp-a-1' }])
    expect(r.enrichies).toHaveLength(1)
    expect(r.nouvelles).toHaveLength(1)
  })
  it('grand livre : garde le FITID d\'origine et le libellé complet, sans doublon', () => {
    const gl = fusionnerGrandLivre(classerTout(ofx, REGLES), classerTout(csv, REGLES))
    expect(gl).toHaveLength(2)
    expect(gl[0]).toMatchObject({ fitid: 'ofx-1', associe: 'AA', categorie: 'Reliquat exercice précédent' })
    expect(gl[0].memo).toContain('ALPHA')
  })
})

describe('planifierImport (import en base)', () => {
  const base = [
    { fitid: 'ofx-1', date: '2025-10-01', montant: -5000, memo: '/MOTIF RELIQUAT 2024 /BEN SELARL DU DOCTEU', manuel: false },
    { fitid: 'ofx-2', date: '2025-10-01', montant: -900, memo: '/MOTIF REMPLA DR EXEMPLE /BEN EXEMPLE', manuel: true },
    { fitid: 'ofx-3', date: '2025-10-02', montant: 31.5, memo: '/FRM CAISSE TEST', manuel: false },
  ]
  const imp = classerTout([
    { fitid: 'bnp-a-0', date: '2025-10-01', montant: -5000, type: 'VIREMENT SEPA EMIS', memo: '/MOTIF RELIQUAT 2024 /BEN SELARL DU DOCTEUR ALPHA' },
    { fitid: 'bnp-b-0', date: '2025-10-01', montant: -900, type: 'VIR SEPA INST EMIS', memo: '/MOTIF REMPLA DR EXEMPLE /BEN EXEMPLE PAUL /REFDO X' },
    { fitid: 'ofx-3', date: '2025-10-02', montant: 31.5, type: 'VIR SEPA RECU', memo: '/FRM CAISSE TEST' },
    { fitid: 'bnp-c-0', date: '2025-10-03', montant: 60, type: 'VIR SEPA RECU', memo: '/FRM CAISSE TEST' },
  ], REGLES)
  const p = planifierImport(imp, base)
  it('nouvelle ligne écrite, enrichie écrite sous l\'ancien FITID, même FITID reclassé', () => {
    expect(p.ecrire.map(l => l.fitid).sort()).toEqual(['bnp-c-0', 'ofx-1', 'ofx-3'])
    expect(p.ecrire.find(l => l.fitid === 'ofx-1')).toMatchObject({ associe: 'AA', memo: expect.stringContaining('ALPHA') })
  })
  it('ligne manuelle : catégorie intacte, seul le libellé est complété', () => {
    expect(p.libelles).toEqual([{ fitid: 'ofx-2', memo: '/MOTIF REMPLA DR EXEMPLE /BEN EXEMPLE PAUL /REFDO X', tiers: 'EXEMPLE PAUL' }])
    expect(p.stats).toMatchObject({ lues: 4, nouvelles: 1, enrichies: 2, manuellesPreservees: 1, doublons: 3 })
  })
  it('réimporter le même relevé n\'ajoute rien', () => {
    const p2 = planifierImport(imp, [...base, { fitid: 'bnp-c-0', date: '2025-10-03', montant: 60, memo: '/FRM CAISSE TEST', manuel: false }])
    expect(p2.stats.nouvelles).toBe(0)
    expect(p2.stats.doublons).toBe(4)
    expect(p2.stats.aArbitrer).toBe(0)
  })
})

describe('coquilles des motifs saisis à la banque', () => {
  it('salaire, rempla, complément, régularisation, heures sup', () => {
    expect(cat('VIR SEPA INST EMIS', '/MOTIF SALAIRZ DURAND /BEN DURAND JEAN', -3000).categorie).toBe('Salaire IADE CDI')
    expect(cat('VIR SEPA INST EMIS', '/MOTIF QALAIRE DURAND /BEN DURAND JEAN', -3000).categorie).toBe('Salaire IADE CDI')
    expect(cat('VIR SEPA INST EMIS', '/MOTIF HEURE SUP DECEMBRE DURAND /BEN DURAND JEAN', -30).categorie).toBe('Salaire IADE CDI')
    expect(cat('VIR SEPA INST EMIS', '/MOTIF REMOLA SDF DR EXEMPLE /BEN EXEMPLE PAUL', -900).categorie).toBe('Remplaçant MAR')
    expect(cat('VIR SEPA INST EMIS', '/MOTIF REM0LA DR EXEMPLE /BEN EXEMPLE PAUL', -900).categorie).toBe('Remplaçant MAR')
    expect(cat('VIR SEPA INST EMIS', '/MOTIF REMPLA PETIT /BEN PETIT LUC', -800).categorie).toBe('Remplaçant IADE (CDD)')
    expect(cat('VIR SEPA INST EMIS', '/MOTIF COMOLEMENT DR ALPHA /BEN SELARL DU DR ALPHA', -5000).categorie).toBe('Complément d\'honoraires')
    expect(cat('VIR SEPA INST EMIS', '/MOTIF REGULARISATION 2025 ALPHA /BEN SELARL DU DR ALPHA', -5000)).toMatchObject({ categorie: 'Régularisation', associe: 'AA' })
  })
})

describe('sorties', () => {
  const lignes = classerTout(parserOfx(
    stmt('VIR SEPA RECU', '/FRM COMPTE MEDECINS MILLENAIRE /EID 1', 10000, '20250105', 'a') +
    stmt('VIR SEPA INST EMIS', '/MOTIF SALAIRE DURAND /BEN DURAND JEAN', -3000, '20250110', 'b') +
    stmt('PRLV SEPA', 'NOUVEAU; "FOURNISSEUR" ECH/020125', -99, '20250112', 'c'),
  ), REGLES)

  it('CSV : aller-retour fidèle, montants à virgule, cellules échappées', () => {
    const csv = versCsv(lignes)
    expect(csv).toMatch(/^\uFEFFdate;montant;/)
    expect(csv).toContain('-3000,00')
    const retour = depuisCsv(csv)
    expect(retour).toHaveLength(3)
    expect(retour[2].memo).toBe('NOUVEAU; "FOURNISSEUR" ECH/020125')
    expect(retour[1].montant).toBe(-3000)
  })

  it('grand livre : rejouer le même fichier ne crée pas de doublon', () => {
    const une = fusionnerGrandLivre([], lignes)
    const deux = fusionnerGrandLivre(une, lignes)
    expect(deux).toHaveLength(3)
    expect(deux.map(l => l.fitid)).toEqual(['a', 'b', 'c'])
  })

  it('rapport : intégrité et lignes à arbitrer', () => {
    const md = rapport(lignes, REGLES, { fichier: 'test.ofx' })
    expect(md).toContain('= total ✓')
    expect(md).toContain('Lignes à arbitrer : **1**')
    expect(md).toContain('## À arbitrer')
    expect(md).toContain('est incomplet')
  })
})
