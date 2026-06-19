import { describe, it, expect } from 'vitest'
import { associesEnDouble, invariantsSemaine, invariantsWeekends, invariantsRea, invariantsVacances } from './planningInvariants'
import { ASSOCIES } from '../data/associes'

// Trame minimale : seuls les indices spéciaux comptent ici.
const trame = { id: 1, colonnes: Array.from({ length: 8 }, () => ({})), rea: 4, vacances: [2], avantWE: 0, apresWE: 7, remplacants: [] }

// Affectation « parfaite » : 1 vacancier (RC en C2), les 7 autres sur 7 colonnes distinctes.
function affComplete() {
  const aff = { 2: 'RC' }
  const cols = [0, 1, 3, 4, 5, 6, 7]
  const autres = ASSOCIES.filter(i => i !== 'RC')
  autres.forEach((ini, k) => { aff[cols[k]] = ini })
  return aff
}

describe('associesEnDouble', () => {
  it('aucun doublon → []', () => {
    expect(associesEnDouble(affComplete())).toEqual([])
  })
  it('détecte un associé sur deux colonnes', () => {
    const aff = { 0: 'EH', 1: 'EH', 2: 'RC' }
    expect(associesEnDouble(aff)).toEqual(['EH'])
  })
  it('ignore les colonnes remplaçant (occupant non associé)', () => {
    const aff = { 0: 'EH', 8: 'Remplaçant 1', 9: 'Remplaçant 1' }
    expect(associesEnDouble(aff)).toEqual([])
  })
})

describe('invariantsSemaine', () => {
  it('affectation conforme → aucune violation', () => {
    expect(invariantsSemaine(trame, affComplete(), { vacanciers: ['RC'] })).toEqual([])
  })

  it('un associé non placé → violation nonPlace', () => {
    const aff = affComplete()
    delete aff[6] // un associé perd sa colonne
    const v = invariantsSemaine(trame, aff, { vacanciers: ['RC'] })
    expect(v.some(x => x.code === 'nonPlace')).toBe(true)
  })

  it('un associé en double → violation enDouble', () => {
    const aff = affComplete()
    aff[6] = aff[1] // doublon
    const v = invariantsSemaine(trame, aff, { vacanciers: ['RC'] })
    expect(v.some(x => x.code === 'enDouble')).toBe(true)
  })

  it('un vacancier placé sur une colonne de travail → violation vacancierEnTravail', () => {
    const aff = { 2: 'RC', 0: 'RC' } // RC en congé mais aussi sur la colonne avant-WE
    const v = invariantsSemaine(trame, aff, { vacanciers: ['RC'] })
    expect(v.some(x => x.code === 'vacancierEnTravail' && x.ini === 'RC')).toBe(true)
  })
})

describe('invariantsWeekends', () => {
  it('conforme → []', () => {
    expect(invariantsWeekends({ 10: 'EH', 11: 'MP' }, {})).toEqual([])
  })
  it('associé indisponible placé → violation', () => {
    const v = invariantsWeekends({ 10: 'EH' }, { indispoParAssocie: { EH: new Set([10]) } })
    expect(v.some(x => x.code === 'indispo')).toBe(true)
  })
  it('garde collée à des vacances (S+1) → violation', () => {
    const v = invariantsWeekends({ 10: 'MP' }, { vacancesParSemaine: { 11: ['MP'] } })
    expect(v.some(x => x.code === 'vacancesCollee')).toBe(true)
  })
})

describe('invariantsRea', () => {
  it('conforme → []', () => {
    expect(invariantsRea({ 10: 'EH' }, { vacancesParSemaine: { 10: ['MP'] } })).toEqual([])
  })
  it('réa pour un associé en congé → violation', () => {
    const v = invariantsRea({ 10: 'EH' }, { vacancesParSemaine: { 10: ['EH'] } })
    expect(v.some(x => x.code === 'reaEnVacances')).toBe(true)
  })
})

describe('invariantsVacances', () => {
  it('conforme → []', () => {
    expect(invariantsVacances({ 10: ['EH'], 11: ['MP'] }, {})).toEqual([])
  })
  it('congé collé à une garde de week-end (S-1) → violation', () => {
    const v = invariantsVacances({ 11: ['MP'] }, { weekendAff: { 10: 'MP' } })
    expect(v.some(x => x.code === 'congeColleGarde')).toBe(true)
  })
  it('refus placé → violation', () => {
    const v = invariantsVacances({ 10: ['EH'] }, { refusParAssocie: { EH: new Set([10]) } })
    expect(v.some(x => x.code === 'refusPlace')).toBe(true)
  })
  it('capacité dépassée → violation', () => {
    const v = invariantsVacances({ 10: ['EH', 'MP', 'RC'] }, { capacite: () => 2 })
    expect(v.some(x => x.code === 'capaciteDepassee')).toBe(true)
  })
  it('doublon dans une semaine → violation', () => {
    const v = invariantsVacances({ 10: ['EH', 'EH'] }, {})
    expect(v.some(x => x.code === 'doublon')).toBe(true)
  })
})
