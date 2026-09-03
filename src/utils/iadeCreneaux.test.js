import { describe, it, expect } from 'vitest'
import {
  MOMENTS, libelleMoment, momentCourt, resume, indexerParJour,
  sallesConnues, compterDemiJournees, verifierCreneau,
} from './iadeCreneaux'

const c = (jour, moment, salle, extra = {}) => ({
  id: `${jour}-${moment}-${salle}`, jour, moment, salle, absent: null, ...extra,
})

describe('moments', () => {
  it('couvre la journée et les deux demi-journées', () => {
    expect(MOMENTS.map(m => m.id)).toEqual(['journee', 'matin', 'apres_midi'])
    expect(libelleMoment('apres_midi')).toBe('Après-midi')
    expect(momentCourt('journee')).toBe('Journée')
  })
})

describe('résumé d\'un créneau', () => {
  it('dit la salle, le moment, et qui manque quand on le sait', () => {
    expect(resume(c('2026-09-14', 'matin', 'Bloc B'))).toBe('Bloc B — matin')
    expect(resume(c('2026-09-14', 'journee', 'Endoscopie 2', { absent: 'Dr Martin' })))
      .toBe('Endoscopie 2 — journée (Dr Martin)')
    expect(resume(null)).toBe('')
  })
})

describe('index par jour', () => {
  it('classe la journée entière avant le matin, puis l\'après-midi', () => {
    const index = indexerParJour([
      c('2026-09-14', 'apres_midi', 'Bloc B'),
      c('2026-09-14', 'journee', 'Bloc A'),
      c('2026-09-14', 'matin', 'Endoscopie'),
    ])
    expect(index.get('2026-09-14').map(x => x.moment)).toEqual(['journee', 'matin', 'apres_midi'])
  })

  it('trie les salles entre elles à moment égal', () => {
    const index = indexerParJour([
      c('2026-09-14', 'matin', 'Endoscopie'),
      c('2026-09-14', 'matin', 'Bloc B'),
    ])
    expect(index.get('2026-09-14').map(x => x.salle)).toEqual(['Bloc B', 'Endoscopie'])
  })
})

describe('salles déjà saisies', () => {
  it('les propose sans doublon de casse', () => {
    expect(sallesConnues([
      c('2026-09-14', 'matin', 'Bloc B'),
      c('2026-09-15', 'matin', 'bloc b'),
      c('2026-09-16', 'matin', 'Endoscopie 2'),
    ])).toEqual(['Bloc B', 'Endoscopie 2'])
  })
})

describe('compte des demi-journées', () => {
  it('compte une journée entière pour deux', () => {
    expect(compterDemiJournees([
      c('2026-09-14', 'journee', 'Bloc A'),
      c('2026-09-15', 'matin', 'Bloc B'),
    ])).toBe(3)
    expect(compterDemiJournees([])).toBe(0)
  })
})

describe('contrôle de saisie', () => {
  const existants = [c('2026-09-14', 'matin', 'Bloc B')]

  it('exige un jour, un moment et une salle', () => {
    expect(verifierCreneau({ jour: '', moment: 'matin', salle: 'Bloc B' })).toMatch(/jour/)
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'soir', salle: 'Bloc B' })).toMatch(/journée/)
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', salle: ' ' })).toMatch(/salle/)
  })

  it('accepte deux salles différentes le même matin', () => {
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', salle: 'Endoscopie' }, existants))
      .toBe(null)
  })

  it('refuse deux fois la même salle sur le même moment', () => {
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', salle: 'bloc b' }, existants))
      .toMatch(/déjà notée fermée/)
  })

  it('refuse une journée entière quand une demi-journée est déjà posée', () => {
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'journee', salle: 'Bloc B' }, existants))
      .toMatch(/retirez-la/)
  })

  it('refuse une demi-journée déjà comprise dans une journée entière', () => {
    const journee = [c('2026-09-14', 'journee', 'Bloc B')]
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', salle: 'Bloc B' }, journee))
      .toMatch(/comprise dedans/)
  })

  it('ne se bloque pas sur la ligne qu\'on est en train de corriger', () => {
    const ligne = existants[0]
    expect(verifierCreneau({ ...ligne, absent: 'Dr Martin' }, existants)).toBe(null)
  })
})
