import { InMemoryRealtimeProvider } from '../src/realtime/inMemoryRealtimeProvider';

describe('InMemoryRealtimeProvider', () => {
  it('delivers team events only to subscribers in that team', () => {
    const provider = new InMemoryRealtimeProvider();
    const teamEvents: string[] = [];
    const otherEvents: string[] = [];
    provider.subscribe('user-a', ['team-a'], (event) => teamEvents.push(event.id));
    provider.subscribe('user-b', ['team-b'], (event) => otherEvents.push(event.id));

    provider.publish({ id: 'event-1', type: 'join_request.created', occurredAt: new Date().toISOString(), teamId: 'team-a' });

    expect(teamEvents).toEqual(['event-1']);
    expect(otherEvents).toEqual([]);
  });

  it('delivers recipient events without exposing them to unrelated users', () => {
    const provider = new InMemoryRealtimeProvider();
    const recipientEvents: string[] = [];
    const otherEvents: string[] = [];
    provider.subscribe('user-a', [], (event) => recipientEvents.push(event.id));
    provider.subscribe('user-b', [], (event) => otherEvents.push(event.id));

    provider.publish({ id: 'event-2', type: 'join_request.approved', occurredAt: new Date().toISOString(), recipientUserId: 'user-a' });

    expect(recipientEvents).toEqual(['event-2']);
    expect(otherEvents).toEqual([]);
  });

  it('deduplicates an event per subscription and cleans up on unsubscribe', () => {
    const provider = new InMemoryRealtimeProvider();
    const events: string[] = [];
    const unsubscribe = provider.subscribe('user-a', ['team-a'], (event) => events.push(event.id));
    const event = { id: 'event-3', type: 'join_request.created', occurredAt: new Date().toISOString(), teamId: 'team-a' };

    provider.publish(event);
    provider.publish(event);
    expect(events).toEqual(['event-3']);
    expect(provider.getSubscriberCount()).toBe(1);

    unsubscribe();
    provider.publish({ ...event, id: 'event-4' });
    expect(events).toEqual(['event-3']);
    expect(provider.getSubscriberCount()).toBe(0);
  });
});