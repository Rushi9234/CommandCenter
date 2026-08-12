import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import * as api from '../services/api';

// Milestone 55: the entry point for POST /auth/forgot-password, which
// already existed backend-side with no frontend caller. Not routed
// through useAuth -- this never establishes a session, unlike
// login/register/completeEmailVerification.
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
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
        <p className="text-gray-600 mb-6 text-center">
          Enter your email and we'll send you a link to reset your password.
        </p>

        {submitted ? (
          <p className="text-sm text-green-700 text-center">
            If that email is registered, a reset link has been sent.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="alert alert-error text-sm">{error}</div>}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@company.com"
              required
              autoFocus
            />
            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? 'Sending...' : 'Send reset link'}
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
