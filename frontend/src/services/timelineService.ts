import api from './api';

export interface TimelineActor {
  user_id: string;
  full_name: string | null;
  username: string | null;
}

export interface TimelineEvent {
  history_id: string;
  team_id: string;
  artifact_type: 'task' | 'goal' | 'blocker' | 'daily_work';
  artifact_id: string;
  event_type: string;
  actor: TimelineActor | null;
  description: string;
  change_summary: Record<string, any> | null;
  created_at: string;
}

export interface TimelineArtifactInfo {
  artifact_type: 'task' | 'goal' | 'blocker';
  artifact_id: string;
  title: string;
  current_status: string;
  context_status: 'active' | 'deleted';
}

export interface TimelineResponse {
  artifact: TimelineArtifactInfo;
  events: TimelineEvent[];
  next_cursor: {
    beforeTimestamp: string;
    beforeHistoryId: string;
  } | null;
}

export const getWorkActivityTimeline = async (
  artifactType: 'task' | 'goal' | 'blocker',
  artifactId: string,
  cursor?: { beforeTimestamp?: string; beforeHistoryId?: string },
  limit: number = 50
): Promise<TimelineResponse> => {
  const params: Record<string, any> = { limit };
  if (cursor?.beforeTimestamp) params.beforeTimestamp = cursor.beforeTimestamp;
  if (cursor?.beforeHistoryId) params.beforeHistoryId = cursor.beforeHistoryId;

  const res = await api.get(`/timeline/${artifactType}/${artifactId}`, { params });
  return res.data.data;
};
