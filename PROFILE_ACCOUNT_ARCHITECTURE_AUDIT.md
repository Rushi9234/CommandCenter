# Profile / Account Architecture & Security Audit

**Date:** 2026-09-02  
**Status:** AUDIT ONLY — NO IMPLEMENTATION  
**Scope:** User Profile, Account Settings, Password Management, Avatar/Media Storage

---

## 1. CURRENT AUTH/PROFILE ARCHITECTURE

### Authentication System (VERIFIED SECURE)

**Password Hashing:**
- Algorithm: bcrypt (cost factor 12, raised from 10)
- Implementation: Milestone 38 — timing-attack resistant
- All existing hashes remain valid (bcrypt embeds cost factor)

**Token System:**
- Access Tokens: Short-lived JWT (15-minute typical)
- Refresh Tokens: Opaque, hashed, rotated on each use
- Verification Tokens: 24-hour lifespan, email verification only
- Password Reset Tokens: 1-hour lifespan, single-use
- Legacy Bearer Tokens: Long-lived, deprecated path for frontend migration

**Session Management:**
- Refresh token rotation prevents replay attacks
- Tokens revoked atomically with password changes (Milestone 38)
- Session invalidation: JWT rejected if issued before `password_changed_at`
- No device/session enumeration currently (single-logout only)

**Security Hardening (Already Implemented):**
- Account enumeration protection: Identical responses for missing email, unverified, invalid password
- Timing attack prevention: Dummy password hash compared even when user not found
- Refresh token reuse detection: Invalid attempt logged when replayed token arrives
- Email verification gate: Cannot login without verified email
- Password reset one-time token with expiration

**Known Limitations (NOT Bugs):**
- No active session list/device management (no device tracking in DB)
- No 2FA (noted as optional future in roadmap)
- No IP address logging (login activity log not implemented)
- No concurrent-login limits (user can be logged in from multiple places simultaneously)
- No "suspicious login" alerting (flagged as future feature)

---

## 2. EXISTING USER SCHEMA

### Current `users` Table Structure

```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Profile/Role
    role VARCHAR(50) DEFAULT 'member',
    team_id UUID,  -- Primary team assignment (not multi-team scoping)
    
    -- Activity/Scoring
    impact_score INTEGER DEFAULT 0,
    streak_count INTEGER DEFAULT 0,
    total_logs INTEGER DEFAULT 0,
    
    -- Email Verification
    is_verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255),
    verification_token_expires TIMESTAMP,
    
    -- Password Reset
    password_reset_token_hash VARCHAR(255),
    password_reset_expires TIMESTAMP,
    password_changed_at TIMESTAMP,  -- Milestone 38: Rejects JWTs issued before this
    
    -- Settings/Preferences (JSONB)
    privacy_settings JSONB DEFAULT '{"ai_enabled": true, "sentiment_tracking": true, "leaderboard_visible": true, "analytics_opt_in": true}',
    notification_preferences JSONB DEFAULT '{"team_join_request": true, "goal_creation": true, "goal_completion": true, "task_assignment": true, "blocker": true}',
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Field Responsibilities

| Field | Purpose | Mutable | Privacy | Notes |
|-------|---------|---------|---------|-------|
| `email` | Authentication + communication | NO (requires verification) | HIGH | Unique constraint; validated with Zod |
| `username` | Identity + URL slug | NO | MEDIUM | Unique; no current UI to edit |
| `full_name` | Display name | Maybe | LOW | Currently editable only via profile; no API yet |
| `password_hash` | Auth secret | YES (reset/change) | CRITICAL | Bcrypt; never exposed |
| `role` | Global role (deprecated) | NO | LOW | Superseded by team-scoped `team_members.role`; kept for legacy |
| `team_id` | Primary team | YES | LOW | Foreign key; no cascading implications |
| `impact_score` | Derived metric | NO (computed) | MEDIUM | Calculated from tasks + log quality |
| `privacy_settings` | Feature toggles | YES | MEDIUM | JSONB object; no UI to edit yet |
| `notification_preferences` | Category toggles | YES | LOW | JSONB object; partial UI in notification bell |
| `is_verified` | Login gate | YES (email link) | LOW | Can't login until true |

### Refresh Tokens Table

```sql
CREATE TABLE refresh_tokens (
    token_id UUID PRIMARY KEY,
    user_id UUID REFERENCES users,
    token_hash VARCHAR(255) NOT NULL,  -- Never store raw token
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,  -- NULL = still valid; non-NULL = revoked/logged out
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose:** Session rotation + revocation tracking  
**Security Properties:**
- Tokens are hashed before storage (cannot be retrieved)
- Revoked tokens block new access token issues
- Password changes atomically revoke all active tokens
- No user agent / IP tracking (could be added in future)

---

## 3. PROPOSED PROFILE DATA MODEL

### Option A: Keep Everything in Existing `users` Table (RECOMMENDED)

**Rationale:** No separate profiles table needed; existing schema already carries all required fields.

**Add These Columns to `users`:**

```sql
-- Profile Display
avatar_url VARCHAR(500),  -- NULL = no avatar; URL to CDN/internal storage
bio TEXT,  -- Optional self-description, max 500 chars
phone_number VARCHAR(20),  -- Optional; E.164 format if provided
pronouns VARCHAR(50),  -- Optional (e.g., "they/them")
location VARCHAR(100),  -- Optional (e.g., "San Francisco, CA")

-- Profile Visibility
is_profile_public BOOLEAN DEFAULT false,  -- Whether teammates can see this profile
public_fields JSONB DEFAULT '{"full_name": true, "bio": true, "profile_picture": true}',

-- Email/Phone Confirmation (for changeability)
email_change_pending VARCHAR(255),  -- New email waiting verification
email_change_token_hash VARCHAR(255),
email_change_expires TIMESTAMP,
phone_verified BOOLEAN DEFAULT false,
phone_verification_token_hash VARCHAR(255),
phone_verification_expires TIMESTAMP,

-- Account Security
last_login_at TIMESTAMP,
login_attempt_count INTEGER DEFAULT 0,  -- Rate limiting
login_attempt_reset_at TIMESTAMP
```

**Why Not a Separate Table:**
- Single row = atomic user operations
- Avoids JOIN overhead on every user lookup
- Simpler permission model (my profile = my user record)
- No cascading delete edge cases
- Migration is additive only (ALTER TABLE)

**Privacy Sensitive Fields:**
- `avatar_url` — URL to user's image (could be leaked to unauthenticated users)
- `bio`, `pronouns`, `location` — Visible only if `is_profile_public = true`
- `email` — Only owner can see full email; others might see partial (design decision)
- `phone_number` — Never exposed; only stored for user's own confirmation
- `password_hash` — Never exposed via API

---

## 4. API DESIGN

### Endpoints to Implement

#### Get Own Profile
```
GET /api/users/me
Authorization: Bearer <token>

Response 200:
{
  "user_id": "uuid",
  "email": "user@example.com",
  "username": "username",
  "full_name": "Full Name",
  "avatar_url": "https://cdn.example.com/avatar-123.jpg",
  "bio": "Bio text here",
  "phone_number": "+1234567890",  // Only for owner
  "pronouns": "they/them",
  "location": "San Francisco",
  "role": "member",
  "is_profile_public": false,
  "phone_verified": false,
  "last_login_at": "2026-09-02T10:00:00Z",
  "created_at": "2026-08-01T00:00:00Z",
  "notification_preferences": {...},
  "privacy_settings": {...}
}
```

#### Update Profile
```
PUT /api/users/me/profile
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "full_name": "New Name",  // Optional
  "bio": "New bio",  // Optional
  "pronouns": "they/them",  // Optional
  "location": "New York",  // Optional
  "is_profile_public": true  // Optional
}

Response 200: Updated user object
```

**Validation:**
- `full_name`: 1-255 chars
- `bio`: 0-500 chars
- `pronouns`: 0-50 chars
- `location`: 0-100 chars
- `is_profile_public`: boolean

**Authorization:** Only own profile

#### Update Notification Preferences
```
PUT /api/users/me/notification-preferences
Authorization: Bearer <token>

Request:
{
  "team_join_request": true,
  "goal_creation": true,
  "goal_completion": false,
  "task_assignment": true,
  "blocker": true
}

Response 200: Updated user object
```

#### Change Password
```
POST /api/users/me/change-password
Authorization: Bearer <token>

Request:
{
  "current_password": "current",
  "new_password": "newpassword123"
}

Response 204: No content
```

**Behavior:**
- Validates current password via bcrypt
- Hashes new password
- Updates `password_hash` and `password_changed_at` atomically
- Revokes ALL active refresh tokens (all sessions end)
- New JWT not issued; user must login again

**Validation:**
- Current password must be correct
- New password must be different from current
- New password must meet minimum requirements (length, complexity — to be designed)

#### Request Email Change
```
POST /api/users/me/request-email-change
Authorization: Bearer <token>

Request:
{
  "new_email": "newemail@example.com"
}

Response 202: Accepted (email sent)
```

**Behavior:**
- Validates new email is not already in use
- Generates verification token
- Sends verification email to NEW address (not current)
- Sets `email_change_pending`, `email_change_token_hash`, `email_change_expires`
- Old email stays current until verification

**Why send to new email?** Prevents account takeover if attacker compromises existing email.

#### Verify Email Change
```
POST /api/users/me/verify-email-change
Authorization: Bearer <token>  // Can use old or new session

Request:
{
  "token": "verification-token"
}

Response 200: Success
```

**Behavior:**
- Validates token hash and expiration
- Updates `email` to `email_change_pending`
- Clears `email_change_pending`, `email_change_token_hash`, `email_change_expires`
- Returns success

#### Request Phone Verification
```
POST /api/users/me/request-phone-verification
Authorization: Bearer <token>

Request:
{
  "phone_number": "+14155552671"  // E.164 format
}

Response 202: Accepted (SMS sent if implemented, or email)
```

**Behavior:**
- Validates phone number format
- Generates verification code (6 digits) or token
- Stores hashed code and expiration
- Sends via SMS or email (design decision: email simpler for MVP)
- Does NOT update `phone_number` yet; only stores in temp column

#### Verify Phone
```
POST /api/users/me/verify-phone
Authorization: Bearer <token>

Request:
{
  "verification_code": "123456"  // or token
}

Response 200: Success
```

**Behavior:**
- Validates code/token
- Updates `phone_number` and sets `phone_verified = true`
- Clears temp columns

#### Upload Avatar
```
POST /api/users/me/avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Field: avatar (image file, max 5MB, .jpg/.png/.webp only)

Response 200:
{
  "avatar_url": "https://cdn.example.com/user-123-avatar-abc123.jpg"
}
```

**Behavior:**
- Validates file type and size
- Generates unique filename (user_id + random suffix)
- Stores in S3 / CDN
- Updates `avatar_url`
- Returns public URL

#### Delete Avatar
```
DELETE /api/users/me/avatar
Authorization: Bearer <token>

Response 204: No content
```

**Behavior:**
- Deletes file from S3/CDN
- Sets `avatar_url = NULL`

#### Get Public Profile
```
GET /api/users/{username}/profile
Authorization: Bearer <token> (optional for public profiles)

Response 200:
{
  "username": "username",
  "full_name": "Display Name",
  "avatar_url": "url",
  "bio": "bio (if public)",
  "pronouns": "pronouns (if public)",
  "location": "location (if public)",
  // NO: email, phone, password, settings
}
```

**Authorization:**
- If `is_profile_public = false` AND requester is not owner: 404 (not 403, to avoid enumeration)
- Otherwise: return visible fields

### Existing Endpoints to Update

**GET /api/users** (list all users)  
- Consider whether to include avatar_url, basic profile info
- Ensure cross-team users aren't exposed unnecessarily
- Decide: list all users in all teams, or only current team?

---

## 5. SECURITY & PRIVACY REQUIREMENTS

### Authentication & Session Management

#### ✅ VERIFIED SAFE — NO CHANGES NEEDED

**Current Implementation:**
- Bcrypt password hashing (cost 12)
- Timing-attack resistant login
- Account enumeration protection
- Refresh token rotation
- Session invalidation on password change
- Email verification gate

**Recommendation:** Keep existing auth system unchanged. It is well-designed.

#### ⚠️ NEEDS HARDENING — Rate Limiting on Password Change

**Risk:** Attacker with stolen session can change password, locking out real owner.

**Mitigation:**
- Require current password on change (already in design ✓)
- Rate limit: max 3 password changes per hour per user
- Log each password change with timestamp
- Alert user of login after password change (future: email notification)

**Implementation:**
- Add `password_attempt_count`, `password_attempt_reset_at` to users table
- Increment counter before allowing change
- Reset after 1 hour
- Throw error if >3 in 1 hour

#### ⚠️ NEEDS HARDENING — Email Change Verification

**Risk:** Attacker with stolen session can change email, locking out real owner.

**Mitigation:**
- Require current password to initiate email change (design above)
- Send verification email to NEW address only (not current)
- Verification token expires in 1 hour
- Old email remains current until verified
- Log email change with timestamp

**Implementation:**
- Verify current password before accepting `request-email-change`
- Rate limit: max 3 email change requests per day
- Send verification email to new address
- Require explicit token verification before committing change

#### ⚠️ NEEDS HARDENING — Phone Number Verification

**Risk:** Attacker can add attacker's phone number, potentially for future 2FA hijacking.

**Mitigation:**
- Phone number changes don't affect login (no 2FA in v1)
- But log the change and alert user (future feature)
- Verification code sent to phone via SMS or email
- Code expires in 10 minutes

**Implementation:**
- Generate 6-digit code or opaque token
- Send via SMS (preferred) or email (backup for MVP)
- Allow 3 attempts before expiration
- Rate limit: max 5 verification requests per day per user

#### ⚠️ NEEDS HARDENING — Avatar Upload

**Risk:** Attacker uploads malware, oversized file, or creates storage DOS.

**Mitigation:**
- File size limit: 5MB max
- File type validation: .jpg, .png, .webp only (MIME-type + magic bytes)
- Image dimensions: max 2048x2048 to prevent decompression DOS
- Filename generation: never trust user input; use UUID
- Storage access control: CDN only serves images, no script execution
- Rate limit: max 1 avatar upload per hour per user

**Implementation:**
- Use `jimp` or `sharp` to validate image dimensions
- Check MIME type AND magic bytes (not just extension)
- Generate filename: `users/{user_id}/avatar-{uuid}.{ext}`
- Serve from CDN with `Content-Disposition: inline; filename=...`
- Never serve from same origin as app (prevent XSS via SVG)

---

## 6. AVATAR / FILE REQUIREMENTS

### Storage Strategy

#### Option A: S3-Compatible Storage (RECOMMENDED for production)

**Pros:**
- Scalable, no server storage limits
- CDN integration straightforward
- Easy backup and disaster recovery
- Can migrate to different provider

**Cons:**
- Requires AWS/MinIO/etc. credentials
- Adds cost
- External dependency

**Implementation:**
```typescript
// Upload: POST /api/users/me/avatar
// 1. Receive multipart/form-data with file
// 2. Validate size (max 5MB), type, dimensions
// 3. Generate key: users/{user_id}/avatar-{uuid}.{ext}
// 4. Upload to S3
// 5. Return public URL (CDN-fronted)
// 6. Update avatar_url in database
```

#### Option B: Local Disk Storage (ACCEPTABLE for MVP)

**Pros:**
- No external dependency
- Simple to implement
- Good for development/testing

**Cons:**
- Server storage limits
- No built-in replication
- Not suitable for scale
- Migration required later

**Implementation:**
```typescript
// Store at: /storage/avatars/{user_id}-{uuid}.{ext}
// Serve via: /uploads/avatars/{filename}
// Configure reverse proxy (nginx) to serve with proper cache headers
```

#### Recommendation: Use S3 for production; local disk for MVP/testing

### Avatar Requirements

| Requirement | Value | Rationale |
|-------------|-------|-----------|
| Max file size | 5 MB | Reasonable for profile pics; prevents DOS |
| Allowed types | .jpg, .png, .webp | Modern formats; no SVG to prevent XSS |
| Max dimensions | 2048x2048 px | Prevents decompression bomb |
| Compression | Yes (JPEG 85%) | Balance quality and bandwidth |
| Served as | Inline (CDN) | Can embed in profile page |
| Expiration | Never | Profile pic should persist |
| Versioning | By filename (UUID) | No versioning; new upload = new file |
| Deletion | Yes, by user | User can delete their avatar |
| Access control | Public (URL-only) | No authentication needed to view |

### Media Storage Implementation

**Database:** Only `avatar_url` is stored (string)

**Object Storage Naming:**
```
users/{user_id}/avatar-{random-uuid}.{extension}
```

**CDN Configuration:**
- Serve with `Cache-Control: public, max-age=31536000` (1 year)
- Serve with `Content-Disposition: inline`
- Block all scripts/unsafe types

**Deletion:**
- When user deletes avatar: remove file from S3, clear `avatar_url` in DB
- When user account deleted: remove all files with same user_id prefix

---

## 7. UI/UX PROPOSAL

### Account Menu Structure

```
Navigation Header (Top Right)
├─ Notification Bell [icon]
├─ User Avatar [small circular image]
└─ Account Menu [dropdown]
   ├─ My Profile
   ├─ Account Settings
   ├─ Notification Preferences
   ├─ ─────────────────
   └─ Sign Out
```

### My Profile Page

**URL:** `/profile` or `/profile/me`

**Layout:**

```
[Back Button] My Profile

[Avatar: large circular image]
[Upload Avatar] [Remove Avatar]

─────────────────────────────────

Full Name:        [Display Name]                [Edit]
Username:         @username                     [Cannot edit]
Email:            user@example.com              [Change] [Verified ✓]
Phone:            (optional)                    [Add/Change] [Verified ✓]
Bio:              [Text]                        [Edit]
Pronouns:         [Text]                        [Edit]
Location:         [Text]                        [Edit]

─────────────────────────────────

Privacy & Visibility
[Toggle] Make profile public to teammates
[Select] Visible fields: Full Name, Bio, Avatar (checkboxes)

─────────────────────────────────

Account Created:  August 1, 2026
Last Login:       September 2, 2026 at 10:30 AM
```

### Account Settings Page

**URL:** `/account/settings`

**Sections:**

#### Security

```
─ Security

Password:  [Change Password Button]
           Last changed: August 15, 2026

Active Sessions:  1 session (this device)
                  [Sign Out All Other Sessions]

Login Activity:   (future: show recent logins)
```

#### Notification Preferences

```
─ Notifications

[Toggle] Team join requests
[Toggle] Goal creation
[Toggle] Goal completion
[Toggle] Task assignment
[Toggle] Blockers

[Checkboxes for email vs in-app]  (future)
```

#### Privacy & Data

```
─ Privacy Settings

[Toggle] Enable AI suggestions (affects goals, blockers)
[Toggle] Include in leaderboard
[Toggle] Allow analytics/impact tracking
[Toggle] Allow data export

[Button] Download my data  (future)
[Button] Request account deletion  (future)
```

### Edit Profile Flow

**Flow:** User clicks [Edit] on profile field

```
Modal: Edit {field_name}

[Input field with current value]

[Cancel]  [Save]

On Save:
- Validate input
- Call PUT /api/users/me/profile
- Show success/error toast
- Refresh profile display
```

### Change Password Flow

**Flow:** User clicks [Change Password] button

```
Modal: Change Password

Current Password:  [password input]  (required)
New Password:      [password input]  (required)
Confirm:           [password input]  (required)

[Password strength meter: Weak/Fair/Good/Strong]

[Show password checkbox]

[Cancel]  [Change Password]

On Submit:
- Validate both passwords provided
- Call POST /api/users/me/change-password
- On success: Show message "Password changed. Please log in again."
- Redirect to login after 3 seconds
- All other sessions end (automatic logout)
```

### Change Email Flow

**Flow:** User clicks [Change] on email

```
Modal: Change Email Address

Current Email:    user@example.com  (readonly)
New Email:        [text input]      (required)

[Cancel]  [Send Verification Link]

On Send:
- Validates new email
- Calls POST /api/users/me/request-email-change
- Shows: "Verification link sent to your new email. Click the link to confirm."
- Modal closes

User clicks link in email:
- Lands on: POST /api/users/me/verify-email-change?token=...
- Shows: "Email change confirmed."
- Profile now shows new email
```

### Avatar Upload Flow

**Flow:** User clicks [Upload Avatar]

```
Modal: Upload Profile Picture

[Drag-and-drop zone] or [Browse Button]

(After file selected)
[Preview of image]
[Remove]  [Upload]

On Upload:
- Validates file type/size/dimensions
- Shows progress bar
- On success: Profile photo updates immediately
- Shows: "Avatar updated"
```

---

## 8. PRODUCT DECISIONS REQUIRED

### Email Editability

**Question:** Can users change their email address?

**Options:**
1. ✅ **Yes** (Recommended) — Allow change via verification flow to new email
   - Pros: Users with old email can still access account
   - Cons: Adds verification complexity
2. ❌ **No** — Email is immutable after registration
   - Pros: Simpler implementation
   - Cons: Users stuck with old email forever

**Recommendation:** **Yes, allow change.** Design is already robust (verify on new email, keep old current until verified).

### Mobile Number Editability

**Question:** Can users add or change phone number?

**Options:**
1. ✅ **Yes** (Recommended) — Allow add/change via SMS or email verification
   - Pros: Prepares for future 2FA
   - Cons: Verification flow adds complexity
2. ⚠️ **Optional for MVP** — Store but don't require
   - Pros: Feature can be added later
   - Cons: Schema change needed when adding

**Recommendation:** **Yes, optional in v1.** Schema ready for future 2FA. Implement basic add/change flow with email verification (SMS too costly for MVP).

### Username Editability

**Question:** Can users change their username?

**Options:**
1. ✅ **Yes** — Allow change (old username becomes available, 48-hour hold to catch bugs)
   - Pros: Users can rebrand
   - Cons: Changes deep in system (URLs, @ mentions, search)
2. ❌ **No** — Username is immutable
   - Pros: Stable URLs, no redirect hell
   - Cons: Users stuck with bad username

**Recommendation:** **No, immutable for v1.** Changing username requires: URL rewrites, @ mention indexing, search rebuild. Defer to v2.

### Avatar Storage Strategy

**Question:** Where to store avatars?

**Options:**
1. ✅ **S3 / Blob Storage** (Production) — Scalable, replicated, CDN-ready
2. ⚠️ **Local Disk** (MVP/Dev) — Simple, no external dependency
3. ❌ **Database (BLOB)** — Bad for performance, backup, migration

**Recommendation:** **Local disk for MVP, S3 for production.** Code structure allows swap via service abstraction.

### Password Change Flow

**Question:** After changing password, should user be force-logged-out?

**Options:**
1. ✅ **Yes, force logout all** (Recommended) — Revoke all tokens, end all sessions
   - Pros: Secure; user had to enter old password to change, knows about it
   - Cons: Slightly annoying (user must re-login)
2. ❌ **No, keep current session** — Only revoke other sessions
   - Pros: No re-login needed
   - Cons: Weaker signal that change happened; harder to debug if old session was compromised

**Recommendation:** **Yes, force logout all.** Simpler, more secure. Design already implements this via atomic revocation.

### Sessions & Devices in v1

**Question:** Should v1 support multiple device sessions?

**Options:**
1. ✅ **Yes, basic support** — Users can see which device active, sign out others (MVP)
   - Pros: Better security; prepares for future 2FA/suspicious login alerts
   - Cons: Adds device tracking complexity
2. ⚠️ **Implicit but hidden** — Tokens work from multiple devices, but no UI to manage
   - Pros: Works today; no UI complexity
   - Cons: User can't sign out from lost device
3. ❌ **Single-session only** — Enforce one login at a time
   - Pros: Simplest
   - Cons: Frustrating (tab refresh, tab lock-out)

**Recommendation:** **Option 2 (implicit, hidden UI).** No schema changes needed. Future v1.1 or v2: add `devices` table with user_agent, IP, last_active, allow UI to "sign out other devices."

### 2FA Scope

**Question:** Is 2FA in scope for v1?

**Options:**
1. ✅ **No, deferred** — Design for it; don't implement
   - Pros: Reduces MVP scope
   - Cons: Schema changes later
2. ❌ **Yes, implement basic TOTP** — Use `speakeasy` library
   - Pros: Have it day one
   - Cons: Adds backend + UI complexity

**Recommendation:** **Deferred.** Design supports it (phone_verified field ready for future use). Implement in v2 or later if security needs justify it. Most teams don't need it in early stages.

### Profile Publicity

**Question:** Should profiles be visible to teammates?

**Options:**
1. ✅ **Yes, optional** (Recommended) — User controls via `is_profile_public`
   - Pros: Users can show off; team discovery works
   - Cons: Privacy concerns for some users
2. ⚠️ **Yes, always public to teammates** — Show profiles within team only
   - Pros: Simpler (no per-field visibility)
   - Cons: Less user control
3. ❌ **No, profiles private** — Only own profile visible
   - Pros: Privacy-first
   - Cons: No team discovery, limits collaboration

**Recommendation:** **Yes, optional & user-controlled.** `is_profile_public` defaults to `false`; users opt-in. Per-field visibility (`public_fields` JSONB) allows fine-grained control. Can show "Profile is private" on non-public profiles.

### Public-to-Unauthenticated Profiles

**Question:** Should unauthenticated users see profiles?

**Options:**
1. ✅ **No** — Profiles require login
   - Pros: Simpler auth model; no user enumeration via profile API
   - Cons: Can't share profile URL with external people
2. ❌ **Yes** — Public profiles visible without login
   - Pros: Can share, marketing use case
   - Cons: External user enumeration possible

**Recommendation:** **No for v1.** Require authentication. Future: add public profile URLs with strict rate limiting if sharing becomes important feature.

---

## 9. TESTING REQUIREMENTS

### Authorization Tests

**Scenario: Users can only access/modify their own profile**
- ✅ GET /me returns own profile
- ✅ PUT /me/{username}/profile (other user) returns 404
- ✅ DELETE /me/{username}/avatar (other user) returns 404
- ✅ POST /change-password (other user's session) rejects

**Scenario: Public profiles respect visibility settings**
- ✅ GET /{username}/profile (is_profile_public=true) returns user fields
- ✅ GET /{username}/profile (is_profile_public=false, not owner) returns 404
- ✅ GET /{username}/profile (as owner) returns all fields
- ✅ Fields hidden based on public_fields JSONB

### IDOR Protection

**Scenario: No user enumeration via profile endpoints**
- ✅ GET /{username}/profile (invalid username) returns 404, not 400
- ✅ POST /verify-email-change (stale token) doesn't reveal user_id
- ✅ POST /change-password (after logout) rejects same as before-login

### Validation Tests

**Email change:**
- ✅ New email must be valid format
- ✅ New email must not already be in use
- ✅ New email must be different from current
- ✅ Verification token expires after 1 hour
- ✅ Old email remains current until verified

**Password change:**
- ✅ Current password must be correct (bcrypt)
- ✅ New password must be different from current
- ✅ New password must meet strength requirements
- ✅ All refresh tokens revoked (all sessions end)
- ✅ password_changed_at updated atomically

**Phone verification:**
- ✅ Phone must be E.164 format
- ✅ Verification code expires after 10 minutes
- ✅ Max 3 attempts before lockout
- ✅ Rate limit: max 5 requests per day

**Avatar upload:**
- ✅ File size max 5MB
- ✅ File type only .jpg, .png, .webp (validated via magic bytes)
- ✅ Image dimensions max 2048x2048
- ✅ Filename sanitized (never trust user input)
- ✅ Old avatar deleted when new one uploaded

### Session Management Tests

**Scenario: Password changes invalidate all sessions**
- ✅ Before change: Old JWT still works
- ✅ After change: Old JWT rejected (password_changed_at check)
- ✅ After change: Old refresh token rejected (revoked)
- ✅ User must login again to get new tokens

**Scenario: Logout revokes refresh token**
- ✅ After logout: Refresh token cannot issue new access token
- ✅ After logout: No stale token reuse possible

### Cross-User Isolation Tests

**Scenario: User A cannot see User B's private data**
- ✅ User A: GET /users/b/profile (private) returns 404
- ✅ User A: Cannot access User B's refresh tokens
- ✅ User A: Cannot change User B's password
- ✅ User A: Cannot see User B's full email in list

### Failure Handling Tests

**Scenario: Graceful error messages**
- ✅ POST /change-password (wrong current password) returns 401 "Invalid password"
- ✅ POST /request-email-change (email already in use) returns 400 "Email already registered"
- ✅ POST /verify-email-change (stale token) returns 400 "Invalid or expired token"
- ✅ POST /avatar (wrong file type) returns 400 "Unsupported file format"

### Rate Limiting Tests

**Scenario: Prevent abuse**
- ✅ POST /request-phone-verification (>5 per day) returns 429 "Too many requests"
- ✅ POST /change-password (>3 per hour) returns 429 "Too many requests"
- ✅ POST /request-email-change (>3 per day) returns 429 "Too many requests"

### Realtime Integration Tests

**Scenario: No unexpected side effects**
- ✅ Profile updates don't trigger team notifications
- ✅ Avatar upload doesn't trigger SSE events
- ✅ Password change doesn't broadcast to other users
- ✅ Existing realtime tests still pass (regression)

### Frontend Tests

**Scenario: UI correctly displays profile state**
- ✅ Profile page loads with user data
- ✅ Avatar displays or shows placeholder
- ✅ Edit modal pre-fills current values
- ✅ Save button disabled until form changed
- ✅ Success/error messages appear and dismiss

**Scenario: Keyboard navigation and accessibility**
- ✅ All inputs accessible via Tab
- ✅ Focus visible on all interactive elements
- ✅ Modal can be closed via Escape key
- ✅ Screen reader labels on all form fields

### Existing Tests (Should Remain Untouched)

- `auth.test.ts` — login, register, refresh, logout (unchanged)
- All team/goal/project/blocker tests (shouldn't interact with profile)
- Notification tests (should still work; profile is one more setting)

---

## 10. MIGRATION REQUIREMENTS

### Database Migrations

**New columns to add to users table:**

```sql
-- Migration: add-user-profile-fields.sql

ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500);
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);
ALTER TABLE users ADD COLUMN pronouns VARCHAR(50);
ALTER TABLE users ADD COLUMN location VARCHAR(100);
ALTER TABLE users ADD COLUMN is_profile_public BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN public_fields JSONB DEFAULT '{"full_name": true, "bio": true, "profile_picture": true}';

-- Email change tracking
ALTER TABLE users ADD COLUMN email_change_pending VARCHAR(255);
ALTER TABLE users ADD COLUMN email_change_token_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN email_change_expires TIMESTAMP;

-- Phone verification tracking
ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN phone_verification_token_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN phone_verification_expires TIMESTAMP;

-- Security hardening
ALTER TABLE users ADD COLUMN password_attempt_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN password_attempt_reset_at TIMESTAMP;
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN login_attempt_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN login_attempt_reset_at TIMESTAMP;
```

**Rationale:** All columns additive; no breaking changes.

**Rollback:** Can be rolled back if needed (no data loss).

### Data Migration

**Backfill:** No data migration needed (all new columns nullable or have defaults).

**Indices:** Consider adding

```sql
CREATE INDEX users_username_idx ON users(username);
CREATE INDEX users_is_profile_public_idx ON users(is_profile_public) WHERE is_profile_public = true;
```

### API Versioning

**Question:** Should we version the API?

**Current:** No versioning (always /api/...)

**Recommendation:** Add version headers once profile changes. For now, new endpoints are additive; no breaking changes to existing endpoints. Can always add `Accept: application/vnd.commandcenter.v1+json` header later if needed.

---

## 11. RISKS / DEPENDENCIES

### Security Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Attacker with stolen session changes email | HIGH | Require current password; verify on new email; log change |
| Attacker uploads malware avatar | MEDIUM | File validation; serve from CDN, not app origin; no script execution |
| Attacker brute-forces password change | MEDIUM | Rate limit; log attempts; alert on multiple failures (future) |
| User forgets password | MEDIUM | Password reset flow already exists; link to that |
| Email becomes unverified after change | LOW | Once verified, stays verified; only new emails need verification |
| Session fixation via avatar URL | LOW | URLs are unpredictable (UUID); CDN serves only image MIME types |

### Dependency Risks

| Dependency | Risk | Mitigation |
|------------|------|-----------|
| S3 downtime (avatars unavailable) | MEDIUM | Fallback to placeholder avatar if CDN fails; cache aggressively |
| Email service failure (verification mail) | MEDIUM | Retry logic; admin can manually verify accounts if needed |
| bcrypt dependency | LOW | Well-maintained; already in use for passwords |
| File validation library (jimp/sharp) | LOW | Use popular library; validate magic bytes, not just extension |

### Data Loss Risks

| Scenario | Likelihood | Impact | Mitigation |
|----------|------------|--------|-----------|
| User deletes avatar, then wants it back | LOW | Gone forever | Warn user; no recovery (by design) |
| Email change not verified, old email lost | LOW | Stuck with new email | Can re-verify old email (restart change flow) |
| Password change regretted | LOW | No undo | Re-use password in future (same as today) |
| Account deleted with data loss | LOW | All data gone | Require confirmation; archive to backup (future) |

### Integration Risks

| Integration | Risk | Mitigation |
|-------------|------|-----------|
| Notification system (uses email, phone) | MEDIUM | Phone field ready; notification system optional in v1 |
| Leaderboard (uses is_profile_public) | LOW | Already respects privacy_settings; profile public is independent |
| Realtime (SSE events on profile changes) | MEDIUM | Keep profile changes out of realtime; only users see own changes |
| Search (searches user profiles) | LOW | Deferred; when implemented, must respect is_profile_public |

---

## 12. IMPLEMENTATION SCOPE ESTIMATE

### Backend (Estimated Effort)

| Task | Complexity | Time |
|------|-----------|------|
| Add DB columns (migration) | Trivial | 1 hour |
| Update user DTOs (DTO.ts) | Simple | 2 hours |
| Implement GET /me endpoint | Simple | 2 hours |
| Implement PUT /me/profile | Simple | 3 hours |
| Implement avatar upload/delete | Medium | 4 hours |
| Implement email change flow | Medium | 4 hours |
| Implement phone verification flow | Medium | 4 hours |
| Implement change password | Simple | 2 hours |
| Add rate limiting middleware | Medium | 3 hours |
| Write backend tests (auth, validation, IDOR) | Medium | 6 hours |
| **Total Backend** | | **31 hours** |

### Frontend (Estimated Effort)

| Task | Complexity | Time |
|------|-----------|------|
| Build Profile page component | Medium | 4 hours |
| Build Account Settings page | Medium | 4 hours |
| Build edit/change modals | Simple | 4 hours |
| Build avatar upload UI | Medium | 3 hours |
| Integrate API calls | Simple | 3 hours |
| Add form validation/error handling | Medium | 3 hours |
| Write frontend tests (UI, navigation, accessibility) | Medium | 4 hours |
| Manual testing on desktop/mobile/tablet | Simple | 3 hours |
| **Total Frontend** | | **28 hours** |

### Total Estimate: **~60 hours (1.5 weeks for 1 engineer)**

### Phases

**Phase 1: Core Profile (1 week)**
- GET /me, PUT /me/profile
- My Profile page
- Edit modals (name, bio, pronouns, location)

**Phase 2: Security (3-4 days)**
- Change password flow
- Password change tests
- Session revocation verification

**Phase 3: Media (3-4 days)**
- Avatar upload/delete
- Avatar validation/compression
- CDN integration

**Phase 4: Advanced (1 week)**
- Email change flow (request + verification)
- Phone verification (optional for v1)
- Rate limiting

**Phase 5: Polish (2-3 days)**
- Mobile responsive design
- Accessibility audit
- Manual testing

---

## 13. DEFINITION OF DONE

### Backend

- ✅ All profile endpoints implemented (GET /me, PUT /me/profile, etc.)
- ✅ Password change implemented with token rotation
- ✅ Email change flow implemented with verification
- ✅ Avatar upload implemented with validation
- ✅ Rate limiting in place (3-5 requests/hour for sensitive ops)
- ✅ All input validated via Zod schemas
- ✅ All responses properly typed in DTOs
- ✅ Authorization checks in place (can't modify others' profiles)
- ✅ IDOR vulnerabilities addressed
- ✅ Error messages don't leak user info
- ✅ All tests passing (new + regression)
- ✅ TypeScript strict mode passes
- ✅ No console errors or warnings

### Frontend

- ✅ Profile page fully implemented
- ✅ Account Settings page fully implemented
- ✅ Edit/change modals work correctly
- ✅ Avatar upload shows preview and success
- ✅ API error handling displays user-friendly messages
- ✅ Form validation provides inline feedback
- ✅ All fields properly labeled (accessibility)
- ✅ Keyboard navigation works (Tab, Escape, Enter)
- ✅ Focus indicators visible on all controls
- ✅ Responsive on desktop (1920px), tablet (768px), mobile (375px)
- ✅ All tests passing (new + regression)
- ✅ TypeScript strict mode passes
- ✅ No console errors or warnings

### Documentation

- ✅ API endpoints documented in routes/swagger
- ✅ DB migration documented and tested
- ✅ User flows documented in separate UX doc
- ✅ Security checklist completed
- ✅ Release notes prepared

### Deployment

- ✅ Backend tests passing in CI
- ✅ Frontend tests passing in CI
- ✅ Production build succeeds
- ✅ No performance regressions
- ✅ Feature flag ready (if gradual rollout desired)
- ✅ Rollback plan documented

---

## SUMMARY & NEXT STEPS

### Key Architecture Recommendation

**Keep all profile data in existing `users` table; add columns additively.** No separate profiles table needed. Existing schema is well-designed; only add new columns for avatar, bio, pronouns, location, phone, and email-change tracking.

### Critical Product Decisions Required Before Implementation

1. **Email Editability** → Recommended: Yes, with verification to new email
2. **Phone Optional or Required** → Recommended: Optional for v1, tracked for future 2FA
3. **Username Immutable** → Recommended: Yes, don't allow changes in v1
4. **Avatar Storage** → Recommended: Local disk for MVP, S3 for production
5. **Sessions/Devices** → Recommended: Implicit support (work today), no UI until v1.1
6. **2FA Scope** → Recommended: Design-ready, defer implementation to v2
7. **Profile Visibility** → Recommended: User-controlled opt-in (is_profile_public)
8. **Public to Unauthenticated** → Recommended: Require auth to view profiles

### Security Concerns

**Already Solved (Existing Auth System):**
- ✅ Bcrypt password hashing (cost 12)
- ✅ Account enumeration prevention
- ✅ Timing-attack resistance
- ✅ Refresh token rotation
- ✅ Session invalidation on password change

**Needs Implementation:**
- ⚠️ Rate limiting on password/email/phone changes
- ⚠️ Verification flow for email and phone changes
- ⚠️ Avatar file validation (type, size, dimensions)
- ⚠️ Avatar upload rate limiting

**No Critical Gaps:** Existing auth is solid; profile features are straightforward additions with standard mitigations.

### Exact Next Implementation Task

**When ready to implement:**

1. **Write database migration** (`add-user-profile-fields.sql`) with all new columns
2. **Update DTO files** to include new profile fields
3. **Implement GET /api/users/me** endpoint (returns full profile + private settings)
4. **Implement PUT /api/users/me/profile** endpoint (update name, bio, etc.)
5. **Implement avatar upload** (/api/users/me/avatar POST/DELETE)
6. **Add comprehensive backend tests** before touching frontend

**Do NOT start** until product decisions above are locked in and this audit is reviewed by tech lead.

---

**Audit completed:** 2026-09-02  
**Status:** Ready for implementation planning  
**Next step:** Review decisions, approve schema, begin Phase 1 implementation

