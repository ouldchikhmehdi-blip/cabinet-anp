import { describe, it, expect } from 'vitest'
import { proposerRea, optimiserRea } from './rea'
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

  it('RÈGLE DURE : jamais deux semaines de réa d’affilée pour le même associé', () => {
    const res = proposerRea(plage(10, 12), {}, {}, {}, {}, {})
    const nums = Object.keys(res).map(Number).sort((a, b) => a - b)
    for (const n of nums) expect(res[n]).not.toBe(res[n - 1])
    expect(invariantsRea(res, {})).toEqual([])
  })

  it('respecte le non-consécutif au bord (réa hors-plage en S9)', () => {
    const res = proposerRea(plage(10, 6), {}, {}, {}, { 9: 'EH' }, {})
    expect(res[10]).not.toBe('EH') // EH avait la réa en S9
  })
})

describe('optimiserRea — sûreté et priorité', () => {
  const semaines = plage(10, 8)
  const ctx = {
    joursOffParAssocie: {}, weekendAff: { 10: 'MP', 11: 'YC' },
    vacancesParSemaine: { 12: ['EH'] }, reaHorsPlage: {},
  }

  it('idempotent et sans violation d’invariante', () => {
    const base = proposerRea(semaines, ctx.joursOffParAssocie, ctx.weekendAff, {}, {}, ctx.vacancesParSemaine)
    const o1 = optimiserRea(semaines, base, ctx)
    const o2 = optimiserRea(semaines, o1.rea, ctx)
    expect(o2.rea).toEqual(o1.rea)
    expect(invariantsRea(o1.rea, { vacancesParSemaine: ctx.vacancesParSemaine })).toEqual([])
  })

  it('ne dégrade jamais les desiderata', () => {
    const joursOffParAssocie = { EH: new Set([10]), MP: new Set([13]) }
    const base = proposerRea(semaines, joursOffParAssocie, ctx.weekendAff, {}, {}, ctx.vacancesParSemaine)
    const r = optimiserRea(semaines, base, { ...ctx, joursOffParAssocie })
    expect(r.desiderata.apres).toBeLessThanOrEqual(r.desiderata.avant)
  })
})
