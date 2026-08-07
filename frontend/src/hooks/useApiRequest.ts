import { useCallback, useState } from 'react';

interface UseApiRequestState<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
}

interface UseApiRequestOptions {
  // Some pages show a loading state from their very first render, before
  // any effect has had a chance to call execute() (e.g. Grid.tsx today
  // initializes `loading` to true, not false). This is the one knob
  // needed to let an adopting page preserve that exactly -- not a general
  // options surface.
  initialLoading?: boolean;
}

// Milestone 20: the frontend's one shared way to run an API call and
// track its loading/data/error state, replacing the same hand-written
// useState-trio-plus-try/catch shape every page previously repeated on
// its own. Deliberately narrow -- no retries, no caching, no polling, no
// pagination, no optimistic updates, no toast notifications, no auth
// logic. A page that wants polling (Grid.tsx does) still owns that
// itself, just by calling the returned execute() on an interval -- the
// hook has no opinion about when or how often it's called.
export function useApiRequest<T>(requestFn: () => Promise<T>, options: UseApiRequestOptions = {}) {
  const [state, setState] = useState<UseApiRequestState<T>>({
    data: null,
    loading: options.initialLoading ?? false,
    error: null,
  });

  // Note for future adopters: requestFn is not memoized here, so a new
  // inline arrow function on every render produces a new `execute`
  // reference too. Fine for a one-shot call in a `useEffect(..., [])`
  // (this milestone's only adopter) -- a page that needs execute() inside
  // a dependency array should memoize requestFn itself (useCallback) to
  // avoid a re-run loop.
  const execute = useCallback(async (): Promise<T> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await requestFn();
      setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      // Data is deliberately left as whatever it already was -- a failed
      // re-fetch shouldn't wipe out data a previous successful call
      // already stored (Grid.tsx's existing behavior: a failed poll
      // leaves the last-known leaderboard on screen).
      setState((prev) => ({ ...prev, loading: false, error }));
      throw error;
    }
  }, [requestFn]);

  return { data: state.data, loading: state.loading, error: state.error, execute };
}
