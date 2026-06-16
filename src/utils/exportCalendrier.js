// ============================================================
// exportCalendrier.js — export Excel (.xlsx) de la Base calendrier (Étape 0),
// au format habituel du faiseur (jours en lignes, 8 associés en colonnes).
// Couleurs gérées via ExcelJS (la lib xlsx communautaire ne sait pas colorer).
// ============================================================
import ExcelJS from 'exceljs'
import { listerSemaines, semainesDansPlage, joursFeriesFR, formatISO, formatDateLongueFR, moisAnneeFR, typeDuJour } from './calendrier'
import { ASSOCIES } from '../data/associes'
import { JOURS } from './trames'

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

      const iso = formatISO(date)
      const estWeekend = offset >= 5
      const estFerie = !!feries[iso]
      const enVac = vacances.has(sem.num)
      const role = typeDuJour(data, sem.num, offset)
      const dateLong = formatDateLongueFR(date)

      // Colonne G/A : on n'affiche que vendredi / samedi / dimanche, plus le jeudi
      // UNIQUEMENT s'il est d'astreinte (cas exceptionnel). Lun/mar/mer et jeudi de
      // garde restent vides (redondant, connu — évite de surcharger la colonne).
      let groupeAffiche = ''
      if (offset >= 4) groupeAffiche = role
      else if (offset === 3 && role === 'A') groupeAffiche = 'A'

      // Week-end affecté (étape 3) : l'associé prend l'astreinte du samedi et la garde
      // du dimanche → on inscrit le rôle du jour dans SA colonne (samedi/dimanche).
      // Vacances (étape 4) : associés en congé cette semaine → colonne bleue (tous les jours).
      const congesSemaine = conges?.[sem.num] ?? []
      const iniWE = estWeekend ? (weekends?.[sem.num] ?? null) : null
      // Réa (étape 5) : l'associé en réa porte « Réa » du lundi au vendredi (offset 0–4).
      // La vacance prime (poste exclusif) : pas de « Réa » sur une semaine de congé.
      const iniRea = (!estWeekend && offset <= 4) ? (rea?.[sem.num] ?? null) : null
      // n° de garde/astreinte cumulé à afficher dans la case de service ce jour-là (offset).
      const numService = (off) => (off === 4 ? compteurs?.vendredi?.[sem.num] : compteurs?.gardeSem?.[sem.num]?.[off])
      const cellulesAssocies = ASSOCIES.map(a => {
        // Week-end : type + n° du week-end (En semaine), sinon juste le type (autres exports).
        if (iniWE && a === iniWE) return compteurs ? `${role}${compteurs.weekend?.[sem.num] ?? ''}` : role
        // Export « En semaine » : contenu quotidien de la colonne attribuée à l'associé (lun→ven).
        if (affectationsSemaine && !estWeekend) {
          const col = affectationsSemaine[sem.num]?.[a]
          const jour = JOURS[offset]
          // Congé : n° de semaine de vacances sur le lundi (offset 0), sinon vide.
          if (congesSemaine.includes(a)) return offset === 0 ? String(compteurs?.vac?.[sem.num]?.[a] ?? '') : ''
          if (estFerie && col) {
            // Jour férié : de-service → Garde/Astreinte (+ n°) ; sinon qui travaillait → Récup JF-N ; repos → vide.
            if (col.service?.[jour]) { const n = numService(offset); return `${role === 'G' ? 'Garde' : 'Astreinte'}${n != null ? ' ' + n : ''}` }
            if ((col[jour] ?? '').trim()) return `Récup JF-${recupParSemaine?.[sem.num]?.[a] ?? ''}`
            return ''
          }
          if (!col) return ''
          // Réa : « RéaN » sur les jours travaillés de la semaine de réa.
          if (iniRea && a === iniRea && (col[jour] ?? '').trim()) return `Réa${compteurs?.rea?.[sem.num] ?? ''}`
          const poste = col[jour] ?? ''
          if (!poste.trim()) return ''
          // Jour de service travaillé : poste + n° (garde de semaine mardi/jeudi, ou vendredi A/G).
          if (col.service?.[jour]) { const n = numService(offset); if (n != null) return `${poste} ${n}` }
          return poste
        }
        if (iniRea && a === iniRea && !congesSemaine.includes(a)) return 'Réa'
        return ''
      })

      // Colonnes remplaçant (postes lun→ven ; vides le week-end et les jours fériés — pas de bloc).
      const cellulesRempl = Array.from({ length: nbRempl }, (_, k) => {
        if (estWeekend || estFerie) return ''
        const colObj = remplacantsSemaine?.[sem.num]?.[k]
        return colObj ? (colObj[JOURS[offset]] ?? '') : ''
      })

      const row = ws.addRow([
        dateLong,
        ...cellulesAssocies,
        dateLong,
        groupeAffiche,
        ...cellulesRempl,
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
          const assoc = ASSOCIES[col - 2]
          if (estWeekend) {
            // Week-end (toutes étapes) : rôle G/A de la personne affectée (texte « G1 »/« A1 » possible),
            // sinon congé (bleu), sinon grisé.
            if (assoc === iniWE && role === 'G') { cell.fill = solid(ARGB.garde); cell.font = { name: 'Calibri', size: 11, bold: true } }
            else if (assoc === iniWE && role === 'A') { cell.fill = solid(ARGB.astreinte); cell.font = { name: 'Calibri', size: 11, bold: true } }
            else if (congesSemaine.includes(assoc)) cell.fill = solid(ARGB.conge)
            else cell.fill = solid(ARGB.weekend)
          } else if (affectationsSemaine) {
            // Jour ouvré (En semaine) : congé bleu > garde/astreinte si de service > récup vert > repos bleu > poste (blanc).
            const colObj = affectationsSemaine[sem.num]?.[assoc]
            const jour = JOURS[offset]
            if (congesSemaine.includes(assoc)) cell.fill = solid(ARGB.conge)
            else if (colObj?.service?.[jour]) {
              const t = typeDuJour(data, sem.num, offset)
              if (t === 'G') { cell.fill = solid(ARGB.garde); cell.font = { name: 'Calibri', size: 11, bold: true } }
              else if (t === 'A') { cell.fill = solid(ARGB.astreinte); cell.font = { name: 'Calibri', size: 11, bold: true } }
            } else if (estFerie && colObj && (colObj[jour] ?? '').trim()) {
              cell.fill = solid(ARGB.ferie) // récup JF (vert)
            } else if (colObj && !(colObj[jour] ?? '').trim()) {
              cell.fill = solid(ARGB.conge) // repos → bleu
            }
          } else if (congesSemaine.includes(assoc)) {
            // Autres exports (Vacances/Réa) : vacancier en semaine → bleu.
            cell.fill = solid(ARGB.conge)
          }
        } else if (estGroupe) {
          if (groupeAffiche === 'G') cell.fill = solid(ARGB.garde)
          else if (groupeAffiche === 'A') cell.fill = solid(ARGB.astreinte)
          cell.font = { name: 'Calibri', size: 11, bold: true }
        } else if (col > NB_COL && col <= NB_COL + nbRempl) {
          // Colonne remplaçant : garde/astreinte si la colonne est de service ce jour, sinon poste (blanc).
          const colObj = remplacantsSemaine?.[sem.num]?.[col - NB_COL - 1]
          const jour = JOURS[offset]
          if (!estWeekend && !estFerie && colObj?.service?.[jour]) {
            const t = typeDuJour(data, sem.num, offset)
            if (t === 'G') { cell.fill = solid(ARGB.garde); cell.font = { name: 'Calibri', size: 11, bold: true } }
            else if (t === 'A') { cell.fill = solid(ARGB.astreinte); cell.font = { name: 'Calibri', size: 11, bold: true } }
          }
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
