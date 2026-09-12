import { put, del } from '@vercel/blob';
import { env } from '../../config/env';
import { randomUUID } from 'crypto';

export interface AvatarStorageResult {
  key: string;
  url: string;
}

export const avatarStorageService = {
  /**
   * Upload avatar blob to Vercel Blob Storage.
   * Returns storage key and URL.
   */
  async uploadAvatar(
    userId: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<AvatarStorageResult> {
    if (!env.vercelBlobToken) {
      throw new Error('VERCEL_BLOB_READ_WRITE_TOKEN not configured');
    }

    // Generate unique storage key: avatars/{user_id}/{uuid}.{ext}
    const versionId = randomUUID();
    const extension = mimeType.split('/')[1]; // "jpeg" from "image/jpeg"
    const storageKey = `avatars/${userId}/${versionId}`;

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
   * Delete avatar blob from Vercel Blob Storage.
   * Logs errors but does not throw (orphan cleanup handled separately).
   */
  async deleteAvatar(key: string): Promise<void> {
    if (!env.vercelBlobToken) {
      console.warn('[avatars.storage] VERCEL_BLOB_READ_WRITE_TOKEN not configured, skipping blob deletion');
      return;
    }

    try {
      await del(key, {
        token: env.vercelBlobToken,
      });
    } catch (error) {
      // Log but don't throw -- DB deletion is authoritative
      console.warn('[avatars.storage] Failed to delete blob:', key, error);
    }
  },

  /**
   * Generate avatar URL from storage key.
   * In production with Vercel Blob, this would be the blob URL.
   * For local development, returns a placeholder.
   */
  getAvatarUrl(key: string): string {
    if (!key) return '';
    // Vercel Blob auto-generates public URLs; this is informational
    return `https://blob.vercel-storage.com/${key}`;
  },
};
