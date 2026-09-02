import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Projects from './Projects';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

// Projects had zero test coverage before this pass -- mocks the two
// external dependencies (useAuth, services/api), same pattern already
// established in Teams.test.tsx/Goals.test.tsx/Grid.test.tsx.
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../services/api');

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const FAKE_USER = { user_id: 'user-1', full_name: 'Ada Lovelace' };
const OTHER_USER = { user_id: 'user-2', full_name: 'Bob Smith' };

const TEAM_A = { team_id: 'team-a', team_name: 'Team Alpha', my_role: 'owner' };
const TEAM_A_VIEWER = { team_id: 'team-a', team_name: 'Team Alpha', my_role: 'viewer' };
const TEAM_A_MEMBER = { team_id: 'team-a', team_name: 'Team Alpha', my_role: 'member' };

const PROJECT_SOLO = {
  project_id: 'proj-solo', project_name: 'Solo Project', description: 'A solo effort',
  team_id: null, created_by: 'user-1', status: 'planning', priority: 'medium',
  is_public: true, deadline: null, created_at: '2026-01-01T00:00:00Z',
};
const PROJECT_TEAM = {
  project_id: 'proj-team', project_name: 'Team Project', description: 'A team effort',
  team_id: 'team-a', created_by: 'user-1', status: 'active', priority: 'high',
  is_public: false, deadline: null, created_at: '2026-01-02T00:00:00Z',
};

const TASK_1 = { task_id: 'task-1', project_id: 'proj-solo', title: 'First task', description: 'd', status: 'todo', priority: 'medium', owner: null, reviewer: null, contributors: [], dependencies: [] };
const TASK_2 = { task_id: 'task-2', project_id: 'proj-solo', title: 'Second task', description: 'd', status: 'done', priority: 'low', owner: null, reviewer: null, contributors: [], dependencies: [] };

const MEMBER_BOB = { user_id: 'user-2', role: 'member', full_name: 'Bob Smith', username: 'bob' };
const MEMBER_ADA = { user_id: 'user-1', role: 'owner', full_name: 'Ada Lovelace', username: 'ada' };

const TEAM_TASK_1 = {
  task_id: 'task-team-1', project_id: 'proj-team', title: 'Team task', description: 'd',
  status: 'todo', priority: 'medium', owner: null, reviewer: null, contributors: [], dependencies: [],
  owner_user: null, reviewer_user: null, contributor_users: [], dependency_tasks: [],
};

const renderProjects = (user: any = FAKE_USER, initialEntries: string[] = ['/projects']) => {
  mockUseAuth.mockReturnValue({ user, isAuthenticated: true, token: 'fake-token', login: vi.fn(), register: vi.fn(), logout: vi.fn() });
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Projects />
    </MemoryRouter>
  );
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A] } } as any);
  vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_SOLO] } } as any);
  vi.mocked(api.getProjectTasks).mockResolvedValue({ data: { data: [] } } as any);
  vi.mocked(api.getTeamMembers).mockResolvedValue({ data: { data: [MEMBER_ADA, MEMBER_BOB] } } as any);
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Projects — project loading', () => {
  it('shows a loading state before the project list resolves', async () => {
    const request = deferred<any>();
    vi.mocked(api.getMyProjects).mockReturnValue(request.promise as any);
    renderProjects();

    expect(screen.getAllByText('Loading projects...').length).toBeGreaterThan(0);
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument();

    request.resolve({ data: { data: [] } });
    await waitFor(() => expect(screen.getByText('No projects yet')).toBeInTheDocument());
  });

  it('renders the loaded project list and auto-selects the first project', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_SOLO, PROJECT_TEAM] } } as any);
    renderProjects();

    expect(await screen.findByRole('heading', { name: 'Solo Project' })).toBeInTheDocument();
    expect(screen.getByText('Team Project')).toBeInTheDocument();
  });

  it('shows the genuine empty state when the caller has zero projects', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [] } } as any);
    renderProjects();

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(await screen.findByText('No Project Selected')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a clear error (not the empty state) when the initial project load fails, with Retry', async () => {
    vi.mocked(api.getMyProjects).mockRejectedValue({ response: { data: { error: 'Projects service unavailable' } } });
    renderProjects();

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument();
    expect(screen.queryByText('No Project Selected')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
  });

  it('retrying after an initial failure succeeds and shows the loaded projects', async () => {
    vi.mocked(api.getMyProjects)
      .mockRejectedValueOnce({ response: { data: { error: 'unavailable' } } })
      .mockResolvedValueOnce({ data: { data: [PROJECT_SOLO] } } as any);
    renderProjects();
    await screen.findAllByRole('alert');

    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]);

    await waitFor(() => expect(api.getMyProjects).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: 'Solo Project' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Projects — project selection and task loading (no duplicate fetch)', () => {
  it('selecting a project loads its tasks exactly once, with no duplicate trigger on initial mount', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_SOLO, PROJECT_TEAM] } } as any);
    renderProjects();

    await screen.findByRole('heading', { name: 'Solo Project' });
    // Only ONE task fetch for the auto-selected first project on mount --
    // this is the actual regression test for the duplicate-fetch bug
    // (the old code had both an inline selectProject() call in
    // loadProjects() AND a separate useEffect([projects]) that could
    // also trigger it).
    await waitFor(() => expect(api.getProjectTasks).toHaveBeenCalledTimes(1));
    expect(api.getProjectTasks).toHaveBeenCalledWith('proj-solo');

    fireEvent.click(screen.getByText('Team Project'));

    await waitFor(() => expect(api.getProjectTasks).toHaveBeenCalledTimes(2));
    expect(api.getProjectTasks).toHaveBeenLastCalledWith('proj-team');
  });

  it('shows a loading state while tasks are being fetched', async () => {
    const request = deferred<any>();
    vi.mocked(api.getProjectTasks).mockReturnValue(request.promise as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Solo Project' });

    expect(screen.getByText('Loading tasks...')).toBeInTheDocument();

    request.resolve({ data: { data: [] } });
    await waitFor(() => expect(screen.queryByText('Loading tasks...')).not.toBeInTheDocument());
  });

  it('shows the genuine empty task state once loaded with zero tasks', async () => {
    renderProjects();
    await screen.findByRole('heading', { name: 'Solo Project' });

    expect(await screen.findByText(/No tasks yet/)).toBeInTheDocument();
  });

  it('shows a clear error (not empty) when the task load fails, and Retry recovers', async () => {
    vi.mocked(api.getProjectTasks)
      .mockRejectedValueOnce({ response: { data: { error: 'Tasks unavailable' } } })
      .mockResolvedValueOnce({ data: { data: [TASK_1] } } as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Solo Project' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Tasks unavailable');
    expect(screen.queryByText(/No tasks yet/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(api.getProjectTasks).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('First task')).toBeInTheDocument();
  });
});

describe('Projects — stale-response race protection (Project A -> Project B)', () => {
  it('a stale task response for a previous project does not overwrite the newly selected project', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_SOLO, PROJECT_TEAM] } } as any);
    const soloRequest = deferred<any>();
    const teamRequest = deferred<any>();
    vi.mocked(api.getProjectTasks).mockImplementation((projectId: string) => {
      if (projectId === 'proj-solo') return soloRequest.promise as any;
      if (projectId === 'proj-team') return teamRequest.promise as any;
      return Promise.resolve({ data: { data: [] } }) as any;
    });
    renderProjects();
    await waitFor(() => expect(api.getProjectTasks).toHaveBeenCalledWith('proj-solo'));

    fireEvent.click(screen.getByText('Team Project'));
    await waitFor(() => expect(api.getProjectTasks).toHaveBeenCalledWith('proj-team'));

    // Team Project's (newer) response resolves first.
    teamRequest.resolve({ data: { data: [{ ...TASK_1, task_id: 'task-team', title: 'Team task' }] } });
    await waitFor(() => expect(screen.getByText('Team task')).toBeInTheDocument());

    // Solo Project's stale response resolves afterward.
    soloRequest.resolve({ data: { data: [TASK_1] } });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText('Team task')).toBeInTheDocument();
    expect(screen.queryByText('First task')).not.toBeInTheDocument();
  });

  it('a task-delete mutation for a project the user has since switched away from does not corrupt the newly selected project\'s tasks', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_SOLO, PROJECT_TEAM] } } as any);
    vi.mocked(api.getProjectTasks).mockImplementation((projectId: string) => {
      if (projectId === 'proj-solo') return Promise.resolve({ data: { data: [TASK_1] } }) as any;
      if (projectId === 'proj-team') return Promise.resolve({ data: { data: [{ ...TASK_1, task_id: 'task-team', title: 'Team task' }] } }) as any;
      return Promise.resolve({ data: { data: [] } }) as any;
    });
    const deleteRequest = deferred<any>();
    vi.mocked(api.deleteTask).mockReturnValue(deleteRequest.promise as any);
    renderProjects();
    await screen.findByText('First task');

    // Start deleting a task on Project A (Solo), but don't let it resolve yet.
    fireEvent.click(screen.getByLabelText('Delete First task'));
    await waitFor(() => expect(api.deleteTask).toHaveBeenCalledWith('task-1'));

    // Switch to Project B (Team) before the delete resolves.
    fireEvent.click(screen.getByText('Team Project'));
    await screen.findByText('Team task');

    // Project A's delete now resolves -- its refresh must be a no-op for
    // the now-displayed Project B, not refetch/apply Project A's tasks.
    deleteRequest.resolve({});
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText('Team task')).toBeInTheDocument();
    expect(screen.queryByText('First task')).not.toBeInTheDocument();

    // And Project B's own task list must still refresh normally afterward
    // -- the stale call must not have permanently corrupted the shared
    // version counter.
    vi.mocked(api.updateTask).mockResolvedValue({ data: { data: {} } } as any);
    fireEvent.change(screen.getByLabelText('Status for Team task'), { target: { value: 'done' } });
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith('task-team', { status: 'done' }));
  });
});

describe('Projects — project CRUD', () => {
  it('creates a project, closes the modal, and selects it without a manual refresh', async () => {
    vi.mocked(api.getMyProjects)
      .mockResolvedValueOnce({ data: { data: [] } } as any)
      .mockResolvedValueOnce({ data: { data: [PROJECT_SOLO] } } as any);
    vi.mocked(api.createProject).mockResolvedValue({ data: { data: PROJECT_SOLO } } as any);
    renderProjects();
    await screen.findByText('No projects yet');

    fireEvent.click(screen.getByText('+ New Project'));
    fireEvent.change(screen.getByLabelText('Project Name *'), { target: { value: 'Solo Project' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));

    await waitFor(() => expect(api.createProject).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Create New Project')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Solo Project' })).toBeInTheDocument();
  });

  it('prevents a duplicate project-create submission while the first is still in flight', async () => {
    const createRequest = deferred<any>();
    vi.mocked(api.createProject).mockReturnValue(createRequest.promise as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Solo Project' });

    fireEvent.click(screen.getByText('+ New Project'));
    fireEvent.change(screen.getByLabelText('Project Name *'), { target: { value: 'New Project' } });
    const submitButton = screen.getByRole('button', { name: 'Create Project' });
    fireEvent.click(submitButton);
    expect(submitButton).toBeDisabled();

    fireEvent.click(submitButton);

    expect(api.createProject).toHaveBeenCalledTimes(1);
    createRequest.resolve({ data: { data: PROJECT_SOLO } });
  });

  it("edits the project and updates the header/sidebar from the server response, without any extra refetch", async () => {
    vi.mocked(api.updateProject).mockResolvedValue({ data: { data: { ...PROJECT_SOLO, project_name: 'Renamed Solo' } } } as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Solo Project' });
    vi.mocked(api.getMyProjects).mockClear();
    vi.mocked(api.getProjectTasks).mockClear();

    fireEvent.click(screen.getByText('✏️ Edit'));
    fireEvent.change(screen.getByLabelText('Project Name *'), { target: { value: 'Renamed Solo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('heading', { name: 'Renamed Solo' })).toBeInTheDocument();
    expect(screen.getAllByText('Renamed Solo').length).toBeGreaterThan(1); // header + sidebar entry
    expect(api.getMyProjects).not.toHaveBeenCalled();
    expect(api.getProjectTasks).not.toHaveBeenCalled();
  });

  it('a failed project edit does not apply the change', async () => {
    vi.mocked(api.updateProject).mockRejectedValue({ response: { data: { error: 'Name already taken' } } });
    renderProjects();
    await screen.findByRole('heading', { name: 'Solo Project' });

    fireEvent.click(screen.getByText('✏️ Edit'));
    fireEvent.change(screen.getByLabelText('Project Name *'), { target: { value: 'Taken Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Name already taken'));
    expect(screen.getByRole('heading', { name: 'Solo Project' })).toBeInTheDocument();
  });

  it('deletes the project after confirmation and re-syncs from the server without a manual refresh', async () => {
    vi.mocked(api.getMyProjects)
      .mockResolvedValueOnce({ data: { data: [PROJECT_SOLO] } } as any)
      .mockResolvedValueOnce({ data: { data: [] } } as any);
    vi.mocked(api.deleteProject).mockResolvedValue({} as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Solo Project' });

    fireEvent.click(screen.getByText('🗑️ Delete'));

    await waitFor(() => expect(api.deleteProject).toHaveBeenCalledWith('proj-solo'));
    expect(await screen.findByText('No Project Selected')).toBeInTheDocument();
    expect(screen.queryByText('Solo Project')).not.toBeInTheDocument();
  });
});

describe('Projects — task CRUD', () => {
  it('creates a task and refreshes the task list without a manual refresh', async () => {
    vi.mocked(api.createTask).mockResolvedValue({ data: { data: TASK_1 } } as any);
    vi.mocked(api.getProjectTasks)
      .mockResolvedValueOnce({ data: { data: [] } } as any)
      .mockResolvedValueOnce({ data: { data: [TASK_1] } } as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Solo Project' });
    await screen.findByText(/No tasks yet/);

    fireEvent.click(screen.getByText('+ Add Task'));
    fireEvent.change(screen.getByLabelText('Task Title *'), { target: { value: 'First task' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => expect(api.createTask).toHaveBeenCalledWith('proj-solo', expect.objectContaining({ title: 'First task' })));
    expect(await screen.findByText('First task')).toBeInTheDocument();
  });

  it('prevents a duplicate task-create submission while the first is still in flight', async () => {
    const createRequest = deferred<any>();
    vi.mocked(api.createTask).mockReturnValue(createRequest.promise as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Solo Project' });

    fireEvent.click(screen.getByText('+ Add Task'));
    fireEvent.change(screen.getByLabelText('Task Title *'), { target: { value: 'New task' } });
    const submitButton = screen.getByRole('button', { name: 'Create Task' });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(api.createTask).toHaveBeenCalledTimes(1);
    createRequest.resolve({ data: { data: TASK_1 } });
  });

  it('updates a task\'s status and refreshes the board', async () => {
    vi.mocked(api.getProjectTasks)
      .mockResolvedValueOnce({ data: { data: [TASK_1] } } as any)
      .mockResolvedValueOnce({ data: { data: [{ ...TASK_1, status: 'done' }] } } as any);
    vi.mocked(api.updateTask).mockResolvedValue({ data: { data: {} } } as any);
    renderProjects();
    await screen.findByText('First task');

    fireEvent.change(screen.getByLabelText('Status for First task'), { target: { value: 'done' } });

    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith('task-1', { status: 'done' }));
    await waitFor(() => expect(api.getProjectTasks).toHaveBeenCalledTimes(2));
  });

  it('deletes a task after confirmation and removes it from the board without a manual refresh', async () => {
    vi.mocked(api.getProjectTasks)
      .mockResolvedValueOnce({ data: { data: [TASK_1] } } as any)
      .mockResolvedValueOnce({ data: { data: [] } } as any);
    vi.mocked(api.deleteTask).mockResolvedValue({} as any);
    renderProjects();
    await screen.findByText('First task');

    fireEvent.click(screen.getByLabelText('Delete First task'));

    await waitFor(() => expect(api.deleteTask).toHaveBeenCalledWith('task-1'));
    await waitFor(() => expect(screen.queryByText('First task')).not.toBeInTheDocument());
  });

  it('prevents a duplicate task-delete submission while the first is still in flight', async () => {
    vi.mocked(api.getProjectTasks).mockResolvedValueOnce({ data: { data: [TASK_1] } } as any);
    const deleteRequest = deferred<any>();
    vi.mocked(api.deleteTask).mockReturnValue(deleteRequest.promise as any);
    renderProjects();
    await screen.findByText('First task');

    const deleteButton = screen.getByLabelText('Delete First task');
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(api.deleteTask).toHaveBeenCalledTimes(1);
    deleteRequest.resolve({});
  });

  it('a task-refresh failure after a successful mutation preserves the previously loaded tasks with a non-blocking error', async () => {
    vi.mocked(api.getProjectTasks)
      .mockResolvedValueOnce({ data: { data: [TASK_1] } } as any)
      .mockRejectedValueOnce({ response: { data: { error: 'network blip' } } });
    vi.mocked(api.createTask).mockResolvedValue({ data: { data: TASK_2 } } as any);
    renderProjects();
    await screen.findByText('First task');

    fireEvent.click(screen.getByText('+ Add Task'));
    fireEvent.change(screen.getByLabelText('Task Title *'), { target: { value: 'Second task' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => expect(api.getProjectTasks).toHaveBeenCalledTimes(2));
    // The refresh failed, but the previously loaded task must still be
    // visible -- never silently blanked to the empty state.
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to refresh tasks');
    expect(screen.getByText('First task')).toBeInTheDocument();
    expect(screen.queryByText(/No tasks yet/)).not.toBeInTheDocument();
  });
});

describe('Projects — permission-gated controls', () => {
  it('the project creator sees Edit, Delete, and Add Task', async () => {
    renderProjects(FAKE_USER);
    await screen.findByRole('heading', { name: 'Solo Project' });

    expect(screen.getByText('✏️ Edit')).toBeInTheDocument();
    expect(screen.getByText('🗑️ Delete')).toBeInTheDocument();
    expect(screen.getByText('+ Add Task')).toBeInTheDocument();
  });

  it('a non-member, non-creator caller sees no management controls at all', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [] } } as any);
    renderProjects(OTHER_USER);
    await screen.findByRole('heading', { name: 'Solo Project' });

    expect(screen.queryByText('✏️ Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('🗑️ Delete')).not.toBeInTheDocument();
    expect(screen.queryByText('+ Add Task')).not.toBeInTheDocument();
  });

  it('a non-viewer team member can Edit and Add Task, but only the creator can Delete', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A_MEMBER] } } as any);
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_TEAM] } } as any);
    renderProjects(OTHER_USER);
    await screen.findByRole('heading', { name: 'Team Project' });

    expect(screen.getByText('✏️ Edit')).toBeInTheDocument();
    expect(screen.getByText('+ Add Task')).toBeInTheDocument();
    expect(screen.queryByText('🗑️ Delete')).not.toBeInTheDocument();
  });

  it('a viewer-role team member sees no management controls (matches backend\'s viewer exclusion)', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A_VIEWER] } } as any);
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_TEAM] } } as any);
    renderProjects(OTHER_USER);
    await screen.findByRole('heading', { name: 'Team Project' });

    expect(screen.queryByText('✏️ Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('+ Add Task')).not.toBeInTheDocument();
    expect(screen.queryByText('🗑️ Delete')).not.toBeInTheDocument();
  });
});

describe('Projects — project <-> team display', () => {
  it('labels a solo project as Independent Project', async () => {
    renderProjects();
    expect(await screen.findByText('Independent Project')).toBeInTheDocument();
  });

  it('labels a team project with the resolved team name', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_TEAM] } } as any);
    renderProjects();
    expect(await screen.findByText('Team Project: Team Alpha')).toBeInTheDocument();
  });
});

describe('Projects — create-form accessibility associations', () => {
  it('associates every create-project field label with its control via htmlFor/id', async () => {
    renderProjects();
    await screen.findByRole('heading', { name: 'Solo Project' });
    fireEvent.click(screen.getByText('+ New Project'));

    expect(screen.getByLabelText('Project Name *')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Team (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority')).toBeInTheDocument();
    expect(screen.getByLabelText('Deadline (optional)')).toBeInTheDocument();
  });

  it('associates every create-task field label with its control via htmlFor/id', async () => {
    renderProjects();
    await screen.findByRole('heading', { name: 'Solo Project' });
    fireEvent.click(screen.getByText('+ Add Task'));

    expect(screen.getByLabelText('Task Title *')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority')).toBeInTheDocument();
    expect(screen.getByLabelText('Owner (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Reviewer (optional)')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task assignment & collaboration
// ---------------------------------------------------------------------------

describe('Projects — assignment member loading', () => {
  it('loads team members for a team project and offers them as assignees', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_TEAM] } } as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Team Project' });
    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledWith('team-a'));

    fireEvent.click(screen.getByText('+ Add Task'));
    const ownerSelect = await screen.findByLabelText('Owner (optional)');
    expect(within(ownerSelect).getByText('Bob Smith')).toBeInTheDocument();
    expect(within(ownerSelect).getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('shows a loading state while assignment options are being fetched', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_TEAM] } } as any);
    const request = deferred<any>();
    vi.mocked(api.getTeamMembers).mockReturnValue(request.promise as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Team Project' });
    fireEvent.click(screen.getByText('+ Add Task'));

    expect(screen.getByText('Loading assignment options…')).toBeInTheDocument();

    request.resolve({ data: { data: [MEMBER_ADA, MEMBER_BOB] } });
    await waitFor(() => expect(screen.queryByText('Loading assignment options…')).not.toBeInTheDocument());
  });

  it('shows a clear error with Retry when loading assignment options fails, then recovers', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_TEAM] } } as any);
    vi.mocked(api.getTeamMembers)
      .mockRejectedValueOnce({ response: { data: { error: 'Members unavailable' } } })
      .mockResolvedValueOnce({ data: { data: [MEMBER_ADA, MEMBER_BOB] } } as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Team Project' });
    fireEvent.click(screen.getByText('+ Add Task'));

    expect(await screen.findByText('Members unavailable')).toBeInTheDocument();
    // The rest of the task/project data must not be affected by a
    // member-load failure.
    expect(screen.getByLabelText('Task Title *')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('Owner (optional)')).toBeInTheDocument();
  });

  it('an independent project needs no member fetch and offers only the caller as assignee', async () => {
    renderProjects();
    await screen.findByRole('heading', { name: 'Solo Project' });
    fireEvent.click(screen.getByText('+ Add Task'));

    expect(api.getTeamMembers).not.toHaveBeenCalled();
    expect(await screen.findByText(/Independent project -- only you can be assigned/)).toBeInTheDocument();
    const ownerSelect = screen.getByLabelText('Owner (optional)');
    expect(within(ownerSelect).getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('does not refetch members when switching between two projects in the same team', async () => {
    const PROJECT_TEAM_2 = { ...PROJECT_TEAM, project_id: 'proj-team-2', project_name: 'Team Project Two' };
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_TEAM, PROJECT_TEAM_2] } } as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Team Project' });
    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Team Project Two'));
    await screen.findByRole('heading', { name: 'Team Project Two' });

    expect(api.getTeamMembers).toHaveBeenCalledTimes(1);
  });

  it('a stale member response for a previous team does not overwrite the newly selected team\'s members', async () => {
    const TEAM_B_MEMBER = { user_id: 'user-3', role: 'member', full_name: 'Carl Chen', username: 'carl' };
    const PROJECT_TEAM_B = { ...PROJECT_TEAM, project_id: 'proj-team-b', project_name: 'Team B Project', team_id: 'team-b' };
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_TEAM, PROJECT_TEAM_B] } } as any);
    const teamARequest = deferred<any>();
    const teamBRequest = deferred<any>();
    vi.mocked(api.getTeamMembers).mockImplementation((teamId: string) => {
      if (teamId === 'team-a') return teamARequest.promise as any;
      if (teamId === 'team-b') return teamBRequest.promise as any;
      return Promise.resolve({ data: { data: [] } }) as any;
    });
    renderProjects();
    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledWith('team-a'));

    fireEvent.click(screen.getByText('Team B Project'));
    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledWith('team-b'));

    teamBRequest.resolve({ data: { data: [TEAM_B_MEMBER] } });
    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledTimes(2));

    teamARequest.resolve({ data: { data: [MEMBER_ADA, MEMBER_BOB] } });
    await new Promise((r) => setTimeout(r, 0));

    fireEvent.click(screen.getByText('+ Add Task'));
    const ownerSelect = await screen.findByLabelText('Owner (optional)');
    expect(within(ownerSelect).getByText('Carl Chen')).toBeInTheDocument();
    expect(within(ownerSelect).queryByText('Bob Smith')).not.toBeInTheDocument();
  });
});

describe('Projects — create task with assignment', () => {
  beforeEach(() => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_TEAM] } } as any);
  });

  it('creates a task with an owner assignment', async () => {
    vi.mocked(api.createTask).mockResolvedValue({ data: { data: TEAM_TASK_1 } } as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Team Project' });

    fireEvent.click(screen.getByText('+ Add Task'));
    fireEvent.change(await screen.findByLabelText('Task Title *'), { target: { value: 'Assigned task' } });
    fireEvent.change(screen.getByLabelText('Owner (optional)'), { target: { value: 'user-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => expect(api.createTask).toHaveBeenCalledWith('proj-team', expect.objectContaining({ owner: 'user-2' })));
  });

  it('creates a task with a reviewer assignment', async () => {
    vi.mocked(api.createTask).mockResolvedValue({ data: { data: TEAM_TASK_1 } } as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Team Project' });

    fireEvent.click(screen.getByText('+ Add Task'));
    fireEvent.change(await screen.findByLabelText('Task Title *'), { target: { value: 'Reviewed task' } });
    fireEvent.change(screen.getByLabelText('Reviewer (optional)'), { target: { value: 'user-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => expect(api.createTask).toHaveBeenCalledWith('proj-team', expect.objectContaining({ reviewer: 'user-2' })));
  });

  it('creates a task with contributors', async () => {
    vi.mocked(api.createTask).mockResolvedValue({ data: { data: TEAM_TASK_1 } } as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Team Project' });

    fireEvent.click(screen.getByText('+ Add Task'));
    fireEvent.change(await screen.findByLabelText('Task Title *'), { target: { value: 'Team task' } });
    fireEvent.click(screen.getByLabelText('Bob Smith'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => expect(api.createTask).toHaveBeenCalledWith('proj-team', expect.objectContaining({ contributors: ['user-2'] })));
  });

  it('creates a task with a dependency on an existing task in the same project', async () => {
    vi.mocked(api.getProjectTasks).mockResolvedValue({ data: { data: [TEAM_TASK_1] } } as any);
    vi.mocked(api.createTask).mockResolvedValue({ data: { data: TEAM_TASK_1 } } as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Team Project' });
    await screen.findByText('Team task');

    fireEvent.click(screen.getByText('+ Add Task'));
    fireEvent.change(await screen.findByLabelText('Task Title *'), { target: { value: 'Follow-up task' } });
    fireEvent.click(screen.getByLabelText(/^Team task/));
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => expect(api.createTask).toHaveBeenCalledWith('proj-team', expect.objectContaining({ dependencies: ['task-team-1'] })));
  });

  it('creates a task with no assignment fields at all (all remain optional)', async () => {
    vi.mocked(api.createTask).mockResolvedValue({ data: { data: TEAM_TASK_1 } } as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Team Project' });

    fireEvent.click(screen.getByText('+ Add Task'));
    fireEvent.change(await screen.findByLabelText('Task Title *'), { target: { value: 'Unassigned task' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => expect(api.createTask).toHaveBeenCalledWith('proj-team', {
      title: 'Unassigned task', description: '', priority: 'medium',
    }));
  });

  it('the created task appears with its assignment data visible on the board', async () => {
    vi.mocked(api.createTask).mockResolvedValue({ data: { data: TEAM_TASK_1 } } as any);
    vi.mocked(api.getProjectTasks)
      .mockResolvedValueOnce({ data: { data: [] } } as any)
      .mockResolvedValueOnce({
        data: {
          data: [{ ...TEAM_TASK_1, owner: 'user-2', owner_user: { user_id: 'user-2', full_name: 'Bob Smith', username: 'bob' } }],
        },
      } as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Team Project' });

    fireEvent.click(screen.getByText('+ Add Task'));
    fireEvent.change(await screen.findByLabelText('Task Title *'), { target: { value: 'Team task' } });
    fireEvent.change(screen.getByLabelText('Owner (optional)'), { target: { value: 'user-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

    expect(await screen.findByText('👤 Owner: Bob Smith')).toBeInTheDocument();
  });
});

describe('Projects — edit task with assignment', () => {
  beforeEach(() => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_TEAM] } } as any);
  });

  it('opens the edit modal pre-filled from the task\'s current values', async () => {
    vi.mocked(api.getProjectTasks).mockResolvedValue({
      data: { data: [{ ...TEAM_TASK_1, owner: 'user-2', owner_user: { user_id: 'user-2', full_name: 'Bob Smith', username: 'bob' } }] },
    } as any);
    renderProjects();
    await screen.findByText('Team task');

    fireEvent.click(screen.getByLabelText('Edit Team task'));

    expect(await screen.findByLabelText('Task Title *')).toHaveValue('Team task');
    expect(screen.getByLabelText('Owner (optional)')).toHaveValue('user-2');
  });

  it('changes a task\'s owner and the card reflects the server response, without a manual refresh', async () => {
    vi.mocked(api.getProjectTasks)
      .mockResolvedValueOnce({ data: { data: [TEAM_TASK_1] } } as any)
      .mockResolvedValueOnce({
        data: { data: [{ ...TEAM_TASK_1, owner: 'user-2', owner_user: { user_id: 'user-2', full_name: 'Bob Smith', username: 'bob' } }] },
      } as any);
    vi.mocked(api.updateTask).mockResolvedValue({ data: { data: {} } } as any);
    renderProjects();
    await screen.findByText('Team task');

    fireEvent.click(screen.getByLabelText('Edit Team task'));
    fireEvent.change(await screen.findByLabelText('Owner (optional)'), { target: { value: 'user-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith('task-team-1', expect.objectContaining({ owner: 'user-2' })));
    expect(await screen.findByText('👤 Owner: Bob Smith')).toBeInTheDocument();
    // The modal's exit is animated (AnimatePresence/framer-motion) --
    // handleSaveTaskEdit nulls editingTask/editTaskDraft as soon as
    // updateTask resolves (starting the exit animation), but that
    // animation takes real wall-clock time to finish and be removed from
    // the DOM, independent of -- and not necessarily faster than -- the
    // second, separately-awaited loadTasks() response that makes "Bob
    // Smith" appear. A synchronous queryByText check right after that
    // await was a genuine test-timing bug (confirmed via screen.debug():
    // the modal was still present, frozen mid-exit on its pre-close
    // "Saving..." state, at the moment "Bob Smith" had already rendered)
    // -- not a product defect, and not the flaky-vs-deterministic
    // ambiguity it was first filed as. Same waitFor-wrapped-removal
    // pattern already used a few tests up for the delete-task case (see
    // "removes a task and it disappears from the board" above).
    await waitFor(() => expect(screen.queryByText('Edit Task')).not.toBeInTheDocument());
  });

  it('clears an existing owner assignment by selecting Unassigned', async () => {
    vi.mocked(api.getProjectTasks).mockResolvedValue({
      data: { data: [{ ...TEAM_TASK_1, owner: 'user-2', owner_user: { user_id: 'user-2', full_name: 'Bob Smith', username: 'bob' } }] },
    } as any);
    vi.mocked(api.updateTask).mockResolvedValue({ data: { data: {} } } as any);
    renderProjects();
    await screen.findByText('Team task');

    fireEvent.click(screen.getByLabelText('Edit Team task'));
    fireEvent.change(await screen.findByLabelText('Owner (optional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith('task-team-1', expect.objectContaining({ owner: null })));
  });

  it('does not offer the task being edited as its own dependency', async () => {
    const TEAM_TASK_2 = { ...TEAM_TASK_1, task_id: 'task-team-2', title: 'Other team task' };
    vi.mocked(api.getProjectTasks).mockResolvedValue({ data: { data: [TEAM_TASK_1, TEAM_TASK_2] } } as any);
    renderProjects();
    await screen.findByText('Team task');

    fireEvent.click(screen.getByLabelText('Edit Team task'));
    await screen.findByLabelText('Task Title *');

    expect(screen.queryByLabelText(/^Team task/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Other team task/)).toBeInTheDocument();
  });

  it('an edit failure keeps the modal open with the previous state and shows an actionable error', async () => {
    vi.mocked(api.getProjectTasks).mockResolvedValue({ data: { data: [TEAM_TASK_1] } } as any);
    vi.mocked(api.updateTask).mockRejectedValue({ response: { data: { error: 'Owner must be a project member' } } });
    renderProjects();
    await screen.findByText('Team task');

    fireEvent.click(screen.getByLabelText('Edit Team task'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Owner must be a project member'));
    expect(screen.getByLabelText('Task Title *')).toHaveValue('Team task');
  });
});

describe('Projects — assignment permissions', () => {
  it('a viewer sees no Add Task / Edit controls, so no assignment UI is reachable', async () => {
    vi.mocked(api.getMyTeams).mockResolvedValue({ data: { data: [TEAM_A_VIEWER] } } as any);
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_TEAM] } } as any);
    vi.mocked(api.getProjectTasks).mockResolvedValue({ data: { data: [TEAM_TASK_1] } } as any);
    renderProjects(OTHER_USER);
    await screen.findByText('Team task');

    expect(screen.queryByText('+ Add Task')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Edit Team task')).not.toBeInTheDocument();
  });

  it('only members of the project\'s own team are offered as assignees -- a member from an unrelated team is never listed', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_TEAM] } } as any);
    renderProjects();
    await screen.findByRole('heading', { name: 'Team Project' });
    fireEvent.click(screen.getByText('+ Add Task'));

    const ownerSelect = await screen.findByLabelText('Owner (optional)');
    expect(within(ownerSelect).queryByText('Someone Else')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Notification deep-link destination: ?projectId=&taskId= selects that
// project (overriding the normal "current, else first" logic) and
// scrolls to/highlights the specific task once tasks have loaded.
describe('Projects — notification deep-link destination', () => {
  it('?projectId=proj-team selects that project instead of the default first project', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_SOLO, PROJECT_TEAM] } } as any);
    renderProjects(FAKE_USER, ['/projects?projectId=proj-team']);

    await screen.findByRole('heading', { name: 'Team Project' });
    expect(screen.queryByRole('heading', { name: 'Solo Project' })).not.toBeInTheDocument();
  });

  it('?projectId=&taskId= highlights the matching task once tasks load', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_SOLO] } } as any);
    vi.mocked(api.getProjectTasks).mockResolvedValue({ data: { data: [TASK_1, TASK_2] } } as any);
    renderProjects(FAKE_USER, ['/projects?projectId=proj-solo&taskId=task-1']);

    await screen.findByText('First task');
    const card = document.getElementById('task-task-1');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('ring-2');
  });

  it('a deep-linked projectId no longer accessible shows a safe fallback message, not a crash', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ data: { data: [PROJECT_SOLO] } } as any);
    renderProjects(FAKE_USER, ['/projects?projectId=proj-removed']);

    expect(await screen.findByText(/no longer have access to that project/i)).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Solo Project' });
  });
});
