import { describe, it, expect } from 'vitest';
import { formatChatTime, formatDateSeparator, formatConversationTime } from './dateUtils';

describe('dateUtils', () => {
  it('formats chat time in IST (Asia/Kolkata)', () => {
    // 2026-09-14T07:30:00Z is 1:00 PM IST (UTC + 5:30)
    const iso = '2026-09-14T07:30:00Z';
    const formatted = formatChatTime(iso);
    expect(formatted).toMatch(/1:00\s*pm/i);
  });

  it('handles invalid dates gracefully', () => {
    expect(formatChatTime('invalid')).toBe('');
    expect(formatDateSeparator(null)).toBe('');
    expect(formatConversationTime(undefined)).toBe('');
  });

  it('formats date separator for Today', () => {
    const today = new Date().toISOString();
    expect(formatDateSeparator(today)).toBe('Today');
  });

  it('formats date separator for Yesterday', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(formatDateSeparator(yesterday)).toBe('Yesterday');
  });

  it('formats conversation time for older dates', () => {
    const pastDate = '2025-01-15T10:00:00Z';
    const formatted = formatConversationTime(pastDate);
    expect(formatted).toBeTruthy();
  });
});
