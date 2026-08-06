import { Response } from 'express';

// Reproduces the exact response envelope every controller already used
// ({ success: true, message?, data }) so migrating a controller to call
// these helpers changes nothing about what the client receives.
export const ok = (res: Response, data?: unknown, message?: string) => {
  res.json({ success: true, ...(message ? { message } : {}), ...(data !== undefined ? { data } : {}) });
};

export const created = (res: Response, data?: unknown, message?: string) => {
  res.status(201).json({ success: true, ...(message ? { message } : {}), ...(data !== undefined ? { data } : {}) });
};
