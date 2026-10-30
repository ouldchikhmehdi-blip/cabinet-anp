import { useState } from 'react'
import { periodeParDefaut } from './mockData'

// Filtres de période partagés par les pages finance. `annees` = series.ANNEES ;
// quand la liste change (données chargées), la sélection est réinitialisée pour
// ne jamais pointer une année absente.
export function usePeriode(annees) {
  const def = periodeParDefaut(annees)
  const [moisDe, setMoisDe] = useState(def.moisDe)
  const [moisA, setMoisA] = useState(def.moisA)
  const [years, setYears] = useState(def.years)
  const [shortcut, setShortcut] = useState(def.shortcut)

  // Quand la liste des années change (données chargées), on repart de la sélection
  // par défaut — dérivé pendant le rendu, pas dans un effet (règle set-state-in-effect).
  const cle = annees.join(',')
  const [clePrec, setClePrec] = useState(cle)
  if (cle !== clePrec) {
    const d = periodeParDefaut(annees)
    setClePrec(cle)
    setYears(d.years)
    setMoisDe(d.moisDe)
    setMoisA(d.moisA)
    setShortcut(d.shortcut)
  }

  const de = Math.min(moisDe, moisA)
  const a = Math.max(moisDe, moisA)
  return {
    moisDe, setMoisDe, moisA, setMoisA, years, setYears, shortcut, setShortcut,
    de, a,
    primary: years.at(-1), // années triées croissant → la plus récente en dernier
    ref: years.at(-2),
  }
}
