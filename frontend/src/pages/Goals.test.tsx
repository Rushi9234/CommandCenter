import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Goals from './Goals';
import * as api from '../services/api';

vi.mock('../services/api');

const TEAM_A = { team_id: 'team-a', team_name: 'Team Alpha' };

const COMPANY_GOAL = {
  goal_id: 'goal-company',
  title: 'Company direction',
  description: 'Company description',
  goal_type: 'company',
  status: 'planning',
  progress: 10,
  children: [
    {
      goal_id: 'goal-department',
      title: 'Department objective',
      description: 'Department description',
      goal_type: 'department',
      status: 'active',
      progress: 20,
      children: [
        {
          goal_id: 'goal-project',
          title: 'Project milestone',
          description: 'Project description',
          goal_type: 'project',
          status: 'active',
          progress: 30,
          children: [
            {
              goal_id: 'goal-milestone',
              title: 'Task milestone',
              description: 'Milestone description',
              goal_type: 'milestone',
              status: 'completed',
              progress: 100,
              children: [],
            },
          ],
        },
      ],
    },
  ],
};

const FLAT_GOALS = [
  COMPANY_GOAL,
  COMPANY_GOAL.children[0],
  COMPANY_GOAL.children[0].children[0],
  COMPANY_GOAL.children[0].children[0].children[0],
];

const renderGoals = (initialEntries: string[] = ['/goals']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Goals />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A] } } as any);
  vi.mocked(api.getGoals).mockResolvedValue({ data: { data: FLAT_GOALS } } as any);
  vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [COMPANY_GOAL] } } as any);
  vi.mocked(api.createGoal).mockResolvedValue({ data: { data: COMPANY_GOAL } } as any);
  vi.mocked(api.updateGoal).mockResolvedValue({ data: { data: COMPANY_GOAL } } as any);
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Goals Page', () => {
  it('renders goals title and loads hierarchy', async () => {
    renderGoals();

    expect(await screen.findByText('Strategic Goals')).toBeInTheDocument();
    expect(await screen.findByText('Company direction')).toBeInTheDocument();
  });

  it('renders goal tree children properly', async () => {
    renderGoals();

    expect(await screen.findByText('Department objective')).toBeInTheDocument();
    expect(await screen.findByText('Project milestone')).toBeInTheDocument();
    expect(await screen.findByText('Task milestone')).toBeInTheDocument();
  });

  it('updates goal status when dropdown changes', async () => {
    renderGoals();

    await screen.findByText('Company direction');
    const select = screen.getAllByRole('combobox')[0];
    fireEvent.change(select, { target: { value: 'active' } });

    await waitFor(() => {
      expect(api.updateGoal).toHaveBeenCalledWith('goal-company', { status: 'active' });
    });
  });

  it('opens create goal modal and submits new goal', async () => {
    renderGoals();

    await screen.findByText('Company direction');
    fireEvent.click(screen.getByRole('button', { name: '+ Create Goal' }));

    expect(await screen.findByText('Create New Goal')).toBeInTheDocument();

    const titleInput = screen.getAllByRole('textbox')[1];
    fireEvent.change(titleInput, { target: { value: 'New Test Goal' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Goal' }));

    await waitFor(() => {
      expect(api.createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Test Goal',
        })
      );
    });
  });
});
