import { describe, it, expect } from 'vitest'
import {
  couleurPoste, decrire, bornesDuMois, colonnesDuMois,
  indexerParJour, texteCase, semaineISO, natureNote, libelleNote,
  posteDepuisTexte, moitiesCase,
} from './iadePlanning'

const c = (jour, iade, rang, extra = {}) => ({
  jour, iade, rang, matin: null, apres_midi: null, poste: null, note: null, ...extra,
})

describe('description des jours', () => {
  it('nomme le jour sans dériver de fuseau', () => {
    // Un new Date('2026-09-01') interprété en UTC puis affiché en local peut
    // reculer d'un jour : la description doit rester sur le 1er.
    expect(decrire('2026-09-01')).toMatchObject({ jour: 1, mois: 9, libelleJour: 'Mardi' })
    expect(decrire('2026-01-01').libelleJour).toBe('Jeudi')
  })

  it('formate la date courte', () => {
    expect(decrire('2026-09-02').court).toBe('mer. 02/09')
  })
})

describe('bornes du mois', () => {
  it('couvre le mois entier, février compris', () => {
    expect(bornesDuMois(2026, 9)).toEqual({ debut: '2026-09-01', fin: '2026-09-30' })
    expect(bornesDuMois(2026, 2)).toEqual({ debut: '2026-02-01', fin: '2026-02-28' })
    expect(bornesDuMois(2024, 2).fin).toBe('2024-02-29')
  })
})

describe('colonnes du mois', () => {
  it('suit l\'ordre du fichier, pas l\'ordre alphabétique', () => {
    const cases = [c('2026-09-01', 'Cathy', 0), c('2026-09-01', 'Nicolas', 1), c('2026-09-01', 'Aline', 2)]
    expect(colonnesDuMois(cases)).toEqual(['Cathy', 'Nicolas', 'Aline'])
  })

  it('ne répète pas un agent présent tous les jours', () => {
    const cases = [c('2026-09-01', 'Cathy', 0), c('2026-09-02', 'Cathy', 0)]
    expect(colonnesDuMois(cases)).toEqual(['Cathy'])
  })
})

describe('index par jour', () => {
  it('rapproche les cases et les infos du jour', () => {
    const index = indexerParJour(
      [c('2026-09-01', 'Cathy', 0, { poste: 'B' })],
      [{ jour: '2026-09-01', vacances: true, remplacants: ['Patrice Colin'] }],
    )
    const j = index.get('2026-09-01')
    expect(j.infos.vacances).toBe(true)
    expect(j.infos.remplacants).toEqual(['Patrice Colin'])
    expect(j.cases.get('Cathy').poste).toBe('B')
  })

  it('garde un jour dont l\'entête manque plutôt que de le perdre', () => {
    const index = indexerParJour([c('2026-09-03', 'Cathy', 0)], [])
    expect(index.get('2026-09-03').infos).toMatchObject({ jour: '2026-09-03', vacances: false })
  })
})

describe('contenu d\'une case', () => {
  it('affiche OFF sur une journée de repos', () => {
    expect(texteCase({ kind: 'off', poste: 'OFF' })).toMatchObject({ haut: 'OFF', pleine: true })
  })

  it('sépare matin et après-midi sur une journée coupée', () => {
    expect(texteCase({ kind: 'split', matin: '08h-13h CPRE', apres_midi: '13h-18h B', poste: 'CPRE' }))
      .toEqual({ haut: '08h-13h CPRE', bas: '13h-18h B', pleine: false })
  })

  it('reste vide sans case', () => {
    expect(texteCase(undefined).haut).toBe('')
  })
})

describe('poste lu dans le libellé', () => {
  it('reconnaît les postes tels que le fichier les écrit', () => {
    expect(posteDepuisTexte('13h-18h B')).toBe('B')
    expect(posteDepuisTexte('7h30-17h30 A')).toBe('A')
    expect(posteDepuisTexte('CPRE')).toBe('CPRE')
    expect(posteDepuisTexte('8h-19h Viscérale')).toBe('VISC')
    expect(posteDepuisTexte('13-18h Renfort A/B')).toBe('RENFORT')
    expect(posteDepuisTexte('OFF')).toBe('OFF')
  })

  it('ne devine rien sur un libellé muet', () => {
    expect(posteDepuisTexte('')).toBe(null)
    expect(posteDepuisTexte(null)).toBe(null)
    expect(posteDepuisTexte('8h-18h')).toBe(null)
  })

  it('ne prend pas le A ou le B d\'un mot pour un poste', () => {
    expect(posteDepuisTexte('Astreinte')).toBe(null)
  })
})

describe('moitiés colorées d\'une case', () => {
  it('donne deux postes à une journée coupée — le cas du vendredi CPRE puis Bloc B', () => {
    expect(moitiesCase({ kind: 'split', matin: 'CPRE', apres_midi: '13h-18h B', poste: 'CPRE' }))
      .toEqual([
        { texte: 'CPRE', poste: 'CPRE' },
        { texte: '13h-18h B', poste: 'B' },
      ])
  })

  it('ne fait qu\'une moitié sur une journée pleine', () => {
    expect(moitiesCase({ kind: 'full', matin: '8h-18h B', apres_midi: '', poste: 'B' }))
      .toEqual([{ texte: '8h-18h B', poste: 'B' }])
  })

  it('garde le poste du miroir quand le libellé ne le dit pas', () => {
    expect(moitiesCase({ kind: 'off', matin: '', apres_midi: '', poste: 'OFF' }))
      .toEqual([{ texte: 'OFF', poste: 'OFF' }])
  })

  it('reste muette sans case', () => {
    expect(moitiesCase(undefined)).toEqual([{ texte: '', poste: null }])
  })
})

describe('semaine ISO', () => {
  it('groupe les jours d\'une même semaine', () => {
    // Lundi 7 au vendredi 11 septembre 2026 : une seule et même semaine.
    const semaine = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'].map(semaineISO)
    expect(new Set(semaine).size).toBe(1)
  })

  it('change de numéro d\'un vendredi au lundi suivant', () => {
    expect(semaineISO('2026-09-11')).not.toBe(semaineISO('2026-09-14'))
  })

  it('reste cohérent au passage d\'année', () => {
    // Le 1er janvier 2026 est un jeudi : il appartient à la semaine 1.
    expect(semaineISO('2026-01-01')).toBe(1)
    // Le 31 décembre 2026 est un jeudi : semaine 53, pas la semaine 1 de 2027.
    expect(semaineISO('2026-12-31')).toBe(53)
  })
})

describe('nature et libellé d\'une note', () => {
  it('reconnaît un congé quel que soit l\'accent ou la casse', () => {
    // Le fichier Excel n'est pas régulier : « Congé », « Conge », « congés »
    // désignent tous la même chose.
    for (const note of ['Congé', 'conge', 'CONGÉS', ' Congé ']) {
      expect(natureNote(note)).toBe('conge')
    }
  })

  it('garde le libellé du congé tel que le fichier l\'écrit', () => {
    // La colonne dédiée est assez large : « Congé CP » vaut mieux que « Congé ».
    expect(libelleNote('Congé')).toBe('Congé')
    expect(libelleNote('conge')).toBe('Conge')
    expect(libelleNote('Congé récup.')).toBe('Congé récup.')
  })

  it('range tout le reste en heures supplémentaires', () => {
    expect(natureNote('+10h')).toBe('hs')
    expect(natureNote('HS')).toBe('hs')
    expect(natureNote(null)).toBe(null)
    expect(natureNote('   ')).toBe(null)
  })

  it('aère le nombre d\'heures pour qu\'il ne se lise pas comme un horaire', () => {
    expect(libelleNote('+10h')).toBe('+10 h')
    expect(libelleNote('8h')).toBe('+8 h')
    expect(libelleNote('+2,5h')).toBe('+2.5 h')
    expect(libelleNote('HS')).toBe('HS')
    expect(libelleNote(null)).toBe('')
  })
})

describe('couleurs', () => {
  it('donne une couleur à chaque poste connu, rien aux autres', () => {
    expect(couleurPoste('A')).toBe('#3E7CB1')
    expect(couleurPoste('OFF')).toBe('#C9C7BF')
    expect(couleurPoste(null)).toBe(null)
    expect(couleurPoste('INCONNU')).toBe(null)
  })
})

// ── Cases modifiées depuis le dashboard ──────────────────────────────────────
import {
  remplacerPoste, composerCase, formulaireDeCase, memeCase, appliquerModifs, resumeCase,
} from './iadePlanning'

describe('remplacerPoste', () => {
  it('garde les horaires et change le poste, tel que le fichier l\'écrit', () => {
    expect(remplacerPoste('8h-18h B', 'CPRE')).toBe('8h-18h CPRE')
    expect(remplacerPoste('8h-18h CPRE', 'A')).toBe('8h-18h A')
    expect(remplacerPoste('10h-20h Viscérale', 'B')).toBe('10h-20h B')
    expect(remplacerPoste('13h-18h Renfort', 'VISC')).toBe('13h-18h Viscérale')
  })
  it('pose le poste seul quand il n\'y a pas d\'horaire', () => {
    expect(remplacerPoste('', 'CPRE')).toBe('CPRE')
    expect(remplacerPoste('CPRE', 'B')).toBe('B')
  })
})

describe('composerCase', () => {
  it('journée pleine : un texte, forme full, poste relu dans le texte', () => {
    expect(composerCase({ mode: 'pleine', matin: ' 8h-18h  B ', apres_midi: 'ignoré' }))
      .toEqual({ kind: 'full', matin: '8h-18h B', apres_midi: null, poste: 'B' })
  })
  it('journée coupée : deux textes → split, un seul → matin ou aprem', () => {
    expect(composerCase({ mode: 'coupee', matin: '7h30-13h A', apres_midi: '13h30-17h30 B' }))
      .toEqual({ kind: 'split', matin: '7h30-13h A', apres_midi: '13h30-17h30 B', poste: 'A' })
    expect(composerCase({ mode: 'coupee', matin: '7h30-13h A', apres_midi: '' }).kind).toBe('matin')
    expect(composerCase({ mode: 'coupee', matin: '', apres_midi: '13h-18h B' }))
      .toEqual({ kind: 'aprem', matin: null, apres_midi: '13h-18h B', poste: 'B' })
  })
  it('OFF : aucun texte, poste OFF', () => {
    expect(composerCase({ mode: 'off', matin: 'x', apres_midi: 'y' }))
      .toEqual({ kind: 'off', matin: null, apres_midi: null, poste: 'OFF' })
  })
  it('rien à enregistrer quand tout est vide', () => {
    expect(composerCase({ mode: 'pleine', matin: '  ', apres_midi: '' })).toBeNull()
    expect(composerCase({ mode: 'coupee', matin: '', apres_midi: '' })).toBeNull()
  })
})

describe('formulaireDeCase', () => {
  it('retrouve la forme comme le fichier la lit (parse_trio)', () => {
    expect(formulaireDeCase(c('2026-09-01', 'CATHY', 0, { matin: '8h-18h B', poste: 'B' })))
      .toEqual({ mode: 'pleine', matin: '8h-18h B', apres_midi: '' })
    expect(formulaireDeCase(c('2026-09-01', 'CATHY', 0, { matin: '7h30-13h A', poste: 'A' })))
      .toEqual({ mode: 'coupee', matin: '7h30-13h A', apres_midi: '' })
    expect(formulaireDeCase(c('2026-09-01', 'CATHY', 0, { apres_midi: '13h-18h B', poste: 'B' })))
      .toEqual({ mode: 'coupee', matin: '', apres_midi: '13h-18h B' })
    expect(formulaireDeCase(c('2026-09-01', 'CATHY', 0, { matin: 'CPRE', apres_midi: '13h-18h B', poste: 'CPRE' })))
      .toEqual({ mode: 'coupee', matin: 'CPRE', apres_midi: '13h-18h B' })
    expect(formulaireDeCase(c('2026-09-01', 'CATHY', 0, { poste: 'OFF' })).mode).toBe('off')
    expect(formulaireDeCase(null).mode).toBe('off')
  })
  it('respecte la forme quand la case la porte (modification déjà enregistrée)', () => {
    expect(formulaireDeCase({ kind: 'matin', matin: '8h-18h B' }).mode).toBe('coupee')
    expect(formulaireDeCase({ kind: 'full', matin: '7h30-13h A' }).mode).toBe('pleine')
  })
})

describe('memeCase', () => {
  it('ignore les espaces et considère OFF égal à OFF', () => {
    expect(memeCase({ matin: '8h-18h  B' }, { matin: '8h-18h B', apres_midi: null })).toBe(true)
    expect(memeCase({ poste: 'OFF' }, { kind: 'off' })).toBe(true)
    expect(memeCase({ poste: 'OFF' }, { matin: '8h-18h B' })).toBe(false)
    expect(memeCase({ matin: '8h-18h B' }, { matin: '8h-18h A' })).toBe(false)
  })
})

describe('appliquerModifs', () => {
  const miroir = [
    c('2026-09-22', 'CATHY', 0, { matin: '7h30-17h30 A', poste: 'A' }),
    c('2026-09-22', 'NICOLAS', 1, { matin: '8h-18h B', poste: 'B' }),
  ]
  it('remplace la case par la modification active, sans toucher la note', () => {
    const cases = appliquerModifs(
      miroir.map(x => ({ ...x, note: 'Congé' })),
      [{ jour: '2026-09-22', iade: 'CATHY', kind: 'full', matin: '8h-18h B', apres_midi: null, poste: 'B', statut: 'active' }]
    )
    expect(cases[0]).toMatchObject({ matin: '8h-18h B', poste: 'B', note: 'Congé', kind: 'full' })
    expect(cases[0].modif.statut).toBe('active')
    expect(cases[1].modif).toBeUndefined()
  })
  it('une modification annulée remet ce que le fichier disait, dès maintenant', () => {
    const cases = appliquerModifs(miroir, [{
      jour: '2026-09-22', iade: 'CATHY', kind: 'full', matin: '8h-18h B', poste: 'B', statut: 'annulee',
      fichier: { matin: '7h30-13h A', apres_midi: null, poste: 'A' },
    }])
    expect(cases[0]).toMatchObject({ matin: '7h30-13h A', poste: 'A' })
    expect(cases[0].modif.retour).toBe(true)
  })
  it('ne crée pas de case là où le miroir n\'en a pas', () => {
    const cases = appliquerModifs(miroir, [{ jour: '2026-09-23', iade: 'CATHY', kind: 'off', statut: 'active' }])
    expect(cases).toHaveLength(2)
    expect(cases.every(x => !x.modif)).toBe(true)
  })
  it('rend le même tableau sans modification', () => {
    expect(appliquerModifs(miroir, [])).toBe(miroir)
  })
})

describe('resumeCase', () => {
  it('dit la case en une ligne', () => {
    expect(resumeCase({ matin: '8h-18h B' })).toBe('8h-18h B')
    expect(resumeCase({ matin: 'CPRE', apres_midi: '13h-18h B' })).toBe('CPRE / 13h-18h B')
    expect(resumeCase({ kind: 'matin', matin: '7h30-13h A' })).toBe('7h30-13h A (matin)')
    expect(resumeCase({ kind: 'aprem', apres_midi: '13h-18h B' })).toBe('13h-18h B (après-midi)')
    expect(resumeCase({ poste: 'OFF' })).toBe('OFF')
    expect(resumeCase(null)).toBe('—')
  })
})
