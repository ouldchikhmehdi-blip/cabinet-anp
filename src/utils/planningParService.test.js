// Tests du parseur de collage « Planning par service » : transpose [date × personne → poste]
// en [date × service → personne(s)], reconnaît initiales et colonnes remplaçant.
import { describe, it, expect } from 'vitest'
import { parserCollageParService, normaliserPosteCanonique, extraireNomRemplacant, POSTES_SERVICE } from './planningParService'

const NOMS = { EH: 'Dr E. H', MP: 'Dr M. P', RC: 'Dr R. C' }

describe('normaliserPosteCanonique', () => {
  it('reconnaît les services et retire VPA', () => {
    expect(normaliserPosteCanonique('SARM 1')).toBe('SARM 1')
    expect(normaliserPosteCanonique('Viscéral A')).toBe('Bloc A viscéral')
    expect(normaliserPosteCanonique('NC')).toBe('Bloc A NC')
    expect(normaliserPosteCanonique('Endoscopie')).toBe('Bloc B')
    expect(normaliserPosteCanonique('Réa')).toBe('USC/Réa')
    expect(normaliserPosteCanonique('SARM 1 + VPA')).toBe('SARM 1')
    expect(normaliserPosteCanonique('VPA')).toBeNull()
    expect(normaliserPosteCanonique('OFF')).toBeNull()
  })

  it('tolère les suffixes de salle collés au code', () => {
    expect(normaliserPosteCanonique('NC4')).toBe('Bloc A NC')
    expect(normaliserPosteCanonique('NC6')).toBe('Bloc A NC')
    expect(normaliserPosteCanonique('NC A')).toBe('Bloc A NC')
    expect(normaliserPosteCanonique('NC G 2')).toBe('Bloc A NC')
    expect(normaliserPosteCanonique('NC A2')).toBe('Bloc A NC')
    expect(normaliserPosteCanonique('NC+VPA')).toBe('Bloc A NC')
    expect(normaliserPosteCanonique('Réa3')).toBe('USC/Réa')
    expect(normaliserPosteCanonique('SARM1')).toBe('SARM 1')
    expect(normaliserPosteCanonique('SARM 2 VPA')).toBe('SARM 2')
    expect(normaliserPosteCanonique('Viscerale CPRE')).toBe('Bloc A viscéral')
    // Codes hors service du jour : non reconnus.
    expect(normaliserPosteCanonique('3')).toBeNull()
    expect(normaliserPosteCanonique('Cs')).toBeNull()
    expect(normaliserPosteCanonique('G3')).toBeNull()
    expect(normaliserPosteCanonique('A3')).toBeNull()
  })
})

describe('parserCollageParService', () => {
  it('transpose des colonnes associés (cellules = postes) par service', () => {
    const texte = [
      'Date\tEH\tMP\tRC',
      'Lun 07/01\tSARM 1\tSARM 2\tBloc B',
      'Mar 08/01\tViscéral\tNC\tRéa',
    ].join('\n')
    const { table, diag } = parserCollageParService(texte, { nomParIni: NOMS })
    expect(table.postes).toEqual(POSTES_SERVICE)
    expect(diag.nbJours).toBe(2)
    expect(table.lignes[0].dateLabel).toBe('Lun 07/01')
    expect(table.lignes[0].parPoste['SARM 1'].texte).toBe('Dr E. H')
    expect(table.lignes[0].parPoste['SARM 2'].texte).toBe('Dr M. P')
    expect(table.lignes[0].parPoste['Bloc B'].texte).toBe('Dr R. C')
    expect(table.lignes[1].parPoste['Bloc A viscéral'].texte).toBe('Dr E. H')
    expect(table.lignes[1].parPoste['Bloc A NC'].texte).toBe('Dr M. P')
    expect(table.lignes[1].parPoste['USC/Réa'].texte).toBe('Dr R. C')
    expect(diag.associes.map(a => a.ini)).toEqual(['EH', 'MP', 'RC'])
  })

  it('colonne remplaçant avec nom en en-tête : affiche le nom, en rouge', () => {
    const texte = ['Date\tEH\tDr Martin', 'Lun\tSARM 1\tSARM 2'].join('\n')
    const { table, diag } = parserCollageParService(texte, { nomParIni: NOMS })
    expect(table.lignes[0].parPoste['SARM 2'].texte).toBe('Dr Martin')
    expect(table.lignes[0].parPoste['SARM 2'].estRemplacant).toBe(true)
    expect(diag.remplacants.map(r => r.nom)).toEqual(['Dr Martin'])
  })

  it('en-tête remplaçant générique ou vide → « Remplaçant »', () => {
    const generique = parserCollageParService(['Date\tEH\tRemp', 'Lun\tSARM 1\tSARM 2'].join('\n'), { nomParIni: NOMS })
    expect(generique.table.lignes[0].parPoste['SARM 2'].texte).toBe('Remplaçant')
    const enteteVide = parserCollageParService(['Date\tEH\t', 'Lun\tSARM 1\tSARM 2'].join('\n'), { nomParIni: NOMS })
    expect(enteteVide.table.lignes[0].parPoste['SARM 2'].texte).toBe('Remplaçant')
    expect(enteteVide.table.lignes[0].parPoste['SARM 2'].estRemplacant).toBe(true)
  })

  it('VPA retiré et postes inconnus ignorés (aucune cellule placée)', () => {
    const texte = ['Date\tEH\tMP', 'Lun\tVPA\tOFF'].join('\n')
    const { table } = parserCollageParService(texte, { nomParIni: NOMS })
    expect(table.lignes[0].parPoste).toEqual({})
  })

  it('deux personnes sur le même service → jointes par « / »', () => {
    const texte = ['Date\tEH\tMP', 'Lun\tSARM 2\tSARM 2'].join('\n')
    const { table } = parserCollageParService(texte, { nomParIni: NOMS })
    expect(table.lignes[0].parPoste['SARM 2'].texte).toBe('Dr E. H / Dr M. P')
    expect(table.lignes[0].parPoste['SARM 2'].estRemplacant).toBe(false)
  })

  it('cellule mixte associé + remplaçant : pas en rouge (estRemplacant faux)', () => {
    const texte = ['Date\tEH\tDr Martin', 'Lun\tSARM 2\tSARM 2'].join('\n')
    const { table } = parserCollageParService(texte, { nomParIni: NOMS })
    expect(table.lignes[0].parPoste['SARM 2'].texte).toBe('Dr E. H / Dr Martin')
    expect(table.lignes[0].parPoste['SARM 2'].estRemplacant).toBe(false)
  })

  it('colonne entièrement vide (en-tête vide) → ignorée', () => {
    const texte = ['Date\tEH\t\tMP', 'Lun\tSARM 1\t\tSARM 2'].join('\n')
    const { table, diag } = parserCollageParService(texte, { nomParIni: NOMS })
    expect(diag.ignorees.length).toBe(1)
    expect(table.lignes[0].parPoste['SARM 1'].texte).toBe('Dr E. H')
    expect(table.lignes[0].parPoste['SARM 2'].texte).toBe('Dr M. P')
  })

  it('reconnaît un associé par son nom complet en en-tête', () => {
    const texte = ['Date\tDr E. H', 'Lun\tSARM 1'].join('\n')
    const { table, diag } = parserCollageParService(texte, { nomParIni: NOMS })
    expect(diag.associes.map(a => a.ini)).toEqual(['EH'])
    expect(table.lignes[0].parPoste['SARM 1'].texte).toBe('Dr E. H')
  })

  it('collage vide ou en-tête seule → aucune ligne', () => {
    expect(parserCollageParService('', {}).table.lignes).toEqual([])
    expect(parserCollageParService('Date\tEH', {}).table.lignes).toEqual([])
  })
})

describe('extraireNomRemplacant', () => {
  it('nettoie « OK … (Ok) » et garde « Dr Nom »', () => {
    expect(extraireNomRemplacant('OK Dr Delbert Aurelie (Ok)')).toBe('Dr Delbert Aurelie')
    expect(extraireNomRemplacant('Dr Martin')).toBe('Dr Martin')
  })
  it('reconnaît un nom connu écrit nu (sans « Dr »)', () => {
    expect(extraireNomRemplacant('Delbert Aurelie')).toBe('Dr Delbert Aurelie')
  })
  it('nom connu : renvoie le nom SEUL malgré les mots parasites et l\'ordre', () => {
    expect(extraireNomRemplacant('OK Dr Delbert Aurelie fait')).toBe('Dr Delbert Aurelie')
    expect(extraireNomRemplacant('Aurelie Delbert')).toBe('Dr Delbert Aurelie')
    expect(extraireNomRemplacant('fait DELBERT aurélie ok')).toBe('Dr Delbert Aurelie')
  })
  it('repli générique : « Dr X » nettoyé de « fait »', () => {
    expect(extraireNomRemplacant('Dr Untel fait')).toBe('Dr Untel')
  })
  it('un poste ou un texte sans nom → null', () => {
    expect(extraireNomRemplacant('SARM2')).toBeNull()
    expect(extraireNomRemplacant('NC4')).toBeNull()
    expect(extraireNomRemplacant('')).toBeNull()
  })
})

describe('parserCollageParService — report du nom de remplaçant (carry-forward)', () => {
  it('un nom en cellule s\'applique aux postes des jours suivants de la colonne (cas du 12 mai)', () => {
    const texte = [
      'Date\tMP\tRemp',
      'dimanche 10 mai\t\tOK Dr Delbert Aurelie (Ok)',
      'lundi 11 mai\tNC\tEndoscopie',
      'mardi 12 mai\tSARM1\tSARM2',
    ].join('\n')
    const { table, diag } = parserCollageParService(texte, { nomParIni: NOMS })
    // La cellule-nom du dimanche n'est pas placée comme poste.
    expect(table.lignes[0].parPoste).toEqual({})
    // lundi : Endoscopie (Bloc B) et mardi : SARM2 → portent le nom reporté.
    expect(table.lignes[1].parPoste['Bloc B'].texte).toBe('Dr Delbert Aurelie')
    expect(table.lignes[1].parPoste['Bloc B'].estRemplacant).toBe(true)
    expect(table.lignes[2].parPoste['SARM 2'].texte).toBe('Dr Delbert Aurelie')
    expect(table.lignes[2].parPoste['SARM 2'].estRemplacant).toBe(true)
    expect(diag.remplacants.map(r => r.nom)).toContain('Dr Delbert Aurelie')
  })

  it('un nouveau nom plus bas remplace le précédent', () => {
    const texte = [
      'Date\tRemp',
      'S1\tDr Delbert Aurelie',
      'S1 lun\tSARM2',
      'S2\tDr Martin',
      'S2 lun\tNC',
    ].join('\n')
    const { table } = parserCollageParService(texte, {})
    expect(table.lignes[1].parPoste['SARM 2'].texte).toBe('Dr Delbert Aurelie')
    expect(table.lignes[3].parPoste['Bloc A NC'].texte).toBe('Dr Martin')
  })

  it('sans aucun nom : reste « Remplaçant » (non-régression)', () => {
    const texte = ['Date\tRemp', 'lun\tSARM2'].join('\n')
    const { table } = parserCollageParService(texte, {})
    expect(table.lignes[0].parPoste['SARM 2'].texte).toBe('Remplaçant')
    expect(table.lignes[0].parPoste['SARM 2'].estRemplacant).toBe(true)
  })
})
