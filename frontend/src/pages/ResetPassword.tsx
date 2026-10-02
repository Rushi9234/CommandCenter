import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import * as api from '../services/api';

// Milestone 55: the landing page for the link sendPasswordResetEmail
// builds (`${FRONTEND_URL}/reset-password?token=...`). POST /auth/reset-
// password does NOT return a session (confirmed against auth.service.ts
// -- it only updates the password and revokes existing sessions), so a
// successful reset here links to /login rather than auto-logging in.
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token');

  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const emailParam = searchParams.get('email') || undefined;

  const effectiveToken = tokenParam || resetCode.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveToken) {
      setError('Please provide a valid verification token or 6-digit code.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.resetPassword(effectiveToken, newPassword, emailParam);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md pro-card p-8 shadow-xl text-center"
      >
        {success ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Password reset</h1>
            <p className="text-gray-600 mb-6">Your password has been reset successfully. Please log in again.</p>
            <Link to="/login" className="btn-primary inline-block">
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Set a new password</h1>
            <p className="text-sm text-gray-600 mb-4">
              {tokenParam
                ? 'Enter your new password below to reset your account credentials.'
                : 'Enter your 6-digit OTP recovery code and choose a new password.'}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4 text-left mt-4">
              {error && <div className="alert alert-error text-sm">{error}</div>}

              {!tokenParam && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">6-Digit Recovery Code</label>
                  <input
                    type="text"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="input-field tracking-widest text-center text-lg font-mono"
                    placeholder="123456"
                    maxLength={6}
                    required
                    autoFocus
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field"
                  placeholder="Minimum 8 characters"
                  minLength={8}
                  required
                  autoFocus={Boolean(tokenParam)}
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
                {loading ? 'Resetting...' : 'Reset password'}
              </button>
            </form>
            <div className="mt-6 text-center">
              <Link to="/forgot-password" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                Back to password recovery
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
