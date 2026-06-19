import { describe, it, expect } from 'vitest'
import { proposerVacances, optimiserVacances } from './vacances'
import { invariantsVacances } from './planningInvariants'

const plage = (debut, n) => Array.from({ length: n }, (_, i) => ({ num: debut + i }))
const VIDE = new Set()

describe('proposerVacances — règles dures + couverture', () => {
  it('couverture minimale : au moins un congé par semaine, sans violation', () => {
    const res = proposerVacances(plage(10, 4), {}, {}, VIDE)
    for (const s of plage(10, 4)) expect((res[s.num] ?? []).length).toBeGreaterThanOrEqual(1)
    expect(invariantsVacances(res, {})).toEqual([])
  })

  it('un refus n’est jamais placé en congé cette semaine', () => {
    const refusParAssocie = { EH: new Set([10]) }
    const res = proposerVacances(plage(10, 4), {}, refusParAssocie, VIDE)
    expect(res[10] ?? []).not.toContain('EH')
    expect(invariantsVacances(res, { refusParAssocie })).toEqual([])
  })

  it('jamais un congé collé à un week-end de garde du même associé (S ou S-1)', () => {
    const weekendAff = { 10: 'MP' } // MP de garde le week-end de S10
    const res = proposerVacances(plage(10, 4), {}, {}, VIDE, {}, weekendAff)
    expect(res[10] ?? []).not.toContain('MP') // S = 10
    expect(res[11] ?? []).not.toContain('MP') // S-1 = 10
    expect(invariantsVacances(res, { weekendAff })).toEqual([])
  })

  it('capacité (postes ouverts) respectée', () => {
    const souhaitParAssocie = { EH: new Set([10]), MP: new Set([10]), RC: new Set([10]) }
    const placesParSemaine = { 10: 2 }
    const res = proposerVacances(plage(10, 1), souhaitParAssocie, {}, VIDE, {}, {}, {}, placesParSemaine)
    expect((res[10] ?? []).length).toBeLessThanOrEqual(2)
    expect(invariantsVacances(res, { capacite: (num) => placesParSemaine[num] ?? 1 })).toEqual([])
  })

  it('un verrou (congé forcé) est préservé', () => {
    const verrousParSemaine = { 10: ['EH'] }
    const res = proposerVacances(plage(10, 4), {}, {}, VIDE, {}, {}, {}, {}, verrousParSemaine)
    expect(res[10] ?? []).toContain('EH')
  })
})

describe('optimiserVacances — sûreté (idempotence, invariantes, verrous)', () => {
  it('idempotent : une 2ᵉ passe ne change plus rien', () => {
    const base = proposerVacances(plage(10, 6), {}, {}, VIDE)
    const o1 = optimiserVacances(plage(10, 6), base, {}, {}, VIDE)
    const o2 = optimiserVacances(plage(10, 6), o1, {}, {}, VIDE)
    expect(o2).toEqual(o1)
  })

  it('ne viole aucune règle dure et préserve les verrous', () => {
    const weekendAff = { 12: 'MP' }
    const verrousParSemaine = { 10: ['EH'] }
    const base = proposerVacances(plage(10, 6), {}, {}, VIDE, {}, weekendAff, {}, {}, verrousParSemaine)
    const opt = optimiserVacances(plage(10, 6), base, {}, {}, VIDE, {}, weekendAff, {}, verrousParSemaine)
    expect(invariantsVacances(opt, { weekendAff })).toEqual([])
    expect(opt[10] ?? []).toContain('EH')
  })
})
