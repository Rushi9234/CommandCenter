import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../services/api';

export default function Projects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);

  const [newProject, setNewProject] = useState({
    projectName: '',
    description: '',
    teamId: '',
    priority: 'medium',
    deadline: '',
  });

  const [aiInput, setAiInput] = useState({
    projectName: '',
    description: '',
    requirements: '',
  });

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assignedTo: '',
    priority: 'medium',
  });

  useEffect(() => {
    loadProjects();
    loadTeams();
  }, []);

  useEffect(() => {
    // Re-select first project when projects load but no project is selected
    if (projects.length > 0 && !selectedProject) {
      selectProject(projects[0]);
    }
  }, [projects]);

  const loadProjects = async () => {
    try {
      const response = await api.getMyProjects();
      setProjects(response.data.data);
      if (response.data.data.length > 0 && !selectedProject) {
        selectProject(response.data.data[0]);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
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

  const selectProject = async (project: any) => {
    setSelectedProject(project);
    try {
      const response = await api.getProjectTasks(project.project_id);
      setTasks(response.data.data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.createProject(newProject);
      setShowCreateModal(false);
      setNewProject({ projectName: '', description: '', teamId: '', priority: 'medium', deadline: '' });
      loadProjects();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleAIAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await api.analyzeProject(aiInput);
      setAiAnalysis(response.data.data);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to analyze project');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFromAI = async () => {
    setLoading(true);
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
      loadProjects();
      alert('Project created with AI-generated tasks!');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    setLoading(true);
    try {
      await api.createTask(selectedProject.project_id, newTask);
      setShowTaskModal(false);
      setNewTask({ title: '', description: '', assignedTo: '', priority: 'medium' });
      selectProject(selectedProject);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
    try {
      await api.updateTask(taskId, { status });
      if (selectedProject) selectProject(selectedProject);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update task');
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProject || !confirm('Delete this project and all tasks?')) return;
    try {
      await api.deleteProject(selectedProject.project_id);
      setSelectedProject(null);
      loadProjects();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete project');
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="pro-card p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Your Projects ({projects.length})</h2>
              <div className="space-y-2">
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
            </div>
          </div>

          <div className="lg:col-span-3">
            {selectedProject ? (
              <div className="space-y-6">
                <div className="pro-card p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-gray-900">{selectedProject.project_name}</h2>
                      <p className="text-gray-600 mt-2">{selectedProject.description}</p>
                      <div className="flex items-center gap-3 mt-4">
                        <span className={`badge badge-${getStatusColor(selectedProject.status)}`}>
                          {selectedProject.status}
                        </span>
                        <span className={`badge badge-${getPriorityColor(selectedProject.priority)}`}>
                          {selectedProject.priority} priority
                        </span>
                        {selectedProject.deadline && (
                          <span className="text-sm text-gray-500">
                            📅 {new Date(selectedProject.deadline).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowTaskModal(true)} className="btn-primary">
                        + Add Task
                      </button>
                      <button onClick={handleDeleteProject} className="btn-secondary text-red-600">
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                </div>

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
                            layout
                            className="p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow cursor-pointer"
                          >
                            <div className="font-medium text-sm text-gray-900">{task.title}</div>
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">{task.description}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className={`badge badge-${getPriorityColor(task.priority)} text-xs`}>
                                {task.priority}
                              </span>
                              <select
                                value={task.status}
                                onChange={(e) => handleUpdateTaskStatus(task.task_id, e.target.value)}
                                className="text-xs border border-gray-300 rounded px-2 py-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="todo">To Do</option>
                                <option value="in_progress">In Progress</option>
                                <option value="review">Review</option>
                                <option value="done">Done</option>
                              </select>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Project Name *</label>
                  <input
                    type="text"
                    value={newProject.projectName}
                    onChange={(e) => setNewProject({ ...newProject, projectName: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    className="input-field resize-none"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Team (Optional)</label>
                  <select
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                    <select
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Deadline</label>
                    <input
                      type="date"
                      value={newProject.deadline}
                      onChange={(e) => setNewProject({ ...newProject, deadline: e.target.value })}
                      className="input-field"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Creating...' : 'Create Project'}
                  </button>
                  <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Project Name *</label>
                    <input
                      type="text"
                      value={aiInput.projectName}
                      onChange={(e) => setAiInput({ ...aiInput, projectName: e.target.value })}
                      className="input-field"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                    <textarea
                      value={aiInput.description}
                      onChange={(e) => setAiInput({ ...aiInput, description: e.target.value })}
                      className="input-field resize-none"
                      rows={3}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Requirements (Optional)</label>
                    <textarea
                      value={aiInput.requirements}
                      onChange={(e) => setAiInput({ ...aiInput, requirements: e.target.value })}
                      className="input-field resize-none"
                      rows={4}
                      placeholder="List any specific requirements, features, or constraints..."
                    />
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" disabled={loading} className="btn-primary flex-1">
                      {loading ? 'Analyzing...' : '✨ Analyze with AI'}
                    </button>
                    <button type="button" onClick={() => setShowAIModal(false)} className="btn-secondary flex-1">
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
                    <button onClick={handleCreateFromAI} disabled={loading} className="btn-primary flex-1">
                      {loading ? 'Creating...' : '🚀 Create Project with Tasks'}
                    </button>
                    <button onClick={() => { setAiAnalysis(null); setShowAIModal(false); }} className="btn-secondary flex-1">
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
              className="pro-card p-6 w-full max-w-md"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Add New Task</h2>
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Task Title *</label>
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    className="input-field resize-none"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                    className="input-field"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Creating...' : 'Create Task'}
                  </button>
                  <button type="button" onClick={() => setShowTaskModal(false)} className="btn-secondary flex-1">
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
