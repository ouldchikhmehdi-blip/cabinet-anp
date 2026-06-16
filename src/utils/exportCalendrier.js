// ============================================================
// exportCalendrier.js — export Excel (.xlsx) de la Base calendrier (Étape 0),
// au format habituel du faiseur (jours en lignes, 8 associés en colonnes).
// Couleurs gérées via ExcelJS (la lib xlsx communautaire ne sait pas colorer).
// ============================================================
import ExcelJS from 'exceljs'
import { listerSemaines, semainesDansPlage, joursFeriesFR, formatDateLongueFR, moisAnneeFR } from './calendrier'
import { ASSOCIES } from '../data/associes'
import {
  COULEURS_GRILLE, ctxJour, celluleAssocieJour, celluleRemplacantJour, celluleGroupeJour, celluleDateJour,
} from './grilleSemaine'

const JOUR_MS = 24 * 60 * 60 * 1000

// Fonds ARGB (FF = opaque).
const ARGB = {
  garde: 'FFFFFF00',     // jaune
  astreinte: 'FFFFC000', // orange
  weekend: 'FFD9D9D9',   // gris
  ferie: 'FF92D050',     // vert
  header: 'FFFF99CC',    // rose
  vacances: 'FFFFFF00',  // jaune (libellé de date des semaines scolaires)
  conge: 'FF00B0F0',     // bleu vif (associé en vacances, §14 — couleur du fichier d'origine)
}
const BORDURE = 'FFBFBFBF'

function solid(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
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

// periode = { debut, fin } (numéros de semaine ISO) borne l'export à cette plage (étapes
// Week-ends / Vacances / Réa). null → année entière (Base calendrier / Objectifs).
export async function exporterCalendrierExcel(annee, data, objectifs = null, weekends = null, conges = null, rea = null, periode = null, tramesParSemaine = null, affectationsSemaine = null, bilan = null, recupParSemaine = null, remplacantsSemaine = null, compteurs = null) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(`Calendrier ${annee}`)

  // Nombre de colonnes « Remplaçant » à droite (max de remplaçants sur les semaines fournies).
  const longueursRempl = Object.values(remplacantsSemaine ?? {}).map(a => a?.length ?? 0)
  const nbRempl = longueursRempl.length ? Math.max(0, ...longueursRempl) : 0
  const enteteRempl = Array.from({ length: nbRempl }, (_, k) => (nbRempl > 1 ? `Remplaçant ${k + 1}` : 'Remplaçant'))

  // Largeurs (unité Excel = nb de caractères, comme la boîte « Largeur de colonne »).
  // Date | 8 associés | Date | Groupe | Remplaçant(s)
  ws.columns = [
    { width: 35 },
    ...ASSOCIES.map(() => ({ width: 24 })),
    { width: 35 },
    { width: 8 },
    ...Array.from({ length: nbRempl }, () => ({ width: 24 })),
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
    const row = ws.addRow([libMois, ...ASSOCIES, libMois, 'G/A', ...enteteRempl])
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = bordures()
      cell.alignment = centre
      cell.font = { name: 'Calibri', bold: true, size: 11 }
      // Initiales sur fond rose ; colonnes date plus sobres.
      if (col >= 2 && col <= 1 + ASSOCIES.length) cell.fill = solid(ARGB.header)
      else cell.fill = solid('FFF2F2F2')
    })
  }

  const semaines = periode ? semainesDansPlage(annee, periode.debut, periode.fin) : listerSemaines(annee)
  let moisPrec = null
  for (const sem of semaines) {
    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(sem.lundi.getTime() + offset * JOUR_MS)
      const mois = date.getUTCMonth()
      if (mois !== moisPrec) {
        ligneEntete(date)
        moisPrec = mois
      }

      // Modèle de cellule (texte + couleur + gras) calculé par la logique PARTAGÉE (grilleSemaine.js),
      // pour que l'aperçu à l'écran soit strictement identique à cet export.
      const ctx = ctxJour({
        data, sem, offset, feries, vacancesScolaires: vacances,
        weekendAff: weekends, reaAff: rea, congesParSemaine: conges,
        affectationsSemaine, recupParSemaine, compteurs,
      })
      const dateLong = formatDateLongueFR(date)

      const cellulesAssocies = ASSOCIES.map(a => celluleAssocieJour(a, ctx))
      const cellulesRempl = Array.from({ length: nbRempl }, (_, k) =>
        celluleRemplacantJour(remplacantsSemaine?.[sem.num]?.[k], ctx))
      const groupe = celluleGroupeJour(ctx)
      const dateCell = celluleDateJour(ctx)

      const row = ws.addRow([
        dateLong,
        ...cellulesAssocies.map(c => c.texte),
        dateLong,
        groupe.texte,
        ...cellulesRempl.map(c => c.texte),
      ])

      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = bordures()
        cell.alignment = centre
        cell.font = { name: 'Calibri', size: 11 }

        const estDate = col === 1 || col === NB_COL - 1
        const estAssocie = col >= 2 && col <= 1 + ASSOCIES.length
        const estGroupe = col === NB_COL
        const estRempl = col > NB_COL && col <= NB_COL + nbRempl

        let modele = null
        if (estDate) modele = dateCell
        else if (estAssocie) modele = cellulesAssocies[col - 2]
        else if (estGroupe) modele = groupe
        else if (estRempl) modele = cellulesRempl[col - NB_COL - 1]

        if (modele?.fond) cell.fill = solid('FF' + COULEURS_GRILLE[modele.fond])
        // Cases de service en gras ; la colonne G/A reste en gras comme avant.
        if (modele?.gras || estGroupe) cell.font = { name: 'Calibri', size: 11, bold: true }
      })

      if (ctx.estFerie) {
        // Note le nom du férié en commentaire sur la cellule date de gauche.
        row.getCell(1).note = feries[ctx.iso]
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

  // ── Bloc « Réalisé à ce stade » (étape En semaine) : cumul annuel par associé, en regard des objectifs ──
  if (bilan) {
    ws.addRow([])
    ws.addRow([])
    const libBilan = `Réalisé à ce stade (année ${annee})`
    const entete = ws.addRow([libBilan, ...ASSOCIES, libBilan])
    entete.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = bordures()
      cell.alignment = centre
      cell.font = { name: 'Calibri', bold: true, size: 11 }
      if (col >= 2 && col <= 1 + ASSOCIES.length) cell.fill = solid(ARGB.header)
      else cell.fill = solid('FFF2F2F2')
    })
    const lignesBilan = [
      { cle: 'gWeekend', label: 'G week-end' },
      { cle: 'aVendredi', label: 'A vendredi' },
      { cle: 'gVendredi', label: 'G vendredi' },
      { cle: 'rea', label: 'Réa' },
      { cle: 'gardeSemaine', label: 'Gardes de semaine' },
      { cle: 'vacances', label: 'Semaines de vacances' },
      { cle: 'recupJF', label: 'Récup jours fériés' },
    ]
    for (const lg of lignesBilan) {
      const valeurs = ASSOCIES.map(a => bilan[a]?.[lg.cle] ?? 0)
      const row = ws.addRow([lg.label, ...valeurs, lg.label])
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = bordures()
        cell.alignment = centre
        cell.font = { name: 'Calibri', size: 11 }
      })
    }
  }

  ws.views = [{ state: 'frozen', ySplit: 0, xSplit: 0 }]

  // ── Feuille « Trames par semaine » (étape En semaine) ──
  // Liste la trame appliquée à chaque semaine ; repère celles ≠ principale et à arbitrer.
  if (Array.isArray(tramesParSemaine) && tramesParSemaine.length) {
    const ws2 = wb.addWorksheet('Trames par semaine')
    ws2.columns = [{ width: 26 }, { width: 30 }, { width: 18 }, { width: 32 }]
    const entete = ws2.addRow(['Semaine', 'Trame appliquée', 'Type', 'À arbitrer'])
    entete.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = bordures()
      cell.alignment = centre
      cell.font = { name: 'Calibri', bold: true, size: 11 }
      cell.fill = solid(ARGB.header)
    })
    for (const t of tramesParSemaine) {
      const row = ws2.addRow([
        t.label ?? '',
        t.trame ?? '—',
        t.specifique ? 'Trame spécifique' : 'Principale',
        t.arbitrer ? (t.motif || 'à arbitrer') : '',
      ])
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = bordures()
        cell.alignment = centre
        cell.font = { name: 'Calibri', size: 11 }
      })
    }
  }

  const nomFichier = periode
    ? `Planning_${annee}_S${periode.debut}-S${periode.fin}.xlsx`
    : `Base_calendrier_${annee}.xlsx`
  await telecharger(wb, nomFichier)
}
