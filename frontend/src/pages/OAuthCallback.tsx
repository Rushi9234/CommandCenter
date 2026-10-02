import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function OAuthCallback() {
  const { provider } = useParams<{ provider: 'google' | 'microsoft' }>();
  const [searchParams] = useSearchParams();
  const { handleOAuthCallback } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const providerError = searchParams.get('error') || searchParams.get('error_description');

      if (providerError) {
        setError(providerError);
        return;
      }

      if (!code || !state || !provider) {
        setError('Invalid OAuth callback parameters');
        return;
      }

      try {
        await handleOAuthCallback(provider as 'google' | 'microsoft', code, state);
        navigate('/pulse');
      } catch (err: any) {
        setError(err.response?.data?.error || err.message || 'OAuth authentication failed');
      }
    };

    processCallback();
  }, [provider, searchParams, handleOAuthCallback, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg text-center">
        {error ? (
          <div>
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
              !
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Authentication Failed</h2>
            <p className="text-gray-600 text-sm mb-6">{error}</p>
            <button
              onClick={() => navigate('/login')}
              className="btn-primary w-full"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <div>
            <div className="spinner w-10 h-10 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Authenticating with {provider === 'google' ? 'Google' : 'Microsoft'}...
            </h2>
            <p className="text-sm text-gray-500">Please wait while we establish your secure session.</p>
          </div>
        )}
      </div>
    </div>
  );
}
