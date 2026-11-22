import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MemberDetailView from './MemberDetailView';

const mockMember = {
  user_id: 'usr_aditya_1',
  full_name: 'Aditya Kulkarni',
  username: 'adityak',
  role: 'member',
  avatar_url: null,
  tasks: {
    assigned: 6,
    in_progress: 1,
    completed: 5,
    remaining: 1,
  },
};

const mockTasks = [
  {
    task_id: 'tsk_101',
    project_id: 'prj_1',
    project_name: 'Backend API Service',
    title: 'Design Auth Middleware',
    description: 'JWT validation and RBAC checks',
    status: 'completed',
    priority: 'high',
    created_at: '2026-09-01T00:00:00Z',
    completed_at: '2026-09-05T00:00:00Z',
  },
  {
    task_id: 'tsk_102',
    project_id: 'prj_1',
    project_name: 'Backend API Service',
    title: 'Implement Database Migrations',
    description: 'Add indexes to team_members table',
    status: 'in_progress',
    priority: 'medium',
    created_at: '2026-09-10T00:00:00Z',
    completed_at: null,
  },
];

const mockDailySubmissions = [
  {
    submission_id: 'sub_1',
    work_date: '2026-09-15',
    confirmed_summary: 'Completed Auth Middleware unit tests and verified API endpoints',
    confirmed_at: '2026-09-15T17:00:00Z',
  },
];

const mockBlockers = [
  {
    blocker_id: 'blk_1',
    title: 'Staging Environment Credentials Pending',
    description: 'Waiting for DevOps team access token',
    urgency: 'high',
    status: 'open',
    created_at: '2026-09-14T10:00:00Z',
  },
];

describe('MemberDetailView Component', () => {
  it('renders member header info, role, and status badge', () => {
    render(
      <MemberDetailView
        member={mockMember}
        teamName="Team Delta"
        parentTeamName="Computer Science TY B"
        tasks={mockTasks}
        dailySubmissions={mockDailySubmissions}
        blockers={mockBlockers}
        onBackToTeam={vi.fn()}
      />
    );

    expect(screen.getByText('Aditya Kulkarni')).toBeInTheDocument();
    expect(screen.getByText('@adityak')).toBeInTheDocument();
    expect(screen.getByText('Team Delta')).toBeInTheDocument();
    expect(screen.getByText(/Computer Science TY B/)).toBeInTheDocument();
  });

  it('renders correct summary KPI calculations', () => {
    render(
      <MemberDetailView
        member={mockMember}
        teamName="Team Delta"
        tasks={mockTasks}
        dailySubmissions={mockDailySubmissions}
        blockers={mockBlockers}
        onBackToTeam={vi.fn()}
      />
    );

    expect(screen.getByText('6')).toBeInTheDocument(); // Assigned Tasks
    expect(screen.getByText('5')).toBeInTheDocument(); // Completed
    expect(screen.getByText('83%')).toBeInTheDocument(); // Completion Rate
  });

  it('renders assigned tasks in table', () => {
    render(
      <MemberDetailView
        member={mockMember}
        teamName="Team Delta"
        tasks={mockTasks}
        dailySubmissions={mockDailySubmissions}
        blockers={mockBlockers}
        onBackToTeam={vi.fn()}
      />
    );

    expect(screen.getByText('Design Auth Middleware')).toBeInTheDocument();
    expect(screen.getByText('Implement Database Migrations')).toBeInTheDocument();
    expect(screen.getAllByText('Backend API Service').length).toBeGreaterThan(0);
  });

  it('renders daily work submissions and reported blockers', () => {
    render(
      <MemberDetailView
        member={mockMember}
        teamName="Team Delta"
        tasks={mockTasks}
        dailySubmissions={mockDailySubmissions}
        blockers={mockBlockers}
        onBackToTeam={vi.fn()}
      />
    );

    expect(screen.getByText('Completed Auth Middleware unit tests and verified API endpoints')).toBeInTheDocument();
    expect(screen.getByText('Staging Environment Credentials Pending')).toBeInTheDocument();
  });

  it('calls onBackToTeam when back button is clicked', () => {
    const handleBack = vi.fn();
    render(
      <MemberDetailView
        member={mockMember}
        teamName="Team Delta"
        tasks={mockTasks}
        dailySubmissions={mockDailySubmissions}
        blockers={mockBlockers}
        onBackToTeam={handleBack}
      />
    );

    const backBtn = screen.getByRole('button', { name: /back to team view/i });
    fireEvent.click(backBtn);
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it('renders empty state message when tasks list is empty', () => {
    render(
      <MemberDetailView
        member={{ ...mockMember, tasks: { assigned: 0, completed: 0, in_progress: 0, remaining: 0 } }}
        teamName="Team Delta"
        tasks={[]}
        dailySubmissions={[]}
        blockers={[]}
        onBackToTeam={vi.fn()}
      />
    );

    expect(screen.getByTestId('no-tasks-assigned')).toBeInTheDocument();
    expect(screen.getByText('No Tasks Assigned')).toBeInTheDocument();
  });
});
