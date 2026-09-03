import { describe, it, expect } from 'vitest'
import {
  MOMENTS, SECTEURS, libelleMoment, momentCourt, resume, indexerParJour,
  sallesConnues, operateursConnus, compterDemiJournees, verifierCreneau,
  bilanBlocB, segmentsBilanB, texteBilanB,
  basculerJour, groupesConsecutifs, resumeJours, verifierLot, MAX_JOURS_LOT,
} from './iadeCreneaux'

// Bloc A : une salle nommée.
const a = (jour, moment, salle, extra = {}) => ({
  id: `A-${jour}-${moment}-${salle}`, jour, moment, secteur: 'A', salle, absent: null, ...extra,
})
// Bloc B : un opérateur = une salle.
const b = (jour, moment, absent) => ({
  id: `B-${jour}-${moment}-${absent}`, jour, moment, secteur: 'B', salle: 'Bloc B', absent,
})

describe('moments et blocs', () => {
  it('couvre la journée et les deux demi-journées', () => {
    expect(MOMENTS.map(m => m.id)).toEqual(['journee', 'matin', 'apres_midi'])
    expect(libelleMoment('apres_midi')).toBe('Après-midi')
    expect(momentCourt('journee')).toBe('Journée')
  })

  it('connaît les deux blocs', () => {
    expect(SECTEURS.map(s => s.id)).toEqual(['A', 'B'])
  })
})

describe('résumé d\'un créneau', () => {
  it('au bloc A, nomme la salle et la personne absente', () => {
    expect(resume(a('2026-09-14', 'journee', 'Viscérale', { absent: 'Dr Martin' })))
      .toBe('Viscérale · Dr Martin')
    expect(resume(a('2026-09-14', 'journee', 'CPRE'))).toBe('CPRE')
  })

  it('ne précise le moment que pour une demi-journée — rien dit, c\'est la journée', () => {
    expect(resume(a('2026-09-14', 'matin', 'CPRE', { absent: 'Dr Martin' }))).toBe('CPRE · Dr Martin — matin')
    expect(resume(a('2026-09-14', 'apres_midi', 'NC'))).toBe('NC — après-midi')
  })

  it('nomme l\'opérateur au bloc B', () => {
    expect(resume(b('2026-09-14', 'matin', 'Dr Dran'))).toBe('Dr Dran — matin')
    expect(resume(b('2026-09-14', 'journee', 'Dr Dran'))).toBe('Dr Dran')
    expect(resume(null)).toBe('')
  })
})

describe('index par jour', () => {
  it('classe la journée entière avant le matin, puis l\'après-midi', () => {
    const index = indexerParJour([
      a('2026-09-14', 'apres_midi', 'NC'),
      b('2026-09-14', 'journee', 'Dr Dran'),
      a('2026-09-14', 'matin', 'CPRE'),
    ])
    expect(index.get('2026-09-14').map(x => x.moment)).toEqual(['journee', 'matin', 'apres_midi'])
  })

  it('trie par nom à moment égal, salle ou opérateur', () => {
    const index = indexerParJour([
      b('2026-09-14', 'matin', 'Dr Pissas'),
      a('2026-09-14', 'matin', 'CPRE'),
    ])
    expect(index.get('2026-09-14').map(x => x.secteur)).toEqual(['A', 'B'])
  })
})

describe('bilan du bloc B — combien de salles en moins', () => {
  it('compte une salle par opérateur, le matin et l\'après-midi', () => {
    const bilan = bilanBlocB([b('2026-10-20', 'matin', 'Dr Dran'), b('2026-10-20', 'matin', 'Dr Flamein')])
    expect(bilan).toMatchObject({ matin: 2, apresMidi: 0, journee: 0, seulMatin: 2 })
    expect(segmentsBilanB(bilan)).toEqual(['−2 salles le matin'])
  })

  it('une salle en moins le matin ET une l\'après-midi, c\'est une salle en moins la journée', () => {
    // Deux personnes différentes, mais une seule salle qui manque du matin au soir.
    const bilan = bilanBlocB([b('2026-10-20', 'matin', 'Dr Dran'), b('2026-10-20', 'apres_midi', 'Dr Pissas')])
    expect(bilan).toMatchObject({ matin: 1, apresMidi: 1, journee: 1, seulMatin: 0, seulApresMidi: 0 })
    expect(segmentsBilanB(bilan)).toEqual(['−1 salle la journée'])
  })

  it('dit la journée d\'abord, puis ce qui dépasse sur une demi-journée', () => {
    const bilan = bilanBlocB([
      b('2026-10-20', 'matin', 'Dr Dran'),
      b('2026-10-20', 'matin', 'Dr Flamein'),
      b('2026-10-20', 'apres_midi', 'Dr Pissas'),
    ])
    expect(bilan).toMatchObject({ journee: 1, seulMatin: 1, seulApresMidi: 0 })
    expect(segmentsBilanB(bilan)).toEqual(['−1 salle la journée', '−1 salle le matin'])
    expect(texteBilanB(bilan)).toBe('−1 salle la journée / −1 salle le matin')
  })

  it('compte une journée entière pour le matin ET l\'après-midi', () => {
    const bilan = bilanBlocB([b('2026-10-20', 'journee', 'Dr Dran'), b('2026-10-20', 'journee', 'Dr Flamein')])
    expect(segmentsBilanB(bilan)).toEqual(['−2 salles la journée'])
    expect(segmentsBilanB(bilanBlocB([b('2026-10-20', 'journee', 'Dr Dran'), b('2026-10-20', 'apres_midi', 'Dr Pissas')])))
      .toEqual(['−1 salle la journée', '−1 salle l\'après-midi'])
  })

  it('ignore le bloc A et reste muet sans ligne', () => {
    expect(bilanBlocB([a('2026-10-20', 'matin', 'CPRE')]).lignes).toEqual([])
    expect(segmentsBilanB(bilanBlocB([]))).toEqual([])
    expect(texteBilanB(null)).toBe('')
  })
})

describe('aides à la saisie', () => {
  it('propose les salles du bloc A sans doublon de casse, jamais « Bloc B »', () => {
    expect(sallesConnues([
      a('2026-09-14', 'matin', 'CPRE'),
      a('2026-09-15', 'matin', 'cpre'),
      a('2026-09-16', 'matin', 'Viscérale'),
      b('2026-09-16', 'matin', 'Dr Dran'),
    ])).toEqual(['CPRE', 'Viscérale'])
  })

  it('propose les opérateurs déjà nommés, tous blocs confondus', () => {
    expect(operateursConnus([
      b('2026-09-14', 'matin', 'Dr Dran'),
      b('2026-09-15', 'matin', 'dr dran'),
      a('2026-09-16', 'matin', 'CPRE', { absent: 'Dr Martin' }),
    ])).toEqual(['Dr Dran', 'Dr Martin'])
  })
})

describe('compte des demi-journées', () => {
  it('compte une journée entière pour deux', () => {
    expect(compterDemiJournees([a('2026-09-14', 'journee', 'NC'), b('2026-09-15', 'matin', 'Dr Dran')])).toBe(3)
    expect(compterDemiJournees([])).toBe(0)
  })
})

describe('contrôle de saisie', () => {
  it('exige un jour, un moment et un bloc', () => {
    expect(verifierCreneau({ jour: '', moment: 'matin', secteur: 'A', salle: 'CPRE' })).toMatch(/jour/)
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'soir', secteur: 'A', salle: 'CPRE' })).toMatch(/journée/)
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'C', salle: 'CPRE' })).toMatch(/bloc A ou le bloc B/)
  })

  it('exige la salle au bloc A, l\'opérateur au bloc B', () => {
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'A', salle: ' ' })).toMatch(/salle/)
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'B', absent: '' })).toMatch(/opérateur/)
    expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'B', absent: 'Dr Dran' })).toBe(null)
  })

  describe('bloc A', () => {
    const existants = [a('2026-09-14', 'matin', 'CPRE')]

    it('accepte deux salles différentes le même matin', () => {
      expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'A', salle: 'NC' }, existants)).toBe(null)
    })

    it('refuse deux fois la même salle sur le même moment', () => {
      expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'A', salle: 'cpre' }, existants))
        .toMatch(/déjà notée fermée/)
    })

    it('refuse une journée entière quand une demi-journée est déjà posée', () => {
      expect(verifierCreneau({ jour: '2026-09-14', moment: 'journee', secteur: 'A', salle: 'CPRE' }, existants))
        .toMatch(/retirez-la/)
    })

    it('refuse une demi-journée déjà comprise dans une journée entière', () => {
      expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'A', salle: 'CPRE' },
        [a('2026-09-14', 'journee', 'CPRE')])).toMatch(/comprise dedans/)
    })

    it('ne se bloque pas sur la ligne qu\'on est en train de corriger', () => {
      expect(verifierCreneau({ ...existants[0], absent: 'Dr Martin' }, existants)).toBe(null)
    })
  })

  describe('bloc B', () => {
    const existants = [b('2026-09-14', 'matin', 'Dr Dran')]

    it('accepte deux opérateurs le même matin — c\'est deux salles en moins', () => {
      expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'B', absent: 'Dr Flamein' }, existants))
        .toBe(null)
    })

    it('refuse deux fois le même opérateur sur le même moment', () => {
      expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'B', absent: 'dr dran' }, existants))
        .toMatch(/déjà noté absent/)
    })

    it('ne confond pas un opérateur du bloc B avec une salle du bloc A du même nom', () => {
      expect(verifierCreneau({ jour: '2026-09-14', moment: 'matin', secteur: 'A', salle: 'Dr Dran' }, existants))
        .toBe(null)
    })
  })
})

describe('sélection de plusieurs jours', () => {
  it('ajoute puis retire un jour au clic', () => {
    expect(basculerJour([], '2026-10-12')).toEqual(['2026-10-12'])
    expect(basculerJour(['2026-10-12'], '2026-10-12')).toEqual([])
  })

  it('garde la sélection triée quel que soit l\'ordre des clics', () => {
    let sel = basculerJour([], '2026-10-15')
    sel = basculerJour(sel, '2026-10-12')
    expect(sel).toEqual(['2026-10-12', '2026-10-15'])
  })

  it('étend depuis le dernier jour cliqué avec Maj, dans les deux sens', () => {
    expect(basculerJour(['2026-10-20'], '2026-10-22', { plage: true, ancre: '2026-10-20' }))
      .toEqual(['2026-10-20', '2026-10-21', '2026-10-22'])
    expect(basculerJour(['2026-10-22'], '2026-10-20', { plage: true, ancre: '2026-10-22' }))
      .toEqual(['2026-10-20', '2026-10-21', '2026-10-22'])
  })

  it('borne une plage aberrante', () => {
    expect(basculerJour([], '2026-12-31', { plage: true, ancre: '2026-01-01' })).toHaveLength(MAX_JOURS_LOT)
  })
})

describe('lecture d\'une sélection', () => {
  it('groupe les jours qui se suivent', () => {
    expect(groupesConsecutifs(['2026-10-12', '2026-10-20', '2026-10-21', '2026-10-22']))
      .toEqual([
        { debut: '2026-10-12', fin: '2026-10-12', nb: 1 },
        { debut: '2026-10-20', fin: '2026-10-22', nb: 3 },
      ])
  })

  it('se relit en clair avant enregistrement', () => {
    expect(resumeJours(['2026-10-12', '2026-10-20', '2026-10-21']))
      .toBe('12/10/2026, du 20/10/2026 au 21/10/2026')
    expect(resumeJours([])).toBe('')
  })
})

describe('contrôle d\'un lot', () => {
  const saisieB = { moment: 'matin', secteur: 'B', absent: 'Dr Dran' }

  it('refuse un lot vide', () => {
    expect(verifierLot({ jours: [], ...saisieB }).message).toMatch(/au moins un jour/)
  })

  it('ne dit qu\'une fois ce qui manque à tout le lot', () => {
    const r = verifierLot({ jours: ['2026-10-12', '2026-10-13'], ...saisieB, absent: '' })
    expect(r.message).toMatch(/opérateur/)
    expect(r.aPoser).toEqual([])
  })

  it('accepte tous les jours quand rien ne gêne', () => {
    const r = verifierLot({ jours: ['2026-10-13', '2026-10-12'], ...saisieB })
    expect(r.message).toBe(null)
    expect(r.aPoser).toEqual(['2026-10-12', '2026-10-13'])
    expect(r.refus).toEqual([])
  })

  it('laisse de côté les jours déjà notés sans faire échouer le reste', () => {
    const r = verifierLot({ jours: ['2026-10-12', '2026-10-13'], ...saisieB }, [b('2026-10-12', 'matin', 'Dr Dran')])
    expect(r.message).toBe(null)
    expect(r.aPoser).toEqual(['2026-10-13'])
    expect(r.refus.map(x => x.jour)).toEqual(['2026-10-12'])
  })

  it('bloque quand plus rien ne reste à poser', () => {
    const r = verifierLot({ jours: ['2026-10-12'], ...saisieB }, [b('2026-10-12', 'matin', 'Dr Dran')])
    expect(r.aPoser).toEqual([])
    expect(r.message).toMatch(/déjà noté absent/)
  })

  it('dédoublonne les jours', () => {
    expect(verifierLot({ jours: ['2026-10-12', '2026-10-12'], ...saisieB }).aPoser).toEqual(['2026-10-12'])
  })

  it('refuse un lot plus long que le maximum', () => {
    const jours = Array.from({ length: MAX_JOURS_LOT + 1 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
    expect(verifierLot({ jours, ...saisieB }).message).toMatch(/Pas plus de/)
  })
})
