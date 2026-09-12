import { query } from '../../db/client';
import { avatarStorageService } from './avatars.storage';
import { avatarValidationService } from './avatars.validation';
import { BadRequestError } from '../../common/errors';

export interface AvatarMetadata {
  avatar_key: string | null;
  avatar_mime_type: string | null;
  avatar_size: number | null;
  avatar_width: number | null;
  avatar_height: number | null;
  avatar_uploaded_at: string | null;
}

export const avatarService = {
  /**
   * Upload and replace user's avatar.
   * Validates, uploads to blob storage, updates database.
   */
  async uploadAvatar(
    userId: string,
    fileBuffer: Buffer,
    declaredMimeType: string,
  ): Promise<{ avatar_key: string; avatar_url: string; avatar_width: number; avatar_height: number; avatar_size: number }> {
    // 1. Validate image
    const validation = await avatarValidationService.validateAvatar(fileBuffer, declaredMimeType);
    if (!validation.isValid) {
      throw new BadRequestError(validation.error || 'Image validation failed');
    }

    // 2. Upload to blob storage
    const { key, url } = await avatarStorageService.uploadAvatar(userId, fileBuffer, declaredMimeType);

    // 3. Load old avatar key (if exists) for cleanup
    const oldResults = await query('SELECT avatar_key FROM users WHERE user_id = $1', [userId]);
    const oldAvatarKey = oldResults[0]?.avatar_key;

    // 4. Update database atomically
    const now = new Date().toISOString();
    const updateResults = await query(
      `UPDATE users
       SET avatar_key = $1,
           avatar_mime_type = $2,
           avatar_size = $3,
           avatar_width = $4,
           avatar_height = $5,
           avatar_uploaded_at = $6,
           updated_at = $7
       WHERE user_id = $8
       RETURNING avatar_key, avatar_mime_type, avatar_size, avatar_width, avatar_height`,
      [
        key,
        declaredMimeType,
        fileBuffer.length,
        validation.width,
        validation.height,
        now,
        now,
        userId,
      ],
    );

    if (updateResults.length === 0) {
      // DB update failed, try to delete the uploaded blob
      await avatarStorageService.deleteAvatar(key);
      throw new BadRequestError('Failed to update user avatar metadata');
    }

    // 5. Cleanup old avatar (fire-and-forget, non-fatal)
    if (oldAvatarKey) {
      avatarStorageService.deleteAvatar(oldAvatarKey).catch((error) => {
        console.warn('[avatars.service] Failed to delete old avatar blob:', oldAvatarKey, error);
      });
    }

    return {
      avatar_key: key,
      avatar_url: url,
      avatar_width: validation.width!,
      avatar_height: validation.height!,
      avatar_size: fileBuffer.length,
    };
  },

  /**
   * Delete user's avatar from database and blob storage.
   */
  async deleteAvatar(userId: string): Promise<void> {
    // 1. Get current avatar key
    const results = await query('SELECT avatar_key FROM users WHERE user_id = $1', [userId]);
    if (results.length === 0) {
      throw new Error('User not found');
    }

    const avatarKey = results[0]?.avatar_key;
    if (!avatarKey) {
      // No avatar to delete, but that's OK (idempotent)
      return;
    }

    // 2. Delete from blob storage (non-fatal if it fails)
    await avatarStorageService.deleteAvatar(avatarKey);

    // 3. Clear database fields
    const now = new Date().toISOString();
    await query(
      `UPDATE users
       SET avatar_key = NULL,
           avatar_mime_type = NULL,
           avatar_size = NULL,
           avatar_width = NULL,
           avatar_height = NULL,
           avatar_uploaded_at = NULL,
           updated_at = $1
       WHERE user_id = $2`,
      [now, userId],
    );
  },

  /**
   * Get avatar metadata for a user (if avatar exists and is visible to caller)
   */
  async getAvatarMetadata(userId: string): Promise<AvatarMetadata> {
    const results = await query(
      `SELECT avatar_key, avatar_mime_type, avatar_size, avatar_width, avatar_height, avatar_uploaded_at
       FROM users WHERE user_id = $1`,
      [userId],
    );

    if (results.length === 0) {
      return {
        avatar_key: null,
        avatar_mime_type: null,
        avatar_size: null,
        avatar_width: null,
        avatar_height: null,
        avatar_uploaded_at: null,
      };
    }

    const row = results[0];
    return {
      avatar_key: row.avatar_key || null,
      avatar_mime_type: row.avatar_mime_type || null,
      avatar_size: row.avatar_size || null,
      avatar_width: row.avatar_width || null,
      avatar_height: row.avatar_height || null,
      avatar_uploaded_at: row.avatar_uploaded_at || null,
    };
  },
};
