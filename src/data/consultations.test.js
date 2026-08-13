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

describe('migration « Chir. bariatrique » → non attribué', () => {
  // Store d'avant migration : le motif FIBRO est encore un praticien de la Gastro,
  // et la spécialité a déjà un bucket « non attribué » alimenté par un import précédent.
  const storeAvant = () => ({
    global:            { 2026: [500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    teleconsultations: { 2026: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    specialites: [
      {
        id: 'endoscopie', nom: 'Gastro / Coloscopies', couleur: '#534AB7',
        praticiens: [
          { id: 'ayral',       nom: 'Dr Ayral',          valeurs: { 2026: [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
          { id: 'bariatrique', nom: 'Chir. bariatrique', valeurs: { 2026: [13, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
        ],
        valeurs: { 2026: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      },
    ],
  })

  const gastro = s => s.specialites.find(x => x.id === 'endoscopie')

  it('retire le praticien et verse ses valeurs dans le bucket « non attribué »', () => {
    remplacerStore(storeAvant())
    const g = gastro(getConsultData())

    expect(g.praticiens.find(p => p.id === 'bariatrique')).toBeUndefined()
    expect(g.valeurs[2026][0]).toBe(4 + 13)   // bucket existant + bariatrique
    expect(g.valeurs[2026][1]).toBe(0 + 11)
    expect(g.praticiens.find(p => p.id === 'ayral').valeurs[2026][0]).toBe(100)  // intact
  })

  it('est un déplacement pur : ce que perd le praticien, le bucket le gagne', () => {
    // On ne compare PAS le total brut avant/après : reconcilier() ajoute au passage tous les
    // praticiens du mock absents du store, ce qui gonflerait légitimement le total du store de
    // test. On isole donc l'effet de la seule migration.
    const somme = tab => (tab || []).reduce((a, b) => a + b, 0)
    const avant = storeAvant()
    const bariatriqueAvant = somme(gastro(avant).praticiens.find(p => p.id === 'bariatrique').valeurs[2026])
    const bucketAvant = somme(gastro(avant).valeurs[2026])

    remplacerStore(storeAvant())
    const bucketApres = somme(gastro(getConsultData()).valeurs[2026])

    expect(bucketApres - bucketAvant).toBe(bariatriqueAvant)
  })

  it('est idempotente : relire le store n’additionne pas une deuxième fois', () => {
    remplacerStore(storeAvant())
    const premier = gastro(getConsultData()).valeurs[2026][0]

    // getConsultData() réconcilie à CHAQUE lecture — sans idempotence, le bucket gonflerait.
    getConsultData(); getConsultData()
    expect(gastro(getConsultData()).valeurs[2026][0]).toBe(premier)
  })

  it('ne réintroduit pas le praticien depuis le mock après migration', () => {
    remplacerStore(storeAvant())
    remplacerStore(getConsultData())              // persiste l'état migré
    expect(gastro(getConsultData()).praticiens.find(p => p.id === 'bariatrique')).toBeUndefined()
  })
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
