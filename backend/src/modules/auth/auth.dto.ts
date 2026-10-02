import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

export const registerSchema = z.object({
  email: requiredString('All fields required'),
  username: requiredString('All fields required'),
  fullName: requiredString('All fields required'),
  password: requiredString('Password must be at least 8 characters', 8),
});

export const loginSchema = z.object({
  email: requiredString('Email and password required'),
  password: requiredString('Email and password required'),
});

export const verifyEmailSchema = z.object({
  token: requiredString('Verification token required'),
});

export const resendVerificationSchema = z.object({
  email: requiredString('Email required'),
});

export const forgotPasswordSchema = z.object({
  email: requiredString('Email required'),
  mode: z.enum(['link', 'otp']).optional(),
});

export const resetPasswordSchema = z.object({
  token: requiredString('Reset token required'),
  newPassword: requiredString('Password must be at least 8 characters', 8),
  email: z.string().email().optional(),
});

export const verifyEmailChangeSchema = z.object({
  token: requiredString('Verification token required'),
});

export const verifyOtpSchema = z.object({
  email: requiredString('Email required'),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be a 6-digit number'),
});

export const resendOtpSchema = z.object({
  email: requiredString('Email required'),
});
