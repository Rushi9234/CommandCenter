import { SmsProvider } from './smsProvider.interface';

// The one real (non-console) SmsProvider implementation. MSG91-specific
// details (endpoint, auth header, DLT flow/template parameters) are
// isolated to this file -- nothing outside services/sms/ ever needs to
// know MSG91 exists, mirroring resendEmailProvider.ts's exact isolation.
//
// Uses MSG91's Flow API (POST /api/v5/flow), the DLT-template-based send
// endpoint -- required for India transactional/OTP SMS, since an
// un-templated free-text send is exactly what TRAI's DLT regime blocks
// (see PROFILE_PHASE4_PHONE_SMS_PROVIDER_AUDIT.md for the full DLT
// requirements). `flow_id` here is the identifier MSG91's own console
// assigns once MSG91_DLT_TEMPLATE_ID's underlying DLT template is
// registered and approved -- this class does not invent DLT compliance,
// it only sends through whichever already-approved template the
// deployed environment's env vars name.
const MSG91_FLOW_API_URL = 'https://control.msg91.com/api/v5/flow';

export class Msg91SmsProvider implements SmsProvider {
  constructor(
    private readonly authKey: string,
    private readonly senderId: string,
    private readonly dltTemplateId: string
  ) {}

  async sendOtp(phoneNumber: string, otp: string): Promise<boolean> {
    try {
      const response = await fetch(MSG91_FLOW_API_URL, {
        method: 'POST',
        headers: {
          authkey: this.authKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flow_id: this.dltTemplateId,
          sender: this.senderId,
          mobiles: phoneNumber,
          // The approved DLT template's variable placeholder -- the exact
          // key name (VAR1 vs. OTP vs. a named variable) is whatever the
          // specific approved template in MSG91's console declares. The
          // OTP is never logged, printed, or included in any thrown error
          // below -- it exists only in this request body, over TLS, sent
          // directly to MSG91.
          VAR1: otp,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const data: any = await response.json().catch(() => null);
      // MSG91's Flow API responds with { type: 'success' } on success;
      // any other shape (including a request-level failure MSG91 itself
      // reports as 200) is treated as a failed send, never as a thrown
      // exception -- matching ResendEmailProvider's exact
      // "resolved-but-failed is not the same as thrown" distinction.
      return data?.type === 'success';
    } catch {
      // Network failure, DNS failure, etc. -- never propagate a raw
      // vendor-specific error up to smsService.ts. The caller only ever
      // needs to know "did this send succeed," matching every other
      // provider in this codebase's contract.
      return false;
    }
  }
}
