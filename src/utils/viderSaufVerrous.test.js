// Tests des helpers « Vider (sauf verrous) » des 4 moteurs du planning.
// Invariant commun : seules les cellules verrouillées par le faiseur subsistent ; les décisions
// du faiseur hors affectation (capacités `places`, trames choisies `trameParSemaine`) sont conservées.
import { describe, it, expect } from 'vitest'
import { viderSaufVerrous as viderWeekends } from './weekends'
import { viderSaufVerrous as viderRea } from './rea'
import { viderSaufVerrous as viderVacances } from './vacances'
import { viderSaufVerrous as viderSemaines } from './semaines'

describe('viderSaufVerrous — week-ends', () => {
  it('sans verrou, vide toutes les affectations', () => {
    const out = viderWeekends({ affectations: { 3: 'EH', 4: 'MP', 5: 'RC' }, verrous: [] })
    expect(out.affectations).toEqual({})
    expect(out.verrous).toEqual([])
  })

  it('conserve uniquement les week-ends verrouillés', () => {
    const out = viderWeekends({ affectations: { 3: 'EH', 4: 'MP', 5: 'RC' }, verrous: [4] })
    expect(out.affectations).toEqual({ 4: 'MP' })
    expect(out.verrous).toEqual([4])
  })

  it('est idempotent', () => {
    const data = { affectations: { 3: 'EH', 4: 'MP' }, verrous: [4] }
    const une = viderWeekends(data)
    expect(viderWeekends(une)).toEqual(une)
  })
})

describe('viderSaufVerrous — réa', () => {
  it('sans verrou, vide tout', () => {
    const out = viderRea({ rea: { 10: 'FXD', 11: 'BA' }, verrous: [] })
    expect(out.rea).toEqual({})
  })

  it('conserve uniquement les semaines verrouillées', () => {
    const out = viderRea({ rea: { 10: 'FXD', 11: 'BA', 12: 'YC' }, verrous: [11] })
    expect(out.rea).toEqual({ 11: 'BA' })
    expect(out.verrous).toEqual([11])
  })

  it('est idempotent', () => {
    const data = { rea: { 10: 'FXD', 11: 'BA' }, verrous: [10] }
    const une = viderRea(data)
    expect(viderRea(une)).toEqual(une)
  })
})

describe('viderSaufVerrous — vacances', () => {
  it('sans verrou, vide tout mais conserve les capacités (places)', () => {
    const out = viderVacances({ vacances: { 3: ['EH', 'MP'], 4: ['RC'] }, places: { 3: 2 }, verrous: {} })
    expect(out.vacances).toEqual({})
    expect(out.places).toEqual({ 3: 2 })
  })

  it('conserve uniquement les congés verrouillés', () => {
    const out = viderVacances({
      vacances: { 3: ['EH', 'MP'], 4: ['RC', 'FXD'] },
      places: { 3: 2, 4: 2 },
      verrous: { 3: ['EH'] },
    })
    expect(out.vacances).toEqual({ 3: ['EH'] })
    expect(out.verrous).toEqual({ 3: ['EH'] })
    expect(out.places).toEqual({ 3: 2, 4: 2 })
  })

  it('est idempotent', () => {
    const data = { vacances: { 3: ['EH', 'MP'] }, places: { 3: 2 }, verrous: { 3: ['MP'] } }
    const une = viderVacances(data)
    expect(viderVacances(une)).toEqual(une)
  })
})

describe('viderSaufVerrous — en semaine', () => {
  it('sans verrou, vide les affectations mais conserve les trames choisies', () => {
    const out = viderSemaines({
      trameParSemaine: { 3: 2, 4: 1 },
      affectations: { 3: { 0: 'EH', 1: 'MP' } },
      verrous: {},
    })
    expect(out.affectations).toEqual({})
    expect(out.trameParSemaine).toEqual({ 3: 2, 4: 1 })
  })

  it('conserve uniquement les colonnes verrouillées', () => {
    const out = viderSemaines({
      trameParSemaine: { 3: 2 },
      affectations: { 3: { 0: 'EH', 1: 'MP', 2: 'RC' }, 4: { 0: 'BA' } },
      verrous: { 3: [1] },
    })
    expect(out.affectations).toEqual({ 3: { 1: 'MP' } })
    expect(out.verrous).toEqual({ 3: [1] })
    expect(out.trameParSemaine).toEqual({ 3: 2 })
  })

  it('est idempotent', () => {
    const data = {
      trameParSemaine: { 3: 2 },
      affectations: { 3: { 0: 'EH', 1: 'MP' } },
      verrous: { 3: [0] },
    }
    const une = viderSemaines(data)
    expect(viderSemaines(une)).toEqual(une)
  })
})
