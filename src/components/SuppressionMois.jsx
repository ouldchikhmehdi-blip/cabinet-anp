import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { contenuMois, supprimerMois } from '../data/consultations'
import { ANNEES, MOIS_COURT } from '../data/mockData'

const MOIS_NOMS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const fmtNb = v => Math.round(v).toLocaleString('fr-FR')

/**
 * Suppression des données d'un mois (rattrapage d'un import erroné).
 *
 * **Réservé au compte admin** (`profiles.role = 'admin'`) : le composant ne rend rien pour
 * les autres. Garde-fou d'interface uniquement — côté base, l'écriture de
 * `planning_consultations` reste ouverte au faiseur (RLS), le store étant une ligne JSON
 * unique que la base ne peut pas distinguer d'un import (cf. CONSULTATIONS.md §12).
 *
 * Props :
 *   consultData — store courant (pour lister les années disponibles)
 *   onChange    — callback après suppression, pour rafraîchir la page
 */
export default function SuppressionMois({ consultData, onChange }) {
  const { profile } = useAuth()
  const [ouvert, setOuvert] = useState(false)
  const [annee, setAnnee] = useState(() => new Date().getFullYear())
  const [mois, setMois] = useState(() => new Date().getMonth())
  const [confirmation, setConfirmation] = useState(false)
  const [resultat, setResultat] = useState(null)

  if (profile?.role !== 'admin') return null

  // Années proposées : celles du dashboard + celles réellement présentes dans le store
  // (une année importée par erreur doit pouvoir être nettoyée).
  const anneesDispos = [...new Set([...ANNEES, ...Object.keys(consultData.global).map(Number)])]
    .sort((a, b) => b - a)

  const contenu = contenuMois(annee, mois)
  const vide = contenu.total === 0 && contenu.lignes.length === 0

  const supprimer = () => {
    const r = supprimerMois(annee, mois)
    setResultat({ ...r, label: `${MOIS_NOMS[mois]} ${annee}` })
    setConfirmation(false)
    onChange?.()
  }

  const cardStyle = {
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    marginTop: 8,
  }
  const selectStyle = {
    fontSize: 11, padding: '4px 6px',
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)',
    background: 'var(--color-bg)', color: 'var(--color-text)',
  }

  return (
    <div>
      <button
        onClick={() => { setOuvert(o => !o); setConfirmation(false); setResultat(null) }}
        style={{
          fontSize: 11, padding: '5px 12px',
          borderRadius: 'var(--radius-md)',
          border: `0.5px solid ${ouvert ? '#F09595' : 'var(--color-border)'}`,
          background: ouvert ? '#FAECE7' : 'var(--color-surface)',
          color: ouvert ? '#A32D2D' : 'var(--color-text-secondary)',
          cursor: 'pointer',
        }}
      >
        🗑 Supprimer un mois
      </button>

      {ouvert && (
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '0.04em', marginBottom: 10 }}>
            SUPPRIMER LES DONNÉES D'UN MOIS
            <span style={{ fontSize: 9, background: '#EEEDFE', color: '#3C3489', padding: '1px 6px', borderRadius: 8, marginLeft: 8, letterSpacing: 0 }}>
              admin
            </span>
          </div>

          {/* Choix du mois */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <select
              style={selectStyle}
              value={mois}
              onChange={e => { setMois(Number(e.target.value)); setConfirmation(false); setResultat(null) }}
            >
              {MOIS_NOMS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select
              style={selectStyle}
              value={annee}
              onChange={e => { setAnnee(Number(e.target.value)); setConfirmation(false); setResultat(null) }}
            >
              {anneesDispos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Ce que contient le mois choisi */}
          {vide ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
              Aucune donnée pour {MOIS_NOMS[mois]} {annee} — rien à supprimer.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 18, marginBottom: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Total global</div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtNb(contenu.total)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>dont téléconsultations</div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtNb(contenu.tele)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>lignes de détail</div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{contenu.lignes.length}</div>
                </div>
              </div>

              {contenu.lignes.length > 0 && (
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <tbody>
                      {contenu.lignes.map((l, i) => (
                        <tr key={`${l.specNom}-${l.label}`} style={{ borderTop: i > 0 ? '0.5px solid var(--color-border)' : 'none' }}>
                          <td style={{ padding: '5px 10px' }}>{l.label}</td>
                          <td style={{ padding: '5px 10px', color: 'var(--color-text-tertiary)', fontSize: 10 }}>{l.specNom}</td>
                          <td style={{ padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNb(l.valeur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ padding: '8px 10px', background: '#FAECE7', border: '0.5px solid #F09595', borderRadius: 'var(--radius-md)', marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#712B13' }}>
                  ⚠ Le total global, les téléconsultations et tout le détail par praticien de{' '}
                  <strong>{MOIS_COURT[mois]} {annee}</strong> seront remis à zéro, pour tous les
                  utilisateurs. Action irréversible — réimportez le CSV Doctolib du mois pour restaurer.
                </div>
              </div>

              {confirmation ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text)' }}>
                    Confirmer la suppression de <strong>{MOIS_NOMS[mois]} {annee}</strong> ({fmtNb(contenu.total)} consult.) ?
                  </span>
                  <button
                    onClick={supprimer}
                    style={{
                      fontSize: 11, padding: '5px 14px', borderRadius: 'var(--radius-md)',
                      border: '0.5px solid #A32D2D', background: '#A32D2D', color: '#fff',
                      cursor: 'pointer', fontWeight: 500,
                    }}
                  >
                    Oui, supprimer
                  </button>
                  <button
                    onClick={() => setConfirmation(false)}
                    style={{
                      fontSize: 11, padding: '5px 12px', borderRadius: 'var(--radius-md)',
                      border: '0.5px solid var(--color-border)', background: 'transparent',
                      color: 'var(--color-text-secondary)', cursor: 'pointer',
                    }}
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmation(true)}
                  style={{
                    fontSize: 11, padding: '5px 14px', borderRadius: 'var(--radius-md)',
                    border: '0.5px solid #F09595', background: 'transparent',
                    color: '#A32D2D', cursor: 'pointer',
                  }}
                >
                  Supprimer {MOIS_NOMS[mois]} {annee}
                </button>
              )}
            </>
          )}

          {resultat && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: '#085041', background: '#E1F5EE', border: '0.5px solid #1D9E75', borderRadius: 'var(--radius-md)', padding: '7px 10px' }}>
              ✓ {resultat.label} supprimé ({fmtNb(resultat.total)} consult.).
              {resultat.anneeSupprimee && ` L'année ${annee} était vide : elle a été retirée du dashboard.`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
