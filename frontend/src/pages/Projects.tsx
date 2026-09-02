import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useRealtime, type RealtimeEvent } from '../hooks/useRealtime';
import * as api from '../services/api';

export default function Projects() {
  const { user } = useAuth();
  // Notification deep-linking: ?projectId=&taskId= selects that project
  // (overriding the normal "keep current, else first" logic) and scrolls
  // to/highlights the specific task once its tasks have loaded. Tracked
  // by last-processed value (not a one-shot boolean) so a second,
  // different notification click while already on /projects -- same
  // route, no remount -- is still processed.
  const [searchParams, setSearchParams] = useSearchParams();
  const lastProcessedProjectDeepLink = useRef<string | null>(null);
  const lastScrolledTaskId = useRef<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [projectDeepLinkError, setProjectDeepLinkError] = useState('');
  const [taskDeepLinkError, setTaskDeepLinkError] = useState('');

  const [projects, setProjects] = useState<any[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsLoadedOnce, setProjectsLoadedOnce] = useState(false);
  const [projectsError, setProjectsError] = useState('');

  const [teams, setTeams] = useState<any[]>([]);

  // Projects UX + reliability pass: selection is tracked by ID only, and
  // the selected project object is DERIVED from the current `projects`
  // array -- this is what makes edit/delete mutation responses become
  // authoritative automatically (patch `projects`, selectedProject
  // reflects it on the next render) without a second, separate
  // "selectedProject" object to keep in sync.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const selectedProject = projects.find((p) => p.project_id === selectedProjectId) || null;
  // Mutation-race fix: every task mutation handler (create/update-status/
  // edit/delete) closes over `selectedProject` from the render it was
  // DEFINED in -- if the user switches projects while that mutation's
  // request is still in flight, the handler's own closure is stale by
  // the time it resolves and calls loadTasks(). A plain ref (updated
  // every render, same pattern as SOSHub.tsx's selectedTeamRef) gives
  // loadTasks() a way to check the TRUE current selection regardless of
  // which render's closure triggered it.
  const selectedProjectIdRef = useRef<string | null>(null);
  selectedProjectIdRef.current = selectedProjectId;

  const [tasks, setTasks] = useState<any[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksLoadedOnce, setTasksLoadedOnce] = useState(false);
  const [tasksError, setTasksError] = useState('');

  // Task assignment & collaboration: candidate assignees for the
  // SELECTED PROJECT's team. Sourced from GET /teams/:teamId/members
  // (already exists, already used by Teams.tsx, already gated by
  // requireTeamMembership -- the same-or-stricter rule canAccessProject
  // itself relies on) rather than any new "all users" endpoint. Keyed on
  // the project's team_id (not project_id) so switching between two
  // projects that share the same team reuses the already-loaded list
  // instead of refetching it.
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersLoadedOnce, setMembersLoadedOnce] = useState(false);
  const [membersError, setMembersError] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);

  // Duplicate-submission guards -- one per independent mutation, not a
  // single shared `loading` flag, so an in-flight create-project can't
  // disable an unrelated task-status control and vice versa.
  const [creatingProject, setCreatingProject] = useState(false);
  const [savingProjectEdit, setSavingProjectEdit] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [analyzingProject, setAnalyzingProject] = useState(false);
  const [creatingFromAI, setCreatingFromAI] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [savingTaskEdit, setSavingTaskEdit] = useState(false);

  const [aiAnalysis, setAiAnalysis] = useState<any>(null);

  const [newProject, setNewProject] = useState({
    projectName: '',
    description: '',
    teamId: '',
    priority: 'medium',
    deadline: '',
    isPublic: true,
  });

  const [editProjectDraft, setEditProjectDraft] = useState<{
    project_name: string;
    description: string;
    team_id: string;
    priority: string;
    status: string;
    deadline: string;
    is_public: boolean;
  } | null>(null);

  const [aiInput, setAiInput] = useState({
    projectName: '',
    description: '',
    requirements: '',
  });

  const emptyTaskDraft = {
    title: '',
    description: '',
    priority: 'medium',
    owner: '',
    reviewer: '',
    contributors: [] as string[],
    dependencies: [] as string[],
  };
  const [newTask, setNewTask] = useState(emptyTaskDraft);

  // Task edit: the task being edited (for self-dependency exclusion and
  // defaults) plus a SEPARATE draft -- same server-truth-sync reasoning
  // as editProjectDraft: typing must never mutate the confirmed task
  // card, and a failed save must not leave an unconfirmed edit visible.
  const [editingTask, setEditingTask] = useState<any>(null);
  const [editTaskDraft, setEditTaskDraft] = useState<typeof emptyTaskDraft & { status: string } | null>(null);

  // Stale-response/race-protection refs -- same version-token pattern
  // already proven in Teams.tsx/Goals.tsx/SOSHub.tsx, one per independent
  // async resource (projects, tasks, members) so a stale response from a
  // previous selection can never overwrite a newer one.
  const loadProjectsVersion = useRef(0);
  const loadTasksVersion = useRef(0);
  const loadMembersVersion = useRef(0);

  useEffect(() => {
    loadProjects();
    loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Context switch: clear the previous project's tasks immediately so
    // Project A's tasks can never render under Project B's header, even
    // for one frame, and mark "not loaded yet" for the new selection so
    // the blocking loading state is correct for a genuine first load of
    // this project's tasks (as opposed to a same-project background
    // refresh after a mutation, which must NOT blank the board -- see
    // loadTasks()).
    setTasks([]);
    setTasksError('');
    setTasksLoadedOnce(false);
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  // Notification deep-link: reacts to `searchParams` itself, not just
  // mount -- clicking a Projects notification while already on /projects
  // (same route, only the query string changes) does not remount this
  // component. Waits for `projects` to actually be populated (covers the
  // fresh-page-load case where the param is present before
  // getMyProjects() resolves).
  useEffect(() => {
    const projectId = searchParams.get('projectId');
    if (!projectId || projectId === lastProcessedProjectDeepLink.current || projects.length === 0) return;
    lastProcessedProjectDeepLink.current = projectId;
    const target = projects.find((p: any) => p.project_id === projectId);
    if (target) {
      setProjectDeepLinkError('');
      setSelectedProjectId(target.project_id);
      const taskId = searchParams.get('taskId');
      if (taskId) {
        setTaskDeepLinkError('');
        setHighlightedTaskId(taskId);
      }
    } else {
      setProjectDeepLinkError("You no longer have access to that project, or it doesn't exist.");
      setSelectedProjectId((current) => {
        if (current && projects.some((p: any) => p.project_id === current)) return current;
        return projects[0]?.project_id ?? null;
      });
    }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, projects]);

  // Deep-linked task: scroll to / confirm it once this project's tasks
  // have actually finished loading. Keyed on the task ID itself (not a
  // one-shot boolean) so a second, different deep-linked task is still
  // scrolled to, while a same-project mutation refresh for the SAME
  // already-scrolled task doesn't re-scroll the board.
  useEffect(() => {
    if (!highlightedTaskId || highlightedTaskId === lastScrolledTaskId.current || !tasksLoadedOnce) return;
    lastScrolledTaskId.current = highlightedTaskId;
    const found = tasks.some((t) => t.task_id === highlightedTaskId);
    if (!found) {
      setTaskDeepLinkError("That task is no longer available, or you don't have access to it.");
      return;
    }
    const el = document.getElementById(`task-${highlightedTaskId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedTaskId, tasksLoadedOnce, tasks]);

  useEffect(() => {
    // Member list is TEAM-scoped, not project-scoped -- keyed on team_id
    // so switching between two projects under the same team does not
    // refetch, but switching to a different team (or an independent
    // project) does, with the same context-switch clear pattern as tasks.
    setMembers([]);
    setMembersError('');
    setMembersLoadedOnce(false);
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.team_id]);

  useRealtime((event: RealtimeEvent) => {
    // Task realtime events: refresh the currently-selected project's tasks.
    // The event carries only teamId; the frontend maintains task state
    // locally and refetches on demand to get authoritative updates.
    if (!event.type.startsWith('task.') && event.type !== 'blocker.created' && event.type !== 'blocker.resolved') return;
    if (!selectedProjectIdRef.current) return;

    loadTasks();
  });

  const loadProjects = async () => {
    const requestVersion = ++loadProjectsVersion.current;
    setProjectsLoading(true);
    setProjectsError('');
    try {
      const response = await api.getMyProjects();
      if (loadProjectsVersion.current !== requestVersion) return;
      const data = response.data.data;
      setProjects(data);
      setProjectsLoadedOnce(true);

      // Default-select is skipped when a projectId deep link is currently
      // pending -- the dedicated deep-link effect below owns selection in
      // that case, so this doesn't race it and briefly select the wrong
      // project.
      if (!searchParams.get('projectId')) {
        setSelectedProjectId((current) => {
          if (current && data.some((p: any) => p.project_id === current)) return current;
          return data[0]?.project_id ?? null;
        });
      }
    } catch (error: any) {
      if (loadProjectsVersion.current !== requestVersion) return;
      console.error('Failed to load projects:', error);
      setProjectsError(error.response?.data?.error || 'Failed to load projects. Please try again.');
    } finally {
      if (loadProjectsVersion.current === requestVersion) setProjectsLoading(false);
    }
  };

  const loadTeams = async () => {
    try {
      const response = await api.getMyTeams();
      setTeams(response.data.data);
    } catch (error) {
      console.error('Failed to load teams:', error);
    }
  };

  // The ONE authoritative task-loading path -- called by the
  // selection-change effect above (project switch / initial auto-select)
  // AND directly by every task mutation handler below (create/update/
  // delete) for a same-project refresh. Deliberately does not clear
  // `tasks`/reset `tasksLoadedOnce` itself -- a same-project refresh must
  // preserve the currently-visible tasks and avoid the blocking spinner.
  // `projectIdOverride` lets a mutation handler tell loadTasks() exactly
  // which project it operated on (the value from ITS OWN render's
  // closure -- genuinely correct data, not a bug in itself). What
  // matters is that loadTasks() then validates that ID against the LIVE
  // selection (selectedProjectIdRef, not a closure) before ever fetching
  // or applying anything -- a mutation's refresh for a project the user
  // has since switched away from becomes a safe no-op instead of
  // silently corrupting the now-displayed project's task list or its
  // shared version counter.
  const loadTasks = async (projectIdOverride?: string) => {
    const projectId = projectIdOverride ?? selectedProjectIdRef.current;
    if (!projectId) {
      setTasksLoading(false);
      return;
    }
    if (projectId !== selectedProjectIdRef.current) return;

    const requestVersion = ++loadTasksVersion.current;
    setTasksLoading(true);
    setTasksError('');
    try {
      const response = await api.getProjectTasks(projectId);
      if (loadTasksVersion.current !== requestVersion || projectId !== selectedProjectIdRef.current) return;
      setTasks(response.data.data);
      setTasksLoadedOnce(true);
    } catch (error: any) {
      if (loadTasksVersion.current !== requestVersion || projectId !== selectedProjectIdRef.current) return;
      console.error('Failed to load tasks:', error);
      setTasksError(error.response?.data?.error || 'Failed to load tasks. Please try again.');
    } finally {
      if (loadTasksVersion.current === requestVersion) setTasksLoading(false);
    }
  };

  // The ONE authoritative member-loading path, mirroring loadTasks()'s
  // shape exactly. An independent project (no team_id) has no fetch to
  // perform at all -- canAccessProject/canWriteProject can never match
  // anyone but the creator when team_id is null, so there is no backend-
  // valid "other assignee" to look up.
  const loadMembers = async () => {
    const teamId = selectedProject?.team_id;
    const requestVersion = ++loadMembersVersion.current;
    if (!teamId) {
      setMembersLoading(false);
      setMembersLoadedOnce(true);
      return;
    }
    setMembersLoading(true);
    setMembersError('');
    try {
      const response = await api.getTeamMembers(teamId);
      if (loadMembersVersion.current !== requestVersion) return;
      setMembers(response.data.data);
      setMembersLoadedOnce(true);
    } catch (error: any) {
      if (loadMembersVersion.current !== requestVersion) return;
      console.error('Failed to load team members:', error);
      setMembersError(error.response?.data?.error || 'Failed to load assignment options. Please try again.');
    } finally {
      if (loadMembersVersion.current === requestVersion) setMembersLoading(false);
    }
  };

  const selectProject = (project: any) => {
    if (project.project_id === selectedProjectId) return;
    setSelectedProjectId(project.project_id);
    setTasks([]);
    setTasksError('');
    setTasksLoadedOnce(false);
  };

  // ---------------------------------------------------------------------
  // Permissions -- mirrors the backend exactly (canWriteProject /
  // isProjectCreator in projects.repository.ts), using data already
  // fetched (getMyTeams already returns the caller's own role per team as
  // `my_role` -- no extra request needed). The backend remains
  // authoritative regardless; this only controls whether a control that
  // the backend would reject is shown at all.
  // ---------------------------------------------------------------------
  const isProjectCreator = !!selectedProject && !!user && selectedProject.created_by === user.user_id;
  const myRoleInProjectTeam = selectedProject?.team_id
    ? teams.find((t) => t.team_id === selectedProject.team_id)?.my_role
    : null;
  const canWriteProject = isProjectCreator || (!!myRoleInProjectTeam && myRoleInProjectTeam !== 'viewer');
  const canDeleteProject = isProjectCreator;

  // Assignable users for the CURRENTLY SELECTED project -- the single
  // source of truth every assignment control (owner/reviewer/
  // contributors, in both the create and edit task forms) reads from.
  // Team project: the team roster already loaded. Independent project:
  // only the creator (the current user, since only the creator can even
  // reach a write-gated control on an independent project) -- never an
  // arbitrary/unrestricted user list.
  const assignableUsers = selectedProject?.team_id
    ? members
    : selectedProject && user
      ? [{ user_id: user.user_id, full_name: user.full_name || 'You', username: user.username || '' }]
      : [];

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingProject) return;
    setCreatingProject(true);
    try {
      const response = await api.createProject(newProject);
      const created = response.data.data;
      setShowCreateModal(false);
      setNewProject({ projectName: '', description: '', teamId: '', priority: 'medium', deadline: '', isPublic: true });
      await loadProjects();
      setSelectedProjectId(created.project_id);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const openEditModal = () => {
    if (!selectedProject) return;
    setEditProjectDraft({
      project_name: selectedProject.project_name,
      description: selectedProject.description || '',
      team_id: selectedProject.team_id || '',
      priority: selectedProject.priority || 'medium',
      status: selectedProject.status || 'planning',
      deadline: selectedProject.deadline ? String(selectedProject.deadline).slice(0, 10) : '',
      is_public: selectedProject.is_public !== false,
    });
    setShowEditModal(true);
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !editProjectDraft || savingProjectEdit) return;
    setSavingProjectEdit(true);
    try {
      const payload: Record<string, any> = {
        project_name: editProjectDraft.project_name,
        description: editProjectDraft.description,
        team_id: editProjectDraft.team_id || null,
        priority: editProjectDraft.priority,
        status: editProjectDraft.status,
        is_public: editProjectDraft.is_public,
      };
      if (editProjectDraft.deadline) payload.deadline = editProjectDraft.deadline;

      const response = await api.updateProject(selectedProject.project_id, payload);
      const updated = response.data.data;
      setShowEditModal(false);
      setEditProjectDraft(null);
      setProjects((prev) => prev.map((p) => (p.project_id === updated.project_id ? updated : p)));
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update project');
    } finally {
      setSavingProjectEdit(false);
    }
  };

  const handleAIAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (analyzingProject) return;
    setAnalyzingProject(true);
    try {
      const response = await api.analyzeProject(aiInput);
      setAiAnalysis(response.data.data);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to analyze project');
    } finally {
      setAnalyzingProject(false);
    }
  };

  const handleCreateFromAI = async () => {
    if (creatingFromAI) return;
    setCreatingFromAI(true);
    try {
      const projectRes = await api.createProject({
        projectName: aiInput.projectName,
        description: aiInput.description,
        priority: 'medium',
      });
      const projectId = projectRes.data.data.project_id;

      for (const task of aiAnalysis.suggested_tasks) {
        await api.createTask(projectId, {
          title: task.title,
          description: task.description,
          priority: task.priority,
        });
      }

      setShowAIModal(false);
      setAiAnalysis(null);
      setAiInput({ projectName: '', description: '', requirements: '' });
      await loadProjects();
      setSelectedProjectId(projectId);
      alert('Project created with AI-generated tasks!');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create project');
    } finally {
      setCreatingFromAI(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || creatingTask) return;
    const projectId = selectedProject.project_id;
    setCreatingTask(true);
    try {
      const payload: Record<string, any> = {
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
      };
      // createTaskSchema's owner/reviewer/contributors/dependencies are
      // all .optional() (not .nullable()) -- omit the key entirely when
      // unselected rather than sending an empty string/array.
      if (newTask.owner) payload.owner = newTask.owner;
      if (newTask.reviewer) payload.reviewer = newTask.reviewer;
      if (newTask.contributors.length > 0) payload.contributors = newTask.contributors;
      if (newTask.dependencies.length > 0) payload.dependencies = newTask.dependencies;

      await api.createTask(projectId, payload);
      setShowTaskModal(false);
      setNewTask(emptyTaskDraft);
      await loadTasks(projectId);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create task');
    } finally {
      setCreatingTask(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
    if (updatingTaskId) return;
    const projectId = selectedProject?.project_id;
    setUpdatingTaskId(taskId);
    try {
      await api.updateTask(taskId, { status });
      await loadTasks(projectId);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update task');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const openEditTaskModal = (task: any) => {
    setEditingTask(task);
    setEditTaskDraft({
      title: task.title,
      description: task.description || '',
      priority: task.priority || 'medium',
      status: task.status || 'todo',
      owner: task.owner || '',
      reviewer: task.reviewer || '',
      contributors: Array.isArray(task.contributors) ? task.contributors : [],
      dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
    });
  };

  const handleSaveTaskEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTaskDraft || savingTaskEdit) return;
    const projectId = selectedProject?.project_id;
    setSavingTaskEdit(true);
    try {
      // updateTaskSchema's owner/reviewer ARE .nullable() (unlike create)
      // -- an explicit null correctly clears a previous assignment,
      // rather than the field being silently omitted and left unchanged.
      await api.updateTask(editingTask.task_id, {
        title: editTaskDraft.title,
        description: editTaskDraft.description,
        owner: editTaskDraft.owner || null,
        reviewer: editTaskDraft.reviewer || null,
        contributors: editTaskDraft.contributors,
        dependencies: editTaskDraft.dependencies,
        status: editTaskDraft.status,
        priority: editTaskDraft.priority,
      });
      setEditingTask(null);
      setEditTaskDraft(null);
      // Server response for a single PUT is the raw row, not the
      // owner_user/contributor_users/dependency_tasks-enriched shape
      // GET /projects/:id/tasks returns -- loadTasks() is what makes the
      // task card's assignment chips/labels reflect server truth
      // immediately, not a hand-reconstructed guess.
      await loadTasks(projectId);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update task');
    } finally {
      setSavingTaskEdit(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (deletingTaskId) return;
    if (!confirm('Delete this task?')) return;
    const projectId = selectedProject?.project_id;
    setDeletingTaskId(taskId);
    try {
      await api.deleteTask(taskId);
      if (editingTask?.task_id === taskId) {
        setEditingTask(null);
        setEditTaskDraft(null);
      }
      await loadTasks(projectId);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete task');
    } finally {
      setDeletingTaskId(null);
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProject || deletingProject) return;
    if (!confirm('Delete this project and all its tasks? This cannot be undone.')) return;
    setDeletingProject(true);
    try {
      await api.deleteProject(selectedProject.project_id);
      await loadProjects();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete project');
    } finally {
      setDeletingProject(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: any = {
      planning: 'gray', active: 'blue', completed: 'green', on_hold: 'yellow',
      todo: 'gray', in_progress: 'blue', review: 'yellow', done: 'green',
    };
    return colors[status] || 'gray';
  };

  const getPriorityColor = (priority: string) => {
    const colors: any = { low: 'green', medium: 'yellow', high: 'red' };
    return colors[priority] || 'gray';
  };

  const tasksByStatus = {
    todo: tasks.filter(t => t.status === 'todo'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    review: tasks.filter(t => t.status === 'review'),
    done: tasks.filter(t => t.status === 'done'),
  };

  const selectedProjectTeam = selectedProject?.team_id
    ? teams.find((t) => t.team_id === selectedProject.team_id)
    : null;

  const toggleArrayValue = (arr: string[], value: string) =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  // Shared assignment-fields block: Owner/Reviewer selects + Contributors/
  // Dependencies checkbox groups. Used by BOTH the create-task and
  // edit-task forms so the two never drift out of sync. `excludeTaskId`
  // prevents a task from listing itself as a dependency candidate.
  const renderAssignmentFields = <T extends typeof emptyTaskDraft>(
    draft: T,
    setDraft: (updater: (d: T) => T) => void,
    idPrefix: string,
    excludeTaskId?: string
  ) => (
    <>
      {membersLoading && !membersLoadedOnce ? (
        <p className="text-xs text-gray-500">Loading assignment options…</p>
      ) : !membersLoadedOnce && !!membersError ? (
        <div role="alert" className="text-xs text-red-600">
          {membersError}{' '}
          <button type="button" onClick={loadMembers} className="underline">Retry</button>
        </div>
      ) : (
        <>
          {!selectedProject?.team_id && (
            <p className="text-xs text-gray-500">Independent project -- only you can be assigned.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${idPrefix}-owner`} className="block text-sm font-medium text-gray-700 mb-2">Owner (optional)</label>
              <select
                id={`${idPrefix}-owner`}
                value={draft.owner}
                onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
                className="input-field"
              >
                <option value="">Unassigned</option>
                {assignableUsers.map((u: any) => (
                  <option key={u.user_id} value={u.user_id}>{u.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${idPrefix}-reviewer`} className="block text-sm font-medium text-gray-700 mb-2">Reviewer (optional)</label>
              <select
                id={`${idPrefix}-reviewer`}
                value={draft.reviewer}
                onChange={(e) => setDraft((d) => ({ ...d, reviewer: e.target.value }))}
                className="input-field"
              >
                <option value="">Unassigned</option>
                {assignableUsers.map((u: any) => (
                  <option key={u.user_id} value={u.user_id}>{u.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          {assignableUsers.length > 0 && (
            <fieldset className="border border-gray-200 rounded-lg p-3">
              <legend className="text-sm font-medium text-gray-700 px-1">Contributors (optional)</legend>
              <div className="max-h-28 overflow-y-auto space-y-1">
                {assignableUsers.map((u: any) => (
                  <label key={u.user_id} htmlFor={`${idPrefix}-contributor-${u.user_id}`} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      id={`${idPrefix}-contributor-${u.user_id}`}
                      type="checkbox"
                      checked={draft.contributors.includes(u.user_id)}
                      onChange={() => setDraft((d) => ({ ...d, contributors: toggleArrayValue(d.contributors, u.user_id) }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    {u.full_name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}

      {tasks.filter((t) => t.task_id !== excludeTaskId).length > 0 && (
        <fieldset className="border border-gray-200 rounded-lg p-3">
          <legend className="text-sm font-medium text-gray-700 px-1">Depends on (optional)</legend>
          <div className="max-h-28 overflow-y-auto space-y-1">
            {tasks.filter((t) => t.task_id !== excludeTaskId).map((t) => (
              <label key={t.task_id} htmlFor={`${idPrefix}-dependency-${t.task_id}`} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  id={`${idPrefix}-dependency-${t.task_id}`}
                  type="checkbox"
                  checked={draft.dependencies.includes(t.task_id)}
                  onChange={() => setDraft((d) => ({ ...d, dependencies: toggleArrayValue(d.dependencies, t.task_id) }))}
                  className="w-4 h-4 text-blue-600"
                />
                {t.title} <span className="text-gray-400">({t.status})</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
              <p className="text-gray-600 mt-1">Manage your projects and tasks</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAIModal(true)} className="btn-secondary">
                🤖 AI Project Setup
              </button>
              <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                + New Project
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {(projectDeepLinkError || taskDeepLinkError) && (
          <div role="alert" className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm flex items-center justify-between">
            <span>{projectDeepLinkError || taskDeepLinkError}</span>
            <button
              type="button"
              onClick={() => { setProjectDeepLinkError(''); setTaskDeepLinkError(''); }}
              className="text-yellow-700 hover:text-yellow-900 text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="pro-card p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Your Projects ({projects.length})</h2>
              {projectsLoading && !projectsLoadedOnce ? (
                <div role="status" className="text-center text-gray-500 py-4 text-sm">
                  <div className="spinner w-5 h-5 mx-auto mb-2"></div>
                  Loading projects...
                </div>
              ) : !projectsLoadedOnce && !!projectsError ? (
                <div role="alert" className="text-center py-4">
                  <p className="text-red-600 text-sm mb-2">{projectsError}</p>
                  <button type="button" onClick={loadProjects} className="btn-secondary text-xs">Retry</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {projectsLoadedOnce && !!projectsError && (
                    <div role="alert" className="p-2 mb-2 bg-red-50 border border-red-200 rounded text-red-800 text-xs text-center">
                      Failed to refresh projects. Showing the last known results.
                      <button type="button" onClick={loadProjects} className="underline ml-1">Retry</button>
                    </div>
                  )}
                  {projects.map((project) => (
                    <button
                      key={project.project_id}
                      onClick={() => selectProject(project)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        selectedProject?.project_id === project.project_id
                          ? 'bg-blue-50 border-2 border-blue-500'
                          : 'hover:bg-gray-50 border-2 border-transparent'
                      }`}
                    >
                      <div className="font-medium text-gray-900">{project.project_name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`badge badge-${getStatusColor(project.status)} text-xs`}>
                          {project.status}
                        </span>
                        <span className={`badge badge-${getPriorityColor(project.priority)} text-xs`}>
                          {project.priority}
                        </span>
                      </div>
                    </button>
                  ))}
                  {projects.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-8">No projects yet</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-3">
            {projectsLoading && !projectsLoadedOnce ? (
              <div role="status" className="pro-card p-12 text-center text-gray-500">
                <div className="spinner w-8 h-8 mx-auto mb-4"></div>
                Loading projects...
              </div>
            ) : !projectsLoadedOnce && !!projectsError ? (
              <div role="alert" className="pro-card p-12 text-center">
                <p className="text-red-600 mb-4">{projectsError}</p>
                <button type="button" onClick={loadProjects} className="btn-secondary">Retry</button>
              </div>
            ) : selectedProject ? (
              <div className="space-y-6">
                <div className="pro-card p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-gray-900">{selectedProject.project_name}</h2>
                      <p className="text-gray-600 mt-2">{selectedProject.description}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {selectedProject.team_id
                          ? `Team Project${selectedProjectTeam ? `: ${selectedProjectTeam.team_name}` : ''}`
                          : 'Independent Project'}
                      </p>
                      <div className="flex items-center gap-3 mt-4">
                        <span className={`badge badge-${getStatusColor(selectedProject.status)}`}>
                          {selectedProject.status}
                        </span>
                        <span className={`badge badge-${getPriorityColor(selectedProject.priority)}`}>
                          {selectedProject.priority} priority
                        </span>
                        <span className={`badge ${selectedProject.is_public ? 'badge-green' : 'badge-gray'}`}>
                          {selectedProject.is_public ? '🌐 Public' : '🔒 Private'}
                        </span>
                        {selectedProject.deadline && (
                          <span className="text-sm text-gray-500">
                            📅 {new Date(selectedProject.deadline).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {canWriteProject && (
                        <button onClick={() => setShowTaskModal(true)} className="btn-primary">
                          + Add Task
                        </button>
                      )}
                      {canWriteProject && (
                        <button onClick={openEditModal} className="btn-secondary">
                          ✏️ Edit
                        </button>
                      )}
                      {canDeleteProject && (
                        <button onClick={handleDeleteProject} disabled={deletingProject} className="btn-secondary text-red-600 disabled:opacity-50">
                          {deletingProject ? 'Deleting...' : '🗑️ Delete'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {tasksLoading && !tasksLoadedOnce ? (
                  <div role="status" className="pro-card p-12 text-center text-gray-500">
                    <div className="spinner w-6 h-6 mx-auto mb-3"></div>
                    Loading tasks...
                  </div>
                ) : !tasksLoadedOnce && !!tasksError ? (
                  <div role="alert" className="pro-card p-12 text-center">
                    <p className="text-red-600 mb-4">{tasksError}</p>
                    <button type="button" onClick={() => loadTasks()} className="btn-secondary">Retry</button>
                  </div>
                ) : (
                  <>
                    {tasksLoadedOnce && !!tasksError && (
                      <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm text-center">
                        Failed to refresh tasks. Showing the last known results.
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-4">
                      {(['todo', 'in_progress', 'review', 'done'] as const).map((status) => (
                        <div key={status} className="pro-card p-4">
                          <h3 className="font-semibold text-gray-900 mb-3 capitalize">
                            {status.replace('_', ' ')} ({tasksByStatus[status].length})
                          </h3>
                          <div className="space-y-2">
                            {tasksByStatus[status].map((task) => (
                              <motion.div
                                key={task.task_id}
                                id={`task-${task.task_id}`}
                                layout
                                className={`p-3 bg-white border rounded-lg hover:shadow-sm transition-shadow ${
                                  highlightedTaskId === task.task_id ? 'ring-2 ring-blue-500 border-blue-300' : 'border-gray-200'
                                }`}
                              >
                                <div className="font-medium text-sm text-gray-900">{task.title}</div>
                                <p className="text-xs text-gray-600 mt-1 line-clamp-2">{task.description}</p>

                                {/* Assignment display -- from the already-
                                    enriched getProjectTasks response
                                    (owner_user/reviewer_user/
                                    contributor_users/dependency_tasks),
                                    never a client-side guess. */}
                                {(task.owner_user || task.reviewer_user || (task.contributor_users?.length > 0) || (task.dependency_tasks?.length > 0)) && (
                                  <div className="mt-2 space-y-1 text-xs text-gray-500">
                                    {task.owner_user && <div>👤 Owner: {task.owner_user.full_name}</div>}
                                    {task.reviewer_user && <div>🔍 Reviewer: {task.reviewer_user.full_name}</div>}
                                    {task.contributor_users?.length > 0 && (
                                      <div>🤝 {task.contributor_users.map((u: any) => u.full_name).join(', ')}</div>
                                    )}
                                    {task.dependency_tasks?.length > 0 && (
                                      <div>🔗 Depends on: {task.dependency_tasks.map((t: any) => t.title).join(', ')}</div>
                                    )}
                                  </div>
                                )}

                                <div className="flex items-center justify-between mt-2 gap-2">
                                  <span className={`badge badge-${getPriorityColor(task.priority)} text-xs`}>
                                    {task.priority}
                                  </span>
                                  {canWriteProject && (
                                    <div className="flex items-center gap-1">
                                      <select
                                        value={task.status}
                                        onChange={(e) => handleUpdateTaskStatus(task.task_id, e.target.value)}
                                        disabled={updatingTaskId === task.task_id || deletingTaskId === task.task_id}
                                        aria-label={`Status for ${task.title}`}
                                        className="text-xs border border-gray-300 rounded px-2 py-1 disabled:opacity-50"
                                      >
                                        <option value="todo">To Do</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="review">Review</option>
                                        <option value="done">Done</option>
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => openEditTaskModal(task)}
                                        disabled={deletingTaskId === task.task_id}
                                        aria-label={`Edit ${task.title}`}
                                        className="text-gray-600 hover:text-gray-900 text-xs disabled:opacity-50"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTask(task.task_id)}
                                        disabled={deletingTaskId === task.task_id || updatingTaskId === task.task_id}
                                        aria-label={`Delete ${task.title}`}
                                        className="text-red-600 hover:text-red-700 text-xs disabled:opacity-50"
                                      >
                                        {deletingTaskId === task.task_id ? '...' : '🗑️'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {tasks.length === 0 && (
                      <div className="pro-card p-12 text-center text-gray-500">
                        <p>No tasks yet. {canWriteProject ? 'Add your first task to get started.' : ''}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="pro-card p-12 text-center">
                <div className="text-6xl mb-4">📋</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Project Selected</h3>
                <p className="text-gray-600 mb-6">Select a project or create a new one</p>
                <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                  Create Your First Project
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Project Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="pro-card p-6 w-full max-w-md"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Project</h2>
              <form onSubmit={handleCreateProject} className="space-y-4">
                <div>
                  <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 mb-2">Project Name *</label>
                  <input
                    id="project-name"
                    type="text"
                    value={newProject.projectName}
                    onChange={(e) => setNewProject({ ...newProject, projectName: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="project-description" className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
                  <textarea
                    id="project-description"
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    className="input-field resize-none"
                    rows={3}
                  />
                </div>
                <div>
                  <label htmlFor="project-team" className="block text-sm font-medium text-gray-700 mb-2">Team (optional)</label>
                  <select
                    id="project-team"
                    value={newProject.teamId}
                    onChange={(e) => setNewProject({ ...newProject, teamId: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Solo Project</option>
                    {teams.map((team) => (
                      <option key={team.team_id} value={team.team_id}>{team.team_name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="project-priority" className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                    <select
                      id="project-priority"
                      value={newProject.priority}
                      onChange={(e) => setNewProject({ ...newProject, priority: e.target.value })}
                      className="input-field"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="project-deadline" className="block text-sm font-medium text-gray-700 mb-2">Deadline (optional)</label>
                    <input
                      id="project-deadline"
                      type="date"
                      value={newProject.deadline}
                      onChange={(e) => setNewProject({ ...newProject, deadline: e.target.value })}
                      className="input-field"
                    />
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="project-public"
                      type="checkbox"
                      checked={newProject.isPublic}
                      onChange={(e) => setNewProject({ ...newProject, isPublic: e.target.checked })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm font-medium text-gray-700">Public project (discoverable)</span>
                  </label>
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={creatingProject} className="btn-primary flex-1 disabled:opacity-50">
                    {creatingProject ? 'Creating...' : 'Create Project'}
                  </button>
                  <button type="button" disabled={creatingProject} onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1 disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Project Modal */}
      <AnimatePresence>
        {showEditModal && editProjectDraft && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="pro-card p-6 w-full max-w-md"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Project</h2>
              <form onSubmit={handleUpdateProject} className="space-y-4">
                <div>
                  <label htmlFor="edit-project-name" className="block text-sm font-medium text-gray-700 mb-2">Project Name *</label>
                  <input
                    id="edit-project-name"
                    type="text"
                    value={editProjectDraft.project_name}
                    onChange={(e) => setEditProjectDraft({ ...editProjectDraft, project_name: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-project-description" className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
                  <textarea
                    id="edit-project-description"
                    value={editProjectDraft.description}
                    onChange={(e) => setEditProjectDraft({ ...editProjectDraft, description: e.target.value })}
                    className="input-field resize-none"
                    rows={3}
                  />
                </div>
                <div>
                  <label htmlFor="edit-project-team" className="block text-sm font-medium text-gray-700 mb-2">Team (optional)</label>
                  <select
                    id="edit-project-team"
                    value={editProjectDraft.team_id}
                    onChange={(e) => setEditProjectDraft({ ...editProjectDraft, team_id: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Solo Project</option>
                    {teams.map((team) => (
                      <option key={team.team_id} value={team.team_id}>{team.team_name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-project-status" className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select
                      id="edit-project-status"
                      value={editProjectDraft.status}
                      onChange={(e) => setEditProjectDraft({ ...editProjectDraft, status: e.target.value })}
                      className="input-field"
                    >
                      <option value="planning">Planning</option>
                      <option value="active">Active</option>
                      <option value="on_hold">On Hold</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-project-priority" className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                    <select
                      id="edit-project-priority"
                      value={editProjectDraft.priority}
                      onChange={(e) => setEditProjectDraft({ ...editProjectDraft, priority: e.target.value })}
                      className="input-field"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="edit-project-deadline" className="block text-sm font-medium text-gray-700 mb-2">Deadline (optional)</label>
                  <input
                    id="edit-project-deadline"
                    type="date"
                    value={editProjectDraft.deadline}
                    onChange={(e) => setEditProjectDraft({ ...editProjectDraft, deadline: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="edit-project-public"
                      type="checkbox"
                      checked={editProjectDraft.is_public}
                      onChange={(e) => setEditProjectDraft({ ...editProjectDraft, is_public: e.target.checked })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm font-medium text-gray-700">Public project (discoverable)</span>
                  </label>
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={savingProjectEdit} className="btn-primary flex-1 disabled:opacity-50">
                    {savingProjectEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    disabled={savingProjectEdit}
                    onClick={() => { setShowEditModal(false); setEditProjectDraft(null); }}
                    className="btn-secondary flex-1 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Project Setup Modal */}
      <AnimatePresence>
        {showAIModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="pro-card p-6 w-full max-w-2xl max-h-[90vh] overflow-auto"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">🤖 AI Project Setup</h2>
              {!aiAnalysis ? (
                <form onSubmit={handleAIAnalyze} className="space-y-4">
                  <div>
                    <label htmlFor="ai-project-name" className="block text-sm font-medium text-gray-700 mb-2">Project Name *</label>
                    <input
                      id="ai-project-name"
                      type="text"
                      value={aiInput.projectName}
                      onChange={(e) => setAiInput({ ...aiInput, projectName: e.target.value })}
                      className="input-field"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="ai-project-description" className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                    <textarea
                      id="ai-project-description"
                      value={aiInput.description}
                      onChange={(e) => setAiInput({ ...aiInput, description: e.target.value })}
                      className="input-field resize-none"
                      rows={3}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="ai-project-requirements" className="block text-sm font-medium text-gray-700 mb-2">Requirements (optional)</label>
                    <textarea
                      id="ai-project-requirements"
                      value={aiInput.requirements}
                      onChange={(e) => setAiInput({ ...aiInput, requirements: e.target.value })}
                      className="input-field resize-none"
                      rows={4}
                      placeholder="List any specific requirements, features, or constraints..."
                    />
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" disabled={analyzingProject} className="btn-primary flex-1 disabled:opacity-50">
                      {analyzingProject ? 'Analyzing...' : '✨ Analyze with AI'}
                    </button>
                    <button type="button" disabled={analyzingProject} onClick={() => setShowAIModal(false)} className="btn-secondary flex-1 disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-semibold text-green-900 mb-2">✅ Analysis Complete</h3>
                    <p className="text-sm text-green-700">AI has analyzed your project and generated recommendations</p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Suggested Tasks ({aiAnalysis.suggested_tasks?.length || 0})</h3>
                    <div className="space-y-2">
                      {aiAnalysis.suggested_tasks?.map((task: any, i: number) => (
                        <div key={i} className="p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-sm">{task.title}</div>
                              <div className="text-xs text-gray-600 mt-1">{task.description}</div>
                            </div>
                            <span className={`badge badge-${getPriorityColor(task.priority)} text-xs`}>
                              {task.priority}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Tech Stack</h3>
                      <div className="flex flex-wrap gap-2">
                        {aiAnalysis.tech_stack?.map((tech: string, i: number) => (
                          <span key={i} className="badge badge-blue text-xs">{tech}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Estimates</h3>
                      <div className="text-sm text-gray-700">
                        <div>Timeline: {aiAnalysis.timeline_estimate}</div>
                        <div>Team Size: {aiAnalysis.team_size_recommendation} people</div>
                      </div>
                    </div>
                  </div>

                  {aiAnalysis.risks?.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">⚠️ Potential Risks</h3>
                      <ul className="text-sm text-gray-700 space-y-1">
                        {aiAnalysis.risks.map((risk: string, i: number) => (
                          <li key={i}>• {risk}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={handleCreateFromAI} disabled={creatingFromAI} className="btn-primary flex-1 disabled:opacity-50">
                      {creatingFromAI ? 'Creating...' : '🚀 Create Project with Tasks'}
                    </button>
                    <button disabled={creatingFromAI} onClick={() => { setAiAnalysis(null); setShowAIModal(false); }} className="btn-secondary flex-1 disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Task Modal */}
      <AnimatePresence>
        {showTaskModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="pro-card p-6 w-full max-w-md max-h-[90vh] overflow-auto"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Add New Task</h2>
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div>
                  <label htmlFor="task-title" className="block text-sm font-medium text-gray-700 mb-2">Task Title *</label>
                  <input
                    id="task-title"
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="task-description" className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
                  <textarea
                    id="task-description"
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    className="input-field resize-none"
                    rows={3}
                  />
                </div>
                <div>
                  <label htmlFor="task-priority" className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    id="task-priority"
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                    className="input-field"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                {renderAssignmentFields(newTask, (updater) => setNewTask(updater), 'task-create')}

                <div className="flex gap-3">
                  <button type="submit" disabled={creatingTask} className="btn-primary flex-1 disabled:opacity-50">
                    {creatingTask ? 'Creating...' : 'Create Task'}
                  </button>
                  <button type="button" disabled={creatingTask} onClick={() => setShowTaskModal(false)} className="btn-secondary flex-1 disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Task Modal */}
      <AnimatePresence>
        {editingTask && editTaskDraft && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="pro-card p-6 w-full max-w-md max-h-[90vh] overflow-auto"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Task</h2>
              <form onSubmit={handleSaveTaskEdit} className="space-y-4">
                <div>
                  <label htmlFor="edit-task-title" className="block text-sm font-medium text-gray-700 mb-2">Task Title *</label>
                  <input
                    id="edit-task-title"
                    type="text"
                    value={editTaskDraft.title}
                    onChange={(e) => setEditTaskDraft({ ...editTaskDraft, title: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-task-description" className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
                  <textarea
                    id="edit-task-description"
                    value={editTaskDraft.description}
                    onChange={(e) => setEditTaskDraft({ ...editTaskDraft, description: e.target.value })}
                    className="input-field resize-none"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-task-status" className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select
                      id="edit-task-status"
                      value={editTaskDraft.status}
                      onChange={(e) => setEditTaskDraft({ ...editTaskDraft, status: e.target.value })}
                      className="input-field"
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="review">Review</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-task-priority" className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                    <select
                      id="edit-task-priority"
                      value={editTaskDraft.priority}
                      onChange={(e) => setEditTaskDraft({ ...editTaskDraft, priority: e.target.value })}
                      className="input-field"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                {renderAssignmentFields(editTaskDraft, (updater) => setEditTaskDraft((d) => (d ? updater(d) : d)), 'task-edit', editingTask.task_id)}

                <div className="flex gap-3">
                  <button type="submit" disabled={savingTaskEdit} className="btn-primary flex-1 disabled:opacity-50">
                    {savingTaskEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    disabled={savingTaskEdit}
                    onClick={() => { setEditingTask(null); setEditTaskDraft(null); }}
                    className="btn-secondary flex-1 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
