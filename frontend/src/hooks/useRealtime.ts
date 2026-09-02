import { useEffect, useRef } from 'react';
import { RealtimeClient, RealtimeEvent } from '../services/realtime';

export type { RealtimeEvent };

// Notifications feature: the header bell now needs the same realtime
// stream Teams.tsx already consumes, and the bell lives in Navigation.tsx
// which mounts on every route (not just /teams) -- so this hook can have
// more than one simultaneous consumer for the first time. Previously each
// call created its OWN RealtimeClient (its own SSE connection); with two
// consumers mounted at once (Navigation's bell + Teams.tsx while on the
// Teams page) that would open two independent connections to the same
// endpoint. Refactored into a ref-counted module-level singleton: exactly
// one RealtimeClient/SSE connection exists no matter how many components
// call useRealtime, it starts on the first mount and stops only when the
// last consumer unmounts, and every registered callback receives every
// event (fan-out, not last-writer-wins). RealtimeClient's own
// deduplication (seenEventIds) and reconnect/visibility behavior are
// completely unchanged -- this only changes how many RealtimeClient
// instances get created.
let sharedClient: RealtimeClient | null = null;
const listeners = new Set<(event: RealtimeEvent) => void>();
let visibilityHandler: (() => void) | null = null;

const getSharedClient = (): RealtimeClient => {
  if (!sharedClient) {
    sharedClient = new RealtimeClient({
      onEvent: (event) => {
        listeners.forEach((listener) => listener(event));
      },
    });
    visibilityHandler = () => {
      if (document.hidden) sharedClient?.stop();
      else sharedClient?.start();
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  }
  return sharedClient;
};

export const useRealtime = (onEvent: (event: RealtimeEvent) => void) => {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const client = getSharedClient();
    const listener = (event: RealtimeEvent) => onEventRef.current(event);
    listeners.add(listener);
    if (!document.hidden) client.start();

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        client.stop();
        if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
        visibilityHandler = null;
        sharedClient = null;
      }
    };
  }, []);
};
