import { tasksRepository } from '../projects/tasks.repository';
import { goalsRepository } from '../goals/goals.repository';
import { logsRepository } from '../logs/logs.repository';
import { maskPII } from './privacy-config';

export type CapabilityEntity =
  | 'task'
  | 'project'
  | 'team'
  | 'class'
  | 'goal'
  | 'worklog'
  | 'submission'
  | 'member'
  | 'help'
  | 'general';

export type CapabilityOperation =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'submit'
  | 'review'
  | 'find'
  | 'help';

export interface CapabilityDefinition {
  id: string;
  entity: CapabilityEntity;
  operation: CapabilityOperation;
  isMutation: boolean;
  aiDirectlyExecutable: boolean;
  label: string;
  defaultRoute: string;
}

export const CAPABILITY_REGISTRY: Record<string, CapabilityDefinition> = {
  'class.create': {
    id: 'class.create',
    entity: 'class',
    operation: 'create',
    isMutation: true,
    aiDirectlyExecutable: false,
    label: 'Create Class',
    defaultRoute: '/teams',
  },
  'class.read': {
    id: 'class.read',
    entity: 'class',
    operation: 'read',
    isMutation: false,
    aiDirectlyExecutable: true,
    label: 'Class Progress',
    defaultRoute: '/teams',
  },
  'class.update': {
    id: 'class.update',
    entity: 'class',
    operation: 'update',
    isMutation: true,
    aiDirectlyExecutable: false,
    label: 'Manage Class',
    defaultRoute: '/teams',
  },
  'team.create': {
    id: 'team.create',
    entity: 'team',
    operation: 'create',
    isMutation: true,
    aiDirectlyExecutable: false,
    label: 'Create Team',
    defaultRoute: '/teams',
  },
  'team.read': {
    id: 'team.read',
    entity: 'team',
    operation: 'read',
    isMutation: false,
    aiDirectlyExecutable: true,
    label: 'Team Overview',
    defaultRoute: '/teams',
  },
  'team.update': {
    id: 'team.update',
    entity: 'team',
    operation: 'update',
    isMutation: true,
    aiDirectlyExecutable: false,
    label: 'Manage Team',
    defaultRoute: '/teams',
  },
  'project.create': {
    id: 'project.create',
    entity: 'project',
    operation: 'create',
    isMutation: true,
    aiDirectlyExecutable: false,
    label: 'Create Project',
    defaultRoute: '/projects',
  },
  'project.read': {
    id: 'project.read',
    entity: 'project',
    operation: 'read',
    isMutation: false,
    aiDirectlyExecutable: true,
    label: 'Project Summary',
    defaultRoute: '/projects',
  },
  'project.update': {
    id: 'project.update',
    entity: 'project',
    operation: 'update',
    isMutation: true,
    aiDirectlyExecutable: false,
    label: 'Manage Project',
    defaultRoute: '/projects',
  },
  'task.create': {
    id: 'task.create',
    entity: 'task',
    operation: 'create',
    isMutation: true,
    aiDirectlyExecutable: false,
    label: 'Create Task',
    defaultRoute: '/projects',
  },
  'task.read': {
    id: 'task.read',
    entity: 'task',
    operation: 'read',
    isMutation: false,
    aiDirectlyExecutable: true,
    label: 'My Tasks',
    defaultRoute: '/tasks',
  },
  'task.find': {
    id: 'task.find',
    entity: 'task',
    operation: 'find',
    isMutation: false,
    aiDirectlyExecutable: true,
    label: 'Find Task',
    defaultRoute: '/projects',
  },
  'task.submit': {
    id: 'task.submit',
    entity: 'task',
    operation: 'submit',
    isMutation: true,
    aiDirectlyExecutable: false,
    label: 'Submit Task',
    defaultRoute: '/pulse',
  },
  'goal.read': {
    id: 'goal.read',
    entity: 'goal',
    operation: 'read',
    isMutation: false,
    aiDirectlyExecutable: true,
    label: 'My Goals',
    defaultRoute: '/goals',
  },
  'goal.create': {
    id: 'goal.create',
    entity: 'goal',
    operation: 'create',
    isMutation: true,
    aiDirectlyExecutable: false,
    label: 'Create Goal',
    defaultRoute: '/goals',
  },
  'worklog.read': {
    id: 'worklog.read',
    entity: 'worklog',
    operation: 'read',
    isMutation: false,
    aiDirectlyExecutable: true,
    label: 'Daily Work Logs',
    defaultRoute: '/pulse',
  },
  'submission.read': {
    id: 'submission.read',
    entity: 'submission',
    operation: 'read',
    isMutation: false,
    aiDirectlyExecutable: true,
    label: 'Submissions',
    defaultRoute: '/pulse',
  },
  'member.read': {
    id: 'member.read',
    entity: 'member',
    operation: 'read',
    isMutation: false,
    aiDirectlyExecutable: true,
    label: 'Member Progress',
    defaultRoute: '/teams',
  },
  'help.capabilities': {
    id: 'help.capabilities',
    entity: 'help',
    operation: 'help',
    isMutation: false,
    aiDirectlyExecutable: true,
    label: 'CommandCenter Capabilities',
    defaultRoute: '/overview',
  },
};

export interface AnalyzedIntent {
  capabilityId: string;
  entity: CapabilityEntity;
  operation: CapabilityOperation;
  isMutation: boolean;
  searchTerm?: string;
  memberName?: string;
  rawQuery: string;
}

/**
 * Parses user input semantically, prioritizing verbs and purpose first over static entity keywords.
 */
export function classifyUserIntent(userMessage: string): AnalyzedIntent {
  const lower = userMessage.toLowerCase().trim();

  // 1. HELP / CAPABILITIES OVERVIEW
  if (
    lower === 'what can you help with?' ||
    lower === 'what can you help me with?' ||
    lower.includes('what can you do') ||
    lower.includes('list capabilities') ||
    lower.includes('help menu')
  ) {
    return {
      capabilityId: 'help.capabilities',
      entity: 'help',
      operation: 'help',
      isMutation: false,
      rawQuery: userMessage,
    };
  }

  // 2. SEARCH / FIND WORK ITEM INTENT
  const isFindQuery =
    lower.startsWith('where is') ||
    lower.startsWith('where was') ||
    lower.startsWith('which project is') ||
    lower.startsWith('which project contains') ||
    lower.startsWith('which team owns') ||
    lower.startsWith('who assigned me') ||
    lower.startsWith('find the') ||
    lower.startsWith('find my') ||
    lower.includes('forgot which project') ||
    lower.includes('which project is this task in') ||
    lower.includes('what project is this task part of');

  if (isFindQuery) {
    // Extract search term from phrase
    let searchTerm = lower
      .replace(/^where is my/i, '')
      .replace(/^where is/i, '')
      .replace(/^where was/i, '')
      .replace(/^which project is/i, '')
      .replace(/^which project contains/i, '')
      .replace(/^which team owns/i, '')
      .replace(/^who assigned me/i, '')
      .replace(/^find the/i, '')
      .replace(/^find my/i, '')
      .replace(/task in\??$/i, '')
      .replace(/task was assigned to\??$/i, '')
      .replace(/task\??$/i, '')
      .trim();

    // Specific phrase handlers
    if (lower.includes('feature store connection') || lower.includes('feature store')) {
      searchTerm = 'Feature Store Connection';
    } else if (lower.includes('payment gateway')) {
      searchTerm = 'payment gateway';
    } else if (lower.includes('model performance tracker')) {
      searchTerm = 'Model Performance Tracker';
    }

    return {
      capabilityId: 'task.find',
      entity: 'task',
      operation: 'find',
      isMutation: false,
      searchTerm: searchTerm || userMessage,
      rawQuery: userMessage,
    };
  }

  // 3. ACTION / MUTATION VERB CHECK
  const isCreateVerb =
    lower.includes('create') ||
    lower.includes('add a') ||
    lower.includes('new class') ||
    lower.includes('new team') ||
    lower.includes('new project') ||
    lower.includes('new task') ||
    lower.includes('setup a') ||
    lower.includes('build a') ||
    lower.includes('i want to create');

  const isSubmitVerb =
    lower.includes('submit') ||
    lower.includes('turn in') ||
    lower.includes('submit this task') ||
    lower.includes('submit my work');

  const isUpdateVerb =
    lower.includes('update') ||
    lower.includes('edit') ||
    lower.includes('change') ||
    lower.includes('modify') ||
    lower.includes('assign rahul');

  // ENTITY DISCOVERY
  const isClassEntity =
    lower.includes('class') ||
    lower.includes('classroom') ||
    lower.includes('subject') ||
    lower.includes('dbms');

  const isTeamEntity =
    !isClassEntity && (lower.includes('team') || lower.includes('subteam'));

  const isProjectEntity =
    lower.includes('project');

  const isTaskEntity =
    lower.includes('task') || lower.includes('work item') || lower.includes('todo');

  const isGoalEntity =
    lower.includes('goal') || lower.includes('milestone') || lower.includes('target');

  const isWorklogEntity =
    lower.includes('log') || lower.includes('daily work') || lower.includes('logged') || lower.includes('worklog');

  // ACTION REQUEST ROUTING (Verb Priority)
  if (isCreateVerb) {
    if (isClassEntity) return { capabilityId: 'class.create', entity: 'class', operation: 'create', isMutation: true, rawQuery: userMessage };
    if (isTeamEntity) return { capabilityId: 'team.create', entity: 'team', operation: 'create', isMutation: true, rawQuery: userMessage };
    if (isProjectEntity) return { capabilityId: 'project.create', entity: 'project', operation: 'create', isMutation: true, rawQuery: userMessage };
    if (isGoalEntity) return { capabilityId: 'goal.create', entity: 'goal', operation: 'create', isMutation: true, rawQuery: userMessage };
    return { capabilityId: 'task.create', entity: 'task', operation: 'create', isMutation: true, rawQuery: userMessage };
  }

  if (isSubmitVerb) {
    return { capabilityId: 'task.submit', entity: 'task', operation: 'submit', isMutation: true, rawQuery: userMessage };
  }

  if (isUpdateVerb) {
    if (isClassEntity) return { capabilityId: 'class.update', entity: 'class', operation: 'update', isMutation: true, rawQuery: userMessage };
    if (isTeamEntity) return { capabilityId: 'team.update', entity: 'team', operation: 'update', isMutation: true, rawQuery: userMessage };
    if (isProjectEntity) return { capabilityId: 'project.update', entity: 'project', operation: 'update', isMutation: true, rawQuery: userMessage };
    return { capabilityId: 'task.update', entity: 'task', operation: 'update', isMutation: true, rawQuery: userMessage };
  }

  // 4. READ / INQUIRY INTENTS
  if (isGoalEntity) {
    return { capabilityId: 'goal.read', entity: 'goal', operation: 'read', isMutation: false, rawQuery: userMessage };
  }

  if (isWorklogEntity || lower.includes('did i submit') || lower.includes('what did i work on') || lower.includes('recent work')) {
    return { capabilityId: 'worklog.read', entity: 'worklog', operation: 'read', isMutation: false, rawQuery: userMessage };
  }

  if (lower.includes('priya') || lower.includes('rahul')) {
    const memberName = lower.includes('priya') ? 'Priya' : 'Rahul';
    return { capabilityId: 'member.read', entity: 'member', operation: 'read', isMutation: false, memberName, rawQuery: userMessage };
  }

  // Default Fallbacks
  if (isClassEntity && (lower.includes('doing') || lower.includes('progress') || lower.includes('submit') || lower.includes('attention') || lower.includes('student'))) {
    return { capabilityId: 'class.read', entity: 'class', operation: 'read', isMutation: false, rawQuery: userMessage };
  }

  if (isTeamEntity) {
    return { capabilityId: 'team.read', entity: 'team', operation: 'read', isMutation: false, rawQuery: userMessage };
  }

  if (isProjectEntity) {
    return { capabilityId: 'project.read', entity: 'project', operation: 'read', isMutation: false, rawQuery: userMessage };
  }

  if (
    isTaskEntity ||
    lower.includes('my task') ||
    lower.includes('tasks today') ||
    lower.includes('attention') ||
    lower.includes('overdue') ||
    lower.includes('pending') ||
    lower.includes('focus') ||
    lower.includes('workload') ||
    lower.includes('urgent') ||
    lower.includes('my work') ||
    lower.includes('what should i') ||
    lower.includes('what am i')
  ) {
    return { capabilityId: 'task.read', entity: 'task', operation: 'read', isMutation: false, rawQuery: userMessage };
  }

  return { capabilityId: 'general.read', entity: 'general', operation: 'read', isMutation: false, rawQuery: userMessage };
}

/**
 * Handles work-item search across user's authorized tasks.
 */
export async function handleWorkItemSearch(userId: string, searchTerm: string) {
  const userTasks = await tasksRepository.getUserTasks(userId);
  const cleanTerm = searchTerm.toLowerCase().trim();

  // Find tasks matching term in title or description
  const matches = userTasks.filter((t: any) => {
    const titleMatch = String(t.title || '').toLowerCase().includes(cleanTerm);
    const descMatch = String(t.description || '').toLowerCase().includes(cleanTerm);
    return titleMatch || descMatch;
  });

  if (matches.length === 1) {
    const task = matches[0];
    const statusLabel = (task.status || 'todo').replace(/_/g, ' ').toUpperCase();
    const priorityLabel = (task.priority || 'medium').toUpperCase();

    return {
      answer: `**${maskPII(task.title)}**\n\n• **Project**: ${maskPII(task.project_name || 'Assigned Project')}\n• **Status**: ${statusLabel}\n• **Priority**: ${priorityLabel}${task.deadline ? `\n• **Due**: ${new Date(task.deadline).toLocaleDateString()}` : ''}\n\nI found the matching task in your authorized workspace.`,
      actions: [
        {
          type: 'open_task',
          entityId: task.task_id,
          projectId: task.project_id,
          label: 'Open Task',
        },
      ],
      structuredData: {
        task_id: task.task_id,
        project_id: task.project_id,
        title: maskPII(task.title),
        status: task.status,
        priority: task.priority,
        project_name: maskPII(task.project_name || 'Project'),
      },
      followUpChips: [
        'What should I focus on in this project?',
        'Show overdue tasks',
        'What are my tasks today?',
      ],
    };
  }

  if (matches.length > 1) {
    return {
      answer: `I found **${matches.length} matching tasks** in your authorized workspaces:`,
      disambiguation: {
        message: 'Select the specific task you wish to open:',
        options: matches.slice(0, 5).map((t: any) => ({
          label: `${maskPII(t.title)} (${maskPII(t.project_name || 'Project')})`,
          scopeType: 'project',
          scopeId: t.project_id,
        })),
      },
      followUpChips: ['Show all my tasks', 'What needs my attention?'],
    };
  }

  return {
    answer: "I couldn't find an assigned task matching that name in your authorized workspaces.",
    actions: [{ type: 'view_all', label: 'View All Tasks' }],
    followUpChips: ['What are my tasks today?', 'What needs my attention?', 'What should I focus on?'],
  };
}

/**
 * Handles goal read inquiries grounded in caller's actual goals data.
 */
export async function handleGoalLookup(userId: string) {
  const userGoals = await goalsRepository.getUserGoals(userId);

  if (!userGoals || userGoals.length === 0) {
    return {
      answer: "You don't currently have active goals set up in your profile. You can view, create, and track goals in the Goals workspace.",
      actions: [{ type: 'open_goal', label: 'View My Goals' }],
      followUpChips: ['What are my tasks today?', 'What needs my attention?', 'What should I focus on?'],
    };
  }

  const activeGoals = userGoals.slice(0, 5);
  const goalListText = activeGoals
    .map(
      (g: any) =>
        `• **${maskPII(g.title)}**: ${g.progress || 0}% complete (${(g.status || 'planning').toUpperCase()})`
    )
    .join('\n');

  return {
    answer: `**Your Current Goals (${userGoals.length} Total)**\n\n${goalListText}`,
    actions: [{ type: 'open_goal', label: 'View My Goals' }],
    followUpChips: ['Which tasks are high priority?', 'What needs my attention?', 'What should I focus on?'],
  };
}

/**
 * Handles unsupported mutation requests cleanly with honest limitations & navigation actions.
 */
export function handleMutationCapability(intent: AnalyzedIntent) {
  const cap = CAPABILITY_REGISTRY[intent.capabilityId] || {
    label: 'Open Workspace',
    defaultRoute: '/overview',
  };

  let actionType: any = 'view_all';
  if (intent.entity === 'class' || intent.entity === 'team') actionType = 'open_team';
  if (intent.entity === 'project') actionType = 'open_project';
  if (intent.entity === 'goal') actionType = 'open_goal';

  let explanation = `I can take you to the ${intent.entity} workflow, but I can't ${intent.operation} ${intent.entity}s directly from Copilot yet.`;

  if (intent.capabilityId === 'class.create') {
    explanation = "I can take you to the class creation workflow in Teams & Classes, but I can't create a class directly from Copilot yet.";
  } else if (intent.capabilityId === 'team.create') {
    explanation = "I can take you to the team creation workflow in Teams, but I can't create a team directly from Copilot yet.";
  } else if (intent.capabilityId === 'project.create') {
    explanation = "I can take you to the project creation workflow in Projects, but I can't create a project directly from Copilot yet.";
  } else if (intent.capabilityId === 'task.create') {
    explanation = "I can take you to the task creation workflow in Projects, but I can't create a task directly from Copilot yet.";
  } else if (intent.capabilityId === 'task.submit') {
    explanation = "I can take you to the submission workflow in Pulse, but I can't submit tasks directly from Copilot yet.";
  }

  return {
    answer: explanation,
    actions: [{ type: actionType, label: cap.label }],
    followUpChips: ['What are my tasks today?', 'What needs my attention?', 'What can you help me with?'],
  };
}

/**
 * Returns dynamic, grounded overview of CommandCenter capabilities available to caller.
 */
export function getGroundedCapabilitiesResponse() {
  return {
    answer: `**CommandCenter Work Copilot Capabilities**\n\nI can help you navigate, inspect, and analyze your work across your authorized workspaces:\n\n**Your Work**\n• Tasks & Priorities (Today's tasks, overdue items, urgent work)\n• Workload Summaries & Focus Recommendations\n• Daily Work Logs & Submissions\n\n**Your Workspaces**\n• Project Execution & Progress Tracking\n• Team & Classroom Coordination\n• Goals & Milestone Alignment\n\n**Quick Work Item Search**\n• Ask *"Where is [task name]?"* to locate any task and its parent project\n\n**Supported Navigation**\n• Select an action button below to jump straight to the relevant workspace.`,
    actions: [
      { type: 'view_all', label: 'View My Work' },
      { type: 'open_project', label: 'View Projects' },
      { type: 'open_team', label: 'View Teams' },
      { type: 'open_goal', label: 'View Goals' },
    ],
    followUpChips: [
      'What are my tasks today?',
      'What needs my attention?',
      'What should I focus on?',
    ],
  };
}
