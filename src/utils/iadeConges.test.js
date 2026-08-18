import { describe, it, expect } from 'vitest'
import {
  TYPES_CONGE, libelleType, courtType, libelleStatut,
  jourSuivant, seSuivent,
  compterParType, resumeTypes, plages, verifierSelection,
  formatJour, formatPeriode,
  bornesMois, joursDuMois, grilleMois,
  grouperParAgent, absenceDuJour, indexJoursPoses,
} from './iadeConges'

// Un jour posé, tel que renvoyé par la base.
const j = (jour, type = 'cp', statut = 'en_attente', extra = {}) => ({
  id: `${jour}-${type}-${statut}`, jour, type_conge: type, statut, user_id: 'u1', lot: 'l1', ...extra,
})

describe('types et statuts', () => {
  it('n\'expose que congé payé et récupération de jour férié', () => {
    expect(TYPES_CONGE.map(t => t.id)).toEqual(['cp', 'recup_ferie'])
  })
  it('traduit les types connus et retombe sur « Congé »', () => {
    expect(libelleType('cp')).toBe('Congé payé')
    expect(libelleType('recup_ferie')).toBe('Récup. jour férié')
    expect(libelleType('inconnu')).toBe('Congé')
  })
  it('donne une abréviation courte pour les cases de calendrier', () => {
    expect(courtType('cp')).toBe('CP')
    expect(courtType('recup_ferie')).toBe('RF')
  })
  it('traduit les statuts', () => {
    expect(libelleStatut('validee')).toBe('Validé')
  })
})

describe('jourSuivant / seSuivent', () => {
  it('avance d\'un jour, y compris en fin de mois et d\'année', () => {
    expect(jourSuivant('2026-07-13')).toBe('2026-07-14')
    expect(jourSuivant('2026-07-31')).toBe('2026-08-01')
    expect(jourSuivant('2026-12-31')).toBe('2027-01-01')
  })
  it('reconnaît deux jours consécutifs', () => {
    expect(seSuivent('2026-02-28', '2026-03-01')).toBe(true) // 2026 n'est pas bissextile
    expect(seSuivent('2026-07-13', '2026-07-15')).toBe(false)
  })
})

describe('compterParType / resumeTypes', () => {
  const jours = [j('2026-07-13'), j('2026-07-14'), j('2026-07-15', 'recup_ferie')]

  it('compte par nature', () => {
    expect(compterParType(jours)).toEqual({ cp: 2, recup_ferie: 1 })
  })
  it('accepte aussi la forme de sélection { type }', () => {
    expect(compterParType([{ type: 'cp' }, { type: 'recup_ferie' }])).toEqual({ cp: 1, recup_ferie: 1 })
  })
  it('résume en français, en omettant les natures absentes', () => {
    expect(resumeTypes(jours)).toBe('2 congés payés · 1 récup. jour férié')
    expect(resumeTypes([j('2026-07-13')])).toBe('1 congé payé')
  })
})

describe('plages', () => {
  it('fusionne les jours consécutifs de même nature et même statut', () => {
    const p = plages([j('2026-07-13'), j('2026-07-14'), j('2026-07-15')])
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ debut: '2026-07-13', fin: '2026-07-15', nb: 3, type_conge: 'cp' })
    expect(p[0].ids).toHaveLength(3)
  })

  it('coupe sur un trou de date', () => {
    const p = plages([j('2026-07-13'), j('2026-07-15')])
    expect(p.map(x => x.debut)).toEqual(['2026-07-13', '2026-07-15'])
  })

  it('coupe sur un changement de nature, même à dates consécutives', () => {
    const p = plages([j('2026-07-13'), j('2026-07-14', 'recup_ferie')])
    expect(p).toHaveLength(2)
    expect(p.map(x => x.type_conge)).toEqual(['cp', 'recup_ferie'])
  })

  it('coupe sur un changement de statut', () => {
    const p = plages([j('2026-07-13', 'cp', 'validee'), j('2026-07-14', 'cp', 'refusee')])
    expect(p.map(x => x.statut)).toEqual(['validee', 'refusee'])
  })

  it('ne fusionne pas deux agents ni deux envois quand les clés le demandent', () => {
    const jours = [
      j('2026-07-13', 'cp', 'en_attente', { user_id: 'u1', lot: 'A' }),
      j('2026-07-14', 'cp', 'en_attente', { user_id: 'u2', lot: 'B' }),
    ]
    expect(plages(jours, ['user_id', 'lot', 'type_conge', 'statut'])).toHaveLength(2)
  })

  it('rend les plages triées par date de début', () => {
    const p = plages([j('2026-08-03'), j('2026-07-13')])
    expect(p.map(x => x.debut)).toEqual(['2026-07-13', '2026-08-03'])
  })
})

describe('verifierSelection', () => {
  const sel = (jour, type = 'cp') => ({ jour, type })

  it('accepte une sélection valide', () => {
    expect(verifierSelection([sel('2026-07-13'), sel('2026-07-14', 'recup_ferie')])).toBeNull()
  })
  it('refuse une sélection vide', () => {
    expect(verifierSelection([])).toMatch(/au moins un jour/i)
  })
  it('refuse une nature inconnue', () => {
    expect(verifierSelection([sel('2026-07-13', 'rtt')])).toMatch(/nature/i)
  })
  it('refuse un jour déjà posé', () => {
    const deja = indexJoursPoses([j('2026-07-13', 'cp', 'validee')])
    expect(verifierSelection([sel('2026-07-13')], deja)).toMatch(/13\/07\/2026/)
  })
  it('refuse un envoi démesuré', () => {
    const trop = Array.from({ length: 63 }, (_, i) => sel(`2026-07-${String((i % 28) + 1).padStart(2, '0')}`))
    expect(verifierSelection(trop)).toMatch(/62 jours/)
  })
})

describe('formats', () => {
  it('formate un jour', () => {
    expect(formatJour('2026-07-13')).toBe('13/07/2026')
  })
  it('affiche un jour unique sans « du … au »', () => {
    expect(formatPeriode('2026-07-13', '2026-07-13')).toBe('13/07/2026')
  })
  it('affiche une plage', () => {
    expect(formatPeriode('2026-07-13', '2026-08-02')).toBe('du 13/07/2026 au 02/08/2026')
  })
})

describe('calendrier mensuel', () => {
  it('borne le mois', () => {
    expect(bornesMois(2026, 1)).toEqual({ debut: '2026-02-01', fin: '2026-02-28' })
    expect(bornesMois(2026, 6)).toEqual({ debut: '2026-07-01', fin: '2026-07-31' })
  })

  it('marque week-ends et jours fériés, avec le nom du férié', () => {
    const jours = joursDuMois(2026, 6) // juillet 2026
    expect(jours).toHaveLength(31)
    expect(jours.find(x => x.iso === '2026-07-14')).toMatchObject({ ferie: true, nomFerie: 'Fête nationale' })
    expect(jours.find(x => x.iso === '2026-07-11').weekend).toBe(true)  // samedi
    expect(jours.find(x => x.iso === '2026-07-13').weekend).toBe(false) // lundi
  })

  it('découpe le mois en semaines de 7 cases commençant le lundi', () => {
    const semaines = grilleMois(2026, 6) // juillet 2026 commence un mercredi
    expect(semaines.every(s => s.length === 7)).toBe(true)
    expect(semaines[0].slice(0, 2)).toEqual([null, null])
    expect(semaines[0][2].numero).toBe(1)
    expect(semaines.flat().filter(Boolean)).toHaveLength(31)
  })
})

describe('grouperParAgent / absenceDuJour / indexJoursPoses', () => {
  const jours = [
    { id: '1', user_id: 'u2', nom: 'Zoé',   jour: '2026-07-01', type_conge: 'cp',          statut: 'en_attente' },
    { id: '2', user_id: 'u1', nom: 'Alice', jour: '2026-07-02', type_conge: 'cp',          statut: 'validee' },
    { id: '3', user_id: 'u1', nom: 'Alice', jour: '2026-07-20', type_conge: 'recup_ferie', statut: 'en_attente' },
  ]

  it('groupe par agent et trie par nom', () => {
    const lignes = grouperParAgent(jours)
    expect(lignes.map(l => l.nom)).toEqual(['Alice', 'Zoé'])
    expect(lignes[0].jours).toHaveLength(2)
  })

  it('trouve le jour posé, la ligne validée en priorité', () => {
    const doublon = [
      { id: 'a', jour: '2026-07-02', statut: 'refusee' },
      { id: 'b', jour: '2026-07-02', statut: 'validee' },
    ]
    expect(absenceDuJour(doublon, '2026-07-02').id).toBe('b')
    expect(absenceDuJour(doublon, '2026-07-03')).toBeNull()
  })

  it('n\'indexe pas les jours refusés : ils peuvent être reposés', () => {
    const index = indexJoursPoses([
      { id: 'a', jour: '2026-07-02', statut: 'refusee' },
      { id: 'b', jour: '2026-07-03', statut: 'en_attente' },
    ])
    expect(index.has('2026-07-02')).toBe(false)
    expect(index.get('2026-07-03').id).toBe('b')
  })
})
