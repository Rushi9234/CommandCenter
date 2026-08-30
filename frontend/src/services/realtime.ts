export interface RealtimeEvent {
  id: string;
  type: string;
  occurredAt: string;
  teamId?: string;
  recipientUserId?: string;
}

interface RealtimeClientOptions {
  onEvent: (event: RealtimeEvent) => void;
  onStatusChange?: (connected: boolean) => void;
}

const REALTIME_URL = import.meta.env.PROD
  ? 'https://commandcenter-backend.vercel.app/api/realtime/events'
  : '/api/realtime/events';

export class RealtimeClient {
  private stopped = true;
  private reconnectTimer: number | undefined;
  private abortController: AbortController | null = null;
  private reconnectAttempt = 0;
  private readonly seenEventIds = new Set<string>();

  constructor(private readonly options: RealtimeClientOptions) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.abortController?.abort();
    this.abortController = null;
    this.options.onStatusChange?.(false);
  }

  private async connect() {
    if (this.stopped || document.hidden) return;
    this.abortController = new AbortController();
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(REALTIME_URL, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: this.abortController.signal,
      });
      if (!response.ok || !response.body) throw new Error(`Realtime connection failed: ${response.status}`);

      this.reconnectAttempt = 0;
      this.options.onStatusChange?.(true);
      await this.readStream(response.body);
      this.options.onStatusChange?.(false);
      this.scheduleReconnect();
    } catch (error: any) {
      if (!this.stopped && error.name !== 'AbortError') {
        this.options.onStatusChange?.(false);
        this.scheduleReconnect();
      }
    }
  }

  private async readStream(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (!this.stopped && !document.hidden) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) this.handleChunk(chunk);
    }
    reader.cancel().catch(() => undefined);
  }

  private handleChunk(chunk: string) {
    const data = chunk.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
    if (!data) return;
    const event = JSON.parse(data) as RealtimeEvent;
    if (this.seenEventIds.has(event.id)) return;
    this.seenEventIds.add(event.id);
    if (this.seenEventIds.size > 100) {
      const oldest = this.seenEventIds.values().next().value;
      if (oldest) this.seenEventIds.delete(oldest);
    }
    this.options.onEvent(event);
  }

  private scheduleReconnect() {
    if (this.stopped || document.hidden || this.reconnectTimer !== undefined) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
  }
}