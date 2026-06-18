// ============================================================
// evenementsAgenda.js — dérive, pour CHAQUE associé et sur une plage (un tiers), ses ÉVÉNEMENTS d'agenda
// « journée entière » : gardes, astreintes, réanimation, vacances, récup jour férié. Réutilise la MÊME
// source que l'export Excel (grilleSemaine.celluleAssocieJour) + les blocs imposés (noel.js), pour rester
// cohérent au pixel près. Les jours de travail ORDINAIRE et de REPOS ne génèrent PAS d'événement
// (un agenda perso n'a d'intérêt que pour les contraintes : garde / astreinte / réa / vacances / récup).
//
// Sortie : { <initiales>: [ { d:'YYYY-MM-DD', fin:'YYYY-MM-DD', type, titre } ] }
//   d   = 1er jour inclus ; fin = lendemain du dernier jour (DTEND exclusif, journée entière) ;
//   type ∈ 'garde' | 'astreinte' | 'rea' | 'vacances' | 'recup'. Les jours consécutifs de même type
//   sont fusionnés en un seul événement (une semaine de réa / de vacances = 1 événement).
// ============================================================
import { ASSOCIES } from '../data/associes'
import { joursFeriesFR, formatISO, parseISO, numeroSemaineISO } from './calendrier'
import { ctxJour, celluleAssocieJour } from './grilleSemaine'
import { normaliserNoel } from './noel'

const JOUR_MS = 24 * 60 * 60 * 1000

export const TITRES_AGENDA = {
  garde: 'Garde',
  astreinte: 'Astreinte',
  rea: 'Réanimation',
  vacances: 'Vacances',
  recup: 'Récup jour férié',
}

function isoPlusUn(iso) {
  return formatISO(new Date(parseISO(iso).getTime() + JOUR_MS))
}

// Type d'événement d'un associé pour un jour donné (ou null = repos / travail ordinaire → pas d'événement).
function typeJour(ini, ctx, conges, rea) {
  const num = ctx.sem.num
  const cell = celluleAssocieJour(ini, ctx)
  if (ctx.estWeekend) {
    // Week-end : seul le porteur de garde a une couleur (astreinte samedi / garde dimanche).
    if (cell.fond === 'garde') return 'garde'
    if (cell.fond === 'astreinte') return 'astreinte'
    return null
  }
  // Jour ouvré : la vacance prime (l'associé est off toute la semaine).
  if ((conges?.[num] ?? []).includes(ini)) return 'vacances'
  if (cell.fond === 'garde') return 'garde'
  if (cell.fond === 'astreinte') return 'astreinte'
  if (cell.fond === 'ferie') return 'recup' // férié travaillé hors service → récup
  if (rea?.[num] === ini) return 'rea'
  return null
}

// Fusionne une map { iso: type } en événements « journée entière » multi-jours (jours consécutifs même type).
function fusionner(parJour) {
  const isos = Object.keys(parJour).sort()
  const evts = []
  for (const iso of isos) {
    const type = parJour[iso]
    const dernier = evts[evts.length - 1]
    if (dernier && dernier.type === type && isoPlusUn(dernier._fin) === iso) {
      dernier._fin = iso
    } else {
      evts.push({ type, d: iso, _fin: iso })
    }
  }
  return evts.map(e => ({ type: e.type, titre: TITRES_AGENDA[e.type], d: e.d, fin: isoPlusUn(e._fin) }))
}

// semaines : [{ num, lundi, dimanche }] de construction du tiers (HORS semaines imposées Noël/Toussaint).
// weekends:{num:ini}, conges:{num:[ini]}, rea:{num:ini}, affectationsSemaine:{num:{ini:col}},
// recupParSemaine:{num:{ini:n}}, compteurs (facultatif). noelData/toussaintData : blocs imposés.
// plageDebut/plageFin : bornes (n° de semaine ISO) pour ne garder des blocs que ce qui est dans le tiers.
export function evenementsAgendaParAssocie({
  annee, semaines = [], calendrier, weekends = {}, conges = {}, rea = {},
  affectationsSemaine = {}, recupParSemaine = {}, compteurs = null,
  noelData = null, toussaintData = null, plageDebut = -Infinity, plageFin = Infinity,
}) {
  const feries = {}
  for (const f of joursFeriesFR(annee)) feries[f.iso] = f.nom
  for (const f of joursFeriesFR(annee + 1)) feries[f.iso] = f.nom // un bloc peut déborder sur l'an+1 (Noël)
  const vacancesScolaires = new Set(calendrier?.vacancesScolaires ?? [])

  const parJour = {}
  for (const ini of ASSOCIES) parJour[ini] = {}

  // 1) Semaines « construites » (grille partagée avec l'export).
  for (const sem of semaines) {
    for (let offset = 0; offset < 7; offset++) {
      const ctx = ctxJour({
        data: calendrier, sem, offset, feries, vacancesScolaires,
        weekendAff: weekends, reaAff: rea, congesParSemaine: conges,
        affectationsSemaine, recupParSemaine, compteurs,
      })
      for (const ini of ASSOCIES) {
        const t = typeJour(ini, ctx, conges, rea)
        if (t) parJour[ini][ctx.iso] = t
      }
    }
  }

  // 2) Blocs imposés (Noël + Toussaint) dans la plage : rôle déjà daté par associé.
  for (const src of [noelData, toussaintData]) {
    const data = normaliserNoel(src)
    for (const j of data.jours) {
      const num = numeroSemaineISO(parseISO(j.iso))
      if (num < plageDebut || num > plageFin) continue
      for (const ini of ASSOCIES) {
        const role = j.parAssocie?.[ini]?.role ?? null
        const t = role === 'G' ? 'garde' : role === 'A' ? 'astreinte' : role === 'C' ? 'vacances' : role === 'F' ? 'recup' : null
        if (t) parJour[ini][j.iso] = t
      }
    }
  }

  const out = {}
  for (const ini of ASSOCIES) out[ini] = fusionner(parJour[ini])
  return out
}
