// Échelles des graphiques finance. L'axe Y s'ajuste aux valeurs affichées au lieu de partir de 0,
// pour que les écarts d'un mois ou d'une année à l'autre se voient. Le 0 n'est gardé que si les
// données s'en approchent. Les graphiques empilés n'utilisent pas echelleVisible : sans le 0, la
// part du bas de chaque barre serait fausse.

// Plus petit pas « rond » (1, 1,5, 2, 2,5, 3, 4, 5, 6, 8 × 10ⁿ) au moins égal à x
const pasRond = (x) => {
  const p = 10 ** Math.floor(Math.log10(x))
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(k => k * p >= x * (1 - 1e-9)) * p
}

// À passer tel quel en `domain` d'un YAxis Recharts, qui l'appelle avec [min, max] des données.
export function echelleVisible([min, max]) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  const ecart = max - min
  const marge = ecart > 0 ? ecart * 0.1 : (Math.abs(max) * 0.1 || 1)
  let bas = min - marge
  let haut = max + marge
  if (min >= 0 && bas < 0) bas = 0
  if (max <= 0 && haut > 0) haut = 0
  // Exactement 4 intervalles ronds : les 5 graduations de Recharts tombent alors sur des valeurs rondes
  let pas = pasRond((haut - bas) / 4)
  while (Math.ceil(haut / pas) * pas - Math.floor(bas / pas) * pas > 4 * pas) pas = pasRond(pas * 1.01)
  bas = Math.floor(bas / pas) * pas
  if (min >= 0 && bas < 0) bas = 0
  return [bas, bas + 4 * pas]
}

// Graduation en milliers, avec les décimales utiles seulement (98k, 98,5k).
export const axeK = (v) => (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + 'k'

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
