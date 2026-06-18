import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { ASSOCIES } from '../data/associes'

/**
 * AdminUsers — gestion des comptes (visible uniquement par les admins).
 *
 * Fonctionnalités :
 *   - Lister tous les profils (RLS : visible par admin seulement)
 *   - Inviter un nouvel utilisateur (email + rôle)
 *   - Promouvoir / rétrograder le rôle d'un utilisateur
 *   - Révoquer l'accès d'un utilisateur
 */
export default function AdminUsers() {
  const { session, profile: moi } = useAuth()
  const [profiles,    setProfiles]    = useState([])
  const [invitations, setInvitations] = useState([])
  const [charge,      setCharge]      = useState(true)
  const [erreur,      setErreur]      = useState(null)
  const [succes,      setSucces]      = useState(null)

  // Formulaire d'invitation
  const [emailInvit, setEmailInvit] = useState('')
  const [roleInvit,  setRoleInvit]  = useState('user')
  const [envoi,      setEnvoi]      = useState(false)
  const [lienGenere, setLienGenere] = useState(null)  // { email, url, emailSent }
  const [copie,      setCopie]      = useState(false)

  // Obtenir le JWT pour appeler les /api
  const jwt = session?.access_token

  const headers = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${jwt}`,
  }

  // ── Chargement ────────────────────────────────────────────────────
  const charger = useCallback(async () => {
    setCharge(true)
    setErreur(null)
    try {
      const [{ data: p }, { data: i }] = await Promise.all([
        supabase.from('profiles').select('id, email, role, status, initiales, is_faiseur, nom_complet, created_at').order('created_at'),
        supabase.from('invitations').select('id, email, role, expires_at, used_at, created_at').order('created_at', { ascending: false }),
      ])
      setProfiles(p ?? [])
      setInvitations(i ?? [])
    } catch {
      setErreur('Impossible de charger les données.')
    } finally {
      setCharge(false)
    }
  }, [])

  // Chargement initial des données (asynchrone : les setState arrivent après les requêtes).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { charger() }, [charger])

  // ── Flash message ─────────────────────────────────────────────────
  function flash(msg, estErreur = false) {
    if (estErreur) setErreur(msg)
    else { setSucces(msg); setTimeout(() => setSucces(null), 4000) }
  }

  // ── Inviter ───────────────────────────────────────────────────────
  async function inviter(e) {
    e.preventDefault()
    setEnvoi(true); setErreur(null); setLienGenere(null); setCopie(false)
    try {
      const res = await fetch('/api/invite', {
        method: 'POST', headers,
        body: JSON.stringify({ email: emailInvit.trim(), role: roleInvit }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLienGenere({ email: emailInvit.trim(), url: data.link, emailSent: data.emailSent })
      flash(data.message)
      setEmailInvit(''); setRoleInvit('user')
      charger()
    } catch (err) {
      flash(err.message, true)
    } finally {
      setEnvoi(false)
    }
  }

  // ── Copier le lien d'invitation ───────────────────────────────────
  async function copierLien() {
    try {
      await navigator.clipboard.writeText(lienGenere.url)
      setCopie(true)
      setTimeout(() => setCopie(false), 2500)
    } catch {
      // navigator.clipboard indisponible (contexte non sécurisé) — l'utilisateur
      // peut sélectionner manuellement le champ, qui est en lecture seule.
    }
  }

  // ── Attribuer initiales + rôle faiseur + nom complet ──────────────
  async function attribuer(userId, initiales, isFaiseur, nomComplet) {
    try {
      const res = await fetch('/api/planning-attribuer', {
        method: 'POST', headers,
        body: JSON.stringify({ userId, initiales, isFaiseur, nomComplet }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      flash(data.message)
      charger()
    } catch (err) {
      flash(err.message, true)
    }
  }

  // ── Promouvoir / rétrograder ──────────────────────────────────────
  async function changerRole(userId, nouveauRole) {
    try {
      const res = await fetch('/api/promote', {
        method: 'POST', headers,
        body: JSON.stringify({ userId, role: nouveauRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      flash(data.message)
      charger()
    } catch (err) {
      flash(err.message, true)
    }
  }

  // ── Révoquer ──────────────────────────────────────────────────────
  async function revoquer(userId, email) {
    if (!confirm(`Révoquer l'accès de ${email} ? Cette action est immédiate.`)) return
    try {
      const res = await fetch('/api/revoke', {
        method: 'POST', headers,
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      flash(data.message)
      charger()
    } catch (err) {
      flash(err.message, true)
    }
  }

  // ── Styles ────────────────────────────────────────────────────────
  const s = {
    section: { marginBottom: 32 },
    titre:   { fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12 },
    card: {
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    },
    tr: { borderBottom: '0.5px solid var(--color-border)' },
    th: { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' },
    td: { padding: '10px 14px', fontSize: 13, color: 'var(--color-text)' },
    badge: (role, status) => ({
      fontSize: 11,
      fontWeight: 500,
      padding: '2px 8px',
      borderRadius: 10,
      background: status === 'disabled'
        ? 'var(--color-bg)'
        : role === 'admin'
          ? 'var(--color-primary-light)'
          : 'var(--color-bg)',
      color: status === 'disabled'
        ? 'var(--color-text-tertiary)'
        : role === 'admin'
          ? 'var(--color-primary)'
          : 'var(--color-text-secondary)',
    }),
    boutonDanger: {
      fontSize: 12,
      padding: '3px 10px',
      borderRadius: 6,
      border: '0.5px solid var(--color-danger)',
      background: 'transparent',
      color: 'var(--color-danger)',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
    boutonSec: {
      fontSize: 12,
      padding: '3px 10px',
      borderRadius: 6,
      border: '0.5px solid var(--color-border)',
      background: 'transparent',
      color: 'var(--color-text-secondary)',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
    input: {
      padding: '8px 12px',
      fontSize: 13,
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      outline: 'none',
    },
    boutonPrimary: {
      padding: '8px 16px',
      background: 'var(--color-primary)',
      color: '#fff',
      border: 'none',
      borderRadius: 'var(--radius-md)',
      fontSize: 13,
      fontWeight: 500,
      cursor: envoi ? 'wait' : 'pointer',
      opacity: envoi ? 0.7 : 1,
    },
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

  const invitationsActives = invitations.filter(i => !i.used_at && new Date(i.expires_at) > new Date())

  return (
    <div style={{ maxWidth: 1180 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Gestion des comptes</h1>

      {/* Messages flash */}
      {erreur  && <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>{erreur}</div>}
      {succes  && <div style={{ fontSize: 13, color: 'var(--color-success)', background: 'var(--color-success-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>{succes}</div>}

      {/* ── Formulaire d'invitation ── */}
      <div style={{ ...s.section }}>
        <div style={s.titre}>Inviter un nouvel utilisateur</div>
        <div style={s.card}>
          <form onSubmit={inviter} style={{ padding: 20, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                Adresse e-mail
              </label>
              <input
                type="email"
                required
                value={emailInvit}
                onChange={e => setEmailInvit(e.target.value)}
                style={{ ...s.input, width: 260 }}
                placeholder="collaborateur@exemple.fr"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                Rôle
              </label>
              <select
                value={roleInvit}
                onChange={e => setRoleInvit(e.target.value)}
                style={s.input}
              >
                <option value="user">Utilisateur</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>
            <button type="submit" disabled={envoi} style={s.boutonPrimary}>
              {envoi ? 'Envoi…' : 'Générer l\'invitation'}
            </button>
          </form>

          {/* Lien d'invitation à transmettre manuellement */}
          {lienGenere && (
            <div style={{
              borderTop: '0.5px solid var(--color-border)',
              padding: 20,
              background: 'var(--color-primary-light)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
                Lien d'invitation pour {lienGenere.email}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                {lienGenere.emailSent
                  ? 'Un e-mail a aussi été envoyé. '
                  : ''}
                Transmettez ce lien à la personne (WhatsApp, SMS, e-mail perso).
                Il est valable <strong>48 h</strong>, <strong>à usage unique</strong>, et
                ne sera <strong>plus affiché</strong> après avoir quitté cette page.
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  readOnly
                  value={lienGenere.url}
                  onFocus={e => e.target.select()}
                  style={{ ...s.input, flex: 1, minWidth: 280, fontFamily: 'monospace', fontSize: 12 }}
                />
                <button type="button" onClick={copierLien} style={s.boutonPrimary}>
                  {copie ? '✓ Copié' : 'Copier le lien'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Liste des comptes ── */}
      <div style={s.section}>
        <div style={s.titre}>Comptes ({profiles.length})</div>
        {charge ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Chargement…</div>
        ) : (
          <div style={s.card}>
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1024 }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>E-mail</th>
                  <th style={s.th}>Rôle</th>
                  <th style={s.th}>Statut</th>
                  <th style={s.th}>Initiales</th>
                  <th style={s.th}>Nom complet</th>
                  <th style={s.th}>Faiseur</th>
                  <th style={s.th}>Depuis</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(p => (
                  <tr key={p.id} style={s.tr}>
                    <td style={s.td}>
                      {p.email}
                      {p.id === moi?.id && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--color-text-tertiary)' }}>(vous)</span>}
                    </td>
                    <td style={s.td}>
                      <span style={s.badge(p.role, p.status)}>
                        {p.role === 'admin' ? 'Admin' : 'Utilisateur'}
                      </span>
                    </td>
                    <td style={s.td}>
                      <span style={{ fontSize: 11, color: p.status === 'active' ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
                        {p.status === 'active' ? 'Actif' : 'Désactivé'}
                      </span>
                    </td>
                    <td style={s.td}>
                      <select
                        value={p.initiales ?? ''}
                        disabled={p.status !== 'active'}
                        onChange={e => attribuer(p.id, e.target.value || null, p.is_faiseur, p.nom_complet ?? null)}
                        style={{ ...s.input, padding: '4px 8px', fontSize: 12 }}
                      >
                        <option value="">—</option>
                        {ASSOCIES.map(a => {
                          const prisAilleurs = profiles.some(x => x.id !== p.id && x.initiales === a)
                          return <option key={a} value={a} disabled={prisAilleurs}>{a}</option>
                        })}
                      </select>
                    </td>
                    <td style={s.td}>
                      {/* Nom complet (export « Planning par service »). key inclut la valeur enregistrée pour
                          réinitialiser le champ après sauvegarde ; commit au blur ou à Entrée. */}
                      <input
                        type="text"
                        key={`nom-${p.id}-${p.nom_complet ?? ''}`}
                        defaultValue={p.nom_complet ?? ''}
                        disabled={p.status !== 'active'}
                        placeholder="Dr Nom"
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (v !== (p.nom_complet ?? '')) attribuer(p.id, p.initiales ?? null, p.is_faiseur, v || null)
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        style={{ ...s.input, padding: '4px 8px', fontSize: 12, width: 130 }}
                      />
                    </td>
                    <td style={s.td}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: p.status === 'active' ? 'pointer' : 'default' }}>
                        <input
                          type="checkbox"
                          checked={p.is_faiseur === true}
                          disabled={p.status !== 'active'}
                          onChange={e => attribuer(p.id, p.initiales ?? null, e.target.checked, p.nom_complet ?? null)}
                          style={{ accentColor: 'var(--color-primary)' }}
                        />
                        {p.is_faiseur && <span style={s.badge('admin', p.status)}>Faiseur</span>}
                      </label>
                    </td>
                    <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>{fmtDate(p.created_at)}</td>
                    <td style={s.td}>
                      {p.id !== moi?.id && p.status === 'active' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {p.role === 'user' ? (
                            <button style={s.boutonSec} onClick={() => changerRole(p.id, 'admin')}>
                              Promouvoir admin
                            </button>
                          ) : (
                            <button style={s.boutonSec} onClick={() => changerRole(p.id, 'user')}>
                              Rétrograder
                            </button>
                          )}
                          <button style={s.boutonDanger} onClick={() => revoquer(p.id, p.email)}>
                            Révoquer
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Invitations en attente ── */}
      {invitationsActives.length > 0 && (
        <div style={s.section}>
          <div style={s.titre}>Invitations en attente ({invitationsActives.length})</div>
          <div style={s.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={s.tr}>
                  <th style={s.th}>E-mail invité</th>
                  <th style={s.th}>Rôle prévu</th>
                  <th style={s.th}>Expire le</th>
                </tr>
              </thead>
              <tbody>
                {invitationsActives.map(i => (
                  <tr key={i.id} style={s.tr}>
                    <td style={s.td}>{i.email}</td>
                    <td style={s.td}>{i.role === 'admin' ? 'Admin' : 'Utilisateur'}</td>
                    <td style={{ ...s.td, color: 'var(--color-amber)' }}>{fmtDate(i.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
