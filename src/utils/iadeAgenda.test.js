import { describe, it, expect } from 'vitest'
import { normaliser, suggererColonne } from './iadeAgenda'

describe('normalisation', () => {
  it('efface accents, casse et ponctuation', () => {
    expect(normaliser('Congé récup.')).toBe('conge recup')
    expect(normaliser('PAULINE>sabrina')).toBe('pauline sabrina')
    expect(normaliser(null)).toBe('')
  })
})

describe('suggestion de colonne', () => {
  const colonnes = ['CATHY', 'NICOLAS', 'MARION', 'PAULINE>sabrina']

  it('reconnaît le prénom du compte dans les colonnes', () => {
    expect(suggererColonne('Nicolas Martin', colonnes)).toBe('NICOLAS')
    expect(suggererColonne('Cathy', colonnes)).toBe('CATHY')
  })

  it('regarde chaque morceau d\'une colonne à deux noms', () => {
    // Le 7e poste change de titulaire en cours d'année : « PAULINE>sabrina ».
    expect(suggererColonne('Sabrina Dupont', colonnes)).toBe('PAULINE>sabrina')
  })

  it('ne suggère rien quand c\'est ambigu — c\'est à l\'agent de trancher', () => {
    // Deux colonnes possibles : se tromper remplirait son agenda avec les
    // journées d'un collègue.
    expect(suggererColonne('Marion Pauline', colonnes)).toBe(null)
    expect(suggererColonne('Inconnu', colonnes)).toBe(null)
    expect(suggererColonne('', colonnes)).toBe(null)
    expect(suggererColonne(null, colonnes)).toBe(null)
  })

  it('ignore les mots trop courts pour identifier quelqu\'un', () => {
    expect(suggererColonne('Le Ka', ['KA', 'CATHY'])).toBe(null)
  })
})
