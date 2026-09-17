import api from './api';

export interface GuidanceItem {
  guidance_id: string;
  context_type: 'task' | 'goal' | 'blocker';
  context_id: string;
  team_id: string;
  author_id: string;
  recipient_id?: string;
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  acknowledged_at?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  author_name?: string;
  recipient_name?: string;
  context_title?: string;
  context_status?: 'active' | 'archived' | 'deleted';
}

export interface CreateGuidanceDto {
  contextType: 'task' | 'goal' | 'blocker';
  contextId: string;
  teamId?: string;
  recipientId?: string;
  message: string;
}

export const createGuidance = (data: CreateGuidanceDto) =>
  api.post('/guidance', data);

export const getGuidanceList = (params?: {
  teamId?: string;
  contextType?: string;
  contextId?: string;
  status?: string;
}) => api.get('/guidance', { params });

export const getGuidanceById = (guidanceId: string) =>
  api.get(`/guidance/${guidanceId}`);

export const updateGuidanceStatus = (guidanceId: string, status: 'acknowledged' | 'resolved') =>
  api.patch(`/guidance/${guidanceId}/status`, { status });
