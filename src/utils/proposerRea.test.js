import { describe, it, expect } from 'vitest'
import { proposerRea } from './rea'
import { invariantsRea } from './planningInvariants'
import { ASSOCIES } from '../data/associes'

const plage = (debut, n) => Array.from({ length: n }, (_, i) => ({ num: debut + i }))

describe('proposerRea — règles dures + comportement', () => {
  it('cas de base : chaque semaine attribuée, équilibré, sans violation', () => {
    const res = proposerRea(plage(10, 8), {}, {}, {}, {}, {})
    expect(Object.keys(res).length).toBe(8)
    for (const ini of Object.values(res)) expect(ASSOCIES).toContain(ini)
    expect(invariantsRea(res, {})).toEqual([])
  })

  it('jamais la réa pour un associé en congé cette semaine', () => {
    const vacancesParSemaine = { 10: ['EH'], 11: ['MP'] }
    const res = proposerRea(plage(10, 8), {}, {}, {}, {}, vacancesParSemaine)
    expect(res[10]).not.toBe('EH')
    expect(res[11]).not.toBe('MP')
    expect(invariantsRea(res, { vacancesParSemaine })).toEqual([])
  })

  it('plafond DUR : objectif atteint exclut l’associé', () => {
    const objectifRea = { EH: 0 }
    const res = proposerRea(plage(10, 8), {}, {}, objectifRea, {}, {})
    expect(Object.values(res)).not.toContain('EH')
  })

  it('évite la réa accolée à une garde de week-end quand c’est possible', () => {
    // MP de garde le week-end de S10 et de S9 → on évite de le mettre en réa S10 (repos).
    const weekendAff = { 10: 'MP', 9: 'MP' }
    const res = proposerRea(plage(10, 8), {}, weekendAff, {}, {}, {})
    expect(res[10]).not.toBe('MP')
  })
})
