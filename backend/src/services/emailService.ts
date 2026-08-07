import { getLogger } from '../common/logging/loggerFactory';

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
// behavior), it's just never passed to a log call.
//
// Milestone 14: console.log calls replaced with getLogger() -- same
// events, same fields, just through the Logger interface instead of
// console directly.
const getBaseUrl = () => (process.env.NODE_ENV === 'production' ? 'https://commandcenter-sand.vercel.app' : 'http://localhost:3000');

export const sendVerificationEmail = async (email: string, token: string, fullName: string) => {
  const verificationUrl = `${getBaseUrl()}/verify-email?token=${token}`;

  // TODO: Replace with actual email service (SendGrid, AWS SES, etc.),
  // passing verificationUrl to it. Until then, this stub only logs that a
  // send was attempted -- never the token or the link built from it.
  getLogger().info('Verification email sent', { event: 'email.verification_sent', to: email, name: fullName });

  return true;
};

export const sendPasswordResetEmail = async (email: string, token: string, fullName: string) => {
  const resetUrl = `${getBaseUrl()}/reset-password?token=${token}`;

  // TODO: Replace with actual email service (SendGrid, AWS SES, etc.),
  // passing resetUrl to it. Until then, this stub only logs that a send
  // was attempted -- never the token or the link built from it.
  getLogger().info('Password reset email sent', { event: 'email.password_reset_sent', to: email, name: fullName });

  return true;
};

export const sendTeamInviteEmail = async (email: string, teamName: string, inviterName: string) => {
  const inviteLink = `${getBaseUrl()}/login?invite=${encodeURIComponent(email)}&team=${encodeURIComponent(teamName)}`;

  // Not a credential-bearing link (unlike the two tokens above), so
  // including it in structured context is unchanged from before -- only
  // the decorative multi-line console.log banner became one structured
  // log entry carrying the same information (recipient, team, inviter,
  // link).
  getLogger().info('Team invite email sent', {
    event: 'email.team_invite_sent',
    to: email,
    team: teamName,
    invitedBy: inviterName,
    inviteLink,
  });

  // TODO: Replace with actual email service (SendGrid, AWS SES, etc.)

  return true;
};
