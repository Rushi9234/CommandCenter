import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useApiRequest } from './useApiRequest';

describe('useApiRequest', () => {
  it('starts with null data, not loading, and no error', () => {
    const { result } = renderHook(() => useApiRequest(() => Promise.resolve('value')));

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.execute).toBe('function');
  });

  it('supports an initial loading state for pages that render loading before their first execute()', () => {
    const { result } = renderHook(() => useApiRequest(() => Promise.resolve('value'), { initialLoading: true }));

    expect(result.current.loading).toBe(true);
  });

  it('sets loading to true while the request is in flight', async () => {
    let resolveRequest: (value: string) => void;
    const requestFn = vi.fn(() => new Promise<string>((resolve) => (resolveRequest = resolve)));
    const { result } = renderHook(() => useApiRequest(requestFn));

    let executePromise: Promise<string>;
    act(() => {
      executePromise = result.current.execute();
    });

    expect(result.current.loading).toBe(true);

    act(() => resolveRequest!('done'));
    await act(async () => {
      await executePromise!;
    });

    expect(result.current.loading).toBe(false);
  });

  it('stores the resolved value in data on a successful request', async () => {
    const { result } = renderHook(() => useApiRequest(() => Promise.resolve({ id: 1, name: 'test' })));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toEqual({ id: 1, name: 'test' });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('captures the error and leaves data untouched when the request rejects', async () => {
    const failure = new Error('request failed');
    const requestFn = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce('recovered');
    const { result } = renderHook(() => useApiRequest(requestFn));

    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow('request failed');
    });

    expect(result.current.error).toBe(failure);
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('can be executed again after a previous call, and clears the prior error on the next attempt', async () => {
    const requestFn = vi.fn().mockRejectedValueOnce(new Error('first attempt failed')).mockResolvedValueOnce('second attempt succeeded');
    const { result } = renderHook(() => useApiRequest(requestFn));

    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow();
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toBe('second attempt succeeded');
    expect(result.current.error).toBeNull();
    expect(requestFn).toHaveBeenCalledTimes(2);
  });
});
