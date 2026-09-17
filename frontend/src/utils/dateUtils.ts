const TIMEZONE = 'Asia/Kolkata';

export const formatChatTime = (isoString: string | null | undefined): string => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return '';
  }
};

export const getISTDateParts = (date: Date): { year: number; month: number; day: number } => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  let year = 0, month = 0, day = 0;
  for (const part of parts) {
    if (part.type === 'year') year = parseInt(part.value, 10);
    if (part.type === 'month') month = parseInt(part.value, 10);
    if (part.type === 'day') day = parseInt(part.value, 10);
  }
  return { year, month, day };
};

export const formatDateSeparator = (isoString: string | null | undefined): string => {
  if (!isoString) return '';
  try {
    const msgDate = new Date(isoString);
    if (isNaN(msgDate.getTime())) return '';

    const now = new Date();
    const msgParts = getISTDateParts(msgDate);
    const nowParts = getISTDateParts(now);

    const msgDateStr = `${msgParts.year}-${String(msgParts.month).padStart(2, '0')}-${String(msgParts.day).padStart(2, '0')}`;
    const nowDateStr = `${nowParts.year}-${String(nowParts.month).padStart(2, '0')}-${String(nowParts.day).padStart(2, '0')}`;

    // Calculate yesterday in IST
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yestParts = getISTDateParts(yesterdayDate);
    const yestDateStr = `${yestParts.year}-${String(yestParts.month).padStart(2, '0')}-${String(yestParts.day).padStart(2, '0')}`;

    if (msgDateStr === nowDateStr) {
      return 'Today';
    }
    if (msgDateStr === yestDateStr) {
      return 'Yesterday';
    }

    // Format as "14 Sep 2026"
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: TIMEZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(msgDate);
  } catch {
    return '';
  }
};

export const formatConversationTime = (isoString: string | null | undefined): string => {
  if (!isoString) return '';
  try {
    const msgDate = new Date(isoString);
    if (isNaN(msgDate.getTime())) return '';

    const now = new Date();
    const msgParts = getISTDateParts(msgDate);
    const nowParts = getISTDateParts(now);

    const msgDateStr = `${msgParts.year}-${String(msgParts.month).padStart(2, '0')}-${String(msgParts.day).padStart(2, '0')}`;
    const nowDateStr = `${nowParts.year}-${String(nowParts.month).padStart(2, '0')}-${String(nowParts.day).padStart(2, '0')}`;

    if (msgDateStr === nowDateStr) {
      return formatChatTime(isoString);
    }

    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yestParts = getISTDateParts(yesterdayDate);
    const yestDateStr = `${yestParts.year}-${String(yestParts.month).padStart(2, '0')}-${String(yestParts.day).padStart(2, '0')}`;

    if (msgDateStr === yestDateStr) {
      return 'Yesterday';
    }

    if (msgParts.year === nowParts.year) {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: TIMEZONE,
        day: 'numeric',
        month: 'short',
      }).format(msgDate);
    }

    return new Intl.DateTimeFormat('en-IN', {
      timeZone: TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).format(msgDate);
  } catch {
    return '';
  }
};
