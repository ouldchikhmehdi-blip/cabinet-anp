// ============================================================
// IadeCalendrier — « Congés de l'équipe » : qui est absent, mois par mois.
// Lecture seule, alimentée par la RPC iade_calendrier() (ni commentaires,
// ni motifs de refus, ni demandes refusées). Visible par les IADE et la gestion.
// ============================================================
import { useState, useEffect } from 'react'
import CalendrierConges from '../components/iade/CalendrierConges'
import { chargerCalendrierIade } from '../utils/iadeCongesApi'
import { bornesMois } from '../utils/iadeConges'

export default function IadeCalendrier() {
  const maintenant = new Date()
  const [annee, setAnnee] = useState(maintenant.getFullYear())
  const [mois,  setMois]  = useState(maintenant.getMonth())
  const [absences, setAbsences] = useState([])
  const [charge,   setCharge]   = useState(true)
  const [erreur,   setErreur]   = useState(null)

  useEffect(() => {
    let annule = false
    // Repasse en « Chargement… » à chaque changement de mois, avant la requête :
    // sans cela, le mois précédent resterait affiché sous le nouvel en-tête.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCharge(true)
    const { debut, fin } = bornesMois(annee, mois)
    chargerCalendrierIade(debut, fin)
      .then(rows => { if (!annule) { setAbsences(rows); setErreur(null) } })
      .catch(() => { if (!annule) setErreur('Impossible de charger le calendrier.') })
      .finally(() => { if (!annule) setCharge(false) })
    return () => { annule = true }
  }, [annee, mois])

  // Navigation mois par mois, avec passage d'année.
  function naviguer(delta) {
    const d = new Date(Date.UTC(annee, mois + delta, 1))
    setAnnee(d.getUTCFullYear())
    setMois(d.getUTCMonth())
  }

  return (
    <div style={{ maxWidth: 1180 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Congés de l'équipe</h1>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
        Absences demandées ou validées de l'équipe IADE. Utile avant de poser une date.
      </div>

      {erreur && (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
          {erreur}
        </div>
      )}

      <CalendrierConges
        annee={annee}
        mois={mois}
        absences={absences}
        chargement={charge}
        onNaviguer={naviguer}
      />
    </div>
  )
}
