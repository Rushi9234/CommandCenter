import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import * as api from '../services/api';
import { mapAuthError, MappedAuthError } from '../utils/authErrorMapper';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<'link' | 'otp'>('link');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mappedError, setMappedError] = useState<MappedAuthError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMappedError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email, mode);
      setSubmitted(true);
    } catch (err: any) {
      setMappedError(mapAuthError(err, "We couldn't connect right now. Please try again shortly."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md pro-card p-8 shadow-xl"
      >
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Reset your password</h1>
        <p className="text-gray-600 mb-6 text-center text-sm">
          Select your preferred recovery method and enter your email address.
        </p>

        {/* Method selector tabs */}
        <div className="flex bg-gray-100 p-1 rounded-xl mb-6 text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setMode('link'); setSubmitted(false); }}
            className={`flex-1 py-2 rounded-lg transition-all ${
              mode === 'link' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Email Reset Link
          </button>
          <button
            type="button"
            onClick={() => { setMode('otp'); setSubmitted(false); }}
            className={`flex-1 py-2 rounded-lg transition-all ${
              mode === 'otp' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            6-Digit OTP Code
          </button>
        </div>

        {submitted ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-green-700 bg-green-50 p-4 rounded-xl border border-green-200">
              {mode === 'link'
                ? 'If that email is registered, a password reset link has been sent to your inbox.'
                : 'If that email is registered, a 6-digit password reset code has been sent to your inbox.'}
            </p>

            {mode === 'otp' && (
              <Link
                to={`/reset-password?email=${encodeURIComponent(email)}`}
                className="btn-primary w-full inline-block py-2.5 text-center text-sm font-semibold shadow-md"
              >
                Enter 6-digit OTP code &rarr;
              </Link>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mappedError && <div className="alert alert-error text-sm">{mappedError.message}</div>}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@company.com"
                required
                autoFocus
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? 'Sending...' : mode === 'link' ? 'Send reset link' : 'Send 6-digit OTP code'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            Back to sign in
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
