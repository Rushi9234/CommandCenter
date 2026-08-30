import { useEffect, useRef } from 'react';
import { RealtimeClient, RealtimeEvent } from '../services/realtime';

export const useRealtime = (onEvent: (event: RealtimeEvent) => void) => {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const client = new RealtimeClient({ onEvent: (event) => onEventRef.current(event) });
    const handleVisibilityChange = () => {
      if (document.hidden) client.stop();
      else client.start();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (!document.hidden) client.start();
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      client.stop();
    };
  }, []);
};