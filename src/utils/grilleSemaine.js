// ============================================================
// grilleSemaine.js — logique PARTAGÉE de calcul des cellules de la grille « En semaine »
// (jours en lignes, 8 associés en colonnes). Source unique de vérité pour :
//   - l'export Excel (src/utils/exportCalendrier.js) ;
//   - l'aperçu à l'écran (src/components/planning/ApercuSemaine.jsx).
//
// Chaque fonction renvoie un modèle de cellule NEUTRE de présentation : { texte, fond, gras }.
//   - texte : contenu affiché (string) ;
//   - fond  : clé de couleur ∈ COULEURS_GRILLE (ou null = pas de fond) ;
//   - gras  : bool (mise en gras des cases de service).
// L'export mappe fond → ARGB ('FF' + hex) ; l'aperçu mappe fond → '#' + hex (CSS).
// ============================================================
import { typeDuJour, formatISO } from './calendrier'
import { JOURS } from './trames'

const JOUR_MS = 24 * 60 * 60 * 1000

// Teintes (hex sans alpha) — identiques aux ARGB.* historiques de l'export, alpha retiré.
export const COULEURS_GRILLE = {
  garde: 'FFFF00',     // jaune
  astreinte: 'FFC000', // orange
  weekend: 'D9D9D9',   // gris (week-end non affecté)
  ferie: '92D050',     // vert (jour férié / récup JF)
  conge: '00B0F0',     // bleu vif (vacances / repos)
  header: 'FF99CC',    // rose (en-têtes)
  vacances: 'FFFF00',  // jaune (libellé de date des semaines scolaires)
}

// Construit le contexte d'UN jour d'une semaine, commun à toutes les cellules de la ligne.
//   data        : base calendrier (rotation jeu/ven/sam/dim)
//   sem         : { num, lundi, ... }
//   feries      : { iso: nom }
//   vacancesScolaires : Set<num>
//   weekendAff  : { num: ini }   reaAff : { num: ini }   congesParSemaine : { num: [ini] }
//   affectationsSemaine : { num: { ini: colObjet } } (export En semaine) ou null
//   recupParSemaine : { num: { ini: n } }   compteurs : { weekend, gardeSem, vendredi, rea, vac }
export function ctxJour({
  data, sem, offset, feries, vacancesScolaires, weekendAff, reaAff,
  congesParSemaine, affectationsSemaine, recupParSemaine, compteurs,
}) {
  const date = new Date(sem.lundi.getTime() + offset * JOUR_MS)
  const iso = formatISO(date)
  const estWeekend = offset >= 5
  const estFerie = !!feries?.[iso]
  const enVac = !!(vacancesScolaires && vacancesScolaires.has && vacancesScolaires.has(sem.num))
  const role = typeDuJour(data, sem.num, offset)
  const jour = JOURS[offset]
  const congesSemaine = congesParSemaine?.[sem.num] ?? []
  const iniWE = estWeekend ? (weekendAff?.[sem.num] ?? null) : null
  const iniRea = (!estWeekend && offset <= 4) ? (reaAff?.[sem.num] ?? null) : null
  return {
    date, iso, estWeekend, estFerie, enVac, role, jour, offset, sem,
    congesSemaine, iniWE, iniRea, affectationsSemaine, recupParSemaine, compteurs,
  }
}

// n° de garde/astreinte cumulé à afficher dans la case de service ce jour-là.
function numService(ctx) {
  const { offset, sem, compteurs } = ctx
  return offset === 4 ? compteurs?.vendredi?.[sem.num] : compteurs?.gardeSem?.[sem.num]?.[offset]
}

// Cellule d'un associé pour un jour donné.
export function celluleAssocieJour(a, ctx) {
  const {
    role, estWeekend, estFerie, sem, offset, jour, iniWE, iniRea,
    congesSemaine, affectationsSemaine, recupParSemaine, compteurs,
  } = ctx

  // ── Week-end : seule la personne de garde est colorée (texte « G1 »/« A1 »), congé bleu, sinon gris.
  if (estWeekend) {
    if (iniWE && a === iniWE) {
      const texte = compteurs ? `${role}${compteurs.weekend?.[sem.num] ?? ''}` : role
      return { texte, fond: role === 'G' ? 'garde' : 'astreinte', gras: true }
    }
    if (congesSemaine.includes(a)) return { texte: '', fond: 'conge', gras: false }
    return { texte: '', fond: 'weekend', gras: false }
  }

  // ── Jour ouvré, export « En semaine » : contenu quotidien de la colonne attribuée à l'associé.
  if (affectationsSemaine) {
    const col = affectationsSemaine[sem.num]?.[a]
    // Congé : n° de semaine de vacances sur le lundi (offset 0), sinon vide ; fond bleu.
    if (congesSemaine.includes(a)) {
      const texte = offset === 0 ? String(compteurs?.vac?.[sem.num]?.[a] ?? '') : ''
      return { texte, fond: 'conge', gras: false }
    }
    // Jour férié : de-service → Garde/Astreinte (+ n°) ; sinon qui travaillait → Récup JF-N (vert) ; repos → bleu.
    if (estFerie && col) {
      if (col.service?.[jour]) {
        const n = numService(ctx)
        return { texte: `${role === 'G' ? 'Garde' : 'Astreinte'}${n != null ? ' ' + n : ''}`, fond: role === 'G' ? 'garde' : 'astreinte', gras: true }
      }
      if ((col[jour] ?? '').trim()) return { texte: `Récup JF-${recupParSemaine?.[sem.num]?.[a] ?? ''}`, fond: 'ferie', gras: false }
      return { texte: '', fond: 'conge', gras: false }
    }
    if (!col) return { texte: '', fond: null, gras: false }
    const poste = col[jour] ?? ''
    // Réa : « RéaN » sur les jours travaillés de la semaine de réa.
    if (iniRea && a === iniRea && poste.trim()) {
      const texte = `Réa${compteurs?.rea?.[sem.num] ?? ''}`
      if (col.service?.[jour]) return { texte, fond: role === 'G' ? 'garde' : 'astreinte', gras: true }
      return { texte, fond: null, gras: false }
    }
    if (!poste.trim()) return { texte: '', fond: 'conge', gras: false } // repos → bleu
    // Jour de service travaillé : poste + n° (garde de semaine mardi/jeudi, ou vendredi A/G).
    if (col.service?.[jour]) {
      const n = numService(ctx)
      return { texte: n != null ? `${poste} ${n}` : poste, fond: role === 'G' ? 'garde' : 'astreinte', gras: true }
    }
    return { texte: poste, fond: null, gras: false }
  }

  // ── Autres exports (Vacances / Réa) : réa porte « Réa », vacancier en semaine → bleu.
  if (iniRea && a === iniRea && !congesSemaine.includes(a)) return { texte: 'Réa', fond: null, gras: false }
  if (congesSemaine.includes(a)) return { texte: '', fond: 'conge', gras: false }
  return { texte: '', fond: null, gras: false }
}

// Cellule d'une colonne remplaçant (poste lun→ven ; vide le week-end et les fériés).
export function celluleRemplacantJour(colObj, ctx) {
  const { estWeekend, estFerie, role, jour } = ctx
  if (estWeekend || estFerie) return { texte: '', fond: null, gras: false }
  const texte = colObj ? (colObj[jour] ?? '') : ''
  if (colObj?.service?.[jour]) return { texte, fond: role === 'G' ? 'garde' : 'astreinte', gras: true }
  return { texte, fond: null, gras: false }
}

// Cellule de la colonne « G/A » (groupe) : vendredi/samedi/dimanche, plus jeudi si astreinte.
export function celluleGroupeJour(ctx) {
  const { role, offset } = ctx
  let texte = ''
  if (offset >= 4) texte = role
  else if (offset === 3 && role === 'A') texte = 'A'
  return { texte, fond: texte === 'G' ? 'garde' : texte === 'A' ? 'astreinte' : null }
}

// Cellule de date (1ʳᵉ colonne) : férié vert > week-end gris > semaine scolaire jaune.
export function celluleDateJour(ctx) {
  const { estFerie, estWeekend, enVac } = ctx
  if (estFerie) return { fond: 'ferie' }
  if (estWeekend) return { fond: 'weekend' }
  if (enVac) return { fond: 'vacances' }
  return { fond: null }
}
