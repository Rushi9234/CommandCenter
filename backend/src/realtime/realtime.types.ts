export interface RealtimeEvent {
  id: string;
  type: string;
  occurredAt: string;
  teamId?: string;
  recipientUserId?: string;
}

export type RealtimeSubscriber = (event: RealtimeEvent) => void;

export interface RealtimeProvider {
  subscribe(userId: string, teamIds: string[], subscriber: RealtimeSubscriber): () => void;
  publish(event: RealtimeEvent): void;
  getSubscriberCount(): number;
  reset(): void;
}