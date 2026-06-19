import { describe, it, expect } from 'vitest'
import { colonnesSpeciales, colonnesAPourvoir, resoudreTrame } from './semaines'

// Trame minimale : seules les colonnes spéciales (indices) et `colonnes`/`remplacants` sont lues ici.
function trame8({ rea = 4, vacances = [2], avantWE = 0, apresWE = 7, remplacants = [] } = {}) {
  return { id: 1, colonnes: Array.from({ length: 8 }, () => ({})), rea, vacances, avantWE, apresWE, remplacants }
}

describe('colonnesSpeciales — un associé n’occupe qu’UNE colonne (anti-doublon)', () => {
  it('rôles tous distincts : chaque colonne spéciale reçoit son occupant', () => {
    const t = trame8()
    const spec = colonnesSpeciales(t, 4, {
      rea: { 4: 'YC' }, vacances: { 4: ['RC'] }, weekendAff: { 4: 'MP', 3: 'BA' },
    })
    expect(spec).toEqual({ 4: 'YC', 2: 'RC', 0: 'MP', 7: 'BA' })
  })

  it('RÉGRESSION : réa == garde de week-end → la personne n’occupe qu’une colonne, l’avant-WE est libérée', () => {
    const t = trame8()
    const spec = colonnesSpeciales(t, 4, {
      rea: { 4: 'MP' }, vacances: { 4: ['RC'] }, weekendAff: { 4: 'MP', 3: 'BA' },
    })
    // MP en réa (C4), l'avant-WE (C0) reste VIDE car MP est déjà placé → sera repourvue par le moteur.
    expect(spec[4]).toBe('MP')
    expect(spec[0]).toBeUndefined()
    // Aucun associé présent deux fois.
    const occ = Object.values(spec)
    expect(occ.length).toBe(new Set(occ).size)
  })

  it('RÉGRESSION : deux week-ends consécutifs (avant-WE == après-WE) → une seule colonne occupée', () => {
    const t = trame8()
    const spec = colonnesSpeciales(t, 4, {
      rea: { 4: 'YC' }, vacances: { 4: ['RC'] }, weekendAff: { 4: 'FF', 3: 'FF' },
    })
    // FF placé en avant-WE (C0, prioritaire), l'après-WE (C7) est libérée.
    expect(spec[0]).toBe('FF')
    expect(spec[7]).toBeUndefined()
    const occ = Object.values(spec)
    expect(occ.length).toBe(new Set(occ).size)
  })

  it('un vacancier n’occupe jamais une colonne de travail (même désigné au week-end)', () => {
    const t = trame8()
    const spec = colonnesSpeciales(t, 4, {
      rea: { 4: 'YC' }, vacances: { 4: ['MP'] }, weekendAff: { 4: 'MP', 3: 'BA' },
    })
    // MP est en vacances → sa colonne vacances (C2), jamais l'avant-WE (C0 reste libre).
    expect(spec[2]).toBe('MP')
    expect(spec[0]).toBeUndefined()
  })
})

describe('colonnesAPourvoir — la colonne de travail libérée redevient disponible', () => {
  it('réutilise l’avant-WE libérée par le doublon réa/week-end', () => {
    const t = trame8()
    const spec = colonnesSpeciales(t, 4, {
      rea: { 4: 'MP' }, vacances: { 4: ['RC'] }, weekendAff: { 4: 'MP', 3: 'BA' },
    })
    const cols = colonnesAPourvoir(t, spec)
    // C0 (avant-WE libérée) doit être à pourvoir ; C2 (vacances) et C7 (après-WE occupé) non.
    expect(cols).toContain(0)
    expect(cols).not.toContain(2)
    expect(cols).not.toContain(7)
  })
})

describe('resoudreTrame — sélection automatique selon le nombre de vacanciers', () => {
  const t1 = { id: 1, vacances: [2], colonnes: Array.from({ length: 8 }, () => ({})), remplacants: [] }
  const t2 = { id: 2, vacances: [1, 4], colonnes: Array.from({ length: 9 }, () => ({})), remplacants: [] }
  const trames = [t1, t2]
  const tramesById = { 1: t1, 2: t2 }

  it('1 vacancier → trame principale (Trame 1, 1 colonne vacances)', () => {
    const r = resoudreTrame({ trames, tramesById, principaleId: 1, choisiId: null, nbVacanciers: 1 })
    expect(r.trame.id).toBe(1)
    expect(r.repli).toBe(false)
  })

  it('2 vacanciers → repli sur la plus petite trame suffisante (Trame 2)', () => {
    const r = resoudreTrame({ trames, tramesById, principaleId: 1, choisiId: null, nbVacanciers: 2 })
    expect(r.trame.id).toBe(2)
    expect(r.repli).toBe(true)
  })

  it('choix explicite → prioritaire même s’il est insuffisant', () => {
    const r = resoudreTrame({ trames, tramesById, principaleId: 1, choisiId: 1, nbVacanciers: 2 })
    expect(r.trame.id).toBe(1)
  })
})
