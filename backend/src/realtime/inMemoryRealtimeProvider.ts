import { randomUUID } from 'crypto';
import { RealtimeEvent, RealtimeProvider, RealtimeSubscriber } from './realtime.types';

interface Subscription {
  userId: string;
  teamIds: Set<string>;
  subscriber: RealtimeSubscriber;
  deliveredEventIds: Set<string>;
}

export class InMemoryRealtimeProvider implements RealtimeProvider {
  private readonly subscriptions = new Set<Subscription>();

  subscribe(userId: string, teamIds: string[], subscriber: RealtimeSubscriber) {
    const subscription: Subscription = {
      userId,
      teamIds: new Set(teamIds),
      subscriber,
      deliveredEventIds: new Set(),
    };
    this.subscriptions.add(subscription);

    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  publish(event: RealtimeEvent) {
    for (const subscription of this.subscriptions) {
      const isRecipient = event.recipientUserId === subscription.userId;
      const isTeamMember = event.teamId ? subscription.teamIds.has(event.teamId) : false;
      if ((!isRecipient && !isTeamMember) || subscription.deliveredEventIds.has(event.id)) {
        continue;
      }

      subscription.deliveredEventIds.add(event.id);
      if (subscription.deliveredEventIds.size > 100) {
        const oldest = subscription.deliveredEventIds.values().next().value;
        if (oldest) subscription.deliveredEventIds.delete(oldest);
      }
      subscription.subscriber(event);
    }
  }

  getSubscriberCount() {
    return this.subscriptions.size;
  }

  reset() {
    this.subscriptions.clear();
  }
}

export const realtimeProvider = new InMemoryRealtimeProvider();

export const createRealtimeEvent = (type: string, details: Omit<RealtimeEvent, 'id' | 'type' | 'occurredAt'> = {}): RealtimeEvent => ({
  id: randomUUID(),
  type,
  occurredAt: new Date().toISOString(),
  ...details,
});
