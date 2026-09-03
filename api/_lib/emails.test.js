import { describe, it, expect } from 'vitest'
import {
  jourSeul, dateDepot, dateDecision,
  emailCongesRecus, emailCongesDecides, emailHsRecues, emailHsDecidees,
} from './emails.js'

const conge = (jour, extra = {}) => ({
  id: jour, user_id: 'u1', jour, type_conge: 'cp', lot: 'L1',
  statut: 'en_attente', motif_reponse: null, created_at: null, decide_le: null, ...extra,
})

const hs = (jour, heures, extra = {}) => ({
  id: jour, user_id: 'u1', jour, heures, commentaire: null,
  statut: 'en_attente', motif_reponse: null, created_at: null, decide_le: null, ...extra,
})

describe('horodatage des demandes', () => {
  it('donne le jour, jamais l\'heure', () => {
    expect(jourSeul('2026-09-03T14:32:11Z')).toBe('jeudi 03 septembre 2026')
  })

  it('date en heure de Paris, pas en UTC', () => {
    // 1 h du matin à Paris en été = 23 h UTC la veille. Une demande déposée dans
    // la nuit ne doit pas être datée du jour précédent.
    expect(jourSeul('2026-09-02T23:30:00Z')).toBe('jeudi 03 septembre 2026')
  })

  it('ne fabrique pas de date quand il n\'y en a pas', () => {
    expect(jourSeul(null)).toBe(null)
    expect(jourSeul('')).toBe(null)
    expect(jourSeul('pas une date')).toBe(null)
  })

  it('retient le premier dépôt et la dernière décision', () => {
    const rows = [
      conge('2026-10-12', { created_at: '2026-09-03T09:00:00Z', decide_le: '2026-09-05T08:00:00Z' }),
      conge('2026-10-13', { created_at: '2026-09-01T09:00:00Z', decide_le: '2026-09-07T08:00:00Z' }),
    ]
    expect(dateDepot(rows)).toBe('mardi 01 septembre 2026')
    expect(dateDecision(rows)).toBe('lundi 07 septembre 2026')
  })

  it('reste muet sur un lot sans horodatage', () => {
    expect(dateDepot([conge('2026-10-12')])).toBe(null)
    expect(dateDecision([])).toBe(null)
  })
})

describe('accusé de réception d\'une demande de congé', () => {
  const rows = [conge('2026-10-12', { created_at: '2026-09-03T09:00:00Z' })]

  it('date la demande dans le corps du message', () => {
    const m = emailCongesRecus({ agentNom: 'Marion', rows, lien: 'https://x.fr' })
    expect(m.subject).toMatch(/bien reçue/)
    expect(m.html).toContain('jeudi 03 septembre 2026')
    expect(m.text).toContain('Demande déposée le : jeudi 03 septembre 2026')
  })

  it('dit que la demande est en attente', () => {
    const m = emailCongesRecus({ agentNom: 'Marion', rows, lien: '' })
    expect(m.text).toMatch(/en attente/)
  })

  it('ne montre pas d\'encadré vide sans horodatage', () => {
    const m = emailCongesRecus({ agentNom: 'Marion', rows: [conge('2026-10-12')], lien: '' })
    expect(m.text).not.toMatch(/déposée le/)
  })
})

describe('réponse à une demande de congé', () => {
  it('porte les deux dates : dépôt et décision', () => {
    const rows = [conge('2026-10-12', {
      statut: 'validee', created_at: '2026-09-03T09:00:00Z', decide_le: '2026-09-05T16:00:00Z',
    })]
    const m = emailCongesDecides({ agentNom: 'Marion', rows, statut: 'validee', motif: null, lien: '' })
    expect(m.text).toContain('Demande déposée le : jeudi 03 septembre 2026')
    expect(m.text).toContain('Validée le : samedi 05 septembre 2026')
  })

  it('dit « Réponse du » sur un refus, et garde le motif', () => {
    const rows = [conge('2026-10-12', {
      statut: 'refusee', created_at: '2026-09-03T09:00:00Z', decide_le: '2026-09-05T16:00:00Z',
    })]
    const m = emailCongesDecides({ agentNom: 'Marion', rows, statut: 'refusee', motif: 'Effectif trop juste', lien: '' })
    expect(m.text).toContain('Réponse du : samedi 05 septembre 2026')
    expect(m.text).toContain('Effectif trop juste')
  })
})

describe('accusé de réception d\'une déclaration d\'heures sup', () => {
  const rows = [hs('2026-10-12', 5, { created_at: '2026-09-03T09:00:00Z' })]

  it('date la déclaration et nomme le MAR destinataire', () => {
    const m = emailHsRecues({ agentNom: 'Marion', rows, marNom: 'Dr Ould-Chikh', lien: '' })
    expect(m.subject).toContain('5 h')
    expect(m.text).toContain('Déclaration déposée le : jeudi 03 septembre 2026')
    expect(m.text).toContain('Transmise à : Dr Ould-Chikh')
  })

  it('reste correct quand le MAR n\'est pas connu', () => {
    const m = emailHsRecues({ agentNom: 'Marion', rows, marNom: null, lien: '' })
    expect(m.text).not.toMatch(/Transmise à/)
    expect(m.text).toMatch(/en attente/)
  })
})

describe('réponse à une déclaration d\'heures sup', () => {
  it('porte les deux dates', () => {
    const rows = [hs('2026-10-12', 5, {
      statut: 'validee', created_at: '2026-09-03T09:00:00Z', decide_le: '2026-09-04T07:00:00Z',
    })]
    const m = emailHsDecidees({ agentNom: 'Marion', rows, statut: 'validee', motif: null, lien: '' })
    expect(m.text).toContain('Déclaration déposée le : jeudi 03 septembre 2026')
    expect(m.text).toContain('Validée le : vendredi 04 septembre 2026')
  })
})
