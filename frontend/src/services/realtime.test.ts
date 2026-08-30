import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealtimeClient } from './realtime';

const stream = (...chunks: string[]) => {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(encoder.encode(chunks[index++]));
      else controller.close();
    },
  });
};

const event = (id: string) => JSON.stringify({ id, type: 'join_request.created', occurredAt: new Date().toISOString(), teamId: 'team-a' });

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('RealtimeClient', () => {
  it('authenticates the SSE fetch and delivers each event once', async () => {
    const onEvent = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream(
      `id: e1\ndata: ${event('e1')}\n\n`,
      `id: e1\ndata: ${event('e1')}\n\n`,
    ))));
    const client = new RealtimeClient({ onEvent });

    client.start();
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/realtime/events', expect.objectContaining({
      headers: { Authorization: 'Bearer test-token' },
    }));
    client.stop();
  });

  it('reconnects after a disconnected stream with bounded backoff', async () => {
    const onEvent = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(stream()))
      .mockResolvedValueOnce(new Response(stream(`data: ${event('e2')}\n\n`)));
    vi.stubGlobal('fetch', fetchMock);
    const client = new RealtimeClient({ onEvent });

    client.start();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'e2' })));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    client.stop();
  });

  it('does not connect while the document is hidden', () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = new RealtimeClient({ onEvent: vi.fn() });

    client.start();

    expect(fetchMock).not.toHaveBeenCalled();
    client.stop();
  });
});