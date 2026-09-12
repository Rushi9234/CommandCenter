# Profile Avatar / Media Architecture & Security Audit

**Date:** 2026-09-04  
**Status:** AUDIT ONLY — NO IMPLEMENTATION  
**Scope:** Avatar upload, storage, display, replacement, deletion

---

## 1. CURRENT DEPLOYMENT ARCHITECTURE

### Backend Environment
- **Platform:** Vercel Functions (@vercel/node runtime)
- **Execution Model:** Serverless, stateless, ephemeral
- **Filesystem:** `/tmp` is NOT persistent across function invocations
- **Configuration:** Uses environment variables for external service configuration
- **Database:** Neon PostgreSQL (cloud-hosted)

### Frontend Environment
- **Platform:** Vercel (static with edge routing)
- **Runtime:** Client-side React via Vite
- **Configuration:** Environment variables for API endpoints

### Current Infrastructure
- No existing file upload endpoints
- No S3 or object storage configuration
- No image processing libraries (sharp, imagemagick, etc.)
- No multipart/form-data middleware (multer, etc.)
- No AWS SDK or equivalent installed

### Critical Finding
**❌ Local Filesystem Storage is NOT SAFE for This Deployment**

Vercel Functions do not provide persistent storage between invocations. Files written to `/tmp` or other filesystem paths:
- Are not guaranteed to persist
- Are not shared across function instances
- Will be lost when the function execution terminates
- Cannot be reliably retrieved in subsequent requests

This invalidates the "MVP: local disk, production: S3" approach suggested in the earlier profile audit.

---

## 2. STORAGE RECOMMENDATION

### Recommended Architecture: Vercel Blob Storage (S3-Compatible)

**Why Vercel Blob:**
- ✅ Seamless Vercel integration (already deployed there)
- ✅ Built on AWS S3 backend (AWS-quality reliability)
- ✅ Minimal additional configuration
- ✅ Free tier sufficient for MVP (100 GB/month)
- ✅ Automatic CDN distribution
- ✅ Direct S3-compatible API
- ✅ No vendor lock-in (S3-compatible, portable)

**Alternative: AWS S3 Direct**
- ✅ Industry standard
- ✅ Mature SDKs
- ✅ Full control
- ❌ Requires AWS account setup and cost management
- ❌ More configuration

### Recommendation
**Use Vercel Blob Storage for v1** (simple, integrated, appropriate for current scale)
- Free tier covers current and anticipated scale (200–500 teams, 100–200+ classrooms)
- Vercel SDK simplifies integration
- Easy migration to S3 later if needed
- No additional infrastructure to manage

### Storage Model

**Avatar Storage Structure:**
```
vercel-blob/
├── avatars/
│   ├── {user-id}/
│   │   ├── {version-hash}.jpg  (current)
│   │   ├── archive/
│   │   │   ├── old-hash-1.jpg  (optional archival)
│   │   │   └── old-hash-2.jpg
```

**Key Generation Strategy:**
- Store in DB: `avatar_key = "avatars/{user_id}/{uuid}"`
- Prevent enumeration: UUIDs are not sequential
- Prevent guessing: Include version hash
- Support replacement: New UUID per upload
- Optional archival: Keep old versions in archive folder for accidental deletion recovery

---

## 3. DATA MODEL

### Recommended Users Table Addition

```sql
-- Add to users table (NOT a separate profiles table)
ALTER TABLE users ADD COLUMN IF NOT EXISTS (
  -- Avatar storage reference
  avatar_key VARCHAR(500),      -- NULL = no avatar; "avatars/{user_id}/{uuid}"
  
  -- Metadata for cache busting and UI
  avatar_mime_type VARCHAR(50), -- "image/jpeg", "image/png", etc. (for validation audit)
  avatar_size INTEGER,          -- bytes (for audit trail)
  avatar_width INTEGER,         -- pixels
  avatar_height INTEGER,        -- pixels
  avatar_uploaded_at TIMESTAMP  -- when last uploaded/replaced
);
```

### Design Rationale

**Field Selection:**
- `avatar_key`: Stores the blob storage key (not the full URL)
  - URLs can change (CDN updates, region changes)
  - Keys are stable and unambiguous
  - Supports URL generation on-the-fly based on current configuration
  - Prevents URL leakage if storage provider changes
  
- `avatar_mime_type`: Stored MIME type (not trusted from upload)
  - Useful for validation audit trail
  - Supports Content-Type response headers
  - Helps detect spoofing attempts
  
- `avatar_size`, `avatar_width`, `avatar_height`, `avatar_uploaded_at`:
  - Useful for UI display
  - Supports audit and monitoring
  - Helps detect suspicious activity

**Why not a separate table:**
- Single-row atomic update (no join overhead)
- Simpler permission model (profile = user record)
- Consistent with existing profile fields (bio, pronouns, location)
- Avoids cascading delete edge cases

**Nullable/Default Behavior:**
```
avatar_key: NULL (no avatar uploaded yet)
avatar_mime_type: NULL (set only on upload)
avatar_size: NULL (not tracked until upload)
avatar_width: NULL (not tracked until upload)
avatar_height: NULL (not tracked until upload)
avatar_uploaded_at: NULL (not tracked until upload)
```

**Replacement Behavior:**
- On successful replacement: Generate new UUID, new `avatar_key`, update all metadata fields
- Old blob is optionally archived in `{key}/archive/` or deleted immediately
- DB update happens AFTER blob upload succeeds (transaction-like ordering)

**Deletion Behavior:**
- DELETE endpoint: Set all avatar fields to NULL
- Blob deletion: Synchronous (fail if blob delete fails)
- Can keep deleted blob in archive for recovery (optional v2)

---

## 4. UPLOAD API

### Endpoints

#### POST /api/users/me/avatar
**Purpose:** Upload or replace user's avatar

**Authentication:** Bearer token required  
**Authorization:** Authenticated user only (IDOR check: must be own user)

**Request Format:**
```
POST /api/users/me/avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body:
- file: [binary image data] (required)
```

**Validation:**
1. ✅ Authentication: Bearer token must be valid
2. ✅ Authorization: `req.user.userId` must match route (no user ID in URL)
3. ✅ Content-Type: Must be multipart/form-data
4. ✅ File presence: Must have exactly one file
5. ✅ File size: ≤ 5MB (reasonable limit)
6. ✅ File type:
   - MIME validation: `image/jpeg`, `image/png`, `image/webp` only
   - Magic bytes validation: Verify actual file type matches extension
   - SVG: Explicitly rejected (unsafe XML/script risks)
7. ✅ Dimensions: After upload, check image dimensions ≤ 4096x4096
8. ✅ No spoofing: File extension must match detected type

**Storage Interaction:**
1. Generate random UUID: `version_id = random_uuid()`
2. Generate blob key: `avatar_key = f"avatars/{user_id}/{version_id}"`
3. Upload to blob storage with Content-Type header
4. Update users table: Set avatar_key, avatar_mime_type, avatar_size, avatar_width, avatar_height, avatar_uploaded_at
5. If DB update fails: Delete uploaded blob (orphan cleanup)

**Response 200:**
```json
{
  "success": true,
  "avatar_url": "https://avatar.example.com/avatars/{user_id}/{version_id}",
  "user_id": "uuid",
  "avatar_size": 12345,
  "avatar_width": 512,
  "avatar_height": 512
}
```

**Errors:**
- 400: Invalid MIME type, spoofed extension, oversized, oversized dimensions
- 401: No authentication token
- 403: Attempt to upload for another user (IDOR)
- 409: Rate limit exceeded
- 413: Payload too large
- 500: Storage failure (blob upload failed, DB update failed)

#### DELETE /api/users/me/avatar
**Purpose:** Remove user's avatar

**Authentication:** Bearer token required  
**Authorization:** Authenticated user only

**Request Format:**
```
DELETE /api/users/me/avatar
Authorization: Bearer <token>
```

**Storage Interaction:**
1. Load current avatar_key from users table
2. Delete blob from storage (if exists)
3. Update users table: Set avatar_key = NULL, avatar_mime_type = NULL, etc.
4. If blob deletion fails but DB update succeeds: Log error, allow deletion to proceed (orphan cleanup)

**Response 204:**
```
(No body)
```

**Errors:**
- 401: No authentication token
- 403: Not own avatar
- 500: DB failure (rollback blob deletion if possible)

### Rate Limiting

**Reuse existing infrastructure:** Use existing `createApiLimiter()` or create `createAvatarLimiter()`
- Suggested policy: 10 avatar uploads per day per user
- Keyed to authenticated user ID
- Consistent with password-change rate limiting model

---

## 5. SECURITY MODEL

### Upload Security

**MIME Validation:** ✅ Required
- Accept: `image/jpeg`, `image/png`, `image/webp` only
- Reject: `image/svg+xml`, `application/*`, any other type
- Do NOT trust browser-supplied Content-Type

**Magic Bytes Validation:** ✅ Required (critical)
- JPEG: Start with `FF D8 FF`
- PNG: Start with `89 50 4E 47`
- WebP: Contains `WEBP` in first 12 bytes
- Reject if magic bytes don't match declared type

**File Extension Validation:** ✅ Required
- Must match detected MIME type
- Reject mismatches (spoofing)
- Safe extensions only: `.jpg`, `.jpeg`, `.png`, `.webp`

**File Size Limits:** ✅ Required
- Max 5MB total (reasonable for avatar)
- Enforce early in request handling

**Image Dimensions:** ✅ Required
- Max 4096x4096 pixels
- Check AFTER upload (using image library metadata)
- Reject oversized images
- Prevent "zip bomb" / decompression bomb attacks (handled by image library)

**Metadata Stripping:** ✅ Recommended
- Remove EXIF data (location, camera info, timestamps)
- Remove IPTC data (copyright, keywords)
- Recommended library: `sharp` (if added) or equivalent
- For v1: Accept as-is, strip in v2

**SVG Handling:** ❌ Explicitly Reject
- SVG files can contain scripts, styles, and other malicious payloads
- Not suitable for user avatars in v1
- Future: Only if sanitizer library is added (e.g., DOMPurify or equivalent)

**Executable Payload Protection:** ✅ Guaranteed by magic-byte validation
- MIME + magic-byte check ensures file is actually an image
- Even if uploaded as `.jpg`, actual file format is verified

**Path Traversal Prevention:** ✅ Guaranteed by blob storage
- Blob storage uses opaque URLs, not filesystem paths
- No path traversal possible (no `../` in keys)
- Storage key is generated server-side, never from user input

**Storage Key Generation:** ✅ Secure
- Use UUIDs for version component (unpredictable)
- Include user_id (not guessable without authentication)
- Result: `avatars/{user_id}/{uuid}` is not enumerable

**Content-Type Handling:** ✅ Enforced
- Store validated MIME type in database
- Send Content-Type header in responses
- Prevents browser content-type sniffing

**Cache Poisoning Prevention:** ✅ Handled by versioning
- UUID per upload ensures unique key per version
- Cache busting: ?v=timestamp or key includes hash
- New upload = new URL automatically

---

## 6. AUTHORIZATION & PRIVACY

### Access Control

**Upload Authorization:** ✅ IDOR Prevention
- POST /api/users/me/avatar: Only authenticated user
- Cannot upload for another user (no user_id param, uses authenticated context)
- Verified by: `req.user!.userId` must match request context

**Delete Authorization:** ✅ IDOR Prevention
- DELETE /api/users/me/avatar: Only authenticated user
- Cannot delete another user's avatar
- Verified by: `req.user!.userId` must match request context

**Display Authorization:** ✅ Profile Visibility Rules Respected
- Avatar displayed only if:
  - User viewing is the owner (always see own avatar), OR
  - User is on same team AND owner's profile is public, OR
  - User is admin/owner of team/classroom
- Fallback to initials if avatar is not visible to requestor

**Storage Object Enumeration Prevention:** ✅ UUID-based keys
- Blob keys use UUID (random, 128-bit)
- Cannot guess other users' avatar keys
- Brute-force would require ~2^128 attempts

**Direct Storage URL Security:** ⚠️ Risk Assessment
- If Vercel Blob provides public URLs: Consider signed URLs for v2
- For v1: Public URLs acceptable if avatars are public-facing anyway
- Mitigated by: Avatar_key not in URL path parameters (opaque blob URL)

### Privacy Implications

**Profile Visibility:** ✅ Enforced
- Avatar display respects existing `is_profile_public` setting
- Public profiles show avatar to everyone
- Private profiles show avatar only to profile owner

**Data Retention:** ✅ Defined
- Avatar deleted immediately when user deletes it
- Orphaned blobs cleaned up by deletion endpoint
- Optional: Archive deleted avatars for recovery (v2)

**Unrelated File Access:** ✅ Prevented
- Blob storage key is `avatars/{user_id}/{uuid}`, not arbitrary paths
- Cannot access other files in storage (no path traversal)
- Storage isolation enforced by blob storage provider

---

## 7. IMAGE VALIDATION & PROCESSING

### Validation Flow

**v1 (MVP):**
```
1. Authentication + Authorization check
2. Multipart parsing
3. File presence + size check (≤ 5MB)
4. MIME type validation (image/jpeg, image/png, image/webp only)
5. Magic bytes validation (actual file format check)
6. Upload to blob storage
7. Load image metadata (dimensions only)
8. Dimension validation (≤ 4096x4096)
9. DB update with metadata
10. Return avatar_url
```

**Processing:**
- Store original image (no resizing/reencoding in v1)
- No metadata stripping (v2 feature)
- No thumbnail generation (v1 feature)
- No format conversion (accept as-is)

### Recommended Libraries (if added)

- `multer`: Multipart form parsing
- `file-type`: Magic bytes validation
- `probe-image-size`: Fast dimension checking without full decode
- `sharp`: (v2) Image resizing, metadata stripping, optimization

**CPU/Memory Impact:**
- Dimension checking: ~50ms, minimal memory
- Full processing pipeline (sharp): ~500ms per upload, CPU/memory proportional to image size
- Keep simple for v1 (fast endpoint)

---

## 8. FRONTEND UX & DISPLAY

### Current Profile Display Locations

**Locations Found:**
1. Profile page header (GET /api/users/me shows avatar_url)
2. User card/preview (in team members list, etc.)
3. Account menu (top-right dropdown, if implemented)
4. Profile image display (full-size in profile details)

### Minimum UI Integration

**Profile Upload Section:**
```
Profile Picture
[Preview: avatar or initials fallback]
[Choose File] [Upload] [Delete]
[Upload status: loading/error/success]
```

**Fallback Behavior:**
- If no avatar: Display user initials (F.L. for First Last)
- If avatar missing/broken: Display initials
- If avatar private: Don't display, show initials only

### Cache Busting Strategy

**Problem:** Browser cache serves stale avatar after replacement

**Solution:** Version URL with timestamp or hash
```javascript
avatar_url = `${baseUrl}/avatars/{user_id}/{uuid}?v=${timestamp}`
```

OR

```javascript
// URL already includes UUID (version hash)
avatar_url = `${baseUrl}/avatars/{user_id}/{v1-uuid}`  // Changes with each upload
```

**Recommended:** Use the UUID-in-URL approach (second option)
- URL changes naturally with each upload
- No additional query parameter needed
- CDN caches each version separately

---

## 9. REPLACEMENT & DELETE LIFECYCLE

### Upload (New or Replacement)

**Success Path:**
1. Blob upload succeeds
2. DB update succeeds
3. Return new avatar_url
4. Old blob: Optionally archive or delete immediately
5. Frontend: Clear cache, load new URL

**Partial Failure Scenarios:**

**Scenario: Blob upload succeeds, DB update fails**
- Orphaned blob exists in storage
- DB still points to old avatar_key
- Cleanup: Retry DB update or manual cleanup job
- Risk: Wasted storage (acceptable for v1)

**Scenario: DB update fails partway**
- DB transaction rollback (ACID)
- Old avatar_key still in DB
- New blob uploaded but unreferenced
- Cleanup: Manual orphan-cleanup job

**Recommended Transaction Model:**
```
1. Upload blob to storage (succeeds or fails)
2. IF blob upload fails: Return 500, stop
3. ELSE: Retrieve image metadata
4. ELSE IF metadata retrieval fails: Delete blob, return 500
5. ELSE: Update DB in single transaction (atomic)
6. IF DB update fails: Try to delete uploaded blob (cleanup)
7. Return success with new avatar_url
```

### Deletion

**Success Path:**
1. Load avatar_key from DB
2. Delete blob from storage
3. DB update: Set avatar_key = NULL (and related fields)
4. Return 204

**Partial Failure Scenarios:**

**Scenario: Blob delete fails, DB update succeeds**
- Orphaned blob remains in storage
- DB correctly reflects deletion (no avatar_key)
- Frontend: Shows fallback (initials)
- Cleanup: Manual orphan-cleanup job or retention policy

**Scenario: Blob delete succeeds, DB update fails**
- DB still points to avatar_key
- Blob is actually deleted
- Frontend: 404 when loading avatar
- Cleanup: Retry DB update

**Recommended Failure Handling:**
- Blob deletion failure: Don't block DB update
- Log error for monitoring
- Run async orphan-cleanup job daily
- DB update is authoritative (app trusts DB, not blob storage)

---

## 10. RATE LIMITING

### Strategy

**Reuse existing infrastructure:**
- Pattern: Like password-change rate limiting (3/hour)
- Endpoint: POST /api/users/me/avatar
- Limit: 10 uploads per day per user (reasonable)
- Key: Authenticated user ID
- Window: 24 hours
- Middleware: Apply before file processing (early exit)

**Implementation:**
```javascript
app.post('/api/users/me/avatar',
  authenticate,
  getRateLimitProvider().createAvatarLimiter(),  // NEW
  uploadAndValidateAvatar  // handler
);
```

**Configuration:**
- No additional env vars needed
- Limit is embedded in limiter implementation
- Can adjust per deployment if needed

---

## 11. TESTING PLAN

### Backend Tests (16 tests)

1. ✅ Authenticated user can upload avatar
2. ✅ Unauthenticated request rejected (401)
3. ✅ User cannot upload for another user (403)
4. ✅ Invalid MIME type rejected (400)
5. ✅ Spoofed file extension rejected (400)
6. ✅ Oversized file rejected (413)
7. ✅ Oversized dimensions rejected (400)
8. ✅ Non-image file rejected (400)
9. ✅ SVG file explicitly rejected (400)
10. ✅ Rate limiting works (429 after limit)
11. ✅ Avatar replacement works (old blob removed/archived)
12. ✅ Unauthorized deletion rejected (403)
13. ✅ Deletion removes blob and DB entries
14. ✅ Blob upload failure handled gracefully
15. ✅ DB failure triggers blob cleanup
16. ✅ No storage key leakage in error messages

### Frontend Tests (9 tests)

17. ✅ Avatar displays when loaded
18. ✅ Initials fallback displays when no avatar
19. ✅ Upload loading state shown
20. ✅ Upload error state displayed correctly
21. ✅ Successful upload refreshes UI
22. ✅ Avatar replacement works and clears cache
23. ✅ Delete button removes avatar
24. ✅ Broken image fallback to initials
25. ✅ Upload control is accessible (keyboard, screen reader)
26. ✅ Mobile layout: Responsive upload control
27. ✅ After replacement: Old avatar not served (cache busted)

---

## 12. NON-FUNCTIONAL REQUIREMENTS

### Vercel/Serverless Compatibility

**Deployment Model:** Vercel Functions
- Stateless: ✅ No local storage
- Cold starts: ✅ Image validation is fast (< 1s)
- Concurrent requests: ✅ Blob storage handles concurrency
- Maximum payload: ✅ 5MB < Vercel limit (50MB)

### Performance

**Upload latency:**
- Blob upload: 200-500ms (network + Vercel Blob)
- Image metadata extraction: 50-100ms
- DB update: 50-100ms
- Total: 300-700ms (acceptable for avatar upload)

**Display latency:**
- Avatar URL generation: <1ms
- CDN cache hit: <50ms
- Cache miss: 100-300ms (first time)

### Memory Usage

**Per-request spike:**
- Multipart parsing: ~5MB (for 5MB file)
- Image metadata loading: ~10MB (full image decode)
- Total: ~15MB per upload
- Vercel limit: 3008MB (sufficient)

### CDN / Cache Behavior

**Vercel Blob CDN:**
- Automatic CDN distribution
- Edge caching (likely 1-7 days default)
- Cache purge: Not automatic (manual API call)

**Strategy:** UUID-based URLs provide natural cache busting
- Each upload = new URL
- Old URLs stay cached (no issue)
- Replacement = new URL automatically

### Scalability

**Target scale:** 200–500 teams, 100–200+ classrooms
- Estimated avatars: 5,000–10,000 users
- Estimated storage: ~50–500GB (10-100MB per avatar, assume 10MB avg)
- Vercel Blob free tier: 100GB/month (likely sufficient, paid tier unlimited)

**Upload throughput:**
- Concurrent uploads: Vercel Functions + Blob Storage handle well
- No bottleneck at current scale

### Observability

**Monitoring:**
- Track upload success/failure rates
- Monitor blob storage quota
- Alert on orphaned blob accumulation
- Log all validation failures (MIME, dimensions, spoofing)

**Logging:**
- Log validation failures (for security audit)
- Log storage errors
- Log DB update failures
- Do NOT log file contents or paths to user files

### Failure Recovery

**Blob upload retry:** Use Vercel Blob SDK's built-in retry
**DB update retry:** Manual retry on specific error codes
**Orphan cleanup:** Daily job to remove unreferenced blobs

---

## 13. PRODUCT DECISIONS REQUIRED

**Decision 1: Avatar Format Support**
- Recommendation: `.jpg`, `.png`, `.webp` only
- Reject `.gif`, `.svg`, animated formats
- Decision: Approved or adjust?

**Decision 2: Maximum Upload Size**
- Recommendation: 5MB
- Rationale: Reasonable for profile avatar, avoids memory issues
- Decision: Approved or adjust?

**Decision 3: Image Dimension Limits**
- Recommendation: Max 4096x4096 pixels
- Rationale: Sufficient for any display scenario, prevents DoS
- Decision: Approved or adjust?

**Decision 4: Storage Provider**
- Recommendation: Vercel Blob Storage
- Rationale: Integrated, free tier sufficient, S3-compatible for future
- Decision: Approved or use AWS S3 directly?

**Decision 5: Avatar Privacy Model**
- Recommendation: Avatar follows `is_profile_public` setting
- Public profiles: Avatar visible to all
- Private profiles: Avatar visible only to owner
- Decision: Approved or different model?

**Decision 6: Old Avatar Retention**
- Recommendation: Delete immediately on replacement
- Rationale: Simple, no orphan management
- Alternative: Archive in subfolder for recovery (adds complexity)
- Decision: Delete or archive?

**Decision 7: Cropping / Image Editing**
- Recommendation: v1: No cropping, accept image as-is
- v2: Add client-side cropping UI
- Decision: No cropping for v1, OK?

**Decision 8: Animated Images**
- Recommendation: Reject animated GIFs, WebP
- Rationale: No performance issue but adds complexity
- Decision: Reject or accept?

**Decision 9: Rate Limiting Policy**
- Recommendation: 10 avatar uploads per day per user
- Rationale: Prevents abuse, allows legitimate updates
- Decision: Approved or adjust limit?

**Decision 10: Avatar Deletion Permission**
- Recommendation: User can delete own avatar only
- Alternative: Also allow admins to delete other users' avatars
- Decision: Owner only or admin-override?

---

## 14. RISKS & MITIGATIONS

### Storage Risks

**Risk: Blob storage quota exceeded**
- Mitigation: Monitor usage, alert at 80%
- Mitigation: Implement orphan cleanup to reduce waste

**Risk: Orphaned blobs accumulate**
- Mitigation: Daily cleanup job
- Mitigation: Blob storage expiration policies

**Risk: Blob storage API changes**
- Mitigation: Use S3-compatible SDK (portable to S3)

### Security Risks

**Risk: File-type spoofing**
- Mitigation: Magic-byte validation (REQUIRED)

**Risk: Malicious EXIF metadata**
- Mitigation: Metadata stripping (v2)

**Risk: Oversized image DoS**
- Mitigation: File size limit (5MB)
- Mitigation: Dimension limits (4096x4096)

**Risk: SVG script injection**
- Mitigation: Explicit SVG rejection

**Risk: IDOR (user accesses another's avatar)**
- Mitigation: User ID in storage path
- Mitigation: Visibility rules in display logic

**Risk: Path traversal**
- Mitigation: Server-generated keys, blob storage isolation

### Operational Risks

**Risk: Upload fails partway (blob success, DB failure)**
- Mitigation: Transaction-like ordering
- Mitigation: Orphan cleanup job

**Risk: Delete fails partway (blob fails, DB succeeds)**
- Mitigation: Orphan cleanup job
- Mitigation: Accept blob remains (low impact)

**Risk: Rate limiting exhaustion (user locked out)**
- Mitigation: Reasonable limit (10/day)
- Mitigation: Daily reset window

---

## 15. IMPLEMENTATION PHASES

### Phase 1: Core (v1 MVP)
- [ ] Data model: Add avatar_key, avatar_mime_type, dimensions to users table
- [ ] POST /api/users/me/avatar: Upload and replace
- [ ] DELETE /api/users/me/avatar: Delete
- [ ] Validation: MIME, magic bytes, size, dimensions
- [ ] Frontend: Display avatar with initials fallback
- [ ] Tests: 25 tests (backend + frontend)
- [ ] Rate limiting: 10/day per user
- [ ] No image processing, no cropping, no metadata stripping

### Phase 2: Polish & Performance (v1.1)
- [ ] Metadata stripping (EXIF, IPTC)
- [ ] Image optimization (consider resizing to standard avatar size)
- [ ] Thumbnail generation (for team member lists)
- [ ] Orphan cleanup job

### Phase 3: Advanced (v2)
- [ ] Client-side image cropping
- [ ] Animated image support (if needed)
- [ ] Avatar archives (keep deleted avatars for recovery)
- [ ] Admin avatar management
- [ ] Batch avatar uploads

---

## 16. DEFINITION OF DONE (v1 Avatar)

- [ ] Data model: Users table has avatar_key and metadata fields
- [ ] No migrations: Fields added via new migration (1788000001000_add-avatar-fields.sql)
- [ ] API endpoints: POST/DELETE /api/users/me/avatar work correctly
- [ ] Validation: All 10 validation checks pass (MIME, magic bytes, size, dimensions, SVG rejection, etc.)
- [ ] Blob storage: Integration with Vercel Blob working
- [ ] Authorization: IDOR testing passes (users cannot access/delete others' avatars)
- [ ] Frontend: Avatar displays in profile, falls back to initials
- [ ] Cache busting: Replacement shows new avatar immediately
- [ ] Rate limiting: 10/day limit enforced
- [ ] Error handling: All failure scenarios handled gracefully
- [ ] Tests: 25+ tests (backend + frontend) all passing
- [ ] TypeScript: Clean (no errors)
- [ ] Logging: Validation failures logged for audit
- [ ] Documentation: API docs updated
- [ ] Security review: Passed security audit

---

## 17. SUMMARY & NEXT TASK

### Storage Architecture
- **Use:** Vercel Blob Storage (S3-compatible)
- **Why:** Serverless backend requires persistent storage; local filesystem is not safe
- **Key:** Store avatar_key in database, not full URL
- **URL:** Generated on-the-fly from key for flexibility

### Data Model
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS (
  avatar_key VARCHAR(500),
  avatar_mime_type VARCHAR(50),
  avatar_size INTEGER,
  avatar_width INTEGER,
  avatar_height INTEGER,
  avatar_uploaded_at TIMESTAMP
);
```

### API
- POST /api/users/me/avatar (upload/replace)
- DELETE /api/users/me/avatar (delete)

### Security
- ✅ Authentication + Authorization
- ✅ MIME + Magic bytes validation
- ✅ File size + Dimension limits
- ✅ SVG rejection
- ✅ IDOR prevention
- ✅ Rate limiting (10/day)

### Next Task
**Profile Phase 4 Implementation: Avatar Upload** (NOT YET STARTED)
- Implement POST/DELETE endpoints
- Add avatar_key to users table
- Integrate Vercel Blob Storage
- Add frontend UI
- Add comprehensive tests

---

## AUDIT COMPLETE ✅

This audit provides a complete, secure, production-appropriate design for avatar upload in CommandCenter's serverless architecture. The recommendation explicitly rejects local filesystem storage and identifies Vercel Blob Storage as the appropriate solution for the current deployment model.

**Awaiting product decision approvals before implementation begins.**
