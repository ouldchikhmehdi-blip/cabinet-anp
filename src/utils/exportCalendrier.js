// ============================================================
// exportCalendrier.js — export Excel (.xlsx) de la Base calendrier (Étape 0),
// au format habituel du faiseur (jours en lignes, 8 associés en colonnes).
// Couleurs gérées via ExcelJS (la lib xlsx communautaire ne sait pas colorer).
// ============================================================
import ExcelJS from 'exceljs'
import { listerSemaines, semainesDansPlage, joursFeriesFR, formatDateLongueFR, moisAnneeFR, parseISO, numeroSemaineISO } from './calendrier'
import { ASSOCIES } from '../data/associes'
import {
  COULEURS_GRILLE, ctxJour, celluleAssocieJour, celluleRemplacantJour, celluleGroupeJour, celluleDateJour,
} from './grilleSemaine'
import { groupeJourNoel } from './noel'

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

// ── Styles partagés (réutilisés par le calendrier, le bloc Noël et le bilan) ──
const NB_COL = 1 + ASSOCIES.length + 1 + 1 // Date | 8 associés | Date | G/A = 11
const centre = { vertical: 'middle', horizontal: 'center' }
const bordures = () => ({
  top: { style: 'thin', color: { argb: BORDURE } },
  left: { style: 'thin', color: { argb: BORDURE } },
  bottom: { style: 'thin', color: { argb: BORDURE } },
  right: { style: 'thin', color: { argb: BORDURE } },
})

// Ligne d'en-tête « initiales » (mois | 8 associés | mois | G/A | Remplaçant(s)).
function ligneEnteteInitiales(ws, date, enteteRempl = []) {
  const libMois = moisAnneeFR(date)
  const row = ws.addRow([libMois, ...ASSOCIES, libMois, 'G/A', ...enteteRempl])
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.border = bordures()
    cell.alignment = centre
    cell.font = { name: 'Calibri', bold: true, size: 11 }
    if (col >= 2 && col <= 1 + ASSOCIES.length) cell.fill = solid(ARGB.header)
    else cell.fill = solid('FFF2F2F2')
  })
}

// Bloc « Noël » (15 jours + week-ends encadrants, fournis tels quels) au format du calendrier.
function ecrireBlocNoel(ws, annee, joursNoel, enteteRempl = []) {
  if (!joursNoel.length) return
  const feriesNoel = {}
  for (const f of [...joursFeriesFR(annee), ...joursFeriesFR(annee + 1)]) feriesNoel[f.iso] = f.nom
  ws.addRow([])
  const titre = ws.addRow([`Noël ${annee}`])
  titre.getCell(1).font = { name: 'Calibri', bold: true, size: 12 }
  ligneEnteteInitiales(ws, parseISO(joursNoel[0].iso), enteteRempl)
  for (const j of joursNoel) {
    const date = parseISO(j.iso)
    const dow = date.getUTCDay() // 0=dim … 6=sam
    const estFerie = !!feriesNoel[j.iso]
    const estWeekend = dow === 0 || dow === 6
    const cellulesAssocies = ASSOCIES.map(ini => {
      const c = j.parAssocie?.[ini]
      const poste = (c?.poste ?? '').trim()
      const role = c?.role ?? null
      const fond = role === 'G' ? 'garde' : role === 'A' ? 'astreinte' : role === 'C' ? 'conge' : null
      return { texte: poste, fond, gras: role === 'G' || role === 'A' }
    })
    const groupeTxt = groupeJourNoel(j)
    const dateFond = estFerie ? 'ferie' : estWeekend ? 'weekend' : null
    const dateLong = formatDateLongueFR(date)
    const row = ws.addRow([
      dateLong,
      ...cellulesAssocies.map(c => c.texte),
      dateLong,
      groupeTxt,
      ...enteteRempl.map(() => ''),
    ])
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = bordures()
      cell.alignment = centre
      cell.font = { name: 'Calibri', size: 11 }
      const estDate = col === 1 || col === NB_COL - 1
      const estAssocie = col >= 2 && col <= 1 + ASSOCIES.length
      const estGroupe = col === NB_COL
      let modele = null
      if (estDate) modele = dateFond ? { fond: dateFond } : null
      else if (estAssocie) modele = cellulesAssocies[col - 2]
      else if (estGroupe) modele = { fond: groupeTxt === 'G' ? 'garde' : groupeTxt === 'A' ? 'astreinte' : null }
      if (modele?.fond) cell.fill = solid('FF' + COULEURS_GRILLE[modele.fond])
      if (modele?.gras || estGroupe) cell.font = { name: 'Calibri', size: 11, bold: true }
    })
    if (estFerie) row.getCell(1).note = feriesNoel[j.iso]
  }
}

// Bloc « Réalisé à ce stade » : cumul par associé (G week-end, A/G vendredi, réa, gardes de semaine,
// vacances, récup JF). Les valeurs absentes sont rendues à 0 (colonnes/ lignes toujours présentes).
function ecrireBilan(ws, annee, bilan) {
  if (!bilan) return
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

// periode = { debut, fin } (numéros de semaine ISO) borne l'export à cette plage (étapes
// Week-ends / Vacances / Réa). null → année entière (Base calendrier / Objectifs).
// Construit le classeur et renvoie { wb, nomFichier } (sans télécharger).
async function construireClasseur(annee, data, objectifs = null, weekends = null, conges = null, rea = null, periode = null, tramesParSemaine = null, affectationsSemaine = null, bilan = null, recupParSemaine = null, remplacantsSemaine = null, compteurs = null, noelData = null) {
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

  const ligneEntete = (date) => ligneEnteteInitiales(ws, date, enteteRempl)

  // Jours de Noël (grille fournie telle quelle) triés par date + semaines ISO couvertes : ces semaines
  // sont EXCLUES du calendrier normal (rendues dans le bloc « Noël » plus bas) → pas de doublon.
  const joursNoel = (noelData?.jours ?? []).slice().sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0))
  const semainesNoel = new Set(joursNoel.map(j => numeroSemaineISO(parseISO(j.iso))))

  const semaines = (periode ? semainesDansPlage(annee, periode.debut, periode.fin) : listerSemaines(annee))
    .filter(s => !semainesNoel.has(s.num))
  let moisPrec = null
  for (const sem of semaines) {
    // Ligne d'en-tête (initiales) à la FRONTIÈRE de semaine : juste avant le lundi, quand le mois du lundi
    // change (≈ toutes les 4 semaines). Jamais au milieu d'une semaine ni d'un week-end.
    const moisLundi = sem.lundi.getUTCMonth()
    if (moisLundi !== moisPrec) {
      ligneEntete(sem.lundi)
      moisPrec = moisLundi
    }
    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(sem.lundi.getTime() + offset * JOUR_MS)

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

  // ── Bloc « Noël » (15 jours + week-ends encadrants, fournis tels quels) au même format que le calendrier ──
  ecrireBlocNoel(ws, annee, joursNoel, enteteRempl)

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
  ecrireBilan(ws, annee, bilan)

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
  return { wb, nomFichier }
}

// Export classique : construit le classeur et déclenche le téléchargement.
export async function exporterCalendrierExcel(...args) {
  const { wb, nomFichier } = await construireClasseur(...args)
  await telecharger(wb, nomFichier)
}

// Variante pour l'archivage : renvoie le buffer .xlsx (à uploader vers Supabase Storage) + le nom.
export async function genererClasseurBuffer(...args) {
  const { wb, nomFichier } = await construireClasseur(...args)
  const buffer = await wb.xlsx.writeBuffer()
  return { buffer, nomFichier }
}

// Export autonome de l'onglet Noël : la grille de Noël (jours fournis tels quels) + le tableau
// « Réalisé à ce stade » alimenté par les gardes/astreintes de Noël (bilanNoel). Zéros conservés.
export async function exporterNoelExcel(annee, noelData, bilan = null) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(`Noël ${annee}`)
  // Mêmes largeurs que le calendrier (sans colonnes remplaçant) : Date | 8 associés | Date | G/A.
  ws.columns = [{ width: 35 }, ...ASSOCIES.map(() => ({ width: 24 })), { width: 35 }, { width: 8 }]

  const joursNoel = (noelData?.jours ?? []).slice().sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0))
  ecrireBlocNoel(ws, annee, joursNoel, [])
  ecrireBilan(ws, annee, bilan)

  await telecharger(wb, `Noel_${annee}.xlsx`)
}
