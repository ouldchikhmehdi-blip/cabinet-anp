import { describe, it, expect } from 'vitest'
import { lignesDepuisTexte, listerIades, genererRecapTexte, genererIcs } from './planningColle'

// Mois collé minimal au format du fichier visuel : 4 colonnes par IADE
// (Matin, Après-midi, Congé/HS, espace) + bloc « Remplaçants ».
const COLS = (cells) => cells.join('\t')
const ROWS = [
  ['Jour', 'Date', 'Cathy', '', '', '', 'Nicolas', '', '', '', 'Remplaçants (jusqu\'à 3)', '', ''],
  ['', '', 'Matin', 'Après-midi', 'Congé / HS', '', 'Matin', 'Après-midi', 'Congé / HS', '', '1', '2', '3'],
  ['Jeudi', '01/01/2026', '8h-18h B', '', '', '', 'OFF', '', '', '', '', '', ''],
  ['Mercredi', '07/01/2026', '7h30-17h30 A', '', '', '', '8h-18h B', '', 'Congé', '', '', '', ''],
  ['Jeudi', '08/01/2026', 'OFF', '', '', '', '10h-20h Viscérale', '', '', '', 'FR Daunay', '', ''],
  ['Vendredi', '09/01/2026', 'OFF', '', '+5h', '', '8h-18h B', '', '', '', '', '', ''],
  ['Jeudi', '22/01/2026', '7h30-13h A', '13h30-17h30 B', '', '', 'OFF', '', '', '', '', '', ''],
  ['Mercredi', '28/01/2026', '8h-18h B', '', '', '', '8h-18h B', '', 'Congé', '', 'FR Daunay', '', ''],
]
const TEXTE = ROWS.map(COLS).join('\n')
const rows = lignesDepuisTexte(TEXTE)

describe('planningColle — lecture de l\'en-tête', () => {
  it('lit les noms d\'IADE dans l\'en-tête, pas en dur', () => {
    expect(listerIades(rows)).toEqual(['Cathy', 'Nicolas'])
  })
})

describe('planningColle — récap gestion', () => {
  const recap = genererRecapTexte(rows)

  it('liste les congés avec leur couverture du même jour', () => {
    expect(recap).toContain('- Nicolas — mercredi 07/01/2026  →  aucune couverture repérée ce jour')
    expect(recap).toContain('- Nicolas — mercredi 28/01/2026  →  remplaçant : FR Daunay')
  })

  it('sépare les remplaçants des jours SANS congé', () => {
    expect(recap).toContain('- jeudi 08/01/2026 : FR Daunay')
    // le 28/01 est rattaché au congé, pas répété ici
    expect(recap).not.toContain('- mercredi 28/01/2026 : FR Daunay')
  })

  it('remonte les heures sup', () => {
    expect(recap).toContain('- vendredi 09/01/2026 : Cathy (+5h)')
  })
})

describe('planningColle — agenda .ics d\'un IADE', () => {
  it('journée pleine = 1 événement, journée coupée = 2, OFF = rien', () => {
    const { ics, nom, nbEvents } = genererIcs(rows, 'Cathy')
    expect(nom).toBe('Cathy')
    // 01/01 pleine
    expect(ics).toContain('DTSTART:20260101T080000')
    expect(ics).toContain('DTEND:20260101T180000')
    // 22/01 coupée
    expect(ics).toContain('DTSTART:20260122T073000')
    expect(ics).toContain('DTSTART:20260122T133000')
    // 08/01 OFF -> aucun événement ce jour
    expect(ics).not.toContain('20260108T')
    // Cathy n'a aucun congé
    expect(ics).not.toContain('SUMMARY:Congé')
    expect(nbEvents).toBeGreaterThan(0)
  })

  it('un jour de congé = journée entière « Congé », sans poste de travail', () => {
    const { ics } = genererIcs(rows, 'Nicolas')
    // 07/01 et 28/01 : Congé toute la journée
    expect(ics).toContain('DTSTART;VALUE=DATE:20260107')
    expect(ics).toMatch(/DTSTART;VALUE=DATE:20260107[\s\S]*SUMMARY:Congé/)
    expect(ics).toMatch(/DTSTART;VALUE=DATE:20260128[\s\S]*SUMMARY:Congé/)
    // le poste « Bloc B » affiché ces jours-là (pour le remplaçant) ne doit PAS
    // devenir un événement de travail de Nicolas
    expect(ics).not.toMatch(/20260107T\d{6}/)
    expect(ics).not.toMatch(/20260128T\d{6}/)
  })

  it('nom introuvable -> erreur claire avec la liste des noms', () => {
    expect(() => genererIcs(rows, 'Zorro')).toThrow(/introuvable.*Cathy, Nicolas/)
  })
})
