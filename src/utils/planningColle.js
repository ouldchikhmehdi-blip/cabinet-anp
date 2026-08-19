// ============================================================
// planningColle.js — outils « planning IADE collé » (100 % côté client).
//
// Le gestionnaire (ou un IADE) copie tout le tableau d'un mois depuis le fichier
// visuel du planning et le colle : ce module lit ce texte (colonnes séparées par
// des tabulations) et produit soit un RÉCAP congés/remplacements (gestion), soit
// un fichier .ics d'agenda pour un IADE donné (self-service).
//
// Aucune donnée n'est envoyée au serveur : tout est calculé dans le navigateur.
// Rien n'est codé en dur : les noms d'IADE viennent de l'en-tête collé, les noms
// de remplaçants sont lus comme texte libre.
// ============================================================

const RE_DATE = /^\d{2}\/\d{2}\/\d{4}$/
// En-tête du bloc remplaçants : « Remplaçant(s) » / « Remplacements » — assez
// précis pour ne pas confondre avec un prénom d'IADE commençant par « Rempla… ».
const RE_REMPL_HEAD = /^rempla[çc](ant|ement)/i
const RE_HS = /\+?\s*\d+\s*h/i
// Plage horaire : « 8h-18h », « 7h30-17h30 », « 13-18h », « 13h30-17h30 ».
const RE_PLAGE = /^\s*(\d{1,2})(?:h(\d{2})?)?\s*[-–]\s*(\d{1,2})(?:h(\d{2})?)?/

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS_FR = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre']
const POSTES_LONG = { A: 'Bloc A', B: 'Bloc B' }

// texte collé -> tableau de lignes, chaque ligne = tableau de cellules
export function lignesDepuisTexte(texte) {
  return String(texte).replace(/\r\n/g, '\n').split('\n').map(l => l.split('\t'))
}

function cell(row, i) {
  return i >= 0 && i < row.length && row[i] != null ? String(row[i]).trim() : ''
}

// Localise l'en-tête (ligne « Date »), la colonne Date, les IADE et le bloc remplaçants.
export function analyserEntete(rows) {
  let h = -1
  for (let k = 0; k < rows.length; k++) {
    if (rows[k].some((_, i) => cell(rows[k], i).toLowerCase() === 'date')) { h = k; break }
  }
  if (h < 0) {
    throw new Error("En-tête introuvable (ligne « Date » absente). "
      + 'Colle bien le tableau entier, en-têtes compris.')
  }
  const entete = rows[h]
  let dcol = 0
  for (let i = 0; i < entete.length; i++) if (cell(entete, i).toLowerCase() === 'date') { dcol = i; break }

  const estTech = (v) => {
    const vl = v.toLowerCase()
    return !vl || vl.startsWith('salles') || vl.startsWith('absence')
      || vl.startsWith('jour') || vl.startsWith('date') || RE_REMPL_HEAD.test(v)
  }
  const iades = []
  for (let i = dcol + 1; i < entete.length; i++) {
    const v = cell(entete, i)
    if (!estTech(v)) iades.push({ nom: v, col: i })
  }

  let rstart = -1
  for (let i = 0; i < entete.length; i++) if (RE_REMPL_HEAD.test(cell(entete, i))) { rstart = i; break }
  const remplCols = rstart >= 0 ? [rstart, rstart + 1, rstart + 2] : []

  return { h, dcol, iades, remplCols }
}

function cleTri(dateStr) {
  const [d, m, y] = dateStr.split('/')
  return `${y}${m}${d}`
}

function jourFr(dateStr) {
  const [d, m, y] = dateStr.split('/').map(Number)
  return JOURS_FR[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

function estNoteHs(txt) {
  return /\bhs\b/i.test(txt) || txt.toLowerCase().includes('heure')
}

// Parcourt les jours et regroupe congés / heures sup / remplaçants par date.
function collecter(rows) {
  const { h, dcol, iades, remplCols } = analyserEntete(rows)
  const conges = new Map()   // date -> [nom]
  const hs = new Map()       // date -> [{nom, note}]
  const rempl = new Map()    // date -> [valeur]
  for (let r = h + 1; r < rows.length; r++) {
    const d = cell(rows[r], dcol)
    if (!RE_DATE.test(d)) continue
    for (const { nom, col } of iades) {
      const note = cell(rows[r], col + 2)   // colonne « Congé / HS » de l'IADE
      if (!note) continue
      if (note.toLowerCase().includes('cong')) {
        if (!conges.has(d)) conges.set(d, [])
        conges.get(d).push(nom)
      } else if (RE_HS.test(note) || note.toLowerCase() === 'hs') {
        if (!hs.has(d)) hs.set(d, [])
        hs.get(d).push({ nom, note })
      }
    }
    for (const rc of remplCols) {
      const v = cell(rows[r], rc)
      if (v) {
        if (!rempl.has(d)) rempl.set(d, [])
        rempl.get(d).push(v)
      }
    }
  }
  return { conges, hs, rempl, iades }
}

// Récap texte (congés + couverture, remplaçants hors congé, heures sup).
export function genererRecapTexte(rows) {
  const { conges, hs, rempl } = collecter(rows)
  const dates = [...new Set([...conges.keys(), ...hs.keys(), ...rempl.keys()])]
    .sort((a, b) => cleTri(a).localeCompare(cleTri(b)))
  if (!dates.length) return 'Aucune donnée de congé / remplacement / HS trouvée dans ce mois.'

  const [dd, mm, yy] = dates[0].split('/').map(Number)
  const titre = `${MOIS_FR[mm].charAt(0).toUpperCase() + MOIS_FR[mm].slice(1)} ${yy}`
  void dd
  const out = [`RÉCAP CONGÉS & REMPLACEMENTS — ${titre.toUpperCase()}`, '']

  out.push('CONGÉS')
  const joursConge = dates.filter(d => conges.has(d))
  if (!joursConge.length) out.push('- (aucun congé ce mois)')
  for (const d of joursConge) {
    for (const nom of conges.get(d)) {
      let ligne = `- ${nom} — ${jourFr(d)} ${d}`
      const nomsRempl = (rempl.get(d) || []).filter(v => !estNoteHs(v))
      const notesHs = [
        ...(hs.get(d) || []).map(x => `${x.nom} ${x.note}`),
        ...(rempl.get(d) || []).filter(v => estNoteHs(v)),
      ]
      const couv = []
      if (nomsRempl.length) couv.push('remplaçant : ' + nomsRempl.join(', '))
      if (notesHs.length) couv.push('heures sup : ' + notesHs.join(', '))
      ligne += couv.length ? '  →  ' + couv.join('  |  ') : '  →  aucune couverture repérée ce jour'
      out.push(ligne)
    }
  }

  out.push('', 'REMPLAÇANTS (jours sans congé)')
  const lignesR = []
  for (const d of dates) {
    const noms = (rempl.get(d) || []).filter(v => !estNoteHs(v))
    if (noms.length && !conges.has(d)) lignesR.push(`- ${jourFr(d)} ${d} : ${noms.join(', ')}`)
  }
  out.push(...(lignesR.length ? lignesR : ['- (aucun)']))

  out.push('', 'HEURES SUP')
  const lignesH = []
  for (const d of dates) {
    const parts = [
      ...(hs.get(d) || []).map(x => `${x.nom} (${x.note})`),
      ...(rempl.get(d) || []).filter(v => estNoteHs(v)),
    ]
    if (parts.length) lignesH.push(`- ${jourFr(d)} ${d} : ${parts.join(', ')}`)
  }
  out.push(...(lignesH.length ? lignesH : ['- (aucune)']))

  return out.join('\n')
}

// Liste des IADE (noms) pour proposer le choix à l'écran.
export function listerIades(rows) {
  return analyserEntete(rows).iades.map(x => x.nom)
}

function parsePlage(txt) {
  const m = RE_PLAGE.exec(txt)
  if (!m) return { debut: null, fin: null, label: txt.trim() }
  const debut = [Number(m[1]), Number(m[2] || 0)]
  const fin = [Number(m[3]), Number(m[4] || 0)]
  let label = txt.slice(m[0].length).trim()
  label = label ? (POSTES_LONG[label.toUpperCase()] || label) : 'Poste'
  return { debut, fin, label }
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

const pad = (n) => String(n).padStart(2, '0')

// Génère le contenu .ics de l'agenda d'un IADE pour le mois collé.
// Renvoie { nom, ics, nbEvents, moisLabel }. Lève si le nom est introuvable.
export function genererIcs(rows, cible) {
  const { h, dcol, iades } = analyserEntete(rows)
  const c = String(cible).trim().toLowerCase()
  const exact = iades.filter(x => x.nom.toLowerCase() === c)
  const partiel = iades.filter(x => x.nom.toLowerCase().includes(c) || c.includes(x.nom.toLowerCase()))
  const choix = exact.length ? exact : partiel
  if (choix.length !== 1) {
    const dispo = iades.map(x => x.nom).join(', ')
    throw new Error(choix.length
      ? `« ${cible} » correspond à plusieurs colonnes. Précise. Noms : ${dispo}`
      : `IADE « ${cible} » introuvable. Noms : ${dispo}`)
  }
  const { nom, col } = choix[0]

  const now = new Date()
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`
    + `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`

  const events = []
  let premierMois = null
  const uidBase = nom.replace(/[^a-zA-Z0-9]/g, '')

  const pousser = (uid, dstart, dend, allDay, summary, desc) => {
    events.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dtstamp}`)
    if (allDay) {
      events.push(`DTSTART;VALUE=DATE:${dstart}`, `DTEND;VALUE=DATE:${dend}`)
    } else {
      events.push(`DTSTART:${dstart}`, `DTEND:${dend}`)
    }
    events.push(`SUMMARY:${esc(summary)}`)
    if (desc) events.push(`DESCRIPTION:${esc(desc)}`)
    events.push('END:VEVENT')
  }

  for (let r = h + 1; r < rows.length; r++) {
    const dstr = cell(rows[r], dcol)
    if (!RE_DATE.test(dstr)) continue
    const [dd, mm, yy] = dstr.split('/').map(Number)
    if (premierMois == null) premierMois = { mm, yy }
    const ymd = `${yy}${pad(mm)}${pad(dd)}`
    const demain = (() => {
      const t = new Date(Date.UTC(yy, mm - 1, dd + 1))
      return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`
    })()
    const matin = cell(rows[r], col)
    const aprem = cell(rows[r], col + 1)
    const note = cell(rows[r], col + 2)

    if (note.toLowerCase().includes('cong')) {   // congé -> journée entière, pas de travail
      pousser(`${ymd}-${uidBase}-conge@planning-iade`, ymd, demain, true, 'Congé', '')
      continue
    }
    const hs = (RE_HS.test(note) || note.toLowerCase() === 'hs') ? note : ''
    for (const [slot, txt] of [['m', matin], ['a', aprem]]) {
      if (!txt || txt.toUpperCase() === 'OFF') continue
      const { debut, fin, label } = parsePlage(txt)
      const desc = txt + (hs ? `  (HS ${hs})` : '')
      const uid = `${ymd}-${uidBase}-${slot}@planning-iade`
      if (debut == null) {
        pousser(uid, ymd, demain, true, label, desc)      // poste sans horaire -> journée entière
      } else {
        const ds = `${ymd}T${pad(debut[0])}${pad(debut[1])}00`
        const de = `${ymd}T${pad(fin[0])}${pad(fin[1])}00`
        pousser(uid, ds, de, false, label, desc)
      }
    }
  }

  const cal = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sarm-dashboard//planning-iade//FR',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events, 'END:VCALENDAR']
  const moisLabel = premierMois
    ? `${MOIS_FR[premierMois.mm]} ${premierMois.yy}`
    : ''
  const moisSlug = premierMois ? `${premierMois.yy}-${pad(premierMois.mm)}` : 'mois'
  return {
    nom,
    ics: cal.join('\r\n') + '\r\n',
    nbEvents: events.filter(l => l === 'BEGIN:VEVENT').length,
    moisLabel,
    moisSlug,
  }
}
