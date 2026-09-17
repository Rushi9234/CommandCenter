import { put, del } from '@vercel/blob';
import { env } from '../../config/env';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { PRESET_SVG_MAP } from './avatars.presets';

export interface AvatarStorageResult {
  key: string;
  url: string;
}

export const avatarStorageService = {
  /**
   * Upload avatar blob to Vercel Blob Storage in production or local filesystem in development.
   * Returns storage key and URL.
   */
  async uploadAvatar(
    userId: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<AvatarStorageResult> {
    const versionId = randomUUID();
    const extension = mimeType.split('/')[1] || 'jpg';

    if (!env.vercelBlobToken) {
      // Local development storage path: uploads/avatars/avatar-{userId}-{versionId}.{ext}
      const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const fileName = `avatar-${userId}-${versionId}.${extension}`;
      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, fileBuffer);

      const relativePath = `uploads/avatars/${fileName}`;
      return {
        key: relativePath,
        url: this.getAvatarUrl(relativePath),
      };
    }

    // Generate unique storage key: avatars/{user_id}/{uuid}.{ext}
    const storageKey = `avatars/${userId}/${versionId}.${extension}`;

    const result = await put(storageKey, fileBuffer, {
      access: 'public',
      contentType: mimeType,
      token: env.vercelBlobToken,
    });

    return {
      key: storageKey,
      url: result.url,
    };
  },

  /**
   * Delete avatar blob from Vercel Blob Storage or local filesystem.
   */
  async deleteAvatar(key: string): Promise<void> {
    if (!key || key.startsWith('data:') || key.startsWith('preset:')) {
      return;
    }

    if (key.startsWith('uploads/') || key.startsWith('/uploads/')) {
      const relativePath = key.replace(/^\//, '');
      const filePath = path.join(process.cwd(), relativePath);
      if (fs.existsSync(filePath)) {
        try {
          await fs.promises.unlink(filePath);
        } catch (error) {
          console.warn('[avatars.storage] Failed to delete local file:', filePath, error);
        }
      }
      return;
    }

    if (!env.vercelBlobToken) {
      console.warn('[avatars.storage] VERCEL_BLOB_READ_WRITE_TOKEN not configured, skipping blob deletion');
      return;
    }

    try {
      await del(key, {
        token: env.vercelBlobToken,
      });
    } catch (error) {
      console.warn('[avatars.storage] Failed to delete blob:', key, error);
    }
  },

  /**
   * Generate avatar URL from storage key.
   */
  getAvatarUrl(key?: string | null): string | null {
    if (!key) return null;
    if (key.startsWith('preset:')) {
      const presetId = key.replace('preset:', '');
      return PRESET_SVG_MAP[presetId] || null;
    }
    if (key.startsWith('data:') || key.startsWith('http://') || key.startsWith('https://')) {
      return key;
    }
    if (key.startsWith('uploads/') || key.startsWith('/uploads/')) {
      const normalizedKey = key.startsWith('/') ? key : '/' + key;
      if (!env.isProduction) {
        const baseUrl = process.env.BACKEND_URL || `http://localhost:${env.port || 3001}`;
        return `${baseUrl}${normalizedKey}`;
      }
      return normalizedKey;
    }
    return `https://blob.vercel-storage.com/${key}`;
  },
};
