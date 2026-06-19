import { describe, it, expect } from 'vitest'
import { associesEnDouble, invariantsSemaine } from './planningInvariants'
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
