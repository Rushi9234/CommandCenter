import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { chatWithAI } from '../services/aiService';

export const chat = async (req: AuthRequest, res: Response) => {
  try {
    const { message, context } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await chatWithAI(message, context || '');

    res.json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
};
