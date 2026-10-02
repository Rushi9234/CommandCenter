import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';

export default function VerifyOtp() {
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get('email') || '';

  const [email, setEmail] = useState(initialEmail);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  const { verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus the first input box on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, []);

  // 60-second resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleDigitChange = (index: number, value: string) => {
    // Only accept numeric inputs
    const numericValue = value.replace(/[^0-9]/g, '');
    if (!numericValue && value !== '') return;

    const newDigits = [...digits];
    newDigits[index] = numericValue.slice(-1); // Take single digit
    setDigits(newDigits);
    setError('');

    // Auto-advance to next input if filled
    if (numericValue && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').trim().replace(/[^0-9]/g, '');
    if (!pastedText) return;

    const pastedDigits = pastedText.slice(0, 6).split('');
    const newDigits = [...digits];
    pastedDigits.forEach((digit, idx) => {
      newDigits[idx] = digit;
    });
    setDigits(newDigits);
    setError('');

    // Focus last filled input or verify button
    const nextFocusIndex = Math.min(pastedDigits.length, 5);
    inputRefs.current[nextFocusIndex]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpCode = digits.join('');
    if (otpCode.length !== 6) {
      setError('Please enter all 6 digits of the verification code.');
      return;
    }
    if (!email.trim()) {
      setError('Please provide the email address associated with your account.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await verifyOtp(email.trim(), otpCode);
      navigate('/pulse');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid or expired verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending || !email.trim()) return;
    setResending(true);
    setError('');
    setResendSent(false);

    try {
      await resendOtp(email.trim());
      setResendSent(true);
      setCooldown(60); // Reset 60s cooldown
      setDigits(Array(6).fill('')); // Clear digits
      inputRefs.current[0]?.focus();
    } catch {
      // Anti-enumeration: report success regardless of result
      setResendSent(true);
      setCooldown(60);
    } finally {
      setResending(false);
    }
  };

  const isComplete = digits.join('').length === 6;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0, rotate: 180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200 }}
            className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"
          >
            <span className="text-white font-bold text-2xl">CC</span>
          </motion.div>
          <h1 className="text-3xl font-bold text-gray-900">Enter Verification Code</h1>
          <p className="text-gray-600 mt-2 text-sm">
            We sent a 6-digit verification code to{' '}
            <strong className="text-gray-900">{email || 'your email'}</strong>
          </p>
        </div>

        <div className="pro-card p-8 shadow-xl">
          {error && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="alert alert-error mb-6 text-sm"
            >
              {error}
            </motion.div>
          )}

          {resendSent && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-3 bg-green-50 text-green-700 rounded-lg text-sm font-medium border border-green-200 text-center"
            >
              A new 6-digit verification code has been sent to your email.
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {!initialEmail && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="you@company.com"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3 text-center">
                6-Digit Security OTP
              </label>
              <div className="flex justify-between gap-2 max-w-xs mx-auto">
                {digits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={handlePaste}
                    className="w-11 h-13 text-center text-xl font-bold rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all shadow-sm bg-gray-50 focus:bg-white"
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isComplete}
              className="btn-primary w-full mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="spinner w-4 h-4"></span>
                  Verifying Code...
                </span>
              ) : (
                'Verify & Continue'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center space-y-3">
            <p className="text-sm text-gray-600">
              Didn&apos;t receive the code?{' '}
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || resending}
                className="text-indigo-600 font-medium hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : resending ? 'Resending...' : 'Resend Code'}
              </button>
            </p>

            <p className="text-xs text-gray-500">
              Alternatively, click the verification link sent in the same email.
            </p>

            <div>
              <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700 font-medium">
                Back to Sign In
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
