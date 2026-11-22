import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssignWorkModal from './AssignWorkModal';
import * as api from '../services/api';

vi.mock('../services/api');

const MOCK_TEAMS = [
  { team_id: 't-alpha', team_name: 'Team Alpha' },
  { team_id: 't-beta', team_name: 'Team Beta' },
];

const MOCK_MEMBERS = [
  { user_id: 'u1', full_name: 'Raju Sharma', username: 'raju', role: 'member', team_id: 't-alpha' },
  { user_id: 'u2', full_name: 'Jayesh Patel', username: 'jayesh', role: 'lead', team_id: 't-alpha' },
];

describe('AssignWorkModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with default team mode selected', () => {
    render(
      <AssignWorkModal
        isOpen={true}
        onClose={vi.fn()}
        availableTeams={MOCK_TEAMS}
        currentTeamId="t-alpha"
        classroomId="c1"
        isClassOwner={true}
      />
    );

    expect(screen.getByTestId('assign-work-modal')).toBeDefined();
    expect(screen.getByText('Who should receive this work? *')).toBeDefined();
    expect(screen.getByText(/Team \/ All Teams/)).toBeDefined();
  });

  it('allows switching between Team and Individual Member modes', () => {
    render(
      <AssignWorkModal
        isOpen={true}
        onClose={vi.fn()}
        availableTeams={MOCK_TEAMS}
        currentTeamId="t-alpha"
        classroomId="c1"
        isClassOwner={true}
      />
    );

    const individualBtn = screen.getByText(/Individual Member/);
    fireEvent.click(individualBtn);

    expect(screen.getByPlaceholderText('Search by name or username...')).toBeDefined();
  });

  it('performs live member search when typing in individual mode', async () => {
    vi.mocked(api.searchClassroomMembers).mockResolvedValue({
      data: { data: MOCK_MEMBERS },
    } as any);

    render(
      <AssignWorkModal
        isOpen={true}
        onClose={vi.fn()}
        availableTeams={MOCK_TEAMS}
        currentTeamId="t-alpha"
        classroomId="c1"
        isClassOwner={true}
      />
    );

    fireEvent.click(screen.getByText(/Individual Member/));

    const searchInput = screen.getByPlaceholderText('Search by name or username...');
    fireEvent.change(searchInput, { target: { value: 'Raju' } });

    await waitFor(() => {
      expect(api.searchClassroomMembers).toHaveBeenCalledWith('c1', 'Raju');
      expect(screen.getByText('Raju Sharma')).toBeDefined();
    });
  });

  it('submits individual assignment successfully', async () => {
    vi.mocked(api.searchClassroomMembers).mockResolvedValue({
      data: { data: MOCK_MEMBERS },
    } as any);
    vi.mocked(api.getTeamProjects).mockResolvedValue({
      data: { data: [{ project_id: 'p-alpha', status: 'active' }] },
    } as any);
    vi.mocked(api.createTask).mockResolvedValue({
      data: { data: { task_id: 'task-101' } },
    } as any);

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <AssignWorkModal
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        availableTeams={MOCK_TEAMS}
        currentTeamId="t-alpha"
        classroomId="c1"
        isClassOwner={true}
      />
    );

    fireEvent.click(screen.getByText(/Individual Member/));
    fireEvent.change(screen.getByPlaceholderText('Search by name or username...'), { target: { value: 'Raju' } });

    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Raju Sharma'));

    // Fill task title
    fireEvent.change(screen.getByPlaceholderText(/Complete Chatbot UI Integration/i), { target: { value: 'Integrate Chatbot UI' } });

    // Submit form
    fireEvent.submit(screen.getByTestId('assign-work-form'));

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith(
        'p-alpha',
        expect.objectContaining({
          title: 'Integrate Chatbot UI',
          owner: 'u1',
        })
      );
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('calls createBatchTeamTasks when All Teams is selected in Class Owner mode', async () => {
    vi.mocked(api.createBatchTeamTasks).mockResolvedValue({
      data: { data: { batch_id: 'batch-1' } },
    } as any);

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <AssignWorkModal
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        availableTeams={MOCK_TEAMS}
        currentTeamId="t-alpha"
        classId="c1"
        isClassOwner={true}
      />
    );

    // Select All Teams
    const teamSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(teamSelect, { target: { value: 'all' } });

    // Fill title
    fireEvent.change(screen.getByPlaceholderText(/Complete Chatbot UI Integration/i), { target: { value: 'Global Classroom Security Audit' } });

    // Submit
    fireEvent.submit(screen.getByTestId('assign-work-form'));

    await waitFor(() => {
      expect(api.createBatchTeamTasks).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({
          title: 'Global Classroom Security Audit',
        })
      );
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
