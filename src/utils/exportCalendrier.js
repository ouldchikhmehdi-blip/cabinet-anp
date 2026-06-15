// ============================================================
// exportCalendrier.js — export Excel (.xlsx) de la Base calendrier (Étape 0),
// au format habituel du faiseur (jours en lignes, 8 associés en colonnes).
// Couleurs gérées via ExcelJS (la lib xlsx communautaire ne sait pas colorer).
// ============================================================
import ExcelJS from 'exceljs'
import { listerSemaines, joursFeriesFR, formatISO, formatDateLongueFR, moisAnneeFR } from './calendrier'
import { ASSOCIES } from '../data/associes'

const JOUR_MS = 24 * 60 * 60 * 1000

// Rôle fixe lun/mar/mer (§3) ; jeu/ven/sam/dim viennent de la base saisie.
const FIXE = { 0: 'A', 1: 'G', 2: 'A' }
const CLE = { 3: 'jeu', 4: 'ven', 5: 'sam', 6: 'dim' }
const DEFAUT = { jeu: 'G', ven: 'A', sam: 'A', dim: 'G' }

// Fonds ARGB (FF = opaque).
const ARGB = {
  garde: 'FFFFFF00',     // jaune
  astreinte: 'FFFFC000', // orange
  weekend: 'FFD9D9D9',   // gris
  ferie: 'FF92D050',     // vert
  header: 'FFFF99CC',    // rose
  vacances: 'FFFFFF00',  // jaune (libellé de date)
}
const BORDURE = 'FFBFBFBF'

function solid(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function roleDuJour(data, num, offset) {
  if (offset <= 2) return FIXE[offset]
  return data.semaines?.[num]?.[CLE[offset]] ?? DEFAUT[CLE[offset]]
}

// Déclenche le téléchargement du classeur.
async function telecharger(workbook, nomFichier) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}

export async function exporterCalendrierExcel(annee, data, objectifs = null) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(`Calendrier ${annee}`)

  // Largeurs (unité Excel = nb de caractères, comme la boîte « Largeur de colonne »).
  // Date | 8 associés | Date | Groupe
  ws.columns = [
    { width: 35 },
    ...ASSOCIES.map(() => ({ width: 24 })),
    { width: 35 },
    { width: 8 },
  ]

  const feries = {}
  for (const f of joursFeriesFR(annee)) feries[f.iso] = f.nom
  const vacances = new Set(data.vacancesScolaires ?? [])

  const NB_COL = 1 + ASSOCIES.length + 1 + 1 // 11
  const bordures = () => ({
    top: { style: 'thin', color: { argb: BORDURE } },
    left: { style: 'thin', color: { argb: BORDURE } },
    bottom: { style: 'thin', color: { argb: BORDURE } },
    right: { style: 'thin', color: { argb: BORDURE } },
  })
  const centre = { vertical: 'middle', horizontal: 'center' }

  function ligneEntete(date) {
    const libMois = moisAnneeFR(date)
    const row = ws.addRow([libMois, ...ASSOCIES, libMois, 'G/A'])
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = bordures()
      cell.alignment = centre
      cell.font = { name: 'Calibri', bold: true, size: 11 }
      // Initiales sur fond rose ; colonnes date plus sobres.
      if (col >= 2 && col <= 1 + ASSOCIES.length) cell.fill = solid(ARGB.header)
      else cell.fill = solid('FFF2F2F2')
    })
  }

  let moisPrec = null
  for (const sem of listerSemaines(annee)) {
    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(sem.lundi.getTime() + offset * JOUR_MS)
      const mois = date.getUTCMonth()
      if (mois !== moisPrec) {
        ligneEntete(date)
        moisPrec = mois
      }

      const iso = formatISO(date)
      const estWeekend = offset >= 5
      const estFerie = !!feries[iso]
      const enVac = vacances.has(sem.num)
      const role = roleDuJour(data, sem.num, offset)
      const dateLong = formatDateLongueFR(date)

      // Colonne G/A : on n'affiche que vendredi / samedi / dimanche, plus le jeudi
      // UNIQUEMENT s'il est d'astreinte (cas exceptionnel). Lun/mar/mer et jeudi de
      // garde restent vides (redondant, connu — évite de surcharger la colonne).
      let groupeAffiche = ''
      if (offset >= 4) groupeAffiche = role
      else if (offset === 3 && role === 'A') groupeAffiche = 'A'

      const row = ws.addRow([
        dateLong,
        ...ASSOCIES.map(() => ''),
        dateLong,
        groupeAffiche,
      ])

      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = bordures()
        cell.alignment = centre
        cell.font = { name: 'Calibri', size: 11 }

        const estDate = col === 1 || col === NB_COL - 1
        const estAssocie = col >= 2 && col <= 1 + ASSOCIES.length
        const estGroupe = col === NB_COL

        if (estDate) {
          if (estFerie) cell.fill = solid(ARGB.ferie)
          else if (estWeekend) cell.fill = solid(ARGB.weekend)
          else if (enVac) cell.fill = solid(ARGB.vacances)
        } else if (estAssocie) {
          if (estWeekend) cell.fill = solid(ARGB.weekend)
        } else if (estGroupe) {
          if (groupeAffiche === 'G') cell.fill = solid(ARGB.garde)
          else if (groupeAffiche === 'A') cell.fill = solid(ARGB.astreinte)
          cell.font = { name: 'Calibri', size: 11, bold: true }
        }
      })

      if (estFerie) {
        // Note le nom du férié en commentaire sur la cellule date de gauche.
        row.getCell(1).note = feries[iso]
      }
    }
  }

  // ── Bloc « Objectifs » en bas (cf. PLANNING.md §16, photo « Objectifs 2025 ») ──
  // Aligné sur les colonnes du calendrier : libellé | 8 associés | libellé.
  if (objectifs?.lignes?.length) {
    ws.addRow([]) // ligne vide de séparation
    ws.addRow([])

    const libObj = `Objectifs ${annee}`
    const entete = ws.addRow([libObj, ...ASSOCIES, libObj])
    entete.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = bordures()
      cell.alignment = centre
      cell.font = { name: 'Calibri', bold: true, size: 11 }
      if (col >= 2 && col <= 1 + ASSOCIES.length) cell.fill = solid(ARGB.header)
      else cell.fill = solid('FFF2F2F2')
    })

    for (const ligne of objectifs.lignes) {
      const valeurs = ASSOCIES.map(a => {
        const v = objectifs.valeurs?.[a]?.[ligne.id]
        return v == null ? '' : v
      })
      const row = ws.addRow([ligne.label, ...valeurs, ligne.label])
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = bordures()
        cell.alignment = centre
        cell.font = { name: 'Calibri', size: 11 }
      })
    }
  }

  ws.views = [{ state: 'frozen', ySplit: 0, xSplit: 0 }]
  await telecharger(wb, `Base_calendrier_${annee}.xlsx`)
}
