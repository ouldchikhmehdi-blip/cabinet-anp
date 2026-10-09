import { describe, it, expect } from 'vitest'
import {
  MAX_JOURS, LIGNES, CHAMPS_JOURS,
  formatJours, parseJours, solde, formatSolde,
  verifierCompteur, estVide, versColonnes, versSaisie, memeSaisie,
  moisRef, libelleMoisRef,
} from './iadeCompteurConges'

// Une ligne telle que la base la renvoie. Par défaut le bulletin de l'image :
// En-cours 15,00 / 8,00 → solde 7,00 ; N 30,00 / 30,00 ; N-1 vide.
const ligne = (extra = {}) => ({
  user_id: 'u1', mois_ref: '2026-10-01',
  encours_acquis: 15, encours_pris: 8,
  n_acquis: 30, n_pris: 30,
  n1_acquis: null, n1_pris: null,
  ...extra,
})

// Une saisie telle que la grille la tient : des CHAÎNES.
const saisie = (extra = {}) => ({
  encours_acquis: '15,00', encours_pris: '8,00',
  n_acquis: '30,00', n_pris: '30,00',
  n1_acquis: '', n1_pris: '',
  ...extra,
})

describe('les trois lignes du bulletin', () => {
  it('suit l\'ordre imprimé : En-cours, N, N-1', () => {
    expect(LIGNES.map(l => l.label)).toEqual(['En-cours', 'N', 'N-1'])
  })

  it('expose les six colonnes chiffrées dans l\'ordre d\'affichage', () => {
    expect(CHAMPS_JOURS).toEqual([
      'encours_acquis', 'encours_pris', 'n_acquis', 'n_pris', 'n1_acquis', 'n1_pris',
    ])
  })
})

describe('écriture à la française', () => {
  it('imprime deux décimales et une virgule, comme le bulletin', () => {
    expect(formatJours(15)).toBe('15,00')
    expect(formatJours(7.5)).toBe('7,50')
    expect(formatJours(0)).toBe('0,00')
  })

  it('laisse la case vide quand le bulletin ne dit rien', () => {
    expect(formatJours(null)).toBe('')
    expect(formatJours(undefined)).toBe('')
    expect(formatJours('')).toBe('')
  })
})

describe('lecture d\'une case saisie à la main', () => {
  it('accepte la virgule, le point et l\'entier nu', () => {
    expect(parseJours('15,00')).toBe(15)
    expect(parseJours('15.00')).toBe(15)
    expect(parseJours('15')).toBe(15)
    expect(parseJours('7,5')).toBe(7.5)
  })

  it('ignore les espaces, y compris l\'insécable des milliers', () => {
    expect(parseJours(' 1 234,5 ')).toBe(1234.5)
    expect(parseJours('1\u00A0234,5')).toBe(1234.5)
  })

  it('une case vide reste vide et ne devient JAMAIS zéro', () => {
    // Number('') vaut 0 : c'est précisément le piège que parseJours évite.
    expect(parseJours('')).toBeNull()
    expect(parseJours('   ')).toBeNull()
    expect(parseJours(null)).toBeNull()
    expect(parseJours(undefined)).toBeNull()
  })

  it('signale ce qui n\'est pas un nombre', () => {
    expect(parseJours('12abc')).toBeNaN()
    expect(parseJours('quinze')).toBeNaN()
    expect(parseJours('-3')).toBeNaN()
    expect(parseJours(',')).toBeNaN()
  })
})

describe('solde', () => {
  it('vaut Acquis − Pris — le cas du bulletin : 15 − 8 = 7', () => {
    expect(solde(15, 8)).toBe(7)
  })

  it('compte une case vide pour zéro quand l\'autre est renseignée', () => {
    expect(solde(12, null)).toBe(12)
    expect(solde(null, 4)).toBe(-4)
  })

  it('n\'annonce aucun solde sur une ligne non concernée', () => {
    // N-1 vide des deux côtés : répondre « 0 » affirmerait ce que le bulletin tait.
    expect(solde(null, null)).toBeNull()
  })

  it('ne s\'imprime pas quand il vaut zéro, comme sur le bulletin', () => {
    expect(formatSolde(30, 30)).toBe('')
    expect(formatSolde(null, null)).toBe('')
    expect(formatSolde(15, 8)).toBe('7,00')
  })
})

describe('contrôle de la saisie', () => {
  it('laisse passer un bulletin bien recopié', () => {
    expect(verifierCompteur(saisie())).toBeNull()
  })

  it('laisse passer une grille entièrement vide', () => {
    expect(verifierCompteur({})).toBeNull()
  })

  it('refuse ce qui n\'est pas un nombre, en citant la case', () => {
    expect(verifierCompteur(saisie({ n_acquis: '30j' }))).toContain('30j')
  })

  it('refuse un nombre de jours négatif', () => {
    // Le signe « - » ne passe pas parseJours : c'est illisible avant d'être négatif.
    expect(verifierCompteur(saisie({ encours_pris: '-2' }))).toContain('-2')
  })

  it('refuse une virgule oubliée dans « 15,00 »', () => {
    expect(verifierCompteur(saisie({ encours_acquis: '1500' })))
      .toBe('Un nombre de jours ne peut pas dépasser 999,99.')
    expect(MAX_JOURS).toBe(999.99)
  })
})

describe('ligne vide', () => {
  it('reconnaît une grille où rien n\'a été recopié', () => {
    expect(estVide({})).toBe(true)
    expect(estVide({ encours_acquis: '', n1_pris: '   ' })).toBe(true)
  })

  it('un zéro explicite n\'est pas un vide : le bulletin dit zéro', () => {
    expect(estVide({ encours_pris: '0' })).toBe(false)
  })
})

describe('aller-retour base ↔ grille', () => {
  it('convertit la saisie en colonnes, vides comprises', () => {
    expect(versColonnes(saisie())).toEqual({
      encours_acquis: 15, encours_pris: 8,
      n_acquis: 30, n_pris: 30,
      n1_acquis: null, n1_pris: null,
    })
  })

  it('réaffiche une ligne de la base à la française', () => {
    expect(versSaisie(ligne())).toEqual({
      encours_acquis: '15,00', encours_pris: '8,00',
      n_acquis: '30,00', n_pris: '30,00',
      n1_acquis: '', n1_pris: '',
    })
  })

  it('un agent absent de la base donne six cases vides', () => {
    expect(versSaisie(null)).toEqual({
      encours_acquis: '', encours_pris: '', n_acquis: '', n_pris: '',
      n1_acquis: '', n1_pris: '',
    })
  })
})

describe('repérer les agents réellement touchés', () => {
  it('« 15 », « 15,00 » et « 15.00 » disent la même chose', () => {
    expect(memeSaisie(saisie(), saisie({ encours_acquis: '15' }))).toBe(true)
    expect(memeSaisie(saisie(), saisie({ encours_acquis: '15.00' }))).toBe(true)
  })

  it('un chiffre changé se voit', () => {
    expect(memeSaisie(saisie(), saisie({ n_pris: '28,00' }))).toBe(false)
  })

  it('vider une case n\'est pas la mettre à zéro', () => {
    expect(memeSaisie(saisie({ n1_acquis: '' }), saisie({ n1_acquis: '0' }))).toBe(false)
  })
})

describe('mois du bulletin', () => {
  it('ramène toujours au 1er du mois, avec un mois 0-indexé', () => {
    // 9 = octobre, comme Date.getMonth() dans IadeGestion.
    expect(moisRef(2026, 9)).toBe('2026-10-01')
    expect(moisRef(2026, 0)).toBe('2026-01-01')
  })

  it('se relit en toutes lettres', () => {
    expect(libelleMoisRef('2026-10-01')).toBe('octobre 2026')
    expect(libelleMoisRef(null)).toBe('')
  })
})
