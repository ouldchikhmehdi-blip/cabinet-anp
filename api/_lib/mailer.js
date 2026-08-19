// ============================================================
// mailer.js — envoi d'e-mails transactionnels via SMTP Gmail.
//
// L'envoi part de GMAIL_USER vers n'importe quel destinataire (pas de domaine à
// vérifier). Best-effort : envoyerEmail() ne lève JAMAIS — l'appelant décide quoi
// faire de l'échec, l'action métier ne doit pas être bloquée par un e-mail.
// Création du mot de passe d'application : cf. AUTH.md § Étape 5.
// ============================================================
import nodemailer from 'nodemailer'

/**
 * Envoie un e-mail. Renvoie { sent: boolean, error: string|null }.
 * Ne rejette jamais.
 */
export async function envoyerEmail({ to, subject, html, text }) {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD non configurés.')
    }
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })
    await transporter.sendMail({
      from:    `"SARM Dashboard" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
      text,
    })
    return { sent: true, error: null }
  } catch (err) {
    console.error('Erreur envoi Gmail (non bloquante):', err)
    return { sent: false, error: (err?.message ?? 'Service d\'envoi injoignable.').slice(0, 200) }
  }
}
