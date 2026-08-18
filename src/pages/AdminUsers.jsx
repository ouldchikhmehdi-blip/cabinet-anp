import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { ASSOCIES, appliquerAssocies } from '../data/associes'

/**
 * AdminUsers — gestion des comptes (visible uniquement par les admins).
 *
 * Fonctionnalités :
 *   - Lister tous les profils (RLS : visible par admin seulement)
 *   - Inviter un nouvel utilisateur (email + rôle)
 *   - Promouvoir / rétrograder le rôle d'un utilisateur
 *   - Révoquer l'accès d'un utilisateur
 */
// Colonnes du module congés IADE (ajoutées par supabase/iade_conges.sql).
// Tant que ce fichier n'a pas été exécuté en base, la requête échoue : on
// recharge alors sans ces colonnes et on signale que le module est à activer.
const CHAMPS_PROFILS       = 'id, email, role, status, initiales, is_faiseur, nom_complet, created_at'
const CHAMPS_PROFILS_IADE  = `${CHAMPS_PROFILS}, is_iade, is_gestion_iade`
const CHAMPS_INVITS        = 'id, email, role, expires_at, used_at, created_at'
const CHAMPS_INVITS_IADE   = `${CHAMPS_INVITS}, is_iade`

export default function AdminUsers() {
  const { session, profile: moi } = useAuth()
  const [profiles,    setProfiles]    = useState([])
  const [invitations, setInvitations] = useState([])
  const [moduleIade,  setModuleIade]  = useState(true)
  const [sieges,      setSieges]      = useState(() => [...ASSOCIES])  // liste ordonnée des associés (initiales)
  const [charge,      setCharge]      = useState(true)
  const [erreur,      setErreur]      = useState(null)
  const [succes,      setSucces]      = useState(null)

  // Formulaire d'invitation
  const [emailInvit, setEmailInvit] = useState('')
  const [roleInvit,  setRoleInvit]  = useState('user')
  const [nomInvit,   setNomInvit]   = useState('')
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
      let [{ data: p, error: pErr }, { data: i, error: iErr }, { data: s }] = await Promise.all([
        supabase.from('profiles').select(CHAMPS_PROFILS_IADE).order('created_at'),
        supabase.from('invitations').select(CHAMPS_INVITS_IADE).order('created_at', { ascending: false }),
        supabase.from('planning_associes').select('liste').eq('id', 1).maybeSingle(),
      ])

      // Repli si supabase/iade_conges.sql n'a pas encore été exécuté.
      const iadePret = !pErr && !iErr
      if (pErr) ({ data: p } = await supabase.from('profiles').select(CHAMPS_PROFILS).order('created_at'))
      if (iErr) ({ data: i } = await supabase.from('invitations').select(CHAMPS_INVITS).order('created_at', { ascending: false }))

      setModuleIade(iadePret)
      setProfiles(p ?? [])
      setInvitations(i ?? [])
      if (Array.isArray(s?.liste) && s.liste.length) setSieges(s.liste)
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
      // « iade » n'est pas un rôle en base : c'est un compte `user` porteur du drapeau is_iade.
      const estIade = roleInvit === 'iade'
      const res = await fetch('/api/invite', {
        method: 'POST', headers,
        body: JSON.stringify({
          email: emailInvit.trim(),
          role:  estIade ? 'user' : roleInvit,
          isIade: estIade,
          nomComplet: nomInvit.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLienGenere({
        email: emailInvit.trim(),
        url: data.link,
        emailSent: data.emailSent,
        emailErreur: data.emailErreur ?? null,
        iade: estIade,
      })
      flash(data.message)
      setEmailInvit(''); setRoleInvit('user'); setNomInvit('')
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

  // ── Drapeaux du module congés IADE ────────────────────────────────
  // isIade : compte restreint (ne voit que ses congés) · isGestionIade : valide les demandes.
  async function attribuerIade(userId, isIade, isGestionIade) {
    try {
      const res = await fetch('/api/iade-attribuer', {
        method: 'POST', headers,
        body: JSON.stringify({ userId, isIade, isGestionIade }),
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

  // ── Supprimer définitivement ──────────────────────────────────────
  async function supprimer(userId, email) {
    if (!confirm(
      `Supprimer DÉFINITIVEMENT le compte de ${email} ?\n\n` +
      `Cette action est irréversible : le compte, ses invitations et son ` +
      `éventuelle initiale d'associé seront libérés. Les plannings déjà ` +
      `archivés ne sont pas affectés.`
    )) return
    try {
      const res = await fetch('/api/delete-user', {
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

  // ── Remplacer un associé (changer ses initiales pour le prochain planning) ──
  async function remplacerAssocie(ancienne) {
    const saisie = prompt(
      `Remplacer l'associé « ${ancienne} » par de nouvelles initiales.\n\n` +
      `Le PROCHAIN planning utilisera ces initiales (les plannings déjà archivés ` +
      `ne sont pas modifiés). Saisir les nouvelles initiales :`,
      ''
    )
    if (saisie == null) return
    const nouvelle = saisie.trim().toUpperCase()
    if (!nouvelle) return
    if (!confirm(`Confirmer le remplacement « ${ancienne} » → « ${nouvelle} » ?`)) return
    try {
      const res = await fetch('/api/planning-remplacer-associe', {
        method: 'POST', headers,
        body: JSON.stringify({ ancienne, nouvelle }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      appliquerAssocies(data.liste)  // met à jour ASSOCIES en mémoire (écrans planning à venir)
      setSieges(data.liste)
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
    boutonDangerFort: {
      fontSize: 12,
      padding: '3px 10px',
      borderRadius: 6,
      border: '0.5px solid var(--color-danger)',
      background: 'var(--color-danger)',
      color: '#fff',
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

      {/* Module congés IADE pas encore installé en base */}
      {!moduleIade && (
        <div style={{ fontSize: 13, color: 'var(--color-amber)', background: 'var(--color-amber-light)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
          Module « congés IADE » inactif : exécutez <strong>supabase/iade_conges.sql</strong> dans
          Supabase → SQL Editor pour pouvoir créer des comptes IADE et désigner un gestionnaire.
        </div>
      )}

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
                <option value="iade" disabled={!moduleIade}>IADE (congés uniquement)</option>
              </select>
            </div>
            <div>
              {/* Nom porté par l'invitation : le compte est nommé dès sa création.
                  Obligatoire pour un IADE — c'est ce nom qui identifie l'auteur d'une demande. */}
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                Nom complet {roleInvit === 'iade' ? '' : '(facultatif)'}
              </label>
              <input
                type="text"
                required={roleInvit === 'iade'}
                value={nomInvit}
                onChange={e => setNomInvit(e.target.value)}
                style={{ ...s.input, width: 200 }}
                placeholder={roleInvit === 'iade' ? 'Prénom Nom' : 'Dr Nom'}
              />
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
                {lienGenere.emailSent
                  ? `E-mail envoyé à ${lienGenere.email}`
                  : `Lien d'invitation pour ${lienGenere.email}`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                {lienGenere.emailSent ? (
                  <>
                    Le message explique la marche à suivre
                    {lienGenere.iade
                      ? ' (création du compte, connexion Google si adresse Gmail, aucun code de sécurité).'
                      : ' (création du compte puis mise en place de la double authentification).'}
                    {' '}Le lien ci-dessous reste disponible si la personne ne reçoit rien.
                  </>
                ) : (
                  <>Transmettez ce lien à la personne (WhatsApp, SMS, e-mail perso).</>
                )}
                {' '}Il est valable <strong>48 h</strong>, <strong>à usage unique</strong>, et
                ne sera <strong>plus affiché</strong> après avoir quitté cette page.
              </div>

              {/* L'échec d'envoi est silencieux côté Resend : on l'affiche, sinon
                  on croit l'e-mail parti alors que le domaine n'est pas vérifié. */}
              {!lienGenere.emailSent && (
                <div style={{ fontSize: 12, color: 'var(--color-amber)', background: 'var(--color-amber-light)', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                  L'e-mail n'a pas pu être envoyé{lienGenere.emailErreur ? ` — ${lienGenere.emailErreur}` : ''}.
                  Vérifiez la clé Resend et le domaine vérifié (cf. AUTH.md), ou transmettez le lien à la main.
                </div>
              )}
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
                  <th style={s.th}>Congés IADE</th>
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
                        {p.role === 'admin' ? 'Admin' : p.is_iade ? 'IADE' : 'Utilisateur'}
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
                        disabled={p.status !== 'active' || p.is_iade === true}
                        onChange={e => attribuer(p.id, e.target.value || null, p.is_faiseur, p.nom_complet ?? null)}
                        style={{ ...s.input, padding: '4px 8px', fontSize: 12 }}
                      >
                        <option value="">—</option>
                        {sieges.map(a => {
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
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: p.status === 'active' && !p.is_iade ? 'pointer' : 'default' }}>
                        <input
                          type="checkbox"
                          checked={p.is_faiseur === true}
                          disabled={p.status !== 'active' || p.is_iade === true}
                          onChange={e => attribuer(p.id, p.initiales ?? null, e.target.checked, p.nom_complet ?? null)}
                          style={{ accentColor: 'var(--color-primary)' }}
                        />
                        {p.is_faiseur && <span style={s.badge('admin', p.status)}>Faiseur</span>}
                      </label>
                    </td>
                    {/* Congés IADE : « Agent » = compte restreint aux congés · « Gestion » = valide les demandes.
                        Les deux sont exclusifs, et un agent IADE ne peut être ni admin, ni faiseur, ni associé. */}
                    <td style={s.td}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-secondary)', cursor: moduleIade && p.status === 'active' ? 'pointer' : 'default' }}>
                          <input
                            type="checkbox"
                            checked={p.is_iade === true}
                            disabled={!moduleIade || p.status !== 'active' || p.is_gestion_iade === true || p.role === 'admin' || p.is_faiseur === true || !!p.initiales}
                            onChange={e => attribuerIade(p.id, e.target.checked, false)}
                            style={{ accentColor: 'var(--color-primary)' }}
                          />
                          Agent
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-secondary)', cursor: moduleIade && p.status === 'active' ? 'pointer' : 'default' }}>
                          <input
                            type="checkbox"
                            checked={p.is_gestion_iade === true}
                            disabled={!moduleIade || p.status !== 'active' || p.is_iade === true}
                            onChange={e => attribuerIade(p.id, false, e.target.checked)}
                            style={{ accentColor: 'var(--color-primary)' }}
                          />
                          Gestion
                        </label>
                      </div>
                    </td>
                    <td style={{ ...s.td, color: 'var(--color-text-secondary)' }}>{fmtDate(p.created_at)}</td>
                    <td style={s.td}>
                      {p.id !== moi?.id && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {p.status === 'active' && (
                            <>
                              {/* Un compte IADE reste un compte restreint : pas de promotion possible. */}
                              {p.role === 'user' ? (
                                <button style={s.boutonSec} disabled={p.is_iade === true} onClick={() => changerRole(p.id, 'admin')}>
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
                            </>
                          )}
                          <button style={s.boutonDangerFort} onClick={() => supprimer(p.id, p.email)}>
                            Supprimer
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

      {/* ── Sièges / associés (ordre des colonnes du planning) ── */}
      <div style={s.section}>
        <div style={s.titre}>Associés du planning ({sieges.length})</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12, maxWidth: 720 }}>
          Liste ordonnée des initiales (= ordre des colonnes du planning). Lors d'un départ
          (retraite), <strong>remplacez</strong> l'initiale du partant par celle de l'arrivant :
          le <strong>prochain</strong> planning utilisera la nouvelle initiale, à la même position.
          Les plannings déjà archivés ne sont pas modifiés. Pensez ensuite à supprimer l'ancien
          compte et à attribuer la nouvelle initiale au nouveau compte.
        </div>
        <div style={s.card}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={s.tr}>
                <th style={s.th}>#</th>
                <th style={s.th}>Initiales</th>
                <th style={s.th}>Compte associé</th>
                <th style={s.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sieges.map((ini, i) => {
                const titulaire = profiles.find(p => p.initiales === ini)
                return (
                  <tr key={ini} style={s.tr}>
                    <td style={{ ...s.td, color: 'var(--color-text-tertiary)' }}>{i + 1}</td>
                    <td style={{ ...s.td, fontWeight: 600 }}>{ini}</td>
                    <td style={{ ...s.td, color: titulaire ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
                      {titulaire ? `${titulaire.nom_complet || titulaire.email}${titulaire.status !== 'active' ? ' (désactivé)' : ''}` : 'Non attribué'}
                    </td>
                    <td style={s.td}>
                      <button style={s.boutonSec} onClick={() => remplacerAssocie(ini)}>
                        Remplacer
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
                    <td style={s.td}>{i.is_iade ? 'IADE (congés)' : i.role === 'admin' ? 'Admin' : 'Utilisateur'}</td>
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
