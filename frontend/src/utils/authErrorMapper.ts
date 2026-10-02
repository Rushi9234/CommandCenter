export interface MappedAuthError {
  message: string;
  isUnverified?: boolean;
  isDuplicateEmail?: boolean;
  isRateLimited?: boolean;
  isNetworkError?: boolean;
}

/**
 * Maps raw backend/Axios error responses to consistent, user-friendly, security-safe messages.
 * Never exposes raw stack traces, database schema details, or internal server errors.
 */
export function mapAuthError(err: any, fallbackMessage?: string): MappedAuthError {
  if (!err) {
    return { message: fallbackMessage || "We couldn't connect right now. Please try again shortly." };
  }

  // Network error (no response received or network down)
  if (err.message === 'Network Error' || !err.response) {
    return {
      message: "We couldn't connect right now. Please try again shortly.",
      isNetworkError: true,
    };
  }

  const status = err.response?.status;
  const rawError = (typeof err.response?.data?.error === 'string'
    ? err.response.data.error
    : typeof err.response?.data?.message === 'string'
    ? err.response.data.message
    : err.message || '').toString();

  const lowerErr = rawError.toLowerCase();

  // Rate Limiting (HTTP 429)
  if (status === 429 || lowerErr.includes('too many attempts') || lowerErr.includes('rate limit')) {
    return {
      message: "Too many attempts. Please wait before trying again.",
      isRateLimited: true,
    };
  }

  // Server Errors (HTTP 500+)
  if (status >= 500) {
    return {
      message: "We couldn't connect right now. Please try again shortly.",
      isNetworkError: true,
    };
  }

  // Duplicate Registration (HTTP 409)
  if (status === 409 || lowerErr.includes('already exists') || lowerErr.includes('duplicate')) {
    return {
      message: "An account may already exist with this email. Try signing in or resetting your password.",
      isDuplicateEmail: true,
    };
  }

  // Unverified Email (HTTP 401)
  if (lowerErr.includes('not been verified') || lowerErr.includes('unverified')) {
    return {
      message: "Please verify your email before signing in.",
      isUnverified: true,
    };
  }

  // Invalid Credentials (HTTP 401)
  if (status === 401 && (lowerErr.includes('invalid email or password') || lowerErr.includes('invalid credentials') || lowerErr.includes('unauthorized'))) {
    return {
      message: "Invalid email or password. Please check your credentials and try again.",
    };
  }

  // Google / OAuth Errors
  if (lowerErr.includes('oauth') || lowerErr.includes('google') || lowerErr.includes('state parameter')) {
    return {
      message: "Google sign-in couldn't be completed. Please try again.",
    };
  }

  // Password Reset Errors
  if (lowerErr.includes('reset token') || lowerErr.includes('invalid or expired password reset')) {
    return {
      message: "We couldn't reset your password. Please try again or request a new reset link.",
    };
  }

  // Link / OTP Verification Errors
  if (lowerErr.includes('verification token') || lowerErr.includes('verification credential') || lowerErr.includes('invalid or expired verification')) {
    return {
      message: "This verification link is invalid or has expired. Request a new one.",
    };
  }

  return {
    message: rawError || fallbackMessage || "An unexpected error occurred. Please try again.",
  };
}
