import { getSmsProvider } from './sms/providers/smsProviderFactory';
import { getLogger } from '../common/logging/loggerFactory';

// Phone verification (Profile Phase 4). Mirrors emailService.ts's
// structure exactly: this file builds the outbound message and hands it
// to whichever SmsProvider smsProviderFactory selects; it never knows
// which vendor is actually active. The raw OTP passes through this
// function's parameter but is never logged here -- only the destination
// phone number and the send outcome are, matching sendSafely's existing
// "log the failure, never the credential" rule below.
const sendSafely = async (phoneNumber: string, otp: string): Promise<boolean> => {
  try {
    const sent = await getSmsProvider().sendOtp(phoneNumber, otp);
    if (!sent) {
      getLogger().error('SMS send failed', { event: 'sms.send_failed', to: phoneNumber });
    }
    return sent;
  } catch (error) {
    getLogger().error('SMS send threw', { event: 'sms.send_failed', to: phoneNumber });
    return false;
  }
};

export const sendOtpSms = async (phoneNumber: string, otp: string): Promise<boolean> => {
  return sendSafely(phoneNumber, otp);
};
