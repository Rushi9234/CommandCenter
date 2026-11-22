import { put, del } from '@vercel/blob';
import { env } from '../../config/env';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { PRESET_SVG_MAP } from './avatars.presets';
import { query } from '../../db/client';

export interface AvatarStorageResult {
  key: string;
  url: string;
}

export const avatarStorageService = {
  /**
   * Upload avatar blob to Vercel Blob Storage in production (or fallback to PostgreSQL user_avatars BYTEA),
   * or local filesystem in development if writable.
   * Returns storage key and URL.
   */
  async uploadAvatar(
    userId: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<AvatarStorageResult> {
    const versionId = randomUUID();
    const extension = mimeType.split('/')[1] || 'jpg';

    // 1. If Vercel Blob token is configured, try uploading to Vercel Blob first
    if (env.vercelBlobToken) {
      try {
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
      } catch (blobErr) {
        console.warn('[avatars.storage] Vercel Blob upload failed, falling back to database storage:', blobErr);
      }
    }

    // 2. In serverless runtime or when Blob storage is unavailable, persist reliably in PostgreSQL user_avatars (BYTEA)
    try {
      await query(
        `INSERT INTO user_avatars (user_id, mime_type, file_size, image_data, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO UPDATE SET
           mime_type = EXCLUDED.mime_type,
           file_size = EXCLUDED.file_size,
           image_data = EXCLUDED.image_data,
           updated_at = CURRENT_TIMESTAMP`,
        [userId, mimeType, fileBuffer.length, fileBuffer]
      );
      const dbKey = `db:${userId}`;
      return {
        key: dbKey,
        url: this.getAvatarUrl(dbKey) || `/api/users/${userId}/avatar`,
      };
    } catch (dbErr) {
      console.warn('[avatars.storage] Database avatar save failed, attempting local filesystem fallback:', dbErr);
    }

    // 3. Local filesystem fallback (only if local disk is writable)
    try {
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
        url: this.getAvatarUrl(relativePath) || `/${relativePath}`,
      };
    } catch (fsErr) {
      console.error('[avatars.storage] Local filesystem avatar save also failed:', fsErr);
      throw new Error('Avatar storage failed on all storage providers');
    }
  },

  /**
   * Delete avatar blob from Vercel Blob Storage, database, or local filesystem.
   */
  async deleteAvatar(key: string): Promise<void> {
    if (!key || key.startsWith('data:') || key.startsWith('preset:')) {
      return;
    }

    if (key.startsWith('db:')) {
      const uid = key.replace('db:', '');
      await query('DELETE FROM user_avatars WHERE user_id = $1', [uid]).catch((error) => {
        console.warn('[avatars.storage] Failed to delete db avatar:', uid, error);
      });
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
    if (key.startsWith('db:')) {
      const uid = key.replace('db:', '');
      const baseUrl = process.env.BACKEND_URL || (env.isProduction ? 'https://commandcenter-backend.vercel.app' : `http://localhost:${env.port || 30018}`);
      return `${baseUrl}/api/users/${uid}/avatar`;
    }
    if (key.startsWith('uploads/') || key.startsWith('/uploads/')) {
      const normalizedKey = key.startsWith('/') ? key : '/' + key;
      const baseUrl = process.env.BACKEND_URL || (env.isProduction ? 'https://commandcenter-backend.vercel.app' : `http://localhost:${env.port || 30018}`);
      return `${baseUrl}${normalizedKey}`;
    }
    return `https://blob.vercel-storage.com/${key}`;
  },
};
