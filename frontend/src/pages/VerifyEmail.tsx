import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

// Milestone 55: lands here from the link emailService.ts builds
// (`${FRONTEND_URL}/verify-email?token=...`). No token in the URL means
// no API call is ever made -- the backend contract (POST /auth/verify-
// email) is unchanged, this page only consumes it.
export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { completeEmailVerification } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<'no-token' | 'verifying' | 'error'>(token ? 'verifying' : 'no-token');
  const [error, setError] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      try {
        await completeEmailVerification(token);
        if (!cancelled) navigate('/pulse');
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to verify email');
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResending(true);
    try {
      await api.resendVerification(resendEmail);
      setResendSent(true);
    } catch {
      // Milestone 26: resend-verification is a generic-success endpoint
      // by design -- there is nothing distinct to show even on failure.
      setResendSent(true);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md pro-card p-8 shadow-xl text-center"
      >
        {status === 'no-token' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Invalid link</h1>
            <p className="text-gray-600 mb-6">This verification link is missing its token.</p>
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
              Back to sign in
            </Link>
          </>
        )}

        {status === 'verifying' && (
          <>
            <span className="spinner w-6 h-6 mx-auto mb-4"></span>
            <p className="text-gray-600">Verifying your email...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Verification failed</h1>
            <p className="text-gray-600 mb-6">{error}</p>

            {resendSent ? (
              <p className="text-sm text-green-700">
                If that email is registered and not yet verified, a new verification link has been sent.
              </p>
            ) : (
              <form onSubmit={handleResend} className="space-y-3">
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="input-field"
                  placeholder="you@company.com"
                  required
                />
                <button type="submit" disabled={resending} className="btn-primary w-full disabled:opacity-50">
                  {resending ? 'Sending...' : 'Resend verification email'}
                </button>
              </form>
            )}

            <div className="mt-6">
              <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
