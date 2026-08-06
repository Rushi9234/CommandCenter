import crypto from 'crypto';

export const generateLogSignature = (userId: string, entryText: string, timestamp: Date): string => {
  const data = `${userId}|${entryText}|${timestamp.toISOString()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
};

export const verifyLogSignature = (userId: string, entryText: string, timestamp: Date, signature: string): boolean => {
  const expectedSignature = generateLogSignature(userId, entryText, timestamp);
  return expectedSignature === signature;
};

export const generateEntryId = (date: Date, sequence: number): string => {
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const seqStr = sequence.toString().padStart(3, '0');
  return `ENT-${dateStr}-${seqStr}`;
};
