import { describe, it, expect } from 'vitest'
import { proposerSemaines, optimiserSemaines, affectationResolue } from './semaines'
import { invariantsSemaine } from './planningInvariants'

const ANNEE = 2026
const calendrier = { semaines: {} }

function trame1() {
  return { id: 1, colonnes: Array.from({ length: 8 }, () => ({})), rea: 4, vacances: [2], avantWE: 0, apresWE: 7, remplacants: [] }
}
const trameInfo = (trame) => () => ({ trame, estPrincipale: true })

function optimise(trame, semaines, contexteAmont, affectations, desiderata = {}) {
  return optimiserSemaines({
    semainesPlage: semaines, annee: ANNEE, calendrier, trameInfo: trameInfo(trame),
    contexteAmont, desiderata, affectations,
  })
}

describe('optimiserSemaines — sûreté et priorité desiderata', () => {
  const semaines = [{ num: 10 }, { num: 11 }, { num: 12 }, { num: 13 }]
  const ctx = {
    rea: { 10: 'YC', 11: 'YC', 12: 'FF', 13: 'FF' },
    vacances: { 10: ['RC'], 11: ['BA'], 12: ['RC'], 13: ['MP'] },
    weekendAff: { 9: 'FF', 10: 'BA', 11: 'MOC', 12: 'EH', 13: 'YC' },
  }

  it('idempotent : une 2ᵉ passe ne change plus rien', () => {
    const t = trame1()
    const base = proposerSemaines({ semainesPlage: semaines, annee: ANNEE, calendrier, trameInfo: trameInfo(t), contexteAmont: ctx, desiderata: {} })
    const o1 = optimise(t, semaines, ctx, base)
    const o2 = optimise(t, semaines, ctx, o1.affectations)
    expect(o2.affectations).toEqual(o1.affectations)
  })

  it('ne dégrade jamais les desiderata et préserve les invariantes', () => {
    const t = trame1()
    const base = proposerSemaines({ semainesPlage: semaines, annee: ANNEE, calendrier, trameInfo: trameInfo(t), contexteAmont: ctx, desiderata: {} })
    const r = optimise(t, semaines, ctx, base)
    expect(r.souhaits.apres).toBeLessThanOrEqual(r.souhaits.avant)
    for (const s of semaines) {
      const aff = affectationResolue(t, s.num, ctx, r.affectations)
      expect(invariantsSemaine(t, aff, { vacanciers: ctx.vacances[s.num] ?? [] })).toEqual([])
    }
  })

  it('satisfait un souhait de colonne réalisable par un simple échange (priorité desiderata)', () => {
    const t = trame1()
    // Spéciales : rea C4=YC, vac C2=RC, avant-WE C0=BA, après-WE C7=FF.
    const ctx1 = { rea: { 10: 'YC' }, vacances: { 10: ['RC'] }, weekendAff: { 10: 'BA', 9: 'FF' } }
    // EH placé en C1, MP en C6 ; EH souhaite la C6. L'optimiseur doit les échanger.
    const affectations = { 10: { 1: 'EH', 3: 'FXD', 5: 'MOC', 6: 'MP' } }
    const desiderata = { colonnesSouhaiteesParAssocie: { EH: { 10: 6 } } }
    const r = optimise(t, [{ num: 10 }], ctx1, affectations, desiderata)
    expect(r.affectations[10][6]).toBe('EH')
    expect(r.souhaits.apres).toBe(0)
    expect(r.souhaits.avant).toBe(1)
  })
})
