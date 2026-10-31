import { describe, it, expect } from 'vitest'
import { bornes, echelle, axeK, sansMoisFuturs } from './echelle'

const rond = (t) => t.every(v => v % 1000 === 0 || v % 5 === 0)
const pasDe = (t) => t[1] - t[0]

describe('bornes', () => {
  it('serre l’axe autour de valeurs éloignées de 0, sur des pas de 1, 2 ou 5 × 10ⁿ', () => {
    const { domain, ticks } = bornes([92000, 114000])
    expect(domain[0]).toBeGreaterThan(0)
    expect(domain[0]).toBeLessThanOrEqual(92000)
    expect(domain[1]).toBeGreaterThanOrEqual(114000)
    expect([1, 2, 5].map(k => k * 10 ** Math.floor(Math.log10(pasDe(ticks))))).toContain(pasDe(ticks))
    expect(ticks.length).toBeLessThanOrEqual(7)
    expect(rond(ticks)).toBe(true)
  })
  it('10k par 10k jusqu’au-dessus du maximum quand on part de 0', () => {
    expect(bornes([20000, 35000], { depuis0: true }).ticks).toEqual([0, 10000, 20000, 30000, 40000])
  })
  it('garde le 0 quand les données s’en approchent', () => {
    expect(bornes([5000, 100000]).domain[0]).toBe(0)
    expect(bornes([0, 3000]).domain[0]).toBe(0)
  })
  it('jamais de pas en 3, 4, 6, 8 ou 9', () => {
    for (const [a, b] of [[40500, 61000], [6300, 11600], [100000, 938000], [1100, 1500], [200000, 215000], [27000, 36000]]) {
      const p = pasDe(bornes([a, b]).ticks)
      expect([1, 2, 5]).toContain(p / 10 ** Math.floor(Math.log10(p) + 1e-9))
    }
  })
  it('valeur unique ou aucune valeur', () => {
    const { domain } = bornes([20000, 20000])
    expect(domain[0]).toBeLessThanOrEqual(20000)
    expect(domain[1]).toBeGreaterThan(20000)
    expect(bornes([null, undefined])).toEqual({})
  })
})

describe('echelle', () => {
  it('lit toutes les séries sauf mois, et ignore les null', () => {
    const { domain } = echelle([{ mois: 'Jan', 2025: 95000, 2026: 101000 }, { mois: 'Fév', 2025: 112000, 2026: null }])
    expect(domain[0]).toBeGreaterThan(0)
    expect(domain[1]).toBeGreaterThanOrEqual(112000)
  })
  it('empile : additionne chaque ligne et part de 0', () => {
    const { ticks } = echelle([{ mois: 'Jan', fixe: 20000, variable: 15000 }, { mois: 'Fév', fixe: 20000, variable: 5000 }], { empile: true })
    expect(ticks).toEqual([0, 10000, 20000, 30000, 40000])
  })
  it('empile par année quand une ligne porte une pile par année', () => {
    const rows = [{ mois: 'Jan', m: 0, cdi_2025: 30000, iade_2025: 10000, cdi_2026: 50000, iade_2026: 20000 }]
    const { domain } = echelle(rows, { cles: k => k.includes('_'), empile: k => k.split('_')[1] })
    expect(domain[0]).toBe(0)
    expect(domain[1]).toBeGreaterThanOrEqual(70000)
    expect(domain[1]).toBeLessThan(110000)
  })
})

describe('axeK', () => {
  it('n’affiche que les décimales utiles', () => {
    expect(axeK(98000)).toBe('98k')
    expect(axeK(98500)).toBe('98,5k')
    expect(axeK(0)).toBe('0')
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
