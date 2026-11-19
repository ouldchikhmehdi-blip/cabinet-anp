import { describe, it, expect } from 'vitest'
import { momentSelonTrameA, operateursTrameA, semaineTypeA } from './iadeBlocA'

// Semaine du lundi 7 au vendredi 11 septembre 2026.
const SEMAINE = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']

describe('la trame du bloc A — CPRE', () => {
  it('lundi et jeudi la journée, mardi, mercredi et vendredi le matin', () => {
    expect(SEMAINE.map(j => momentSelonTrameA('CPRE', j)?.moment))
      .toEqual(['journee', 'matin', 'matin', 'journee', 'matin'])
  })

  it('reconnaît le nom quelle que soit la casse', () => {
    expect(momentSelonTrameA('cpre', '2026-09-07')).toMatchObject({ moment: 'journee', source: 'trame' })
  })

  it('ne dit rien le week-end, ni pour un nom qu\'elle ne connaît pas', () => {
    expect(momentSelonTrameA('CPRE', '2026-09-12')).toBeNull()
    expect(momentSelonTrameA('Dr Martin', '2026-09-07')).toBeNull()
  })

  it('propose CPRE à la frappe et décrit sa semaine', () => {
    expect(operateursTrameA()).toEqual(['CPRE'])
    expect(semaineTypeA('CPRE').map(j => `${j.label} ${j.moment}`))
      .toEqual(['lundi journee', 'mardi matin', 'mercredi matin', 'jeudi journee', 'vendredi matin'])
  })
})
