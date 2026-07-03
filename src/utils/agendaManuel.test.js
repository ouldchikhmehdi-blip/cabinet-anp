import { describe, it, expect } from 'vitest'
import { parseDateFR } from './calendrier'
import { classerCelluleAgenda, parserAgendaManuel } from './agendaManuel'

describe('parseDateFR', () => {
  it('parse les formats numériques et ISO', () => {
    expect(parseDateFR('2026-03-17')).toBe('2026-03-17')
    expect(parseDateFR('17/03/2026')).toBe('2026-03-17')
    expect(parseDateFR('17/03/26')).toBe('2026-03-17')
    expect(parseDateFR('17-03-2026')).toBe('2026-03-17')
    expect(parseDateFR('17.03.2026')).toBe('2026-03-17')
  })

  it('parse le texte français avec ou sans jour de semaine', () => {
    expect(parseDateFR('lundi 17 mars 2026')).toBe('2026-03-17')
    expect(parseDateFR('17 mars 2026')).toBe('2026-03-17')
    expect(parseDateFR('1 août 2026')).toBe('2026-08-01')
  })

  it('infère l’année manquante via anneeIndice', () => {
    expect(parseDateFR('17/03', { anneeIndice: 2027 })).toBe('2027-03-17')
    expect(parseDateFR('17 mars', { anneeIndice: 2025 })).toBe('2025-03-17')
  })

  it('renvoie null (sans exception) sur une date illisible ou invalide', () => {
    expect(parseDateFR('')).toBeNull()
    expect(parseDateFR('semaine 12')).toBeNull()
    expect(parseDateFR('31/02/2026')).toBeNull()
  })
})

describe('classerCelluleAgenda', () => {
  it('reconnaît les rôles contraintes avant les postes de service', () => {
    expect(classerCelluleAgenda('Garde')).toBe('Garde')
    expect(classerCelluleAgenda('G1')).toBe('Garde')
    expect(classerCelluleAgenda('Astreinte')).toBe('Astreinte')
    expect(classerCelluleAgenda('Congé')).toBe('Congé')
    expect(classerCelluleAgenda('CP')).toBe('Congé')
  })

  it('reconnaît les postes de service et ignore repos/VPA', () => {
    expect(classerCelluleAgenda('Bloc B')).toBe('Bloc B')
    expect(classerCelluleAgenda('NC4')).toBe('Bloc A NC')
    expect(classerCelluleAgenda('SARM1')).toBe('SARM 1')
    expect(classerCelluleAgenda('')).toBeNull()
    expect(classerCelluleAgenda('VPA')).toBeNull()
  })
})

describe('parserAgendaManuel', () => {
  const grille = [
    'Date\tEH\tMP',
    'lundi 16 mars 2026\tBloc B\tGarde',
    '17/03\tBloc B\tSARM 1',
    '18/03\tGarde\tSARM 2',
    '19/03\tCongé\tBloc B',
    '20/03\t\tBloc B', // EH en repos → pas d’événement
  ].join('\n')

  it('repère la colonne de l’associé et fusionne les jours consécutifs', () => {
    const { events, diag } = parserAgendaManuel(grille, { ini: 'EH', anneeIndice: 2026 })
    expect(diag.colonne).toBe('EH')
    // 16–17 mars « Bloc B » fusionnés, puis 18 « Garde », 19 « Congé » ; 20 repos ignoré.
    expect(events).toEqual([
      { d: '2026-03-16', fin: '2026-03-18', titre: 'Bloc B' },
      { d: '2026-03-18', fin: '2026-03-19', titre: 'Garde' },
      { d: '2026-03-19', fin: '2026-03-20', titre: 'Congé' },
    ])
  })

  it('accepte un collage à 2 colonnes [date + ma colonne] même sans en-tête d’initiales', () => {
    const deuxCol = ['Jour\tPoste', '17/03/2026\tBloc B', '18/03/2026\tGarde'].join('\n')
    const { events, diag } = parserAgendaManuel(deuxCol, { ini: 'YC', anneeIndice: 2026 })
    expect(diag.colonne).toBeTruthy()
    expect(events).toEqual([
      { d: '2026-03-17', fin: '2026-03-18', titre: 'Bloc B' },
      { d: '2026-03-18', fin: '2026-03-19', titre: 'Garde' },
    ])
  })

  it('avertit quand la colonne de l’associé est introuvable (≥3 colonnes)', () => {
    const { events, diag } = parserAgendaManuel(grille, { ini: 'RC', anneeIndice: 2026 })
    expect(events).toEqual([])
    expect(diag.avert.length).toBeGreaterThan(0)
  })

  it('remonte les lignes non datées et les cellules non reconnues', () => {
    const grilleSale = ['Date\tEH', 'semaine 12\tBloc B', '18/03/2026\tXYZ inconnu'].join('\n')
    const { events, diag } = parserAgendaManuel(grilleSale, { ini: 'EH', anneeIndice: 2026 })
    expect(events).toEqual([])
    expect(diag.nonDatees.length).toBe(1)
    expect(diag.nonReconnues.length).toBe(1)
  })
})
