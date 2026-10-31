// ============================================================
// facturation.js — séries mensuelles de l'onglet « Facturé », calculées depuis les
// agrégats poussés par compta/facturation.js, plus un magasin partagé (même modèle
// que compta.js).
//
// CONTRAT DES SÉRIES :
//   series.ANNEES                 années disponibles, décroissantes, toujours ≥ 2
//   series.FACTURE[y][m]          facturé dans le mois (FAC, Mt Total), tous associés et établissements
//   series.REGLE[y][m]            réglé dans le mois (RED, Base Conv + Base DH)
//   series.REDEVANCE[y][m]        redevance clinique TTC prélevée sur le réglé
//   series.DH[y][m]               dépassements d'honoraires facturés (FAC, Mt DH)
//   series.PAR_CHIRURGIEN[y]      { [cle]: [12] } facturé par chirurgien (« NOM Prenom ») ou bucket « __… »
//   series.RENSEIGNE[y][m]        true quand le mois a été importé (un mois absent n'est pas un 0)
//   series.moisActuel(y)          dernier mois (0-11) importé de l'année y, −1 si aucun
// ============================================================
import { useEffect, useReducer } from 'react'
import { chargerFacturation } from './facturationApi'

const VIDE = () => Array(12).fill(0)
const arrondi = (v) => Math.round(v * 100) / 100

export function calculerSeriesFact(mensuel = [], chirurgiens = []) {
  let annees = [...new Set([...mensuel, ...chirurgiens].map(r => Number(r.annee)))].sort((a, b) => b - a)
  if (annees.length === 0) annees = [new Date().getFullYear()]
  if (annees.length === 1) annees = [annees[0], annees[0] - 1]

  const FACTURE = {}, REGLE = {}, REDEVANCE = {}, DH = {}, PAR_CHIRURGIEN = {}, RENSEIGNE = {}
  for (const y of annees) {
    FACTURE[y] = VIDE(); REGLE[y] = VIDE(); REDEVANCE[y] = VIDE(); DH[y] = VIDE(); PAR_CHIRURGIEN[y] = {}; RENSEIGNE[y] = Array(12).fill(false)
  }
  for (const r of mensuel) {
    const y = Number(r.annee), m = Number(r.mois) - 1
    if (!FACTURE[y] || m < 0 || m > 11) continue
    FACTURE[y][m] = arrondi(FACTURE[y][m] + r.facture_total)
    REGLE[y][m] = arrondi(REGLE[y][m] + r.regle_total)
    REDEVANCE[y][m] = arrondi(REDEVANCE[y][m] + r.redevance_ttc)
    DH[y][m] = arrondi(DH[y][m] + r.facture_dh)
    RENSEIGNE[y][m] = true
  }
  for (const r of chirurgiens) {
    const y = Number(r.annee), m = Number(r.mois) - 1
    if (!PAR_CHIRURGIEN[y] || m < 0 || m > 11) continue
    const s = (PAR_CHIRURGIEN[y][r.chirurgien] ||= VIDE())
    s[m] = arrondi(s[m] + r.montant)
    RENSEIGNE[y][m] = true
  }
  const moisActuel = (y) => (RENSEIGNE[y] || []).reduce((acc, v, m) => (v ? m : acc), -1)
  return { ANNEES: annees, FACTURE, REGLE, REDEVANCE, DH, PAR_CHIRURGIEN, RENSEIGNE, moisActuel }
}

// ---- Magasin partagé : chargé une fois, partagé par les deux sous-onglets ----

let etat = { statut: 'vide', mensuel: [], chirurgiens: [], series: calculerSeriesFact(), erreur: null }
const abonnes = new Set()
const publier = () => abonnes.forEach(f => f())

export function etatFacturation() { return etat }

export async function rechargerFacturation() {
  etat = { ...etat, statut: 'chargement', erreur: null }
  publier()
  try {
    const { mensuel, chirurgiens } = await chargerFacturation()
    etat = { statut: 'pret', mensuel, chirurgiens, series: calculerSeriesFact(mensuel, chirurgiens), erreur: null }
  } catch (e) {
    etat = { ...etat, statut: 'erreur', erreur: e?.message || String(e) }
  }
  publier()
  return etat
}

// Injection locale (harnais de test navigateur) : recalcule sans réseau
export function majFacturationLocale({ mensuel, chirurgiens } = {}) {
  etat = { ...etat, statut: 'pret', mensuel: mensuel ?? etat.mensuel, chirurgiens: chirurgiens ?? etat.chirurgiens }
  etat.series = calculerSeriesFact(etat.mensuel, etat.chirurgiens)
  publier()
}

export function useFacturation() {
  const [, forcer] = useReducer(x => x + 1, 0)
  useEffect(() => {
    abonnes.add(forcer)
    if (etat.statut === 'vide') rechargerFacturation()
    return () => abonnes.delete(forcer)
  }, [])
  return etat
}
