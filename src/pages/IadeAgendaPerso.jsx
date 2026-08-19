// ============================================================
// IadeAgendaPerso — « Sync agenda » (self-service IADE).
// L'IADE colle tout le tableau d'un mois, clique sur SON nom dans la liste
// proposée (lue dans l'en-tête, jamais en dur), et télécharge un .ics à importer
// dans Apple Agenda / Outlook / Google Agenda. Un jour de congé devient une
// journée « Congé » sans poste de travail (le poste affiché est pour le remplaçant).
// 100 % côté client — rien n'est envoyé au serveur.
// ============================================================
import { useState } from 'react'
import { lignesDepuisTexte, listerIades, genererIcs } from '../utils/planningColle'

function telecharger(texte, nomFichier, mime) {
  const blob = new Blob([texte], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}

export default function IadeAgendaPerso() {
  const [texte, setTexte] = useState('')
  const [noms, setNoms] = useState(null)     // null = pas encore analysé
  const [erreur, setErreur] = useState(null)
  const [succes, setSucces] = useState(null)

  function analyser() {
    setErreur(null); setSucces(null); setNoms(null)
    try {
      const liste = listerIades(lignesDepuisTexte(texte))
      if (!liste.length) throw new Error("Aucun nom d'IADE trouvé dans l'en-tête collé.")
      setNoms(liste)
    } catch (e) {
      setErreur(e.message || 'Impossible de lire le mois collé.')
    }
  }

  function choisir(nom) {
    setErreur(null); setSucces(null)
    try {
      const { ics, nom: trouve, nbEvents, moisLabel, moisSlug } = genererIcs(lignesDepuisTexte(texte), nom)
      telecharger(ics, `agenda-${trouve.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${moisSlug}.ics`,
        'text/calendar;charset=utf-8')
      setSucces(`${trouve} — ${nbEvents} événement(s) pour ${moisLabel}. Fichier téléchargé : ouvre-le pour l'ajouter à ton agenda.`)
    } catch (e) {
      setErreur(e.message || 'Génération impossible.')
    }
  }

  const carte = {
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: 20,
  }
  const bouton = {
    padding: '9px 18px',
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    fontSize: 14,
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Sync agenda</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
          Copie tout le tableau d'un mois depuis le fichier visuel du planning, colle-le ci-dessous,
          puis clique sur <strong>ton nom</strong> : tu obtiens un fichier <code>.ics</code> à ouvrir
          pour ajouter ton planning à ton agenda (Apple, Outlook, Google). Un jour de congé apparaît
          « Congé » toute la journée, sans poste. Tout se calcule dans ton navigateur.
        </p>
      </div>

      <div style={carte}>
        <textarea
          value={texte}
          onChange={e => { setTexte(e.target.value); setNoms(null); setSucces(null) }}
          placeholder="Colle ici le mois entier (Ctrl+V)…"
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: 180,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            padding: 12,
            border: '0.5px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ marginTop: 12 }}>
          <button onClick={analyser} disabled={!texte.trim()} style={{ ...bouton, opacity: texte.trim() ? 1 : 0.5 }}>
            Analyser le mois
          </button>
        </div>
        {erreur && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--color-danger, #c0392b)' }}>{erreur}</div>
        )}
      </div>

      {noms && (
        <div style={carte}>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            Clique sur ton nom :
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {noms.map(nom => (
              <button
                key={nom}
                onClick={() => choisir(nom)}
                style={{
                  padding: '10px 18px',
                  background: 'var(--color-bg)',
                  color: 'var(--color-primary)',
                  border: '0.5px solid var(--color-primary)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                {nom}
              </button>
            ))}
          </div>
        </div>
      )}

      {succes && (
        <div style={{
          ...carte,
          borderColor: 'var(--color-primary)',
          fontSize: 13,
          color: 'var(--color-text)',
          lineHeight: 1.5,
        }}>
          {succes}
        </div>
      )}
    </div>
  )
}
