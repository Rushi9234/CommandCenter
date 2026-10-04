import * as emailProviderFactory from './email/providers/emailProviderFactory';
import { EmailMessage } from './email/providers/emailProvider.interface';
import { env } from '../config/env';
import { getLogger } from '../common/logging/loggerFactory';

const getBaseUrl = () => env.frontendUrl;

const sendSafely = async (message: EmailMessage): Promise<boolean> => {
  try {
    const sent = await emailProviderFactory.getEmailProvider().send(message);
    if (!sent) {
      getLogger().error('Email send failed', { event: 'email.send_failed', to: message.to, subject: message.subject });
    }
    return sent;
  } catch (error) {
    getLogger().error('Email send threw', { event: 'email.send_failed', to: message.to, subject: message.subject });
    return false;
  }
};

/**
 * Renders a standardized, responsive HTML email template for CommandCenter transactional emails.
 */
const buildBrandedHtml = (options: {
  title: string;
  recipientName: string;
  headline: string;
  bodyText: string;
  otpCode?: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string => {
  const { title, recipientName, headline, bodyText, otpCode, ctaText, ctaUrl, footerNote } = options;

  const otpSection = otpCode
    ? `
      <div style="margin: 24px 0; text-align: center;">
        <p style="font-size: 14px; color: #4b5563; margin-bottom: 8px; font-weight: 500;">Your 6-Digit Verification Code:</p>
        <div style="font-size: 32px; letter-spacing: 10px; font-weight: 700; font-family: 'Courier New', Courier, monospace; background-color: #f3f4f6; color: #1e3a8a; padding: 16px 24px; border-radius: 12px; display: inline-block; border: 1px solid #e5e7eb;">
          ${otpCode}
        </div>
        <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">Code expires in 10 minutes. Do not share this code with anyone.</p>
      </div>
    `
    : '';

  const ctaSection = ctaUrl && ctaText
    ? `
      <div style="margin: 24px 0; text-align: center;">
        <a href="${ctaUrl}" style="background: linear-gradient(135deg, #2563eb, #4f46e5); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
          ${ctaText}
        </a>
      </div>
    `
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e3a8a, #3b82f6); padding: 28px 32px; text-align: center;">
      <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); width: 44px; h-44px; border-radius: 10px; margin-bottom: 8px; line-height: 44px; color: #ffffff; font-weight: bold; font-size: 20px;">
        CC
      </div>
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">CommandCenter</h1>
    </div>

    <!-- Content Card -->
    <div style="padding: 32px;">
      <h2 style="font-size: 18px; color: #0f172a; margin-top: 0; margin-bottom: 12px; font-weight: 600;">${headline}</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-bottom: 16px;">Hi ${recipientName},</p>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-bottom: 16px;">${bodyText}</p>

      ${otpSection}
      ${ctaSection}

      ${footerNote ? `<p style="font-size: 13px; color: #64748b; line-height: 1.5; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">${footerNote}</p>` : ''}
    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">CommandCenter Transactional Email Service</p>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Sent to ${options.recipientName} &bull; Unsubscribe or manage preferences in your profile.</p>
    </div>

  </div>
</body>
</html>
  `;
};

export const sendVerificationEmail = async (email: string, token: string, fullName: string, otpCode?: string) => {
  const verificationUrl = `${getBaseUrl()}/verify-email?token=${token}`;
  const otpMessage = otpCode ? ` Your 6-digit verification code is: ${otpCode} (expires in 10 minutes).\n\nAlternatively, verify using this link:` : '';

  const html = buildBrandedHtml({
    title: 'Verify your CommandCenter account',
    recipientName: fullName,
    headline: 'Welcome to CommandCenter',
    bodyText: 'Thank you for creating an account. Please verify your email address to complete your registration.',
    otpCode,
    ctaText: 'Verify Account',
    ctaUrl: verificationUrl,
    footerNote: 'If you did not request this registration, you can safely ignore this email.',
  });

  return sendSafely({
    to: email,
    subject: 'Verify your CommandCenter account',
    body: `Hi ${fullName},${otpMessage} ${verificationUrl}`,
    html,
    templateData: { fullName, verificationUrl, otpCode },
    metadata: { event: 'email.verification_sent', to: email, name: fullName },
  });
};

export const sendEmailChangeVerification = async (newEmail: string, token: string, fullName: string) => {
  const verificationUrl = `${getBaseUrl()}/verify-email-change?token=${token}`;

  const html = buildBrandedHtml({
    title: 'Confirm your new email address',
    recipientName: fullName,
    headline: 'Email Address Change Request',
    bodyText: 'We received a request to update your CommandCenter account email address to this address.',
    ctaText: 'Confirm New Email',
    ctaUrl: verificationUrl,
    footerNote: 'This link will expire in 1 hour. If you did not initiate this change, please contact support immediately.',
  });

  return sendSafely({
    to: newEmail,
    subject: 'Confirm your new CommandCenter email address',
    body: `Hi ${fullName}, confirm your new email address by visiting: ${verificationUrl} (expires in 1 hour)`,
    html,
    templateData: { fullName, verificationUrl },
    metadata: { event: 'email.email_change_verification_sent', to: newEmail, name: fullName },
  });
};

export const sendPasswordResetEmail = async (email: string, token: string, fullName: string) => {
  const resetUrl = `${getBaseUrl()}/reset-password?token=${token}`;

  const html = buildBrandedHtml({
    title: 'Reset your password',
    recipientName: fullName,
    headline: 'Password Reset Request',
    bodyText: 'We received a request to reset your password. Click the button below to choose a new password.',
    ctaText: 'Reset Password',
    ctaUrl: resetUrl,
    footerNote: 'This link will expire in 1 hour. If you did not request a password reset, your account remains secure and no action is required.',
  });

  return sendSafely({
    to: email,
    subject: 'Reset your CommandCenter password',
    body: `Hi ${fullName}, reset your password (expires in 1 hour): ${resetUrl}`,
    html,
    templateData: { fullName, resetUrl },
    metadata: { event: 'email.password_reset_sent', to: email, name: fullName },
  });
};

export const sendPasswordResetOtpEmail = async (email: string, otpCode: string, fullName: string) => {
  const html = buildBrandedHtml({
    title: 'Reset your password - Verification Code',
    recipientName: fullName,
    headline: 'Password Reset Verification Code',
    bodyText: 'We received a request to reset your password. Use the 6-digit verification code below to set a new password.',
    otpCode,
    footerNote: 'This code will expire in 10 minutes. If you did not request a password reset, your account remains secure and no action is required.',
  });

  return sendSafely({
    to: email,
    subject: 'Your CommandCenter password reset code',
    body: `Hi ${fullName}, your password reset code is: ${otpCode} (expires in 10 minutes).`,
    html,
    templateData: { fullName, otpCode },
    metadata: { event: 'email.password_reset_otp_sent', to: email, name: fullName },
  });
};

export const sendSecurityAlertEmail = async (email: string, fullName: string, alertDetail: string) => {
  const html = buildBrandedHtml({
    title: 'Security Alert',
    recipientName: fullName,
    headline: 'Security Alert for Your Account',
    bodyText: alertDetail,
    footerNote: 'If you suspect unauthorized access to your account, please reset your password immediately.',
  });

  return sendSafely({
    to: email,
    subject: 'CommandCenter Security Alert',
    body: `Hi ${fullName}, Security Alert: ${alertDetail}`,
    html,
    templateData: { fullName, alertDetail },
    metadata: { event: 'email.security_alert', to: email, name: fullName },
  });
};

export const sendTeamInviteEmail = async (email: string, teamName: string, inviterName: string) => {
  const inviteLink = `${getBaseUrl()}/login?invite=${encodeURIComponent(email)}&team=${encodeURIComponent(teamName)}`;

  const html = buildBrandedHtml({
    title: `Team Invitation: ${teamName}`,
    recipientName: email.split('@')[0],
    headline: `Join ${teamName} on CommandCenter`,
    bodyText: `${inviterName} has invited you to join the team "${teamName}" on CommandCenter.`,
    ctaText: 'Accept Invitation',
    ctaUrl: inviteLink,
    footerNote: 'If you do not wish to join this team, you can ignore this email.',
  });

  return sendSafely({
    to: email,
    subject: `You've been invited to join ${teamName} on CommandCenter`,
    body: `${inviterName} invited you to join ${teamName}. Accept your invitation: ${inviteLink}`,
    html,
    templateData: { teamName, inviterName, inviteLink },
    metadata: { event: 'email.team_invite_sent', to: email, team: teamName, invitedBy: inviterName, inviteLink },
  });
};

export const sendSupportNotificationEmail = async (options: {
  referenceId: string;
  reportType: string;
  subject: string;
  description: string;
  userName: string;
  userEmail: string;
  severity: string;
  affectedPage?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  attachment?: {
    filename: string;
    content: Buffer;
    contentType?: string;
  };
}): Promise<boolean> => {
  const supportTarget = env.supportEmail?.trim() || 'rushikedar40@gmail.com';

  // Do not attempt outbound delivery to unconfigured or placeholder recipient addresses
  if (!supportTarget || supportTarget.endsWith('@commandcenter.local')) {
    getLogger().info('Support email recipient is unconfigured or a local placeholder. Ticket retained locally.', {
      event: 'email.support_notification_skipped',
      referenceId: options.referenceId,
    });
    return false;
  }

  const bugDetailsHtml =
    options.reportType === 'bug' && (options.expectedBehavior || options.actualBehavior)
      ? `<br><br><strong>Expected Behavior:</strong> ${options.expectedBehavior || 'N/A'}<br><strong>Actual Behavior:</strong> ${options.actualBehavior || 'N/A'}`
      : '';

  const affectedPageHtml = options.affectedPage ? `<br><br><strong>Affected Page:</strong> ${options.affectedPage}` : '';

  const attachmentNote = options.attachment ? `<br><br><strong>Attachment Attached:</strong> ${options.attachment.filename}` : '';

  const html = buildBrandedHtml({
    title: `[Support Ticket ${options.referenceId}] ${options.subject}`,
    recipientName: 'Support Team',
    headline: `New ${options.reportType.toUpperCase()} Report (${options.referenceId})`,
    bodyText: `User <strong>${options.userName}</strong> (&lt;${options.userEmail}&gt;) submitted a <strong>${options.severity.toUpperCase()}</strong> severity ${options.reportType} report:<br><br><strong>${options.subject}</strong><br>${options.description}${affectedPageHtml}${bugDetailsHtml}${attachmentNote}`,
    footerNote: `Reference ID: ${options.referenceId} | Category: ${options.reportType} | Priority: ${options.severity}`,
  });

  const attachments = options.attachment ? [{
    filename: options.attachment.filename,
    content: options.attachment.content,
    contentType: options.attachment.contentType,
  }] : undefined;

  return sendSafely({
    to: supportTarget,
    subject: `[${options.referenceId}] ${options.reportType.toUpperCase()}: ${options.subject}`,
    body: `New ${options.reportType} report from ${options.userName} (${options.userEmail}): ${options.description}`,
    html,
    attachments,
    templateData: {
      ...options,
      attachment: options.attachment ? { filename: options.attachment.filename } : undefined,
    },
    metadata: {
      event: 'email.support_notification',
      referenceId: options.referenceId,
      to: supportTarget,
      hasAttachment: !!options.attachment,
      attachmentName: options.attachment?.filename,
    },
  });
};
