import { describe, it, expect, beforeEach } from 'vitest'

// La couche consultations lit/écrit localStorage (absent en environnement node) :
// on installe un stub minimal AVANT d'importer le module.
const memoire = new Map()
globalThis.localStorage = {
  getItem: k => (memoire.has(k) ? memoire.get(k) : null),
  setItem: (k, v) => memoire.set(k, String(v)),
  removeItem: k => memoire.delete(k),
  clear: () => memoire.clear(),
}

const { getConsultData, contenuMois, supprimerMois, remplacerStore } = await import('./consultations')

// Store de test injecté directement (remplacerStore n'appelle pas le persisteur distant).
const storeTest = () => ({
  global:            { 2027: [500, 300, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  teleconsultations: { 2027: [50, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  specialites: [
    {
      id: 'endoscopie', nom: 'Gastro', couleur: '#534AB7',
      praticiens: [
        { id: 'ayral', nom: 'Dr Ayral', valeurs: { 2027: [200, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
      ],
      valeurs: { 2027: [40, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    },
  ],
})

beforeEach(() => {
  memoire.clear()
  remplacerStore(storeTest())
})

describe('contenuMois', () => {
  it('décrit le total, les téléconsultations et le détail du mois', () => {
    const c = contenuMois(2027, 0)
    expect(c.total).toBe(500)
    expect(c.tele).toBe(50)
    expect(c.lignes.map(l => [l.label, l.valeur])).toEqual([
      ['Dr Ayral', 200],
      ['Gastro — non attribué', 40],
    ])
  })

  it('renvoie un contenu vide pour un mois sans données', () => {
    const c = contenuMois(2027, 5)
    expect(c.total).toBe(0)
    expect(c.lignes).toEqual([])
  })
})

describe('supprimerMois', () => {
  it('remet à zéro le global, les téléconsultations et tout le détail du mois visé', () => {
    const r = supprimerMois(2027, 0)
    expect(r.total).toBe(500)

    const s = getConsultData()
    expect(s.global[2027][0]).toBe(0)
    expect(s.teleconsultations[2027][0]).toBe(0)
    expect(s.specialites[0].praticiens[0].valeurs[2027][0]).toBe(0)
    expect(s.specialites[0].valeurs[2027][0]).toBe(0)
  })

  it('laisse les autres mois intacts', () => {
    supprimerMois(2027, 0)
    const s = getConsultData()
    expect(s.global[2027][1]).toBe(300)
    expect(s.specialites[0].praticiens[0].valeurs[2027][1]).toBe(120)
  })

  it('retire l’année du store quand elle devient entièrement vide', () => {
    expect(supprimerMois(2027, 0).anneeSupprimee).toBe(false)
    const r = supprimerMois(2027, 1)

    expect(r.anneeSupprimee).toBe(true)
    const s = getConsultData()
    expect(s.global[2027]).toBeUndefined()
    expect(s.teleconsultations[2027]).toBeUndefined()
    expect(s.specialites[0].praticiens[0].valeurs[2027]).toBeUndefined()
  })

  it('est sans effet sur un mois déjà vide', () => {
    const r = supprimerMois(2027, 5)
    expect(r.total).toBe(0)
    expect(getConsultData().global[2027][0]).toBe(500)
  })
})
