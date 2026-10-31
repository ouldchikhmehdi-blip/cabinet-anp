// Échelles des graphiques finance. L'axe Y s'ajuste aux valeurs affichées au lieu de partir de 0,
// pour que les écarts d'un mois ou d'une année à l'autre se voient ; le 0 n'est gardé que si les
// données s'en approchent. Les graduations vont de 1 en 1 ou de 5 en 5 (× 10ⁿ : 1k, 5k, 10k,
// 50k…), donc sur des nombres ronds ou de la table de 5 ; le pas de 2 (20k, 200k) ne sert que si
// aucun autre ne donne entre 3 et 6 intervalles. Les graphiques empilés partent de 0 : sans lui,
// la part du bas de chaque barre serait fausse.

// Graduations d'un axe couvrant les valeurs données → { domain, ticks } pour un YAxis Recharts
export function bornes(valeurs, { depuis0 = false } = {}) {
  const v = valeurs.filter(x => typeof x === 'number' && Number.isFinite(x))
  if (depuis0) v.push(0)
  if (v.length === 0) return {}
  const min = Math.min(...v)
  const max = Math.max(...v)
  const ecart = max - min || Math.abs(max) || 1
  let bas = min - ecart * 0.05
  let haut = max + ecart * 0.05
  // 0 gardé quand les valeurs en sont proches (moins d'un quart de l'écart)
  if (min >= 0 && min - ecart * 0.25 < 0) bas = 0
  if (max <= 0 && max + ecart * 0.25 > 0) haut = 0
  // Pas candidats autour de l'écart ; préférés : 1 et 5 × 10ⁿ avec 3 à 6 intervalles, puis 2 × 10ⁿ
  const intervalles = (p) => Math.ceil(haut / p) - Math.floor(bas / p)
  const e0 = Math.floor(Math.log10(haut - bas))
  const candidats = [e0 - 2, e0 - 1, e0, e0 + 1].flatMap(e => [1, 2, 5].map(k => ({ k, p: k * 10 ** e })))
  const ok = (c) => intervalles(c.p) >= 3 && intervalles(c.p) <= 6
  const pas = (candidats.find(c => c.k !== 2 && ok(c)) || candidats.find(ok) || candidats.find(c => intervalles(c.p) <= 6)).p
  const debut = Math.floor(bas / pas)
  const n = Math.max(1, Math.ceil(haut / pas) - debut)
  const ticks = Array.from({ length: n + 1 }, (_, i) => Number(((debut + i) * pas).toPrecision(12)))
  // interval 0 : Recharts affiche toutes les graduations au lieu d'en sauter une sur deux
  return { domain: [ticks[0], ticks.at(-1)], ticks, interval: 0 }
}

// Échelle d'un graphique depuis ses lignes de données. `cles` choisit les séries (par défaut tout
// sauf mois et annee). `empile` : true additionne les séries de chaque ligne (une seule pile), ou
// une fonction clé → pile quand chaque ligne porte plusieurs piles (une par année).
export function echelle(rows, { cles = k => k !== 'mois' && k !== 'annee', empile = false } = {}) {
  const valeurs = []
  for (const row of rows) {
    const piles = {}
    for (const [k, v] of Object.entries(row)) {
      if (!cles(k) || typeof v !== 'number') continue
      if (!empile) valeurs.push(v)
      else { const p = empile === true ? '' : empile(k); piles[p] = (piles[p] || 0) + v }
    }
    valeurs.push(...Object.values(piles))
  }
  return bornes(valeurs, { depuis0: !!empile })
}

// Graduation en milliers, avec les décimales utiles seulement (98k, 98,5k).
export const axeK = (v) => (v === 0 ? '0' : (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + 'k')

// Les mois pas encore écoulés valent null (et non 0) : la courbe s'arrête au dernier mois connu
// et ce faux 0 n'écrase pas l'échelle. Ligne i = mois de + i. La clé d'une série est l'année
// ou finit par l'année (2025, m2025, c2025) ; `annee` la donne pour une série d'une seule année.
export function sansMoisFuturs(rows, S, de, annee) {
  return rows.map((row, i) => {
    const r = { ...row }
    for (const k of Object.keys(r)) {
      if (k === 'mois') continue
      const y = annee ?? Number((/(\d{4})$/.exec(k) || [])[1])
      if (y && de + i > S.moisActuel(y)) r[k] = null
    }
    return r
  })
}

