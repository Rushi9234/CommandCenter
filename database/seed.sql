-- Sample Data for Testing CommandCenter

-- Insert sample users (password: 'password123' for all)
INSERT INTO users (email, username, full_name, password_hash, role, impact_score, streak_count) VALUES
('sarah@example.com', 'sarahchen', 'Sarah Chen', '$2b$10$rKvVJKJ9YZXqZ8qZ8qZ8qOqZ8qZ8qZ8qZ8qZ8qZ8qZ8qZ8qZ8qZ8q', 'member', 85, 12),
('alex@example.com', 'alextanaka', 'Alex Tanaka', '$2b$10$rKvVJKJ9YZXqZ8qZ8qZ8qOqZ8qZ8qZ8qZ8qZ8qZ8qZ8qZ8qZ8qZ8q', 'member', 92, 15),
('riley@example.com', 'rileymorgan', 'Riley Morgan', '$2b$10$rKvVJKJ9YZXqZ8qZ8qZ8qOqZ8qZ8qZ8qZ8qZ8qZ8qZ8qZ8qZ8qZ8q', 'member', 78, 8),
('manager@example.com', 'manager', 'Team Manager', '$2b$10$rKvVJKJ9YZXqZ8qZ8qZ8qOqZ8qZ8qZ8qZ8qZ8qZ8qZ8qZ8qZ8qZ8q', 'manager', 0, 0);

-- Note: To generate proper password hashes, use bcrypt in Node.js:
-- const bcrypt = require('bcrypt');
-- const hash = await bcrypt.hash('password123', 10);

-- Sample tasks
INSERT INTO tasks (project_id, assigned_to, task_title, description, status, priority) VALUES
(gen_random_uuid(), (SELECT user_id FROM users WHERE username = 'sarahchen'), 'Implement AI Analysis Pipeline', 'Build Claude API integration for log analysis', 'in_progress', 'high'),
(gen_random_uuid(), (SELECT user_id FROM users WHERE username = 'alextanaka'), 'Design Leaderboard UI', 'Create glassmorphism cards with neon effects', 'completed', 'medium'),
(gen_random_uuid(), (SELECT user_id FROM users WHERE username = 'rileymorgan'), 'Setup Redis Caching', 'Configure Redis for session management', 'in_progress', 'high');

-- Sample daily logs (last 3 days)
INSERT INTO daily_logs (user_id, entry_text, log_date, crypto_signature, entry_summary, sentiment_score, word_count) VALUES
(
  (SELECT user_id FROM users WHERE username = 'sarahchen'),
  'Today I completed the authentication system with JWT tokens. Implemented bcrypt password hashing and role-based access control. Tomorrow I will focus on the AI analysis pipeline integration with Claude API.',
  CURRENT_DATE - INTERVAL '1 day',
  'abc123def456',
  'Completed authentication system with JWT and bcrypt',
  0.7,
  35
),
(
  (SELECT user_id FROM users WHERE username = 'alextanaka'),
  'Finished the glassmorphism design system. Created reusable Tailwind components for cards, buttons, and inputs. The neon color palette looks amazing! Next up: implementing the leaderboard animations.',
  CURRENT_DATE - INTERVAL '1 day',
  'def456ghi789',
  'Completed glassmorphism design system with neon colors',
  0.8,
  28
);

-- Sample badges earned
INSERT INTO user_badges (user_id, badge_id) VALUES
((SELECT user_id FROM users WHERE username = 'sarahchen'), (SELECT badge_id FROM badges WHERE badge_name = 'Fire Streak')),
((SELECT user_id FROM users WHERE username = 'alextanaka'), (SELECT badge_id FROM badges WHERE badge_name = 'Fire Streak')),
((SELECT user_id FROM users WHERE username = 'alextanaka'), (SELECT badge_id FROM badges WHERE badge_name = 'Perfect Week'));

COMMIT;
