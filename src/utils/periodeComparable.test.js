import { describe, it, expect } from 'vitest'
import { moisRenseignes, sommeComparable, dernierMoisRenseigne } from './periodeComparable'

// Cas réel du 13/08/2026 : 2026 importé jusqu'à juin, période par défaut Jan → Jul.
const G2026 = [935, 1087, 1208, 1108, 947, 1157, 0, 0, 0, 0, 0, 0]
const G2025 = [1015, 1002, 1120, 985, 1041, 1015, 838, 604, 1080, 1128, 1013, 1021]

describe('moisRenseignes', () => {
  it('ne retient que les mois porteurs de données dans la fenêtre', () => {
    expect(moisRenseignes(G2026, 0, 6)).toEqual([0, 1, 2, 3, 4, 5])   // juillet (6) exclu
  })

  it('respecte les bornes de la période', () => {
    expect(moisRenseignes(G2026, 2, 4)).toEqual([2, 3, 4])
  })

  it('renvoie une liste vide pour une année sans données', () => {
    expect(moisRenseignes([], 0, 11)).toEqual([])
    expect(moisRenseignes(undefined, 0, 11)).toEqual([])
  })
})

describe('sommeComparable', () => {
  it('somme l’année de référence sur la fenêtre de l’année principale', () => {
    const pleins = moisRenseignes(G2026, 0, 6)
    expect(sommeComparable(G2025, pleins)).toBe(6178)   // Jan → Jun 2025, pas Jan → Jul
  })

  it('corrige l’écart année/année faussé par un mois non importé', () => {
    const de = 0, a = 6
    const pleins = moisRenseignes(G2026, de, a)
    const t1 = G2026.slice(de, a + 1).reduce((x, y) => x + y, 0)

    // Comparaison naïve : 6 mois de 2026 opposés à 7 mois de 2025 → fausse baisse.
    const naif = G2025.slice(de, a + 1).reduce((x, y) => x + y, 0)
    expect(Math.round((t1 - naif) / naif * 1000) / 10).toBe(-8.2)

    // Comparaison recadrée : même fenêtre des deux côtés → la vraie progression.
    const juste = sommeComparable(G2025, pleins)
    expect(Math.round((t1 - juste) / juste * 1000) / 10).toBe(4.3)
  })

  it('redresse la moyenne mensuelle écrasée par un mois vide', () => {
    const de = 0, a = 6
    const t1 = G2026.slice(de, a + 1).reduce((x, y) => x + y, 0)

    expect(Math.round(t1 / (a - de + 1))).toBe(920)                       // ÷ 7 mois → sous le minimum réel
    expect(Math.round(t1 / moisRenseignes(G2026, de, a).length)).toBe(1074) // ÷ 6 mois réels
    expect(Math.min(...G2026.filter(Boolean))).toBeGreaterThan(920)       // 920 était bien aberrant
  })

  it('ne change rien quand la période est entièrement renseignée', () => {
    const pleins = moisRenseignes(G2025, 0, 11)
    expect(sommeComparable(G2025, pleins)).toBe(G2025.reduce((x, y) => x + y, 0))
  })
})

describe('dernierMoisRenseigne', () => {
  it('trouve le dernier mois importé', () => {
    expect(dernierMoisRenseigne(G2026)).toBe(5)   // juin, pas MOIS_ACTUEL (8 = septembre)
    expect(dernierMoisRenseigne(G2025)).toBe(11)
  })

  it('renvoie -1 sur une année vide', () => {
    expect(dernierMoisRenseigne(Array(12).fill(0))).toBe(-1)
    expect(dernierMoisRenseigne(undefined)).toBe(-1)
  })

  it('ignore les trous internes et rend bien le DERNIER mois porteur', () => {
    expect(dernierMoisRenseigne([5, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(3)
  })
})
