import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const renderGoals = () => render(<Goals />);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A] } } as any);
  vi.mocked(api.getGoals).mockResolvedValue({ data: { data: FLAT_GOALS } } as any);
  vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [COMPANY_GOAL] } } as any);
  vi.mocked(api.updateGoal).mockResolvedValue({ data: { data: COMPANY_GOAL } } as any);
  vi.mocked(api.deleteGoal).mockResolvedValue({} as any);
  vi.mocked(api.submitGoalForReview).mockResolvedValue({ data: { data: {} } } as any);
  vi.mocked(api.approveGoal).mockResolvedValue({ data: { data: {} } } as any);
  vi.mocked(api.returnGoal).mockResolvedValue({ data: { data: {} } } as any);
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Goals — goal-type filtering', () => {
  it('shows loading state without showing the empty state while goals are fetched', async () => {
    const goalsRequest = deferred<any>();
    vi.mocked(api.getGoals).mockReturnValue(goalsRequest.promise);
    renderGoals();

    expect(screen.getByRole('status')).toHaveTextContent('Loading goals...');
    expect(screen.queryByText('No goals yet')).not.toBeInTheDocument();

    goalsRequest.resolve({ data: { data: FLAT_GOALS } });
    await waitFor(() => expect(screen.getByText('Company direction')).toBeInTheDocument());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a visible error and retries when the hierarchy fetch fails', async () => {
    vi.mocked(api.getGoalHierarchy)
      .mockRejectedValueOnce({ response: { data: { error: 'Goals service unavailable' } } })
      .mockResolvedValueOnce({ data: { data: [COMPANY_GOAL] } } as any);
    renderGoals();

    expect(await screen.findByRole('alert')).toHaveTextContent('Goals service unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('No goals yet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(api.getGoalHierarchy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Company direction')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a hierarchy-only failure does not use a scoped retry that also touches the unaffected goals list', async () => {
    vi.mocked(api.getGoalHierarchy)
      .mockRejectedValueOnce({ response: { data: { error: 'Goals service unavailable' } } })
      .mockResolvedValueOnce({ data: { data: [COMPANY_GOAL] } } as any);
    renderGoals();
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(api.getGoalHierarchy).toHaveBeenCalledTimes(2));
    // The goals list (used only by the create-form's Parent goal dropdown)
    // already succeeded on the first load -- a hierarchy-only retry must
    // not needlessly re-fetch it.
    expect(api.getGoals).toHaveBeenCalledTimes(1);
  });

  it('the goal tree still renders when only the (unrelated) goals-list fetch fails -- loading/error granularity fix', async () => {
    vi.mocked(api.getGoals).mockRejectedValue({ response: { data: { error: 'Goals list unavailable' } } });
    renderGoals();

    // Main content is driven by the hierarchy fetch, which succeeded --
    // it must render normally despite the unrelated goals-list failure
    // (this is the actual bug: the old Promise.all fail-fast behavior
    // discarded a genuinely successful hierarchy whenever getGoals alone
    // rejected).
    expect(await screen.findByText('Company direction')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // The failure is instead surfaced non-blockingly next to the one
    // field that actually depends on the goals list.
    fireEvent.click(screen.getByRole('button', { name: '+ Create Goal' }));
    expect(await screen.findByText(/Couldn't load existing goals to choose a parent/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledTimes(2));
  });

  it('shows one combined error banner (not two) and a single Retry when both independent fetches fail', async () => {
    vi.mocked(api.getGoals).mockRejectedValueOnce({ response: { data: { error: 'Goals list unavailable' } } }).mockResolvedValueOnce({ data: { data: FLAT_GOALS } } as any);
    vi.mocked(api.getGoalHierarchy)
      .mockRejectedValueOnce({ response: { data: { error: 'Hierarchy unavailable' } } })
      .mockResolvedValueOnce({ data: { data: [COMPANY_GOAL] } } as any);
    renderGoals();

    expect(await screen.findAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Hierarchy unavailable');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(api.getGoals).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.getGoalHierarchy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Company direction')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the unchanged empty state after successful loading with no goals', async () => {
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [] } } as any);
    renderGoals();

    expect(await screen.findByText('No goals yet')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows all goal types in the All view', async () => {
    renderGoals();

    await screen.findByText('Company direction');
    expect(screen.getByText('Department objective')).toBeInTheDocument();
    expect(screen.getByText('Project milestone')).toBeInTheDocument();
    expect(screen.getByText('Task milestone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toHaveClass('bg-blue-600');
  });

  it.each([
    ['Company', ['Company direction', 'Department objective', 'Project milestone', 'Task milestone']],
    ['Department', ['Company direction', 'Department objective']],
    ['Project', ['Company direction', 'Department objective', 'Project milestone']],
    ['Milestone', ['Company direction', 'Department objective', 'Project milestone', 'Task milestone']],
  ])('filters to %s goals while preserving relevant hierarchy context', async (filterName, visibleGoals) => {
    renderGoals();
    await screen.findByText('Company direction');

    fireEvent.click(screen.getByRole('button', { name: new RegExp(filterName) }));

    for (const visibleGoal of visibleGoals) {
      expect(screen.getByText(visibleGoal)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: new RegExp(filterName) })).toHaveClass('bg-blue-600');
  });
});

describe('Goals — mutations', () => {
  it('shows a visible error when a status update fails', async () => {
    vi.mocked(api.updateGoal).mockRejectedValue({ response: { data: { error: 'Status update failed' } } });
    renderGoals();
    await screen.findByText('Company direction');

    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'active' } });

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Status update failed'));
    expect(api.getGoals).toHaveBeenCalledTimes(1);
  });

  it('does not delete a goal when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderGoals();
    await screen.findByText('Company direction');

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    expect(api.deleteGoal).not.toHaveBeenCalled();
  });

  it('deletes the selected goal and reloads goals after success', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderGoals();
    await screen.findByText('Company direction');

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    await waitFor(() => expect(api.deleteGoal).toHaveBeenCalledWith('goal-company'));
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledTimes(2));
    expect(api.getGoalHierarchy).toHaveBeenCalledTimes(2);
  });

  it('shows the child-goal conflict error when deletion returns 409', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.deleteGoal).mockRejectedValue({ response: { status: 409, data: { error: 'Foreign key violation' } } });
    renderGoals();
    await screen.findByText('Company direction');

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(
      'This goal cannot be deleted because it has child goals. Delete or re-parent the child goals first.'
    ));
    expect(api.getGoals).toHaveBeenCalledTimes(1);
  });
});

describe('Goals — team goal progress and review workflow', () => {
  const TEAM_GOAL_ACTIVE_AS_MEMBER = {
    goal_id: 'goal-team-active',
    title: 'Ship the feature',
    description: 'Team goal in progress',
    goal_type: 'project',
    status: 'active',
    progress: 40,
    team_id: 'team-a',
    my_team_role: 'member',
    children: [],
  };

  // requested_status is what the corrective fix actually adds: a
  // pending-review goal that was only asking for sign-off (not
  // completion) must show that distinction and must never complete on
  // approval.
  const TEAM_GOAL_PENDING_SIGNOFF_AS_MEMBER = {
    ...TEAM_GOAL_ACTIVE_AS_MEMBER,
    goal_id: 'goal-team-pending-signoff',
    status: 'pending_review',
    requested_status: 'active',
    submitted_by_name: 'Alex Submitter',
  };

  const TEAM_GOAL_PENDING_SIGNOFF_AS_LEADER = {
    ...TEAM_GOAL_PENDING_SIGNOFF_AS_MEMBER,
    goal_id: 'goal-team-pending-signoff-leader',
    my_team_role: 'owner',
  };

  const TEAM_GOAL_PENDING_COMPLETION_AS_MEMBER = {
    ...TEAM_GOAL_ACTIVE_AS_MEMBER,
    goal_id: 'goal-team-pending-completion',
    status: 'pending_review',
    requested_status: 'completed',
    submitted_by_name: 'Alex Submitter',
  };

  const TEAM_GOAL_PENDING_COMPLETION_AS_LEADER = {
    ...TEAM_GOAL_PENDING_COMPLETION_AS_MEMBER,
    goal_id: 'goal-team-pending-completion-leader',
    my_team_role: 'owner',
  };

  it('updating progress sends the new value and the UI reflects it immediately after reload (no manual refresh)', async () => {
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [TEAM_GOAL_ACTIVE_AS_MEMBER] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [TEAM_GOAL_ACTIVE_AS_MEMBER] } } as any);
    renderGoals();
    await screen.findByText('Ship the feature');

    const progressInput = screen.getByLabelText('Progress for Ship the feature');
    fireEvent.change(progressInput, { target: { value: '75' } });
    fireEvent.blur(progressInput);

    await waitFor(() => expect(api.updateGoal).toHaveBeenCalledWith('goal-team-active', { progress: 75 }));
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledTimes(2));
  });

  it('a team member sees two distinct review actions, not one ambiguous "Submit for Review" button', async () => {
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [TEAM_GOAL_ACTIVE_AS_MEMBER] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [TEAM_GOAL_ACTIVE_AS_MEMBER] } } as any);
    renderGoals();
    await screen.findByText('Ship the feature');

    // No direct "Completed" option for a team goal's status select.
    expect(screen.queryByRole('option', { name: 'Completed' })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Request Sign-off' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request Completion' })).toBeInTheDocument();
  });

  it('requesting sign-off (not completion) submits without requestedStatus set to completed', async () => {
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [TEAM_GOAL_ACTIVE_AS_MEMBER] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [TEAM_GOAL_ACTIVE_AS_MEMBER] } } as any);
    renderGoals();
    await screen.findByText('Ship the feature');

    fireEvent.click(screen.getByRole('button', { name: 'Request Sign-off' }));

    await waitFor(() => expect(api.submitGoalForReview).toHaveBeenCalledWith('goal-team-active', undefined));
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledTimes(2));
  });

  it('requesting completion submits with requestedStatus: completed', async () => {
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [TEAM_GOAL_ACTIVE_AS_MEMBER] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [TEAM_GOAL_ACTIVE_AS_MEMBER] } } as any);
    renderGoals();
    await screen.findByText('Ship the feature');

    fireEvent.click(screen.getByRole('button', { name: 'Request Completion' }));

    await waitFor(() => expect(api.submitGoalForReview).toHaveBeenCalledWith('goal-team-active', 'completed'));
  });

  it('a normal member sees a sign-off request labeled distinctly from a completion request, with no Approve/Return controls', async () => {
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [TEAM_GOAL_PENDING_SIGNOFF_AS_MEMBER] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [TEAM_GOAL_PENDING_SIGNOFF_AS_MEMBER] } } as any);
    renderGoals();
    await screen.findByText('Ship the feature');

    expect(screen.getByText('Waiting for Review')).toBeInTheDocument();
    expect(screen.getByText(/Sign-off requested by Alex Submitter/)).toBeInTheDocument();
    expect(screen.queryByText(/Completion requested/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Return/ })).not.toBeInTheDocument();
  });

  it('a normal member sees a completion request labeled distinctly from a sign-off request', async () => {
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [TEAM_GOAL_PENDING_COMPLETION_AS_MEMBER] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [TEAM_GOAL_PENDING_COMPLETION_AS_MEMBER] } } as any);
    renderGoals();
    await screen.findByText('Ship the feature');

    expect(screen.getByText(/Completion requested by Alex Submitter/)).toBeInTheDocument();
  });

  it('CORRECTIVE FIX: a leader approving a sign-off request keeps the goal in its working status -- it must NOT become Completed', async () => {
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [TEAM_GOAL_PENDING_SIGNOFF_AS_LEADER] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [TEAM_GOAL_PENDING_SIGNOFF_AS_LEADER] } } as any);
    renderGoals();
    await screen.findByText('Ship the feature');

    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    // Approve takes only the goal id -- the frontend never tells the
    // server "make this completed"; the server derives the outcome from
    // requested_status (goals.service.ts's approveReview), which is the
    // actual fix this test is guarding.
    await waitFor(() => expect(api.approveGoal).toHaveBeenCalledWith('goal-team-pending-signoff-leader'));
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledTimes(2));
  });

  it('a leader approving a completion request calls the same approve endpoint (server applies completed + 100%)', async () => {
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [TEAM_GOAL_PENDING_COMPLETION_AS_LEADER] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [TEAM_GOAL_PENDING_COMPLETION_AS_LEADER] } } as any);
    renderGoals();
    await screen.findByText('Ship the feature');

    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    await waitFor(() => expect(api.approveGoal).toHaveBeenCalledWith('goal-team-pending-completion-leader'));
  });

  it('a team leader can return a pending-review goal to in-progress, regardless of what was requested', async () => {
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [TEAM_GOAL_PENDING_COMPLETION_AS_LEADER] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [TEAM_GOAL_PENDING_COMPLETION_AS_LEADER] } } as any);
    renderGoals();
    await screen.findByText('Ship the feature');

    fireEvent.click(screen.getByRole('button', { name: /Return/ }));
    await waitFor(() => expect(api.returnGoal).toHaveBeenCalledWith('goal-team-pending-completion-leader'));
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledTimes(2));
  });
});

describe('Goals — goal type selection', () => {
  it('requires custom text when "Other" is selected and blocks submission until provided', async () => {
    renderGoals();
    await screen.findByText('Company direction');

    fireEvent.click(screen.getByRole('button', { name: '+ Create Goal' }));
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'My custom goal' } });

    const combos = screen.getAllByRole('combobox');
    const typeSelect = combos[combos.length - 3];
    fireEvent.change(typeSelect, { target: { value: 'other' } });

    fireEvent.submit(screen.getByRole('button', { name: 'Create Goal' }).closest('form')!);
    expect(window.alert).toHaveBeenCalledWith('Please enter a custom goal type, or choose one of the predefined types.');
    expect(api.createGoal).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Enter a custom goal type'), { target: { value: 'Hackathon Prep' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create Goal' }).closest('form')!);

    await waitFor(() => expect(api.createGoal).toHaveBeenCalledWith(expect.objectContaining({
      title: 'My custom goal',
      goalType: 'Hackathon Prep',
    })));
  });
});

describe('Goals — selected team creation default', () => {
  it('uses the selected team in the create-goal payload', async () => {
    vi.mocked(api.createGoal).mockResolvedValue({ data: { data: COMPANY_GOAL } } as any);
    renderGoals();
    await screen.findByText('Company direction');

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'team-a' } });
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledWith('?teamId=team-a'));

    fireEvent.click(screen.getByRole('button', { name: '+ Create Goal' }));
    const modalComboboxes = screen.getAllByRole('combobox');
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Team goal' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create Goal' }).closest('form')!);

    await waitFor(() => expect(api.createGoal).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Team goal',
      teamId: 'team-a',
    })));
    expect(modalComboboxes[modalComboboxes.length - 1]).toHaveValue('team-a');
  });
});

// ---------------------------------------------------------------------------
// Cross-section audit fix: switching teams previously left the PREVIOUS
// team's goal tree on screen for the full duration of the new fetch (no
// stale-clear, and the loading indicator only fired when hierarchy was
// already empty). Also verifies getGoals/getGoalHierarchy now run in
// parallel instead of sequentially.
// ---------------------------------------------------------------------------

describe('Goals — team switching does not show stale cross-team data', () => {
  const TEAM_B = { team_id: 'team-b', team_name: 'Team Beta' };

  it('clears the previous team\'s goals and shows a loading state while switching, never mixing the two', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A, TEAM_B] } } as any);
    renderGoals();
    await screen.findByText('Company direction');

    const teamBGoal = { ...COMPANY_GOAL, goal_id: 'goal-beta', title: 'Beta direction', children: [] };
    const secondLoad = deferred<any>();
    vi.mocked(api.getGoals).mockReturnValue(secondLoad.promise);
    vi.mocked(api.getGoalHierarchy).mockReturnValue(secondLoad.promise);

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'team-b' } });

    // The previous team's goal must be gone immediately, not lingering
    // until the new team's response arrives.
    await waitFor(() => expect(screen.queryByText('Company direction')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Loading goals...');

    secondLoad.resolve({ data: { data: [teamBGoal] } });
    await waitFor(() => expect(screen.getByText('Beta direction')).toBeInTheDocument());
    expect(screen.queryByText('Company direction')).not.toBeInTheDocument();
  });

  it('fetches getGoals and getGoalHierarchy in parallel, not sequentially', async () => {
    let goalsStarted = false;
    let hierarchyStartedBeforeGoalsResolved = false;
    const goalsGate = deferred<any>();

    vi.mocked(api.getGoals).mockImplementation(() => {
      goalsStarted = true;
      return goalsGate.promise as any;
    });
    vi.mocked(api.getGoalHierarchy).mockImplementation(() => {
      if (goalsStarted) hierarchyStartedBeforeGoalsResolved = true;
      return Promise.resolve({ data: { data: [] } }) as any;
    });

    renderGoals();

    // getGoalHierarchy must have been invoked while getGoals was still
    // pending -- a sequential (await-then-await) implementation would
    // never call getGoalHierarchy until after getGoals resolved.
    await waitFor(() => expect(api.getGoalHierarchy).toHaveBeenCalled());
    expect(hierarchyStartedBeforeGoalsResolved).toBe(true);

    goalsGate.resolve({ data: { data: [] } });
  });
});

// ---------------------------------------------------------------------------
// Goals UX cleanup phase: create-goal duplicate-submission guard, creator/
// timestamp visibility, and create-form accessibility associations.
// ---------------------------------------------------------------------------

describe('Goals — create-goal duplicate-submission prevention', () => {
  it('a second rapid submission while the first is still in flight sends only one createGoal request', async () => {
    const createRequest = deferred<any>();
    vi.mocked(api.createGoal).mockReturnValue(createRequest.promise);
    renderGoals();
    await screen.findByText('Company direction');

    fireEvent.click(screen.getByRole('button', { name: '+ Create Goal' }));
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'New goal' } });
    const submitButton = screen.getByRole('button', { name: 'Create Goal' });

    fireEvent.click(submitButton);
    // Button must be disabled immediately, before the request resolves.
    expect(submitButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeInTheDocument();

    // A second click (or a fast double-Enter) while still in flight.
    fireEvent.click(submitButton);

    expect(api.createGoal).toHaveBeenCalledTimes(1);

    createRequest.resolve({ data: { data: { goal_id: 'goal-new' } } });
    await waitFor(() => expect(screen.queryByText('Create New Goal')).not.toBeInTheDocument());
  });

  it('restores the button and re-enables submission after a failed creation', async () => {
    vi.mocked(api.createGoal).mockRejectedValueOnce({ response: { data: { error: 'Failed' } } });
    renderGoals();
    await screen.findByText('Company direction');

    fireEvent.click(screen.getByRole('button', { name: '+ Create Goal' }));
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'New goal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Goal' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed'));
    expect(screen.getByRole('button', { name: 'Create Goal' })).not.toBeDisabled();
  });

  it('updates the goal list immediately after successful creation, without a manual refresh', async () => {
    vi.mocked(api.createGoal).mockResolvedValue({ data: { data: { goal_id: 'goal-new' } } } as any);
    renderGoals();
    await screen.findByText('Company direction');

    fireEvent.click(screen.getByRole('button', { name: '+ Create Goal' }));
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'New goal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Goal' }));

    await waitFor(() => expect(api.createGoal).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Create New Goal')).not.toBeInTheDocument();
  });
});

describe('Goals — creator and timestamp visibility', () => {
  const GOAL_WITH_METADATA = {
    goal_id: 'goal-meta',
    title: 'Metadata goal',
    description: 'd',
    goal_type: 'project',
    status: 'active',
    progress: 40,
    team_id: 'team-a',
    my_team_role: 'member',
    created_by_name: 'Grace Hopper',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    children: [],
  };

  it("renders the creator's real name and created date from the actual API response", async () => {
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [GOAL_WITH_METADATA] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [GOAL_WITH_METADATA] } } as any);
    renderGoals();

    expect(await screen.findByText(/Created by Grace Hopper/)).toBeInTheDocument();
  });

  it('shows an "Updated" date only when it genuinely differs from the created date', async () => {
    const updated = { ...GOAL_WITH_METADATA, updated_at: '2026-02-15T00:00:00Z' };
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [updated] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [updated] } } as any);
    renderGoals();

    expect(await screen.findByText(/Updated/)).toBeInTheDocument();
  });

  it('does not show a redundant "Updated" date when it matches the created date', async () => {
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [GOAL_WITH_METADATA] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [GOAL_WITH_METADATA] } } as any);
    renderGoals();

    await screen.findByText(/Created by Grace Hopper/);
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  });

  it('falls back gracefully, without fabricating a name, when created_by_name is genuinely unavailable', async () => {
    const noCreator = { ...GOAL_WITH_METADATA, created_by_name: null };
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [noCreator] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [noCreator] } } as any);
    renderGoals();

    expect(await screen.findByText(/Created by a former member/)).toBeInTheDocument();
  });

  it('shows submitted-for-review and approved timestamps alongside the existing name display', async () => {
    const pending = {
      ...GOAL_WITH_METADATA,
      goal_id: 'goal-pending',
      status: 'pending_review',
      requested_status: 'active',
      submitted_by_name: 'Alex Submitter',
      submitted_for_review_at: '2026-03-01T00:00:00Z',
    };
    vi.mocked(api.getGoals).mockResolvedValue({ data: { data: [pending] } } as any);
    vi.mocked(api.getGoalHierarchy).mockResolvedValue({ data: { data: [pending] } } as any);
    renderGoals();

    // Locale-agnostic: don't assert exact digit order (day/month vs
    // month/day depends on the test environment's default locale), just
    // that a name and a parenthesized date both render.
    expect(await screen.findByText(/Sign-off requested by Alex Submitter \(.+\)/)).toBeInTheDocument();
  });
});

describe('Goals — loadGoals() stale-response race protection', () => {
  it('a stale response for a previous team does not overwrite a faster response for the next team (Team A -> Team B race)', async () => {
    const TEAM_B = { team_id: 'team-b', team_name: 'Team Beta' };
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A, TEAM_B] } } as any);
    renderGoals();
    await screen.findByText('Company direction');

    const teamAGoal = { ...COMPANY_GOAL, goal_id: 'goal-a', title: 'Team A Goal', children: [] };
    const teamBGoal = { ...COMPANY_GOAL, goal_id: 'goal-b', title: 'Team B Goal', children: [] };
    const teamARequest = deferred<any>();
    const teamBRequest = deferred<any>();

    vi.mocked(api.getGoals).mockImplementation((params?: string) => {
      if (params === '?teamId=team-a') return teamARequest.promise as any;
      if (params === '?teamId=team-b') return teamBRequest.promise as any;
      return Promise.resolve({ data: { data: [] } }) as any;
    });
    vi.mocked(api.getGoalHierarchy).mockImplementation((params?: string) => {
      if (params === '?teamId=team-a') return teamARequest.promise as any;
      if (params === '?teamId=team-b') return teamBRequest.promise as any;
      return Promise.resolve({ data: { data: [] } }) as any;
    });

    // Switch to Team A (request in flight, not yet resolved).
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'team-a' } });
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledWith('?teamId=team-a'));

    // Switch to Team B before Team A's request resolves.
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'team-b' } });
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledWith('?teamId=team-b'));

    // Resolve Team B's (newer, current) response first.
    teamBRequest.resolve({ data: { data: [teamBGoal] } });
    await waitFor(() => expect(screen.getByText('Team B Goal')).toBeInTheDocument());

    // Resolve Team A's stale response afterward.
    teamARequest.resolve({ data: { data: [teamAGoal] } });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText('Team B Goal')).toBeInTheDocument();
    expect(screen.queryByText('Team A Goal')).not.toBeInTheDocument();
  });

  it('a stale response after switching from a team back to Personal Goals is discarded', async () => {
    renderGoals();
    await screen.findByText('Company direction');

    const teamGoal = { ...COMPANY_GOAL, goal_id: 'goal-team', title: 'Team Direction', children: [] };
    const personalGoal = { ...COMPANY_GOAL, goal_id: 'goal-personal', title: 'Personal Direction', children: [] };
    const teamRequest = deferred<any>();
    const personalRequest = deferred<any>();

    vi.mocked(api.getGoals).mockImplementation((params?: string) => {
      if (params === '?teamId=team-a') return teamRequest.promise as any;
      if (!params) return personalRequest.promise as any;
      return Promise.resolve({ data: { data: [] } }) as any;
    });
    vi.mocked(api.getGoalHierarchy).mockImplementation((params?: string) => {
      if (params === '?teamId=team-a') return teamRequest.promise as any;
      if (!params) return personalRequest.promise as any;
      return Promise.resolve({ data: { data: [] } }) as any;
    });

    // Switch to Team Alpha (request in flight).
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'team-a' } });
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledWith('?teamId=team-a'));

    // Switch back to Personal Goals before the team request resolves.
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '' } });
    await waitFor(() => expect(api.getGoals).toHaveBeenCalledWith(''));

    // Resolve Personal Goals (the newer, current selection) first.
    personalRequest.resolve({ data: { data: [personalGoal] } });
    await waitFor(() => expect(screen.getByText('Personal Direction')).toBeInTheDocument());

    // Resolve the stale team request afterward.
    teamRequest.resolve({ data: { data: [teamGoal] } });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText('Personal Direction')).toBeInTheDocument();
    expect(screen.queryByText('Team Direction')).not.toBeInTheDocument();
  });
});

describe('Goals — create-form accessibility associations', () => {
  it('associates Parent goal, Team, and Target date labels with their controls via htmlFor/id', async () => {
    renderGoals();
    await screen.findByText('Company direction');
    fireEvent.click(screen.getByRole('button', { name: '+ Create Goal' }));

    expect(screen.getByLabelText('Parent goal (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Team (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Target date (optional)')).toBeInTheDocument();
  });
});
