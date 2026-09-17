export interface RealtimeEvent {
  id: string;
  type: string;
  occurredAt: string;
  teamId?: string;
  recipientUserId?: string;
  // Chat V1 Task 4: an identifier only, never message content -- lets a
  // subscriber with several conversations open (or listed) know WHICH one
  // changed without carrying any of its content. Every existing event
  // (join_request.*, notification.created, goal.*, task.*, blocker.*)
  // still carries only teamId/recipientUserId and is unaffected by this
  // addition -- delivery routing (InMemoryRealtimeProvider.publish) still
  // matches on teamId/recipientUserId alone; conversationId is payload
  // only, never used for delivery decisions.
  conversationId?: string;
  guidanceId?: string;
}

export type RealtimeSubscriber = (event: RealtimeEvent) => void;

export interface RealtimeProvider {
  subscribe(userId: string, teamIds: string[], subscriber: RealtimeSubscriber): () => void;
  publish(event: RealtimeEvent): void;
  getSubscriberCount(): number;
  reset(): void;
}
