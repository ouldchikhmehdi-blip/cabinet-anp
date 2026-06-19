import { describe, it, expect } from 'vitest'
import { proposerWeekends } from './weekends'
import { invariantsWeekends } from './planningInvariants'
import { ASSOCIES } from '../data/associes'

const plage = (debut, n) => Array.from({ length: n }, (_, i) => ({ num: debut + i }))

describe('proposerWeekends — règles dures + comportement', () => {
  it('cas de base : chaque week-end est attribué, sans violation d’invariante', () => {
    const res = proposerWeekends(plage(10, 8), {}, {}, {}, {}, {})
    expect(Object.keys(res).length).toBe(8)
    for (const ini of Object.values(res)) expect(ASSOCIES).toContain(ini)
    expect(invariantsWeekends(res, {})).toEqual([])
  })

  it('un associé indisponible n’est jamais placé ce week-end', () => {
    const indispoParAssocie = { EH: new Set([10]) }
    const res = proposerWeekends(plage(10, 8), indispoParAssocie, {}, {}, {}, {})
    expect(res[10]).not.toBe('EH')
    expect(invariantsWeekends(res, { indispoParAssocie })).toEqual([])
  })

  it('jamais de garde de week-end collée à des vacances (S ou S+1)', () => {
    const vacancesParSemaine = { 11: ['MP'] } // MP en congé semaine 11
    const res = proposerWeekends(plage(10, 8), {}, {}, {}, vacancesParSemaine, {})
    // MP ne doit pas avoir le week-end 10 (S+1 = 11) ni 11 (S = 11).
    expect(res[10]).not.toBe('MP')
    expect(res[11]).not.toBe('MP')
    expect(invariantsWeekends(res, { vacancesParSemaine })).toEqual([])
  })

  it('plafond DUR : un objectif atteint exclut l’associé (jamais dépassé)', () => {
    const objectifParAssocie = { EH: 0 } // EH ne doit jamais être de garde
    const res = proposerWeekends(plage(10, 8), {}, objectifParAssocie, {}, {}, {})
    expect(Object.values(res)).not.toContain('EH')
  })

  it('un week-end forcé (hors-plage) est pris en compte pour l’espacement', () => {
    // EH a déjà le week-end 9 (hors-plage) → il ne doit pas reprendre le 10 (espacement < 4).
    const res = proposerWeekends(plage(10, 4), {}, {}, { 9: 'EH' }, {}, {})
    expect(res[10]).not.toBe('EH')
  })
})
