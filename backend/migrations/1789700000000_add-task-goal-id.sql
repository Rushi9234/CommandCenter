-- Add optional goal_id foreign key to tasks table for Target #6 Goal -> Task linkage
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(goal_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_goal_id ON tasks(goal_id);
