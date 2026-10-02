-- Up Migration

-- Milestone 49: the existing `daily_logs` table is one free-form entry
-- per user per day (UNIQUE(user_id, log_date) since M24) with no team
-- scoping and no draft/AI-summary/confirm workflow -- correct for its own
-- existing use case (Pulse.tsx's single daily log, already shipped, not
-- touched here), but the wrong shape for "many small timestamped entries
-- through the day -> AI-drafted summary -> user edits/confirms -> one
-- final submission," which M48 already flagged as needing a new model
-- and this milestone verified rather than assumed.
--
-- Two tables, not three: raw entries accumulate freely (no uniqueness
-- constraint needed -- a user can log as many small updates as they
-- like), while the one-per-user-per-team-per-day INVARIANT that matters
-- (at most one final submission) lives on daily_work_submissions,
-- exactly mirroring daily_logs' own UNIQUE(user_id, log_date) pattern
-- (M24) -- the same race-safety guarantee, translated by the existing
-- errorHandler.ts PG_ERROR_TRANSLATIONS (M40, code 23505) into a clean
-- 409 with zero new error-handling code required. team_id is NOT NULL on
-- both tables (unlike daily_logs, which is deliberately personal/
-- team-agnostic) because this feature's own product requirement is
-- "confirmed work becomes part of TEAM progress/history" -- there is no
-- personal-only case to support here, matching the same NOT NULL choice
-- blockers.team_id already made for the identical reason.

CREATE TABLE daily_work_entries (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    entry_text VARCHAR(1000) NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE daily_work_submissions (
    submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    ai_summary TEXT,
    confirmed_summary VARCHAR(5000) NOT NULL,
    confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, team_id, work_date)
);

CREATE INDEX idx_daily_work_entries_user_team_date ON daily_work_entries(user_id, team_id, entry_date);
CREATE INDEX idx_daily_work_submissions_team_date ON daily_work_submissions(team_id, work_date);

-- Down Migration

DROP TABLE daily_work_submissions;
DROP TABLE daily_work_entries;
