import { describe, it, expect } from 'vitest'
import { echelleVisible, axeK, sansMoisFuturs } from './echelle'

describe('echelleVisible', () => {
  it('serre l’axe autour des valeurs éloignées de 0', () => {
    const [bas, haut] = echelleVisible([95000, 110000])
    expect(bas).toBeGreaterThan(0)
    expect(bas).toBeLessThanOrEqual(95000)
    expect(haut).toBeGreaterThanOrEqual(110000)
    expect(haut - bas).toBeLessThan(40000)
  })
  it('garde le 0 quand les données s’en approchent', () => {
    expect(echelleVisible([5000, 100000])[0]).toBe(0)
    expect(echelleVisible([0, 3000])[0]).toBe(0)
  })
  it('gère une valeur unique et l’absence de données', () => {
    const [bas, haut] = echelleVisible([20000, 20000])
    expect(bas).toBeLessThan(20000)
    expect(haut).toBeGreaterThan(20000)
    expect(echelleVisible([Infinity, -Infinity])).toEqual([0, 1])
  })
})

describe('axeK', () => {
  it('n’affiche que les décimales utiles', () => {
    expect(axeK(98000)).toBe('98k')
    expect(axeK(98500)).toBe('98,5k')
  })
})

describe('sansMoisFuturs', () => {
  const S = { moisActuel: (y) => (y === 2026 ? 9 : 11) }
  it('met à null les mois non écoulés, ligne i = mois de + i', () => {
    const rows = [{ mois: 'Sep', 2025: 1, 2026: 2, c2026: 3 }, { mois: 'Oct', 2025: 1, 2026: 2 }, { mois: 'Nov', 2025: 1, 2026: 0, c2026: 5 }]
    const r = sansMoisFuturs(rows, S, 8)
    expect(r[1][2026]).toBe(2)
    expect(r[2][2026]).toBeNull()
    expect(r[2].c2026).toBeNull()
    expect(r[2][2025]).toBe(1)
    expect(r[2].mois).toBe('Nov')
  })
  it('accepte une année imposée pour les séries sans année dans la clé', () => {
    expect(sansMoisFuturs([{ mois: 'Déc', fixe: 4 }], S, 11, 2026)[0].fixe).toBeNull()
  })
})
