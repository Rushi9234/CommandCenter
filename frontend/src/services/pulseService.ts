import api from './api';

export interface PulseItem {
  history_id: string;
  team_id: string;
  team_name: string;
  artifact_type: 'task' | 'goal' | 'daily_work' | 'blocker';
  artifact_id: string;
  event_type: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
  previous_state: any;
  new_state: any;
  created_at: string;
  artifact_title: string | null;
  project_name: string | null;
  context_status: 'active' | 'deleted';
}

export interface PulsePageResponse {
  events: PulseItem[];
  next_cursor: string | null;
}

export interface GetPulseParams {
  category?: string;
  cursor?: string;
  limit?: number;
}

export const pulseService = {
  async getIndividualPulse(params?: GetPulseParams): Promise<PulsePageResponse> {
    const res = await api.get('/pulse/me', { params });
    return res.data.data;
  },

  async getTeamPulse(teamId: string, params?: GetPulseParams): Promise<PulsePageResponse> {
    const res = await api.get(`/pulse/teams/${teamId}`, { params });
    return res.data.data;
  },

  async getClassroomPulse(teamId: string, params?: GetPulseParams): Promise<PulsePageResponse> {
    const res = await api.get(`/pulse/classrooms/${teamId}`, { params });
    return res.data.data;
  },
};

export default pulseService;
