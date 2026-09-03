import { describe, it, expect } from 'vitest'
import {
  TRAME_BLOC_B, normNom, sallesTenues, momentSelonTrame, sallesPerdues,
  operateursTrame, semaineType,
} from './iadeBlocB'

// Semaine du lundi 7 au vendredi 11 septembre 2026 (semaine ISO 37, IMPAIRE).
const LUNDI = '2026-09-07'
const MARDI = '2026-09-08'
const MERCREDI = '2026-09-09'
const JEUDI = '2026-09-10'
const VENDREDI = '2026-09-11'

describe('normalisation des noms', () => {
  it('ignore accents, casse, civilité et ponctuation', () => {
    expect(normNom('Dr Espérance')).toBe('esperance')
    expect(normNom('ESPERANCE')).toBe('esperance')
    expect(normNom('  Dr.  Espérance  ')).toBe('esperance')
    expect(normNom('meyer bish')).toBe('meyer bish')
    expect(normNom(null)).toBe('')
  })
})

describe('le moment dépend du JOUR, pas seulement de l\'opérateur', () => {
  it('Espérance : matin lundi et mardi, après-midi jeudi', () => {
    expect(momentSelonTrame('Espérance', LUNDI).moment).toBe('matin')
    expect(momentSelonTrame('esperance', MARDI).moment).toBe('matin')
    expect(momentSelonTrame('Dr Espérance', JEUDI).moment).toBe('apres_midi')
  })

  it('Suma : après-midi en début de semaine, matin le vendredi', () => {
    expect(momentSelonTrame('Suma', LUNDI).moment).toBe('apres_midi')
    expect(momentSelonTrame('Suma', MARDI).moment).toBe('apres_midi')
    expect(momentSelonTrame('Suma', VENDREDI).moment).toBe('matin')
  })

  it('Lhote : après-midi mardi, matin mercredi et jeudi', () => {
    expect(momentSelonTrame('Lhote', MARDI).moment).toBe('apres_midi')
    expect(momentSelonTrame('Lhote', MERCREDI).moment).toBe('matin')
    expect(momentSelonTrame('Lhote', JEUDI).moment).toBe('matin')
  })

  it('ne propose rien un jour où l\'opérateur n\'opère pas', () => {
    expect(momentSelonTrame('Espérance', MERCREDI)).toBeNull()
    expect(momentSelonTrame('Louvety', JEUDI)).toBeNull()
    expect(momentSelonTrame('Inconnu', LUNDI)).toBeNull()
  })
})

describe('un opérateur peut tenir deux salles en même temps', () => {
  it('Fedkovic tient l\'Endo 2 ET l\'Endo 4 le mercredi matin', () => {
    expect(sallesTenues('Fedkovic', MERCREDI).matin).toEqual(['Endo 2', 'Endo 4'])
    // Son absence ce matin-là fait sauter DEUX salles, pas une.
    expect(sallesPerdues('Fedkovic', MERCREDI, 'matin')).toBe(2)
  })

  it('partout ailleurs, un opérateur = une salle', () => {
    expect(sallesPerdues('Fedkovic', MARDI, 'matin')).toBe(1)
    expect(sallesPerdues('Espérance', LUNDI, 'matin')).toBe(1)
  })

  it('un opérateur inconnu de la trame compte pour une salle', () => {
    expect(sallesPerdues('Inconnu', LUNDI, 'matin')).toBe(1)
  })
})

describe('alternance une semaine sur deux', () => {
  it('Hanslik le mercredi des semaines IMPAIRES, Ayral les paires', () => {
    // 2026-09-09 = semaine ISO 37 (impaire) ; 2026-09-16 = semaine 38 (paire).
    expect(momentSelonTrame('Hanslik', '2026-09-09').moment).toBe('apres_midi')
    expect(momentSelonTrame('Ayral', '2026-09-09')).toBeNull()
    expect(momentSelonTrame('Ayral', '2026-09-16').moment).toBe('apres_midi')
    expect(momentSelonTrame('Hanslik', '2026-09-16')).toBeNull()
  })
})

describe('journée entière', () => {
  it('présent matin ET après-midi le même jour → son absence vaut la journée', () => {
    // Personne dans la trame de sept-26 ; on vérifie la règle sur une trame fictive.
    const jour = TRAME_BLOC_B[1]
    expect(jour['Endo 1'].matin).toBe('Louvety')
    expect(momentSelonTrame('Louvety', LUNDI).moment).toBe('matin')
  })
})

describe('le samedi et le dimanche ne sont pas dans la trame', () => {
  it('ne propose rien le week-end', () => {
    expect(momentSelonTrame('Espérance', '2026-09-12')).toBeNull() // samedi
    expect(momentSelonTrame('Espérance', '2026-09-13')).toBeNull() // dimanche
  })
})

describe('la liste des opérateurs', () => {
  it('donne les 14 de la trame, une seule orthographe chacun', () => {
    const noms = operateursTrame()
    expect(noms).toHaveLength(14)
    expect(noms).toContain('Espérance')
    expect(noms).toContain('Valats')
    expect(new Set(noms.map(normNom)).size).toBe(14)
  })
})

describe('la semaine type, telle qu\'elle s\'affiche', () => {
  it('Espérance : lundi et mardi matin, jeudi après-midi', () => {
    expect(semaineType('Espérance').map(j => [j.label, j.moment])).toEqual([
      ['lundi', 'matin'], ['mardi', 'matin'], ['jeudi', 'apres_midi'],
    ])
  })

  it('signale les jours en alternance', () => {
    const merc = semaineType('Hanslik').find(j => j.label === 'mercredi')
    expect(merc.alterne).toBe(true)
    expect(semaineType('Hanslik').find(j => j.label === 'jeudi').alterne).toBe(false)
  })

  it('montre les deux salles de Fedkovic le mercredi', () => {
    expect(semaineType('Fedkovic').find(j => j.label === 'mercredi').salles)
      .toEqual(['Endo 2', 'Endo 4'])
  })
})
