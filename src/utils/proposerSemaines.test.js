import { describe, it, expect } from 'vitest'
import { proposerSemaines, affectationResolue } from './semaines'
import { invariantsSemaine } from './planningInvariants'
import { ASSOCIES } from '../data/associes'

// Moteur d'attribution « En semaine » testé via ses INVARIANTES (tout le monde placé, aucun doublon,
// aucun vacancier en colonne de travail). Pas de garde réelle nécessaire : colonnes sans `service`
// → l'attribution se fait par équilibre/index, ce qui suffit à valider la complétude du placement.

const ANNEE = 2026
const calendrier = { semaines: {} } // jeu/ven → rotation par défaut ; aucun impact sur la complétude

// Trame 1 : 8 colonnes, 1 colonne vacances (C2), réa C4, avant-WE C0, après-WE C7.
function trame1() {
  return { id: 1, colonnes: Array.from({ length: 8 }, () => ({})), rea: 4, vacances: [2], avantWE: 0, apresWE: 7, remplacants: [] }
}

// Résout l'affectation COMPLÈTE d'une semaine (spéciales + libres proposées par le moteur).
function affecter(trame, num, contexteAmont) {
  const out = proposerSemaines({
    semainesPlage: [{ num }], annee: ANNEE, calendrier,
    trameInfo: () => ({ trame, estPrincipale: true }),
    contexteAmont, desiderata: {},
  })
  return affectationResolue(trame, num, contexteAmont, out)
}

function tousPlaces(aff, vacanciers) {
  const places = new Set(Object.values(aff).filter(i => ASSOCIES.includes(i)))
  return ASSOCIES.filter(i => !vacanciers.includes(i)).every(i => places.has(i))
}

describe('proposerSemaines — complétude de l’attribution (invariantes)', () => {
  it('semaine normale (1 vacancier, rôles spéciaux distincts) : aucune violation', () => {
    const t = trame1()
    const ctx = { rea: { 10: 'YC' }, vacances: { 10: ['RC'] }, weekendAff: { 10: 'MP', 9: 'BA' } }
    const aff = affecter(t, 10, ctx)
    expect(invariantsSemaine(t, aff, { vacanciers: ['RC'] })).toEqual([])
    expect(tousPlaces(aff, ['RC'])).toBe(true)
  })

  it('RÉGRESSION : réa == garde de week-end → tout le monde placé (bug EH non placé)', () => {
    const t = trame1()
    const ctx = { rea: { 10: 'MP' }, vacances: { 10: ['RC'] }, weekendAff: { 10: 'MP', 9: 'BA' } }
    const aff = affecter(t, 10, ctx)
    expect(invariantsSemaine(t, aff, { vacanciers: ['RC'] })).toEqual([])
    expect(tousPlaces(aff, ['RC'])).toBe(true)
  })

  it('RÉGRESSION : week-ends consécutifs (avant-WE == après-WE) → tout le monde placé', () => {
    const t = trame1()
    const ctx = { rea: { 10: 'YC' }, vacances: { 10: ['RC'] }, weekendAff: { 10: 'FF', 9: 'FF' } }
    const aff = affecter(t, 10, ctx)
    expect(invariantsSemaine(t, aff, { vacanciers: ['RC'] })).toEqual([])
    expect(tousPlaces(aff, ['RC'])).toBe(true)
  })

  it('un vacancier désigné au week-end n’occupe jamais une colonne de travail', () => {
    const t = trame1()
    const ctx = { rea: { 10: 'YC' }, vacances: { 10: ['MP'] }, weekendAff: { 10: 'MP', 9: 'BA' } }
    const aff = affecter(t, 10, ctx)
    expect(invariantsSemaine(t, aff, { vacanciers: ['MP'] })).toEqual([])
    expect(tousPlaces(aff, ['MP'])).toBe(true)
  })
})
