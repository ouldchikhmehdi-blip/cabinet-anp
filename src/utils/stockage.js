export const charger = (cle, defaut) => {
  try {
    const v = localStorage.getItem(cle)
    return v ? JSON.parse(v) : defaut
  } catch {
    return defaut
  }
}

export const sauver = (cle, val) => {
  try {
    localStorage.setItem(cle, JSON.stringify(val))
  } catch {
    // quota dépassé ou stockage indisponible — on ignore
  }
}
