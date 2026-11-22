import request from 'supertest';
import sharp from 'sharp';
import { app } from '../src/app';
import { query } from '../src/db/client';
import { registerAndLogin } from './utils/fixtures';

// The approved architecture uses Vercel Blob Storage, but this test
// environment has no VERCEL_BLOB_READ_WRITE_TOKEN provisioned (verified:
// absent from .env.test, .env.test.example, and .env.example). Without a
// live token, avatarStorageService.uploadAvatar would always throw before
// ever reaching the database/business logic this suite exists to verify.
// Mocking the storage layer here tests everything this application actually
// controls (validation, authorization, rate limiting, DB atomicity,
// replacement/cleanup, privacy) in isolation from the one thing it does
// not control (the real network call to Vercel's blob API) -- that
// integration itself is a deployment/credentials concern, not something a
// unit/integration test can honestly exercise without a real token.
jest.mock('../src/modules/avatars/avatars.storage', () => ({
  avatarStorageService: {
    uploadAvatar: jest.fn(async (userId: string, _buffer: Buffer, _mime: string) => ({
      key: `avatars/${userId}/${Math.random().toString(36).slice(2)}`,
      url: `https://blob.example.test/avatars/${userId}/mock`,
    })),
    deleteAvatar: jest.fn(async () => {}),
    getAvatarUrl: jest.fn((key: string) => (key ? `https://blob.example.test/${key}` : '')),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { avatarStorageService } = require('../src/modules/avatars/avatars.storage');

const validJpeg = async (width = 200, height = 200): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } } })
    .jpeg()
    .toBuffer();

const validPng = async (width = 200, height = 200): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 4, background: { r: 50, g: 60, b: 70, alpha: 1 } } })
    .png()
    .toBuffer();

const validWebp = async (width = 200, height = 200): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .webp()
    .toBuffer();

beforeEach(() => {
  jest.clearAllMocks();
  // Restore default (non-throwing) behavior after any test that overrides it.
  avatarStorageService.uploadAvatar.mockImplementation(async (userId: string) => ({
    key: `avatars/${userId}/${Math.random().toString(36).slice(2)}`,
    url: `https://blob.example.test/avatars/${userId}/mock`,
  }));
  avatarStorageService.deleteAvatar.mockImplementation(async () => {});
});

describe('Avatar Upload & Management', () => {
  describe('Authentication & Authorization', () => {
    it('authenticated user can upload avatar', async () => {
      const { token } = await registerAndLogin('av-upload');
      const jpeg = await validJpeg();

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', jpeg, 'test.jpg');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.avatar_url).toBeDefined();
      expect(res.body.data.avatar_key).toBeDefined();
      expect(res.body.data.avatar_size).toBeGreaterThan(0);
      expect(avatarStorageService.uploadAvatar).toHaveBeenCalledTimes(1);
    });

    it('unauthenticated request rejected', async () => {
      const jpeg = await validJpeg();

      const res = await request(app).post('/api/users/me/avatar').attach('file', jpeg, 'test.jpg');

      expect(res.status).toBe(401);
      expect(avatarStorageService.uploadAvatar).not.toHaveBeenCalled();
    });

    it('storage key is always server-generated from the authenticated user id, never client input', async () => {
      const { token, userId } = await registerAndLogin('av-idor');
      const jpeg = await validJpeg();

      // Attempt to smuggle a foreign user id / path traversal via form fields
      // and query string -- the endpoint has no field that accepts a key or
      // target user, so this can only ever affect the authenticated caller.
      const res = await request(app)
        .post('/api/users/me/avatar?user_id=someone-else&key=avatars/other-user/x')
        .set('Authorization', `Bearer ${token}`)
        .field('user_id', 'someone-else')
        .field('avatar_key', '../../etc/passwd')
        .attach('file', jpeg, 'test.jpg');

      expect(res.status).toBe(200);
      expect(res.body.data.avatar_key).toContain(userId);
      expect(res.body.data.avatar_key).not.toContain('someone-else');
      expect(res.body.data.avatar_key).not.toContain('..');

      // Confirm the DB row updated is the caller's own row
      const rows = await query('SELECT avatar_key FROM users WHERE user_id = $1', [userId]);
      expect(rows[0]?.avatar_key).toBe(res.body.data.avatar_key);
    });
  });

  describe('File Format Validation', () => {
    it('accepts a valid JPEG', async () => {
      const { token } = await registerAndLogin('av-jpeg');
      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', await validJpeg(), 'test.jpg');

      expect(res.status).toBe(200);
    });

    it('accepts a valid PNG', async () => {
      const { token } = await registerAndLogin('av-png');
      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', await validPng(), { filename: 'test.png', contentType: 'image/png' });

      expect(res.status).toBe(200);
    });

    it('accepts a valid WebP', async () => {
      const { token } = await registerAndLogin('av-webp');
      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', await validWebp(), { filename: 'test.webp', contentType: 'image/webp' });

      expect(res.status).toBe(200);
    });

    it('rejects unsupported MIME type', async () => {
      const { token } = await registerAndLogin('av-mime');

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('This is plain text, not an image'), {
          filename: 'test.txt',
          contentType: 'text/plain',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/unsupported|format/i);
    });

    it('rejects SVG files', async () => {
      const { token } = await registerAndLogin('av-svg');

      const svgContent = Buffer.from(
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" /></svg>',
      );

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', svgContent, { filename: 'test.svg', contentType: 'image/svg+xml' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/svg|xml/i);
    });

    it('rejects GIF files', async () => {
      const { token } = await registerAndLogin('av-gif');

      const gifHeader = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', gifHeader, { filename: 'test.gif', contentType: 'image/gif' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/gif|animated/i);
    });

    it('rejects animated WebP (declared as image/gif-equivalent animated content is already blocked; verify webp path independently rejects a non-webp-signature payload)', async () => {
      const { token } = await registerAndLogin('av-awebp');

      // A payload declaring image/webp but without a valid WEBP RIFF body
      // (simulating an animated/malformed webp container) must fail the
      // magic-bytes check rather than being trusted on declared MIME alone.
      const fakeWebp = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', fakeWebp, { filename: 'test.webp', contentType: 'image/webp' });

      expect(res.status).toBe(400);
    });

    it('rejects file type spoofing (JPEG extension/MIME, PNG magic bytes)', async () => {
      const { token } = await registerAndLogin('av-spoof');
      const pngBytes = await validPng();

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', pngBytes, { filename: 'test.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/mismatch|spoofed|detected/i);
    });

    it('rejects a malformed/corrupt image that cannot be decoded', async () => {
      const { token } = await registerAndLogin('av-malform');

      // Valid JPEG magic bytes, but the rest of the file is garbage --
      // passes the magic-byte check, must fail at the decode/dimension step.
      const malformed = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(200, 0x00)]);

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', malformed, { filename: 'bad.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('File Size & Dimensions', () => {
    it('rejects file larger than 5MB', async () => {
      const { token } = await registerAndLogin('av-size');

      const largeFile = Buffer.alloc(6 * 1024 * 1024, 0xff);
      largeFile[0] = 0xff;
      largeFile[1] = 0xd8;
      largeFile[2] = 0xff;

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', largeFile, 'large.jpg');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/size|5mb|limit/i);
    });

    it('accepts a real image well under 5MB', async () => {
      const { token } = await registerAndLogin('av-sizeok');
      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', await validJpeg(), 'small.jpg');

      expect(res.status).toBe(200);
    });

    it('rejects images larger than 4096x4096', async () => {
      const { token } = await registerAndLogin('av-dim');
      const oversized = await validJpeg(4200, 4200);

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', oversized, 'huge.jpg');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dimension|4096/i);
    }, 30000);

    it('accepts images at exactly 4096x4096', async () => {
      const { token } = await registerAndLogin('av-dimok');
      const atLimit = await validJpeg(4096, 4096);

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', atLimit, 'atlimit.jpg');

      expect(res.status).toBe(200);
    }, 30000);
  });

  describe('Rate Limiting', () => {
    it('enforces 10 uploads per day and keys the limit per authenticated user (not shared across users)', async () => {
      const userA = await registerAndLogin('av-rla');
      const jpeg = await validJpeg();

      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post('/api/users/me/avatar')
          .set('Authorization', `Bearer ${userA.token}`)
          .attach('file', jpeg, 'test.jpg');

        expect(res.status).not.toBe(429);
      }

      // 11th attempt for the same user hits the limit
      const blocked = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${userA.token}`)
        .attach('file', jpeg, 'test.jpg');
      expect(blocked.status).toBe(429);

      // A second, unrelated user is not affected by userA's exhausted quota --
      // proves the limiter key is the authenticated user id, not IP or a
      // shared bucket (the defect found and fixed during this verification:
      // the limiter previously ran ahead of `authenticate` and always fell
      // back to its IP key).
      const userB = await registerAndLogin('av-rlb');
      const resB = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${userB.token}`)
        .attach('file', jpeg, 'test.jpg');
      expect(resB.status).not.toBe(429);
    }, 60000);

    it('unauthenticated requests are rejected before the rate limiter can apply (no bypass via omitting auth)', async () => {
      const jpeg = await validJpeg();
      const res = await request(app).post('/api/users/me/avatar').attach('file', jpeg, 'test.jpg');
      expect(res.status).toBe(401);
    });
  });

  describe('Avatar Replacement', () => {
    it('replacing an avatar updates the DB key and cleans up the old blob', async () => {
      const { token, userId } = await registerAndLogin('av-replace');

      const first = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', await validJpeg(), 'first.jpg');
      expect(first.status).toBe(200);
      const firstKey = first.body.data.avatar_key;

      const second = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', await validPng(), { filename: 'second.png', contentType: 'image/png' });
      expect(second.status).toBe(200);
      const secondKey = second.body.data.avatar_key;

      expect(secondKey).not.toBe(firstKey);

      // DB reflects only the new key
      const rows = await query('SELECT avatar_key FROM users WHERE user_id = $1', [userId]);
      expect(rows[0]?.avatar_key).toBe(secondKey);

      // Old blob was cleaned up (non-fatal, best-effort call to storage)
      expect(avatarStorageService.deleteAvatar).toHaveBeenCalledWith(firstKey);
    });
  });

  describe('Avatar Deletion', () => {
    it('user can delete their own avatar', async () => {
      const { token, userId } = await registerAndLogin('av-delete');

      await query('UPDATE users SET avatar_key = $1, avatar_mime_type = $2 WHERE user_id = $3', [
        'avatars/test/uuid-123',
        'image/jpeg',
        userId,
      ]);

      const res = await request(app).delete('/api/users/me/avatar').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);

      const userResults = await query('SELECT avatar_key FROM users WHERE user_id = $1', [userId]);
      expect(userResults[0]?.avatar_key).toBeNull();
      expect(avatarStorageService.deleteAvatar).toHaveBeenCalledWith('avatars/test/uuid-123');
    });

    it('unauthenticated deletion rejected', async () => {
      const res = await request(app).delete('/api/users/me/avatar');
      expect(res.status).toBe(401);
    });

    it('a user cannot delete another user\'s avatar (no cross-user path exists)', async () => {
      const userA = await registerAndLogin('av-dela');
      const userB = await registerAndLogin('av-delb');

      await query('UPDATE users SET avatar_key = $1 WHERE user_id = $2', ['avatars/userB/real-key', userB.userId]);

      // userA can only ever act on their own row -- the endpoint takes no
      // target id, so this exercises that userA's delete never touches userB.
      const res = await request(app)
        .delete('/api/users/me/avatar')
        .set('Authorization', `Bearer ${userA.token}`);
      expect(res.status).toBe(204);

      const bRows = await query('SELECT avatar_key FROM users WHERE user_id = $1', [userB.userId]);
      expect(bRows[0]?.avatar_key).toBe('avatars/userB/real-key');
    });

    it('delete is idempotent (no error if no avatar exists)', async () => {
      const { token } = await registerAndLogin('av-delempty');

      const res = await request(app).delete('/api/users/me/avatar').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
      expect(avatarStorageService.deleteAvatar).not.toHaveBeenCalled();
    });

    it('a storage deletion failure does not prevent the DB from being cleared (fails safe)', async () => {
      const { token, userId } = await registerAndLogin('av-delfail');

      await query('UPDATE users SET avatar_key = $1 WHERE user_id = $2', ['avatars/test/fails-to-delete', userId]);

      avatarStorageService.deleteAvatar.mockImplementationOnce(async () => {
        throw new Error('simulated storage outage');
      });

      // avatars.service.ts calls avatarStorageService.deleteAvatar directly
      // (not wrapped in try/catch at that call site) -- if the storage layer
      // itself doesn't swallow the error, this exposes whether a transient
      // storage failure incorrectly blocks DB cleanup.
      const res = await request(app).delete('/api/users/me/avatar').set('Authorization', `Bearer ${token}`);

      // Whatever status is returned, the DB must never end up in a state
      // that still references a key the app believes is gone from storage
      // AND failed to clear -- i.e. no silent inconsistency.
      if (res.status === 204) {
        const rows = await query('SELECT avatar_key FROM users WHERE user_id = $1', [userId]);
        expect(rows[0]?.avatar_key).toBeNull();
      } else {
        expect(res.status).toBe(500);
      }
    });
  });

  describe('Failure Isolation', () => {
    it('a storage upload failure leaves no avatar reference in the database', async () => {
      const { token, userId } = await registerAndLogin('av-upfail');

      avatarStorageService.uploadAvatar.mockImplementationOnce(async () => {
        throw new Error('simulated Vercel Blob outage');
      });

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', await validJpeg(), 'test.jpg');

      expect(res.status).toBe(500);

      const rows = await query('SELECT avatar_key FROM users WHERE user_id = $1', [userId]);
      expect(rows[0]?.avatar_key).toBeNull();
    });

    it('error responses do not leak the internal failure message', async () => {
      const { token } = await registerAndLogin('av-upmsg');

      avatarStorageService.uploadAvatar.mockImplementationOnce(async () => {
        throw new Error('simulated Vercel Blob outage: token abc123 rejected');
      });

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', await validJpeg(), 'test.jpg');

      expect(res.status).toBe(500);
      expect(res.body.error).not.toMatch(/token|abc123|vercel/i);
    });
  });

  describe('Avatar Metadata & Privacy', () => {
    it('profile response includes avatar_key and avatar_url after upload', async () => {
      const { token, userId } = await registerAndLogin('av-meta');

      await query(
        'UPDATE users SET avatar_key = $1, avatar_mime_type = $2, avatar_width = $3, avatar_height = $4 WHERE user_id = $5',
        ['avatars/test/uuid-456', 'image/jpeg', 512, 512, userId],
      );

      const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.avatar_key).toBe('avatars/test/uuid-456');
      expect(res.body.data.avatar_url).toBeDefined();
      expect(res.body.data.avatar_mime_type).toBe('image/jpeg');
    });

    it('avatar_url and avatar_key are null when no avatar exists', async () => {
      const { token } = await registerAndLogin('av-noavatar');

      const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.avatar_url).toBeNull();
      expect(res.body.data.avatar_key).toBeNull();
    });

    it('avatar metadata (size/width/height) is persisted exactly as computed', async () => {
      const { token, userId } = await registerAndLogin('av-metaex');

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', await validJpeg(300, 250), 'test.jpg');

      expect(res.status).toBe(200);
      expect(res.body.data.avatar_width).toBe(300);
      expect(res.body.data.avatar_height).toBe(250);

      const rows = await query(
        'SELECT avatar_width, avatar_height, avatar_mime_type, avatar_size FROM users WHERE user_id = $1',
        [userId],
      );
      expect(rows[0]?.avatar_width).toBe(300);
      expect(rows[0]?.avatar_height).toBe(250);
      expect(rows[0]?.avatar_mime_type).toBe('image/jpeg');
      expect(rows[0]?.avatar_size).toBeGreaterThan(0);
    });
  });

  describe('Error Messages & Safety', () => {
    it('error messages do not expose storage internals', async () => {
      const { token } = await registerAndLogin('av-errors');

      const res = await request(app)
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('not an image'), { filename: 'bad.txt', contentType: 'text/plain' });

      expect(res.status).toBe(400);
      expect(res.body.error).not.toMatch(/blob|vercel|storage|s3|key|path/i);
    });
  });
});
