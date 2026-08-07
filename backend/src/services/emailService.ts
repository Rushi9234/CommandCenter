import { getEmailProvider } from './email/providers/emailProviderFactory';

// Milestone 4: generateVerificationToken removed -- it duplicated
// modules/auth/jwt.ts's generateOpaqueToken (same crypto.randomBytes(32)
// implementation), which auth.service.ts now uses instead. This file's job
// is sending, not generating, tokens.
//
// Milestone 11: sendVerificationEmail/sendPasswordResetEmail used to log
// the raw, unhashed token as a clickable link -- in every environment,
// including production, with no guard at all. Anyone with read access to
// server logs could lift a live password-reset or email-verification
// token straight out of them and take over the account it belonged to.
// The URL is still built the same way (so a real provider can be wired in
// here later without changing this function's signature or return
// behavior); it just never goes into `metadata` (see providers/README.md
// -- only `metadata` is safe for a provider to log).
//
// Milestone 15: this file no longer logs anything itself, or knows how a
// send actually happens -- it builds the message (recipient, subject,
// body, and which fields are safe to log) and hands it to whichever
// EmailProvider emailProviderFactory selects. Every exported function's
// signature and return behavior is unchanged.
const getBaseUrl = () => (process.env.NODE_ENV === 'production' ? 'https://commandcenter-sand.vercel.app' : 'http://localhost:3000');

export const sendVerificationEmail = async (email: string, token: string, fullName: string) => {
  const verificationUrl = `${getBaseUrl()}/verify-email?token=${token}`;

  // TODO: Replace ConsoleEmailProvider with a real provider (SendGrid,
  // AWS SES, etc.) implementing EmailProvider -- this call site doesn't
  // change either way.
  return getEmailProvider().send({
    to: email,
    subject: 'Verify your CommandCenter account',
    body: `Hi ${fullName}, please verify your email by visiting: ${verificationUrl}`,
    templateData: { fullName, verificationUrl },
    metadata: { event: 'email.verification_sent', to: email, name: fullName },
  });
};

export const sendPasswordResetEmail = async (email: string, token: string, fullName: string) => {
  const resetUrl = `${getBaseUrl()}/reset-password?token=${token}`;

  return getEmailProvider().send({
    to: email,
    subject: 'Reset your CommandCenter password',
    body: `Hi ${fullName}, reset your password (expires in 1 hour): ${resetUrl}`,
    templateData: { fullName, resetUrl },
    metadata: { event: 'email.password_reset_sent', to: email, name: fullName },
  });
};

export const sendTeamInviteEmail = async (email: string, teamName: string, inviterName: string) => {
  const inviteLink = `${getBaseUrl()}/login?invite=${encodeURIComponent(email)}&team=${encodeURIComponent(teamName)}`;

  return getEmailProvider().send({
    to: email,
    subject: `You've been invited to join ${teamName} on CommandCenter`,
    body: `${inviterName} invited you to join ${teamName}. Accept your invitation: ${inviteLink}`,
    templateData: { teamName, inviterName, inviteLink },
    // Not a credential-bearing link (unlike the two tokens above), so
    // including it in metadata (and therefore in ConsoleEmailProvider's
    // log output) is unchanged from before this milestone.
    metadata: { event: 'email.team_invite_sent', to: email, team: teamName, invitedBy: inviterName, inviteLink },
  });
};
