import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { postgresDB } from '../utils/postgresDB';
import { generateVerificationToken, sendVerificationEmail } from '../services/emailService';

const AUTO_VERIFY = process.env.AUTO_VERIFY === 'true';

export const register = async (req: Request, res: Response) => {
  try {
    const { email, username, fullName, password } = req.body;

    if (!email || !username || !fullName || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = generateVerificationToken();

    const user = await postgresDB.createUser(email, username, fullName, passwordHash, verificationToken);

    if (AUTO_VERIFY) {
      user.is_verified = true;
      user.verification_token = undefined;
      console.log('✅ AUTO-VERIFIED:', email);
    } else {
      await sendVerificationEmail(email, verificationToken, fullName);
    }

    res.status(201).json({
      success: true,
      message: AUTO_VERIFY 
        ? 'Account created and verified! You can now login.' 
        : 'Registration successful! Check backend console for verification link.',
      data: {
        email: user.email,
        username: user.username,
        is_verified: user.is_verified,
      },
    });
  } catch (error: any) {
    console.error('Register error:', error);
    if (error.message === 'User already exists') {
      return res.status(400).json({ error: 'Email or username already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await postgresDB.getUserByEmail(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_verified) {
      return res.status(403).json({ error: 'Please verify your email before logging in' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.user_id, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful!',
      data: {
        user: {
          user_id: user.user_id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          impact_score: user.impact_score,
          streak_count: user.streak_count,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Verification token required' });
    }

    const user = await postgresDB.getUserByEmail(req.body.token);
    if (!user) throw new Error('Invalid verification token');

    const authToken = jwt.sign(
      { userId: user.user_id, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Email verified successfully!',
      data: {
        user: {
          user_id: user.user_id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          impact_score: user.impact_score,
          streak_count: user.streak_count,
        },
        token: authToken,
      },
    });
  } catch (error: any) {
    console.error('Verify email error:', error);
    res.status(400).json({ error: error.message || 'Verification failed' });
  }
};

export const resendVerification = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const newToken = generateVerificationToken();
    const user = await postgresDB.getUserByEmail(email);
    if (!user) throw new Error('User not found');
    if (user.is_verified) throw new Error('User already verified');

    await sendVerificationEmail(email, newToken, user.full_name);

    res.json({
      success: true,
      message: 'Verification email sent!',
    });
  } catch (error: any) {
    console.error('Resend verification error:', error);
    res.status(400).json({ error: error.message || 'Failed to resend verification' });
  }
};
