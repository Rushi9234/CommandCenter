import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import TaskCard from './TaskCard';
import ProjectSummaryCard from './ProjectSummaryCard';
import TeamSummaryCard from './TeamSummaryCard';
import AttentionCard from './AttentionCard';
import ActionGroup from './ActionGroup';
import FollowUpChips from './FollowUpChips';
import SafeMarkdown from './SafeMarkdown';
import { resolveActionRoute } from '../../utils/aiActionRoutes';

describe('AI Actionable UI Components Suite', () => {
  it('resolves action routes safely to internal application routes without external URL execution', () => {
    expect(resolveActionRoute({ type: 'open_task', entityId: 't-123', label: 'Open' })).toBe('/projects?taskId=t-123');
    expect(resolveActionRoute({ type: 'open_task', entityId: 't-123', projectId: 'p-456', label: 'Open' })).toBe('/projects?projectId=p-456&taskId=t-123');
    expect(resolveActionRoute({ type: 'open_project', entityId: 'p-456', label: 'Open' })).toBe('/projects?projectId=p-456');
    expect(resolveActionRoute({ type: 'open_team', entityId: 'tm-789', label: 'Open' })).toBe('/teams/tm-789');
    expect(resolveActionRoute({ type: 'view_overdue', label: 'Overdue' })).toBe('/tasks?filter=overdue');
    expect(resolveActionRoute({ type: 'view_blockers', label: 'Blockers' })).toBe('/projects?filter=blockers');
  });

  it('renders TaskCard with title, status, priority, and Open Task link', () => {
    const task = {
      task_id: 't-1',
      title: 'Fix Authentication Flow',
      status: 'in_progress',
      priority: 'high',
      deadline: '2026-10-01T00:00:00Z',
      project_name: 'Security Refactor',
    };

    render(
      <MemoryRouter>
        <TaskCard task={task} />
      </MemoryRouter>
    );

    expect(screen.getByText('Fix Authentication Flow')).toBeInTheDocument();
    expect(screen.getByText('Security Refactor')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('Open Task')).toBeInTheDocument();
  });

  it('renders ProjectSummaryCard with progress, blocker counts, and action buttons', () => {
    const summary = {
      project_id: 'proj-99',
      project_name: 'Frontend Optimization',
      status: 'active',
      task_counts: { total: 10, completed: 7 },
      active_blockers_count: 2,
      high_priority_tasks: 3,
    };

    render(
      <MemoryRouter>
        <ProjectSummaryCard summary={summary} />
      </MemoryRouter>
    );

    expect(screen.getByText('Frontend Optimization')).toBeInTheDocument();
    expect(screen.getByText('70% (7/10 tasks)')).toBeInTheDocument();
    expect(screen.getByText('Open Project')).toBeInTheDocument();
    expect(screen.getByText('View Blockers')).toBeInTheDocument();
  });

  it('renders TeamSummaryCard with member count and Open Team action', () => {
    const summary = {
      team_id: 'team-1',
      team_name: 'Core Engineering',
      team_type: 'team',
      member_count: 5,
      open_blockers_count: 1,
    };

    render(
      <MemoryRouter>
        <TeamSummaryCard summary={summary} />
      </MemoryRouter>
    );

    expect(screen.getByText('Core Engineering')).toBeInTheDocument();
    expect(screen.getByText('5 Members')).toBeInTheDocument();
    expect(screen.getByText('Open Team')).toBeInTheDocument();
  });

  it('renders AttentionCard with overdue tasks and navigation chips', () => {
    const attentionData = {
      overdue_tasks: [
        {
          task_id: 't-overdue-1',
          title: 'Database Security Patch',
          status: 'todo',
          priority: 'urgent',
          deadline: '2026-01-01T00:00:00Z',
        },
      ],
      high_priority_tasks: [],
    };

    render(
      <MemoryRouter>
        <AttentionCard data={attentionData} />
      </MemoryRouter>
    );

    expect(screen.getByText('Needs Your Attention')).toBeInTheDocument();
    expect(screen.getByText('Database Security Patch')).toBeInTheDocument();
    expect(screen.getByText('View All Tasks')).toBeInTheDocument();
    expect(screen.getByText('View Overdue')).toBeInTheDocument();
  });

  it('renders ActionGroup and triggers onActionClick callback when clicked', () => {
    const onActionClick = vi.fn();
    const actions = [{ type: 'view_overdue' as const, label: 'View Overdue Tasks' }];

    render(
      <MemoryRouter>
        <ActionGroup actions={actions} onActionClick={onActionClick} />
      </MemoryRouter>
    );

    const btn = screen.getByText('View Overdue Tasks');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onActionClick).toHaveBeenCalledWith(actions[0]);
  });

  it('renders FollowUpChips and calls onChipClick when chip is clicked', () => {
    const onChipClick = vi.fn();
    const chips = ['Show overdue tasks', 'What should I focus on?'];

    render(<FollowUpChips chips={chips} onChipClick={onChipClick} />);

    expect(screen.getByText('Show overdue tasks')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show overdue tasks'));
    expect(onChipClick).toHaveBeenCalledWith('Show overdue tasks');
  });

  it('renders SafeMarkdown correctly without raw markdown slashes or unparsed tags', () => {
    const rawMarkdown = '# Today\'s work\n- **Task 1**\n- **Task 2**\n1. First step';
    const { container } = render(
      <MemoryRouter>
        <SafeMarkdown text={rawMarkdown} />
      </MemoryRouter>
    );

    expect(screen.getByText("Today's work")).toBeInTheDocument();
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Task 2')).toBeInTheDocument();
    expect(screen.getByText('First step')).toBeInTheDocument();
    expect(container.querySelector('strong')).toBeInTheDocument();
    expect(container.querySelector('ul')).toBeInTheDocument();
    expect(container.querySelector('ol')).toBeInTheDocument();
  });
});
