import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useApiRequest } from '../hooks/useApiRequest';
import * as api from '../services/api';

// Leaderboard period filter: values match exactly what the backend
// (leaderboard.controller.ts's VALID_PERIODS) actually supports -- 'all'
// is the default and matches pre-period behavior byte-for-byte.
type LeaderboardPeriod = 'all' | 'today' | 'week' | 'month';
const PERIOD_OPTIONS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

export default function Grid() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  // Read by the mount-effect's `load()` closure (which only ever runs once,
  // see the `useEffect(..., [])` below) so a period change is visible to
  // polling/retry without re-running that effect (which would reset the
  // 30s interval). Kept in sync with `period` synchronously in
  // handlePeriodChange, not via a separate effect -- the fetch triggered
  // by a period change needs the ref to already be current the moment it
  // fires, and effects run a tick later than the state update itself.
  const periodRef = useRef(period);

  // Milestone 20: adopts the shared useApiRequest hook (proof-of-pattern
  // page) instead of a hand-written loading/data useState pair. Behavior
  // preserved exactly: loading starts true (initialLoading), a failed
  // load logs the same message and leaves the last-known leaderboard on
  // screen (the hook never clears `data` on error), and the 30s poll
  // interval is unchanged -- the hook has no polling of its own, this
  // page still owns that.
  //
  // requestFn is wrapped in useCallback with an EMPTY dep array (it reads
  // periodRef, not `period` state directly) so its identity -- and
  // therefore `execute`'s identity -- never changes across renders. That
  // keeps the mount effect's `[]` deps safe: nothing about adding the
  // period filter requires re-running that effect or resetting the 30s
  // interval.
  const requestFn = useCallback(
    () => api.getLeaderboard(periodRef.current).then((response) => response.data.data),
    []
  );
  const { data: leaderboardData, loading, error, execute: loadLeaderboard } = useApiRequest<any[]>(
    requestFn,
    { initialLoading: true }
  );
  const leaderboard: any[] = leaderboardData ?? [];
  // Loading/empty/error granularity fix ([P3]): useApiRequest already
  // distinguishes these cases perfectly well via `data` -- it starts
  // `null` and only ever becomes an array (even `[]`) after a genuinely
  // successful response (see useApiRequest.ts: a failed execute() leaves
  // `data` as whatever it already was, via `...prev`). So `data !== null`
  // is "has a successful response ever landed," independent of `loading`/
  // `error`. No hook change needed -- Grid.tsx just wasn't using the
  // distinction `?? []` already threw away.
  const hasLoadedOnce = leaderboardData !== null;

  // Polling-race fix (sync/loading audit, [P1]): useApiRequest has no
  // overlap/staleness protection of its own (by design -- it's a thin,
  // single-consumer hook), and this was the only caller relying on that
  // being safe. Without a guard, a slow request could still be in flight
  // when the next 30s tick fired, letting two requests race; if the
  // older one resolved after the newer one, useApiRequest's unconditional
  // setState would let it overwrite the newer leaderboard with stale
  // data. inFlight prevents a second request from ever starting while one
  // is still pending, which removes the overlap at its source -- there is
  // never more than one in-flight request, so there is no "stale response"
  // to guard against downstream.
  const inFlight = useRef(false);
  // Exposes the mount effect's `load` to the manual Retry button below,
  // without adding a second, competing fetch path -- Retry reuses the
  // exact same inFlight-guarded function the interval/visibility-return
  // already call, just force=true (bypasses the hidden-tab gate, which is
  // moot anyway since the user is visibly clicking it).
  const loadRef = useRef<(force?: boolean) => void>(() => {});
  const handleRetry = () => loadRef.current(true);
  // Set ONLY by handlePeriodChange, and only for the narrow case where the
  // user switches period WHILE a request is already in flight (that
  // in-flight request is for the OLD period and can't be redirected).
  // Deliberately a separate flag from `inFlight` itself -- a normal
  // poll/retry/visibility-return force call must keep its existing
  // behavior of silently no-op'ing when a request is already in flight
  // (see the existing "does not start a second request if one is already
  // in flight when the tab becomes visible" test); only a genuine period
  // change gets this queued-retry treatment.
  const periodRefetchPending = useRef(false);

  useEffect(() => {
    // Deliberately [] (matching this effect's deps before this
    // milestone), not [loadLeaderboard] -- execute()'s reference changes
    // on every render (see useApiRequest.ts's memoization note), so
    // including it here would re-run this effect, and reset the
    // interval, on every render instead of once on mount.
    //
    // Hidden-tab polling pause (sync/loading audit, [P2]): same
    // force-bypasses-hidden pattern already proven in SOSHub.tsx's
    // loadBlockers/loadMessages. A regular 30s tick calls load() with no
    // argument -- force defaults false, so it's a no-op while the tab is
    // hidden (no wasted network traffic in a background tab). The
    // initial mount call and the visibilitychange-driven refresh both
    // pass force=true so they always fetch regardless of hidden state;
    // the inFlight guard still applies to a forced call too, so
    // returning to the tab while a request is already in flight (e.g.
    // the initial load hasn't finished yet) never starts a second one.
    //
    // Period-filter safety: requestFn (above) always reads periodRef at
    // the moment IT runs, so every poll tick and every retry already use
    // whatever period is currently selected -- no separate wiring needed
    // for that. The one case this guard alone can't handle is a period
    // change that arrives while a request for the OLD period is still in
    // flight; that's handled by periodRefetchPending below, not by
    // changing this function's own logic.
    const load = (force = false) => {
      if ((document.hidden && !force) || inFlight.current) return;
      inFlight.current = true;
      loadLeaderboard()
        .catch((error) => console.error('Failed to load leaderboard:', error))
        .finally(() => {
          inFlight.current = false;
          if (periodRefetchPending.current) {
            periodRefetchPending.current = false;
            load(true);
          }
        });
    };
    loadRef.current = load;
    load(true);
    const interval = setInterval(load, 30000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') load(true);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // User-initiated period switch. periodRef is updated synchronously
  // (not via a useEffect keyed on `period`) so the very next fetch --
  // whether fired immediately below or queued via periodRefetchPending --
  // is guaranteed to already see the new value; an effect would only run
  // on the render after this one, which is too late for the immediate
  // branch. If a request is already in flight (for the OLD period), it
  // can't be redirected -- it's flagged to trigger exactly one follow-up
  // fetch (for the now-current period) the moment it settles, so the
  // in-flight response's period was chosen before this call and the
  // follow-up fetch is guaranteed to be the LAST word (see
  // periodRefetchPending above). This makes it structurally impossible
  // for a stale, older-period response to overwrite the newly-selected
  // period's data: the two requests can never be in flight at the same
  // time in the first place.
  const handlePeriodChange = (next: LeaderboardPeriod) => {
    if (next === period) return;
    setPeriod(next);
    periodRef.current = next;
    if (inFlight.current) {
      periodRefetchPending.current = true;
    } else {
      loadRef.current(true);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', class: 'bg-gradient-to-br from-yellow-400 to-yellow-600', text: 'text-yellow-900' };
    if (rank === 2) return { emoji: '🥈', class: 'bg-gradient-to-br from-gray-300 to-gray-500', text: 'text-gray-900' };
    if (rank === 3) return { emoji: '🥉', class: 'bg-gradient-to-br from-orange-400 to-orange-600', text: 'text-orange-900' };
    return { emoji: `#${rank}`, class: 'bg-gray-100', text: 'text-gray-700' };
  };

  const myRank = leaderboard.findIndex(u => u.user_id === user?.user_id) + 1;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">The Grid</h1>
              <p className="text-gray-600 mt-1">Team leaderboard and rankings</p>
            </div>
            {myRank > 0 && (
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">#{myRank}</div>
                <div className="text-sm text-gray-600">Your Rank</div>
              </div>
            )}
          </div>
          {/* Period filter: a plain, keyboard-accessible button group (not
              a native <select>) so the current selection is always
              visibly readable, not hidden behind a closed dropdown --
              matches the same "clear selected state" requirement the rest
              of the app's filter/tab UIs already follow. */}
          <div className="flex items-center flex-wrap gap-3 mt-4">
            <div role="group" aria-label="Leaderboard time period" className="flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handlePeriodChange(opt.value)}
                  aria-pressed={period === opt.value}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    period === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Non-blocking refresh feedback: only shown once something has
                already loaded, alongside the (still fully visible)
                previous results -- the blocking full-page spinner below
                remains reserved for the genuine first-ever load. */}
            {loading && hasLoadedOnce && (
              <span className="text-xs text-gray-500" role="status">Updating…</span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Loading/empty/error granularity fix ([P3]): `loading` is true
            on EVERY execute() call, including silent 30s background
            polls -- not just the very first load. Gating the blocking
            spinner on `!hasLoadedOnce` too means a background refresh
            (success or failure) never blanks an already-loaded
            leaderboard; only the genuine first-ever load does. This also
            fixes a real, previously-untested defect: before this change,
            the entire leaderboard was replaced by a full-page spinner on
            every single 30s poll tick, even ones that succeeded
            normally. */}
        {loading && !hasLoadedOnce ? (
          <div className="text-center py-12">
            <div className="spinner w-8 h-8 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading rankings...</p>
          </div>
        ) : !hasLoadedOnce && !!error ? (
          // The initial load failed and nothing has ever successfully
          // loaded -- a genuine empty leaderboard and a failed-to-load
          // leaderboard must never look the same (data=null vs data=[]).
          <div role="alert" className="text-center py-12">
            <div className="text-6xl mb-4">⚠️</div>
            <p className="text-gray-700 font-medium mb-4">Unable to load leaderboard</p>
            <button type="button" onClick={handleRetry} className="btn-secondary">
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Cross-section audit fix: the hook already tracked this
                error, Grid just never read it -- a failed poll silently
                left stale rankings on screen with zero feedback.
                Deliberately non-blocking: last-known data stays visible
                (unchanged behavior), this only adds the missing ERROR
                signal alongside it. Only shown once something has
                actually loaded -- the no-data case is handled by the
                initial-error branch above instead. */}
            {hasLoadedOnce && !!error && (
              <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm text-center">
                Failed to refresh rankings. Showing the last known results.
              </div>
            )}

            {/* Top 3 */}
            {leaderboard.length >= 3 && (
              <div className="grid grid-cols-3 gap-4 mb-8">
                {[1, 0, 2].map((idx) => {
                  const player = leaderboard[idx];
                  const rank = idx + 1;
                  const badge = getRankBadge(rank);
                  return (
                    <motion.div
                      key={player.user_id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={`pro-card p-6 text-center ${rank === 1 ? 'transform scale-105' : ''}`}
                    >
                      <div className={`w-16 h-16 mx-auto rounded-full ${badge.class} flex items-center justify-center text-2xl font-bold ${badge.text} mb-3`}>
                        {badge.emoji}
                      </div>
                      <div className="avatar w-20 h-20 mx-auto mb-3 text-lg">
                        {getInitials(player.full_name)}
                      </div>
                      <h3 className="font-bold text-gray-900">{player.full_name}</h3>
                      <p className="text-sm text-gray-600">@{player.username}</p>
                      <div className="mt-4 flex items-center justify-center gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">{player.impact_score}</div>
                          <div className="text-xs text-gray-600">Score</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-600">{player.streak_count}</div>
                          <div className="text-xs text-gray-600">🔥 Streak</div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Rest of Rankings */}
            <div className="pro-card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">All Rankings</h2>
              <div className="space-y-2">
                {leaderboard.map((player, index) => {
                  const rank = index + 1;
                  const badge = getRankBadge(rank);
                  const isCurrentUser = player.user_id === user?.user_id;
                  
                  return (
                    <motion.div
                      key={player.user_id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={`flex items-center justify-between p-4 rounded-lg transition-all ${
                        isCurrentUser ? 'bg-blue-50 border-2 border-blue-500' : 'pro-card-hover'
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`w-10 h-10 rounded-full ${badge.class} flex items-center justify-center font-bold text-sm ${badge.text}`}>
                          {badge.emoji}
                        </div>
                        <div className="avatar w-10 h-10 text-sm">
                          {getInitials(player.full_name)}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 flex items-center gap-2">
                            {player.full_name}
                            {isCurrentUser && <span className="badge badge-blue text-xs">You</span>}
                          </div>
                          <div className="text-sm text-gray-600">@{player.username}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <div className="text-xl font-bold text-blue-600">{player.impact_score}</div>
                          <div className="text-xs text-gray-600">Score</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xl font-bold text-orange-600">{player.streak_count}</div>
                          <div className="text-xs text-gray-600">🔥 Streak</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xl font-bold text-green-600">{player.recent_activity}</div>
                          <div className="text-xs text-gray-600">Logs (7d)</div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {leaderboard.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-6xl mb-4">🏆</div>
                  <p>No rankings yet. Start logging to appear on the leaderboard!</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
