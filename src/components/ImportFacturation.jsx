// Bouton « Importer les justificatifs » de l'onglet Facturé → Facturé / réglé (admins et rôle Compta).
// On dépose les FAC / RED d'un mois, tous associés et établissements : ils sont lus ICI, dans le
// navigateur (ils portent des noms de patients), et seuls les agrégats par associé × établissement
// partent en base (src/data/facturationImport.js, supabase/facturation_import.sql). Aperçu, puis
// confirmation ; un mois déjà importé est remplacé associé par associé, le reste est laissé tel quel.
import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { lireFichiersFacturation, comparerAvecBase, totauxImport, libelleMois } from '../data/facturationImport'
import { importerFacturationMois } from '../data/facturationApi'
import { rechargerFacturation } from '../data/facturation'
import { fmtEur } from '../data/mockData'

const bouton = (principal = false) => ({
  fontSize: 11, padding: '5px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
  border: `0.5px solid ${principal ? 'var(--color-primary)' : 'var(--color-border)'}`,
  background: principal ? 'var(--color-primary)' : 'var(--color-surface)',
  color: principal ? '#fff' : 'var(--color-text-secondary)',
})
const encart = (fond, texte) => ({ fontSize: 12, padding: '8px 12px', borderRadius: 8, background: fond, color: texte, lineHeight: 1.5 })
const td = { padding: '5px 8px', fontSize: 12, textAlign: 'right', borderTop: '0.5px solid var(--color-border)' }
const th = { ...td, borderTop: 'none', color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 11 }
const lisible = (cle) => cle.replace('|', ' · ')

async function lireFichier(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  return { nom: file.name, rows: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) }
}

export default function ImportFacturation({ mensuelBase = [] }) {
  const [ouvert, setOuvert] = useState(false)
  const [drag, setDrag] = useState(false)
  const [lecture, setLecture] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [apercu, setApercu] = useState(null)   // résultat de lireFichiersFacturation + comparaison
  const [message, setMessage] = useState(null) // { ok, texte }
  const fileRef = useRef(null)

  const fermer = () => { setOuvert(false); setApercu(null); setMessage(null) }

  async function lire(files) {
    const liste = [...(files || [])]
    if (!liste.length) return
    setLecture(true); setMessage(null); setApercu(null)
    try {
      const fichiers = []
      const illisibles = []
      for (const f of liste) {
        try { fichiers.push(await lireFichier(f)) } catch { illisibles.push(`${f.name} : fichier illisible`) }
      }
      const r = lireFichiersFacturation(fichiers)
      if (illisibles.length) r.erreurs = [...illisibles, ...r.erreurs]
      setApercu({ ...r, comparaison: r.erreurs.length ? null : comparerAvecBase(r, mensuelBase) })
    } finally {
      setLecture(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function importer() {
    setEnvoi(true); setMessage(null)
    try {
      const n = await importerFacturationMois(apercu.mensuel)
      await rechargerFacturation()
      setMessage({ ok: true, texte: `${libelleMois(apercu.annee, apercu.mois)} importé : ${n} ligne${n > 1 ? 's' : ''} associé × établissement. « Par chirurgien » sera complété au prochain passage du script sur le mini PC.` })
      setApercu(null)
    } catch (e) {
      setMessage({ ok: false, texte: `Import refusé : ${e?.message || e}` })
    } finally {
      setEnvoi(false)
    }
  }

  const c = apercu?.comparaison
  const tot = apercu && !apercu.erreurs.length ? totauxImport(apercu.mensuel) : null

  return (
    <div>
      <button type="button" style={bouton()} onClick={() => (ouvert ? fermer() : setOuvert(true))}>
        ⬆ Importer les justificatifs
      </button>

      {ouvert && (
        <div style={{ marginTop: 10, background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Déposer <strong>tous les fichiers FAC et RED d'un mois</strong>, pour l'ensemble des associés et des établissements
            (<code>…&amp;OULD010&amp;MIL&amp;FAC.xlsx</code>). Ils sont lus sur cet ordinateur : seuls les totaux par associé
            partent sur le site, aucun nom de patient.
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); lire(e.dataTransfer.files) }}
            onClick={() => fileRef.current?.click()}
            style={{
              padding: '22px 16px', textAlign: 'center', cursor: 'pointer', borderRadius: 'var(--radius-md)',
              border: `2px dashed ${drag ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: drag ? 'var(--color-primary-light)' : 'transparent',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>
              {lecture ? 'Lecture des fichiers…' : 'Glisser les fichiers du mois ici'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>ou cliquer pour les choisir (sélection multiple)</div>
            <input ref={fileRef} type="file" multiple accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => lire(e.target.files)} />
          </div>

          {apercu?.erreurs.length > 0 && (
            <div style={encart('#FBE9E9', '#A32D2D')}>
              <strong>Rien n'a été importé.</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{apercu.erreurs.map(e => <li key={e}>{e}</li>)}</ul>
            </div>
          )}

          {apercu && !apercu.erreurs.length && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                Aperçu — {libelleMois(apercu.annee, apercu.mois)}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>Associé · établissement</th>
                    <th style={{ ...th, textAlign: 'center' }}>FAC</th><th style={{ ...th, textAlign: 'center' }}>RED</th>
                    <th style={th}>Facturé</th><th style={th}>Réglé</th><th style={th}>Redevance TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {apercu.mensuel.map(r => (
                    <tr key={`${r.associe}|${r.etablissement}`}>
                      <td style={{ ...td, textAlign: 'left' }}>
                        {r.associe} · {r.etablissement}
                        {c.remplaces.includes(`${r.associe}|${r.etablissement}`) && <span style={{ marginLeft: 6, fontSize: 10, color: '#8a5a00' }}>remplace</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>{r.fichier_fac ? '✓' : '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{r.fichier_red ? '✓' : '—'}</td>
                      <td style={td}>{r.fichier_fac ? fmtEur(r.facture_total) : ''}</td>
                      <td style={td}>{r.fichier_red ? fmtEur(r.regle_total) : ''}</td>
                      <td style={td}>{r.fichier_red ? fmtEur(r.redevance_ttc) : ''}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600 }}>
                    <td style={{ ...td, textAlign: 'left' }}>Total</td><td style={td} /><td style={td} />
                    <td style={td}>{fmtEur(tot.facture)}</td><td style={td}>{fmtEur(tot.regle)}</td><td style={td}>{fmtEur(tot.redevance)}</td>
                  </tr>
                </tbody>
              </table>

              {apercu.ignores.length > 0 && (
                <div style={encart('var(--color-bg)', 'var(--color-text-secondary)')}>
                  Ignorés (pas des justificatifs FAC / RED) : {apercu.ignores.join(', ')}
                </div>
              )}
              {c.manquants.length > 0 && (
                <div style={encart('#FFF4E0', '#8a5a00')}>
                  ⚠ Présents en {libelleMois(c.precedent.annee, c.precedent.mois)} mais absents de cet import :{' '}
                  <strong>{c.manquants.map(lisible).join(', ')}</strong>. Un fichier oublié ? Il pourra être importé plus tard, seul.
                </div>
              )}
              {c.partiels.length > 0 && (
                <div style={encart('#FFF4E0', '#8a5a00')}>
                  ⚠ Moitié seulement pour {c.partiels.map(p => `${lisible(p.cle)} (pas de ${p.manque})`).join(', ')}.
                  Si cette moitié est déjà en base, elle est gardée.
                </div>
              )}
              {c.dejaImporte && (
                <div style={encart('#FFF4E0', '#8a5a00')}>
                  <strong>{libelleMois(apercu.annee, apercu.mois)} est déjà importé.</strong>{' '}
                  {c.remplaces.length > 0 && <>Seront remplacés : {c.remplaces.map(lisible).join(', ')}. </>}
                  {c.conserves.length > 0 && <>Laissés tels quels (absents de l'import) : {c.conserves.map(lisible).join(', ')}.</>}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={{ ...bouton(true), opacity: envoi ? 0.6 : 1 }} disabled={envoi} onClick={importer}>
                  {envoi ? 'Import…' : c.dejaImporte ? `Remplacer ${libelleMois(apercu.annee, apercu.mois)}` : `Importer ${libelleMois(apercu.annee, apercu.mois)}`}
                </button>
                <button type="button" style={bouton()} disabled={envoi} onClick={() => setApercu(null)}>Annuler</button>
              </div>
            </>
          )}

          {message && <div style={message.ok ? encart('#E1F5EE', '#085041') : encart('#FBE9E9', '#A32D2D')}>{message.texte}</div>}
        </div>
      )}
    </div>
  )
}
