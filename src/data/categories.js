export const TAXONOMIE = [
  { groupe: 'Associés',    sous: ['Rétrocession fixe', 'Rétrocession variable', 'Remboursement de frais associé'] },
  { groupe: 'Remplaçants', sous: ['Remplaçant IADE', 'Remplaçant MAR'] },
  { groupe: 'Salariés',    sous: ['Salarié CDI', 'Salarié CDD'] },
  { groupe: 'Dépenses',    sous: ["Dépense d'exploitation", 'Énergie', 'Loyer', 'Assurances', 'Matériel médical'] },
  { groupe: 'Autre',       sous: ['Autre'] },
]

export const TOUTES_SOUS = TAXONOMIE.flatMap(g => g.sous)
export const CATEGORIES_ASSOCIE = ['Rétrocession fixe', 'Rétrocession variable', 'Remboursement de frais associé']

// Mappe une catégorie (libellé libre) vers son groupe
export const groupeDe = (cat) => {
  if (cat.includes('IADE') || cat.includes('MAR') || cat.includes('Remplaçant')) return 'Remplaçants'
  if (cat.includes('Associé') || cat.includes('Rétrocession')) return 'Associés'
  if (cat.includes('CDI') || cat.includes('CDD') || cat.includes('Salarié')) return 'Salariés'
  if (cat.includes('Dépense') || cat.includes('Énergie') || cat.includes('Loyer') || cat.includes('Assurance') || cat.includes('Matériel')) return 'Dépenses'
  return 'Autre'
}

export const catColor = (cat) => {
  if (cat.includes('IADE')) return { background: '#FAEEDA', color: '#633806' }
  if (cat.includes('MAR')) return { background: '#FAECE7', color: '#712B13' }
  if (cat.includes('Associé') || cat.includes('Rétrocession')) return { background: '#EEEDFE', color: '#3C3489' }
  if (cat.includes('CDI') || cat.includes('CDD') || cat.includes('Salarié')) return { background: '#E1F5EE', color: '#085041' }
  return { background: '#F1EFE8', color: '#444441' }
}
