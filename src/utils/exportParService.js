// ============================================================
// exportParService.js — export Excel (.xlsx) de la vue « Planning par service » :
// lignes = jours, colonnes = postes (SARM 1 … USC/Réa), cellules = médecin(s) en nom complet.
// Construit à partir de la table renvoyée par parserCollageParService (planningParService.js).
// ============================================================
import ExcelJS from 'exceljs'

const ARGB = {
  weekend: 'FFD9D9D9', // gris (week-end / férié)
  header: 'FFFF99CC',  // rose (en-tête)
}
const BORDURE = 'FFBFBFBF'
const centre = { vertical: 'middle', horizontal: 'center' }

function solid(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}
function bordures() {
  const b = { style: 'thin', color: { argb: BORDURE } }
  return { top: b, left: b, bottom: b, right: b }
}

async function telecharger(workbook, nomFichier) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}

// table = { postes:[...], lignes:[{ dateLabel, estWeekend, estFerie, parPoste:{poste:txt} }] }
export async function exporterParServiceExcel(annee, table, { plageDebut, plageFin } = {}) {
  const wb = new ExcelJS.Workbook()
  const suffixe = (plageDebut != null && plageFin != null) ? ` S${plageDebut}-S${plageFin}` : ''
  const ws = wb.addWorksheet(`Par service${suffixe}`.slice(0, 31))

  const postes = table?.postes ?? []
  // En-tête.
  const entete = ws.addRow(['Date', ...postes])
  entete.eachCell({ includeEmpty: true }, cell => {
    cell.fill = solid(ARGB.header)
    cell.font = { name: 'Calibri', size: 11, bold: true }
    cell.alignment = centre
    cell.border = bordures()
  })

  // Lignes jour par jour.
  for (const lg of (table?.lignes ?? [])) {
    const row = ws.addRow([lg.dateLabel, ...postes.map(p => lg.parPoste?.[p]?.texte ?? '')])
    const grise = lg.estWeekend || lg.estFerie
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.alignment = centre
      cell.border = bordures()
      if (grise) cell.fill = solid(ARGB.weekend)
      // Postes en colonnes 2…N : « Remplaçant » en rouge gras pour ressortir.
      const poste = postes[col - 2]
      cell.font = (poste && lg.parPoste?.[poste]?.estRemplacant)
        ? { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFF0000' } }
        : { name: 'Calibri', size: 11 }
    })
  }

  // Largeurs de colonnes.
  ws.getColumn(1).width = 26
  for (let i = 0; i < postes.length; i++) ws.getColumn(i + 2).width = 20

  const nomFichier = `Planning_par_service_${annee}${suffixe ? `_S${plageDebut}-S${plageFin}` : ''}.xlsx`
  await telecharger(wb, nomFichier)
}
