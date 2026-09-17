import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

// Lands here from the link users.service.ts's requestEmailChange (backend)
// sends via emailService.ts's sendEmailChangeVerification
// (`${FRONTEND_URL}/verify-email-change?token=...`). Deliberately modeled on
// ResetPassword.tsx, not VerifyEmail.tsx: POST /auth/verify-email-change
// does NOT return a session (confirmed against auth.service.ts's
// verifyEmailChange -- it only swaps the email and revokes every refresh
// token), so a successful verification links to /login rather than
// auto-logging in, exactly like ResetPassword.tsx already does for the
// structurally identical "sensitive account change, no auto-login" case.
export default function VerifyEmailChange() {
  const [searchParams, setSearchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<'no-token' | 'verifying' | 'success' | 'error'>(token ? 'verifying' : 'no-token');
  const [newEmail, setNewEmail] = useState('');
  // Generic message only -- verify-email-change's backend response is
  // deliberately identical (same wording) whether the token is invalid,
  // expired, or already consumed (see auth.service.ts's verifyEmailChange).
  // This page never tries to distinguish those cases either.
  const [error, setError] = useState('');

  // React.StrictMode (main.tsx) double-invokes effects in dev, which would
  // otherwise submit the (single-use) token twice -- the second call always
  // fails since consumeEmailChangeToken already cleared it on the first,
  // masking a real success behind a spurious error. This ref makes the
  // actual network call idempotent regardless of how many times the effect
  // itself runs.
  const submitted = useRef(false);

  useEffect(() => {
    if (!token || submitted.current) return;
    submitted.current = true;

    let cancelled = false;
    (async () => {
      try {
        const response = await api.verifyEmailChange(token);
        if (cancelled) return;

        // The raw token has done its job -- drop it from the visible
        // URL/history now rather than leaving a single-use, already-
        // consumed credential sitting in the address bar or browser
        // history for longer than necessary.
        setSearchParams({}, { replace: true });

        // A stale local session (this browser may still be holding the
        // OLD token/user in localStorage from before the change) is no
        // longer valid -- every refresh token was just revoked
        // server-side, and any already-issued access/legacy token will
        // fail its next authenticate() check. Clearing it here is honest
        // about that rather than leaving a dead session lying around.
        logout();

        setNewEmail(response.data.data.email);
        setStatus('success');
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to verify email change');
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
            <p className="text-gray-600">Verifying your new email address...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Email changed</h1>
            <p className="text-gray-600 mb-2">
              Your account email has been changed to <span className="font-medium text-gray-900">{newEmail}</span>.
            </p>
            <p className="text-gray-600 mb-6">For your security, you&apos;ve been signed out everywhere. Please log in again with your new email.</p>
            <button onClick={() => navigate('/login')} className="btn-primary inline-block">
              Go to sign in
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Verification failed</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
              Back to sign in
            </Link>
          </>
        )}
      </motion.div>
    </div>
  );
}
