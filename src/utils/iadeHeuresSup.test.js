import { describe, it, expect } from 'vitest'
import {
  MIN_HEURES, MAX_HEURES, libelleOrigine, formatHeures,
  verifierDeclaration, verifierAjoutGestion,
  indexJoursDeclares, totalHeures, resumeHeures, grouperParAgent, sectionHeuresSup,
  finFenetre, fenetreOuverte, peutRevenirDessus, recapMensuel,
} from './iadeHeuresSup'

describe('formatHeures / libelleOrigine', () => {
  it('affiche des heures entières', () => {
    expect(formatHeures(1)).toBe('1 h')
    expect(formatHeures(12)).toBe('12 h')
  })

  it('nomme les deux chemins d\'entrée', () => {
    expect(libelleOrigine('iade')).toBe('Déclarée par l’agent')
    expect(libelleOrigine('gestion')).toBe('Ajoutée par la gestion')
    expect(libelleOrigine('inconnu')).toBe('inconnu')
  })
})

describe('verifierDeclaration', () => {
  const bonne = { jour: '2026-11-02', heures: 4, marId: 'mar-1' }

  it('accepte une déclaration complète', () => {
    expect(verifierDeclaration(bonne)).toBeNull()
  })

  it('exige un jour valide', () => {
    expect(verifierDeclaration({ ...bonne, jour: '' })).toMatch(/jour concerné/)
    expect(verifierDeclaration({ ...bonne, jour: '02/11/2026' })).toMatch(/jour concerné/)
  })

  it('exige un nombre d\'heures entier dans les bornes', () => {
    expect(verifierDeclaration({ ...bonne, heures: 2.5 })).toMatch(/entier/)
    expect(verifierDeclaration({ ...bonne, heures: 0 })).toMatch(/compris entre/)
    expect(verifierDeclaration({ ...bonne, heures: MAX_HEURES + 1 })).toMatch(/compris entre/)
    expect(verifierDeclaration({ ...bonne, heures: MIN_HEURES })).toBeNull()
    expect(verifierDeclaration({ ...bonne, heures: MAX_HEURES })).toBeNull()
  })

  it('exige la désignation d\'un MAR — sans lui, personne ne pourrait valider', () => {
    expect(verifierDeclaration({ ...bonne, marId: null })).toMatch(/MAR/)
  })

  it('refuse un jour déjà déclaré, comme le fera la base', () => {
    const deja = new Map([['2026-11-02', { statut: 'en_attente' }]])
    expect(verifierDeclaration(bonne, deja)).toMatch(/déjà une déclaration/)
  })
})

describe('verifierAjoutGestion', () => {
  it('n\'exige pas de MAR mais exige un agent', () => {
    expect(verifierAjoutGestion({ jour: '2026-11-02', heures: 6, userId: 'u1' })).toBeNull()
    expect(verifierAjoutGestion({ jour: '2026-11-02', heures: 6, userId: null })).toMatch(/agent/)
  })

  it('applique les mêmes bornes d\'heures', () => {
    expect(verifierAjoutGestion({ jour: '2026-11-02', heures: 30, userId: 'u1' })).toMatch(/compris entre/)
  })
})

describe('indexJoursDeclares', () => {
  const lignes = [
    { id: 'a', jour: '2026-11-02', statut: 'en_attente' },
    { id: 'b', jour: '2026-11-03', statut: 'refusee' },
    { id: 'c', jour: '2026-11-04', statut: 'en_attente' },
    { id: 'd', jour: '2026-11-04', statut: 'validee' },
  ]

  it('ignore les refus : un jour refusé peut être redéclaré', () => {
    expect(indexJoursDeclares(lignes).has('2026-11-03')).toBe(false)
  })

  it('fait primer la ligne validée sur celle en attente', () => {
    expect(indexJoursDeclares(lignes).get('2026-11-04').id).toBe('d')
  })
})

describe('totalHeures / resumeHeures', () => {
  const lignes = [{ heures: 4 }, { heures: 2 }, { heures: 6 }]

  it('additionne les heures', () => {
    expect(totalHeures(lignes)).toBe(12)
    expect(totalHeures([])).toBe(0)
  })

  it('résume en jours et en heures', () => {
    expect(resumeHeures(lignes)).toBe('3 jours · 12 h')
    expect(resumeHeures([{ heures: 4 }])).toBe('1 jour · 4 h')
    expect(resumeHeures([])).toBe('aucune heure')
  })
})

describe('grouperParAgent', () => {
  const lignes = [
    { user_id: 'u2', jour: '2026-11-02', heures: 6 },
    { user_id: 'u1', jour: '2026-11-03', heures: 4 },
    { user_id: 'u1', jour: '2026-11-04', heures: 2 },
  ]
  const nomDe = (id) => ({ u1: 'Dupont Marie', u2: 'Amar Sophie' })[id] ?? '—'

  it('regroupe, totalise et trie par nom', () => {
    const groupes = grouperParAgent(lignes, nomDe)
    expect(groupes.map(g => g.nom)).toEqual(['Amar Sophie', 'Dupont Marie'])
    expect(groupes[1].heures).toBe(6)
    expect(groupes[1].lignes).toHaveLength(2)
  })

  it('préfère le nom déjà porté par la ligne (venu d\'une RPC)', () => {
    const groupes = grouperParAgent([{ user_id: 'u9', nom: 'Venu de la RPC', heures: 3 }], nomDe)
    expect(groupes[0].nom).toBe('Venu de la RPC')
  })
})

describe('sectionHeuresSup', () => {
  const heuresSup = [
    { user_id: 'u1', jour: '2026-09-09', heures: 4, statut: 'validee' },
    { user_id: 'u1', jour: '2026-09-23', heures: 2, statut: 'validee' },
    { user_id: 'u2', jour: '2026-09-11', heures: 3, statut: 'en_attente' },
    { user_id: 'u1', jour: '2026-10-02', heures: 5, statut: 'validee' },
  ]
  const nomDe = (id) => ({ u1: 'Dupont Marie', u2: 'Amar Sophie' })[id] ?? 'Agent inconnu'
  const section = sectionHeuresSup({
    heuresSup, nomDe, debut: '2026-09-01', fin: '2026-09-30',
  })

  it('ne retient que les heures validées du mois', () => {
    expect(section.valides).toBe(2)
    expect(section.heures).toBe(6)
    expect(section.enAttente).toBe(1)
    expect(section.lignes.join('\n')).not.toMatch(/02\/10|2026-10-02/)
  })

  it('détaille jour par jour', () => {
    expect(section.lignes[0]).toBe('Dupont Marie — 6 h : 2026-09-09 (4 h), 2026-09-23 (2 h)')
  })

  it('le dit quand il n\'y a rien', () => {
    const vide = sectionHeuresSup({ heuresSup: [], debut: '2026-09-01', fin: '2026-09-30' })
    expect(vide.lignes).toEqual(['Aucune heure supplémentaire validée sur ce mois.'])
    expect(vide.nbAgents).toBe(0)
  })
})

describe('fenêtre de correction', () => {
  it('court jusqu\'à la fin du mois SUIVANT le jour concerné', () => {
    expect(finFenetre('2026-09-14')).toBe('2026-10-31')
    expect(finFenetre('2026-09-30')).toBe('2026-10-31')
    expect(finFenetre('2026-01-15')).toBe('2026-02-28')   // année non bissextile
    expect(finFenetre('2026-12-03')).toBe('2027-01-31')   // passage d'année
  })

  it('n\'est jamais déjà fermée pour un jour de fin de mois', () => {
    // Heures faites le 30/09, déclarées et refusées le 1er octobre : il reste un mois.
    expect(fenetreOuverte('2026-09-30', '2026-10-01')).toBe(true)
  })

  it('se ferme après la date limite', () => {
    expect(fenetreOuverte('2026-09-14', '2026-10-31')).toBe(true)
    expect(fenetreOuverte('2026-09-14', '2026-11-01')).toBe(false)
  })

  it('ne bloque jamais une PREMIÈRE décision, même très tardive', () => {
    const vieille = { jour: '2026-01-15', statut: 'en_attente' }
    expect(peutRevenirDessus(vieille, { aujourdhui: '2026-12-01' })).toBe(true)
  })

  it('bloque le MAR hors fenêtre mais jamais la gestion', () => {
    const refusee = { jour: '2026-01-15', statut: 'refusee' }
    expect(peutRevenirDessus(refusee, { aujourdhui: '2026-12-01' })).toBe(false)
    expect(peutRevenirDessus(refusee, { aujourdhui: '2026-12-01', estGestion: true })).toBe(true)
    expect(peutRevenirDessus(refusee, { aujourdhui: '2026-02-20' })).toBe(true)
  })
})

describe('recapMensuel', () => {
  const lignes = [
    { jour: '2026-09-09', heures: 4, statut: 'validee' },
    { jour: '2026-09-23', heures: 2, statut: 'validee' },
    { jour: '2026-09-11', heures: 3, statut: 'en_attente' },
    { jour: '2026-09-12', heures: 5, statut: 'refusee' },
    { jour: '2026-10-02', heures: 6, statut: 'validee' },
    { jour: '2025-09-02', heures: 9, statut: 'validee' },   // autre année
  ]
  const recap = recapMensuel(lignes, 2026)

  it('renvoie toujours les 12 mois', () => {
    expect(recap).toHaveLength(12)
    expect(recap[0].libelle).toBe('Janvier')
    expect(recap[0].heuresValidees).toBe(0)
  })

  it('ventile par statut et ignore les autres années', () => {
    const sept = recap[8]
    expect(sept.heuresValidees).toBe(6)
    expect(sept.heuresEnAttente).toBe(3)
    expect(sept.nbRefusees).toBe(1)
    expect(recap[9].heuresValidees).toBe(6)
    // Le refusé ne compte aucune heure : il n'est pas dû.
    expect(sept.heuresValidees + sept.heuresEnAttente).toBe(9)
  })
})
