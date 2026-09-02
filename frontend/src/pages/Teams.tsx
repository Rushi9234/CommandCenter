import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useRealtime } from '../hooks/useRealtime';
import { RealtimeEvent } from '../services/realtime';
import { buildTeamTree, hasRealParent, TeamTreeNode } from '../utils/teamHierarchy';

export default function Teams() {
  const { user } = useAuth();
  // Notification deep-linking: ?teamId=... selects that team, overriding
  // the default "first team" -- see the dedicated effect below (reacts to
  // searchParams directly, not just mount, so it also works when the user
  // is already on /teams and clicks another Teams notification).
  const [searchParams, setSearchParams] = useSearchParams();
  const [deepLinkError, setDeepLinkError] = useState('');
  const [teams, setTeams] = useState<any[]>([]);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  // Settings-save server-truth sync: the modal used to bind its inputs
  // directly to `selectedTeam` (onChange mutated it in place), so every
  // keystroke immediately updated the shared detail-pane state -- a
  // failed save left that unsaved edit stuck there permanently, and even
  // a successful save was never actually confirmed against the server
  // response. A separate draft decouples "what the user is typing" from
  // "what's confirmed displayed"; only a successful save (via its
  // response, see handleUpdateSettings) is allowed to update
  // selectedTeam/teams.
  const [settingsDraft, setSettingsDraft] = useState<{ team_name: string; description: string; is_public: boolean } | null>(null);
  const [showJoinByIdModal, setShowJoinByIdModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [teamDetailsLoading, setTeamDetailsLoading] = useState(false);
  // The CALLER's own role in the currently selected team -- drives which
  // management controls are shown (Settings/Invite/role changes/member
  // removal/join-request review). Sourced from the members list response
  // we already fetch, never guessed or assumed.
  const [myRole, setMyRole] = useState<string | null>(null);
  const [parentTeam, setParentTeam] = useState<any>(null);
  const [allTeamsLoading, setAllTeamsLoading] = useState(true);
  const [discoverError, setDiscoverError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Milestone 50: "join by Team ID" preview state -- getTeamPreview
  // (M48) returns only the same safe field set searchTeams already
  // exposes for discoverable teams, so previewing before joining adds no
  // new exposure (see docs/security/SECURITY_FINDINGS.md §20).
  const [joinByIdInput, setJoinByIdInput] = useState('');
  const [previewedTeam, setPreviewedTeam] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // Milestone 50: sub-teams (M37's existing getSubTeams) and today's
  // work-submission status (M49) for whichever team is selected --
  // both membership-gated, already-audited endpoints, no new backend
  // surface.
  const [subTeams, setSubTeams] = useState<any[]>([]);
  const [workSubmissions, setWorkSubmissions] = useState<any[]>([]);

  // Milestone 51: coordinator dashboard -- only populated when the
  // caller is owner/admin of the SELECTED team (see selectTeam); a plain
  // member/viewer never sees this, and the backend independently
  // enforces that regardless of what the frontend shows.
  const [contextDashboard, setContextDashboard] = useState<any>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [newTeam, setNewTeam] = useState({
    teamName: '',
    description: '',
    isPublic: true,
    maxTeamSize: 10,
    teamType: 'main',
    parentTeamId: '',
  });

  const [inviteEmail, setInviteEmail] = useState('');

  // Milestone 50: labels only -- team_type is still free-text/unvalidated
  // on the backend (no consumer branches on it there either, confirmed
  // during M49's re-verification), so this is purely a frontend
  // convenience list, not an enum the backend enforces.
  const CONTEXT_TYPES = [
    { value: 'main', label: 'Normal Team', emoji: '👥' },
    { value: 'classroom', label: 'Subject / Classroom', emoji: '🎓' },
    { value: 'hackathon', label: 'Hackathon', emoji: '🏆' },
  ];
  const contextTypeLabel = (teamType?: string) => CONTEXT_TYPES.find((c) => c.value === teamType)?.label || teamType;
  const contextTypeEmoji = (teamType?: string) => CONTEXT_TYPES.find((c) => c.value === teamType)?.emoji || '👥';

  const [myJoinRequests, setMyJoinRequests] = useState<any[]>([]);

  // Stale-response race fix (sync/loading audit): selectTeam is a
  // multi-stage async flow (members -> join-requests -> parent -> sub-teams
  // + submissions -> dashboard). Without this, a slower response for a
  // team the user has already switched away from could apply its data
  // after a faster response for the newly-selected team, showing the
  // wrong team's members/requests/etc. Every selectTeam() call bumps this
  // version; each stage checks it's still current before applying a
  // response, same pattern already proven in SOSHub.tsx's
  // blockersRequestVersion/messagesRequestVersion.
  const selectTeamRequestVersion = useRef(0);

  // Milestone 52: join-request mutation race prevention. When the user
  // clicks Approve/Reject, the click handler calls the scoped refetch.
  // Simultaneously, the backend publishes an SSE event that also triggers
  // the same refetch. Both use the shared selectTeamRequestVersion token,
  // and the SSE-triggered call can increment it BEFORE the click handler's
  // refetch completes, causing the click handler's correct response to be
  // discarded (version mismatch). Setting these flags prevents the SSE
  // handler from starting its refetch while the corresponding click
  // handler's refetch is in flight. The click handler sets the flag BEFORE
  // the API call and clears it in finally (after refetch completes); the
  // SSE handler checks the flag and skips its refetch if it's set.
  const approvingJoinRequestRef = useRef(false);
  const rejectingJoinRequestRef = useRef(false);

  // Sidebar + Discover Teams hierarchy: `teams` (getMyTeams) and the
  // Discover lists (getAllTeams/searchTeams) all already carry each
  // team's own parent_team_id -- no new schema, no invented data, no
  // backend change (confirmed by reading both repository queries: both
  // are SELECT * against `teams`). Most parents are themselves already
  // present in whichever list is being shown, so their name is available
  // locally with zero extra requests. The one case that needs an extra
  // read is a team whose PARENT is not in that same list (not a member,
  // for the sidebar; not itself public/discoverable or search-matched,
  // for Discover) -- for that case only, getTeamPreview (already used for
  // this exact purpose on the detail pane, membership/discoverability-
  // free, safe fields only) resolves the name, batched and deduplicated
  // by unique missing parent ID so N discover rows sharing one hidden
  // parent cost exactly one request, not N. The Discover portion of this
  // scan is gated on the modal actually being open, so a user who never
  // opens Discover Teams never triggers it. Purely a display cache; never
  // used for any authorization decision.
  const [parentNamesById, setParentNamesById] = useState<Record<string, string>>({});

  useEffect(() => {
    const discoverList = showDiscoverModal ? (searchQuery ? searchResults : allTeams) : [];
    const combined = [...teams, ...discoverList];
    const localIds = new Set(combined.map((t) => t.team_id));
    const missing = Array.from(
      new Set(
        combined
          .filter((t) => t.parent_team_id && !localIds.has(t.parent_team_id) && !parentNamesById[t.parent_team_id])
          .map((t) => t.parent_team_id)
      )
    );
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled(missing.map((id) => api.getTeamPreview(id)));
      if (cancelled) return;
      setParentNamesById((prev) => {
        const next = { ...prev };
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            next[missing[i]] = r.value.data.data.team_name;
          }
        });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [teams, showDiscoverModal, allTeams, searchResults, searchQuery]);

  // Groups `teams` (flat, from getMyTeams) into the sidebar's visual
  // hierarchy using buildTeamTree() -- the SAME recursive, cycle-safe,
  // order-independent utility Discover Teams uses (no second competing
  // hierarchy algorithm). Only bucketing into visual groups is
  // sidebar-specific:
  //  - a root with descendants becomes its own group, headed by itself
  //    (still directly selectable), with every descendant at any depth
  //    rendered recursively beneath it via renderSidebarNode.
  //  - a childless root with no real parent is a genuine independent
  //    team -- grouped under the shared "Independent Team" heading.
  //  - a root that DOES have a real parent_team_id but whose parent isn't
  //    in the user's own team list (buildTeamTree correctly still surfaces
  //    it as a root rather than dropping it) is an orphan: never mislabeled
  //    as independent. Grouped by its resolved parent name (parentNamesById,
  //    same batched/deduplicated lookup already used elsewhere in this
  //    file), falling back to a generic label while that single extra
  //    fetch is in flight or failed. Multiple orphans sharing the same
  //    missing parent share one group.
  const resolveSidebarParentName = (parentId: string): string | null => {
    const local = teams.find((t) => t.team_id === parentId);
    if (local) return local.team_name;
    return parentNamesById[parentId] || null;
  };

  const buildSidebarGroups = () => {
    const tree = buildTeamTree(teams);
    const groups: { key: string; heading: string; headingTeam: any | null; nodes: TeamTreeNode[] }[] = [];
    const independent: TeamTreeNode[] = [];

    for (const root of tree) {
      if (hasRealParent(root.team)) {
        const parentId = root.team.parent_team_id;
        const key = `orphan-${parentId}`;
        let group = groups.find((g) => g.key === key);
        if (!group) {
          group = { key, heading: resolveSidebarParentName(parentId) || 'Sub-team', headingTeam: null, nodes: [] };
          groups.push(group);
        }
        group.nodes.push(root);
      } else if (root.children.length > 0) {
        groups.push({ key: root.team.team_id, heading: root.team.team_name, headingTeam: root.team, nodes: root.children });
      } else {
        independent.push(root);
      }
    }

    if (independent.length > 0) {
      groups.push({ key: 'independent', heading: 'Independent Team', headingTeam: null, nodes: independent });
    }

    return groups;
  };

  // Recursively renders one sidebar node (and its descendants, unlimited
  // depth) -- every team, at any depth, is independently selectable via
  // selectTeam(team) using that exact node's own team_id, never a parent
  // substitution. depth>0 nodes get a "└──" connector, growing indentation
  // per level, and (only when they genuinely have a parent_team_id -- never
  // for the childless "Independent Team" bucket, which passes depth 0) a
  // "Sub-team of X" caption resolved from the node's own immediate parent
  // (so a grandchild correctly says "Sub-team of <its direct parent>", not
  // the top-level ancestor). indexRef is a shared mutable counter across
  // the whole sidebar tree so the existing stagger-in animation delay still
  // increases monotonically, matching pre-hierarchy behavior.
  const renderSidebarNode = (node: TeamTreeNode, depth: number, indexRef: { current: number }) => {
    const { team, children } = node;
    const parentName = hasRealParent(team) ? resolveSidebarParentName(team.parent_team_id) : null;
    return (
      <div key={team.team_id}>
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: indexRef.current++ * 0.05 }}
          onClick={() => selectTeam(team)}
          style={depth > 0 ? { marginLeft: `${depth}rem` } : undefined}
          aria-label={`Select ${team.team_name}`}
          className={`w-full text-left p-3 rounded-lg transition-all ${
            selectedTeam?.team_id === team.team_id
              ? 'bg-blue-50 border-2 border-blue-500 shadow-sm'
              : 'hover:bg-gray-50 border-2 border-transparent'
          }`}
        >
          <div className="font-medium text-gray-900 flex items-center gap-1">
            {depth > 0 && <span className="text-gray-400" aria-hidden="true">└──</span>}
            <span>{team.team_name}</span>
          </div>
          {depth > 0 && hasRealParent(team) && (
            <div className="text-xs text-gray-400 mt-0.5">
              {parentName ? `Sub-team of ${parentName}` : 'Sub-team'}
            </div>
          )}
          <div className="text-xs text-gray-500 mt-1">
            {new Date(team.created_at).toLocaleDateString()}
          </div>
        </motion.button>
        {children.length > 0 && (
          <div role="group" aria-label={`Sub-teams of ${team.team_name}`} className="space-y-2 mt-2">
            {children.map((child) => renderSidebarNode(child, depth + 1, indexRef))}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    // Step 7: getAllTeams' result only feeds the Discover Teams modal, not
    // the main page -- it doesn't belong in the batch that gates
    // initialLoading. A slow/stuck Discover fetch used to block the
    // user's own team list from ever rendering, even though that data
    // (loadTeams) might already be back. It still loads on mount (so the
    // modal has data ready if opened immediately), just independently.
    void loadAllTeams();
    (async () => {
      await Promise.allSettled([loadTeams(), loadInvites(), loadMyJoinRequests()]);
      setInitialLoading(false);
    })();
  }, []);

  const loadMyJoinRequests = async () => {
    try {
      const response = await api.getMyJoinRequests();
      setMyJoinRequests(response.data.data.filter((r: any) => r.status === 'pending'));
    } catch (error) {
      console.error('Failed to load my join requests:', error);
    }
  };

  // Realtime nudge for the currently-selected team must reuse the exact
  // same scoped refetch helpers the direct mutation handlers use
  // (handleApproveJoinRequest/handleRejectJoinRequest below), not the full
  // selectTeam() cascade. selectTeam() synchronously clears teamMembers/
  // joinRequests to [] before refetching everything -- fine for an actual
  // team switch, but wrong here: the approving/rejecting leader is also a
  // subscriber to their own team's realtime channel (events are matched by
  // teamId, not just recipient), so their own action echoes back to their
  // own open connection nearly concurrently with their own mutation's
  // already-correct, already-awaited scoped refetch. Both paths share the
  // same selectTeamRequestVersion ref; with selectTeam()'s heavier,
  // sequential fetch chain racing the lean scoped refetch, resolution
  // order isn't deterministic, so the version guard could discard the
  // correct scoped response or leave the UI blanked mid-cascade. Routing
  // the realtime nudge through the same scoped helpers instead means both
  // triggers cooperate on one non-destructive, version-guarded update
  // path -- no clearing, no race, only ever a final consistent state.
  useRealtime((event: RealtimeEvent) => {
    if (!event.type.startsWith('join_request.')) return;

    // Milestone 52: Skip the SSE-triggered refetch if the click handler is
    // currently inflight (approvingJoinRequestRef.current or
    // rejectingJoinRequestRef.current is true). The click handler will do
    // its own refetch after the mutation succeeds, and both using the same
    // version token would cause a race. This check lets the click handler's
    // refetch complete uncontested, while still allowing the SSE-triggered
    // refetch for OTHER users' actions (when both flags are false).
    if (event.type === 'join_request.approved' && approvingJoinRequestRef.current) return;
    if (event.type === 'join_request.rejected' && rejectingJoinRequestRef.current) return;

    void loadMyJoinRequests();
    if (event.type === 'join_request.approved') {
      void loadTeams();
    }
    if (selectedTeam && event.teamId === selectedTeam.team_id) {
      if (event.type === 'join_request.approved') {
        void refetchTeamMembersAndJoinRequests(selectedTeam.team_id);
      } else {
        void refetchJoinRequests(selectedTeam.team_id);
      }
    }
  });

  const loadTeams = async () => {
    try {
      const response = await api.getMyTeams();
      setTeams(response.data.data);
      // Default-select-first is skipped when a teamId deep link is
      // currently pending -- the dedicated deep-link effect below (which
      // reacts to `teams` finishing loading too) owns selection in that
      // case, so this doesn't race it and briefly select the wrong team.
      if (response.data.data.length > 0 && !selectedTeam && !searchParams.get('teamId')) {
        selectTeam(response.data.data[0]);
      }
    } catch (error) {
      console.error('Failed to load teams:', error);
    }
  };

  // Notification deep-link: reacts to `searchParams` itself, not just
  // mount -- a click on a Teams notification while the user is ALREADY on
  // /teams does not remount this component (same route, only the query
  // string changes), so a mount-only effect would never see it. Also
  // waits for `teams` to actually be populated, covering the fresh-
  // page-load case where the param is present before getMyTeams()
  // resolves. lastProcessedTeamId prevents reprocessing the exact same
  // value while the param-clearing setSearchParams update is still
  // in-flight.
  const lastProcessedTeamId = useRef<string | null>(null);
  useEffect(() => {
    const teamId = searchParams.get('teamId');
    if (!teamId || teamId === lastProcessedTeamId.current || teams.length === 0) return;
    lastProcessedTeamId.current = teamId;
    const target = teams.find((t: any) => t.team_id === teamId);
    if (target) {
      setDeepLinkError('');
      selectTeam(target);
    } else {
      setDeepLinkError("You no longer have access to that team, or it doesn't exist.");
      selectTeam(teams[0]);
    }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, teams]);

  const loadAllTeams = async () => {
    setAllTeamsLoading(true);
    setDiscoverError('');
    try {
      const response = await api.getAllTeams();
      setAllTeams(response.data.data);
    } catch (error) {
      console.error('Failed to load all teams:', error);
      setDiscoverError('Failed to load teams. Please try again.');
    } finally {
      setAllTeamsLoading(false);
    }
  };

  const loadInvites = async () => {
    try {
      const response = await api.getMyInvites();
      setInvites(response.data.data);
    } catch (error) {
      console.error('Failed to load invites:', error);
    }
  };

  const selectTeam = async (team: any) => {
    // Every call gets its own version; a stage only applies its response
    // if this is still the most recent selectTeam() invocation by the
    // time that response arrives. isCurrent() is checked freshly at each
    // stage (not just once) since a newer selectTeam() call can start at
    // any point while this one is still awaiting a later stage.
    const requestVersion = ++selectTeamRequestVersion.current;
    const isCurrent = () => selectTeamRequestVersion.current === requestVersion;

    setSelectedTeam(team);
    // Milestone: previously only subTeams/workSubmissions/contextDashboard
    // were cleared here -- teamMembers/joinRequests were left as-is, so
    // switching teams showed the PREVIOUS team's member list and pending
    // requests under the new team's header until the new fetch resolved.
    setTeamMembers([]);
    setJoinRequests([]);
    setSubTeams([]);
    setWorkSubmissions([]);
    setContextDashboard(null);
    setParentTeam(null);
    setTeamDetailsLoading(true);
    let myMembership: any = null;
    try {
      // Milestone: getJoinRequests is owner/admin-only on the backend
      // (requireTeamRole) -- calling it for a plain member/viewer always
      // 403s. That's harmless today only because the catch below swallows
      // it silently, but it's a wasted round trip and a logged error on
      // every single team switch for most users. Only fetch it once we
      // know (from the members list we already have to fetch anyway)
      // that the caller is actually authorized to see it.
      const membersRes = await api.getTeamMembers(team.team_id);
      if (!isCurrent()) return;
      setTeamMembers(membersRes.data.data);
      myMembership = membersRes.data.data.find((m: any) => m.user_id === user?.user_id);
      setMyRole(myMembership?.role || null);

      if (myMembership && (myMembership.role === 'owner' || myMembership.role === 'admin')) {
        try {
          const requestsRes = await api.getJoinRequests(team.team_id);
          if (!isCurrent()) return;
          setJoinRequests(requestsRes.data.data);
        } catch (error) {
          console.error('Failed to load join requests:', error);
        }
      }
    } catch (error) {
      console.error('Failed to load team data:', error);
    } finally {
      if (isCurrent()) setTeamDetailsLoading(false);
    }

    if (!isCurrent()) return;

    // Hierarchy: resolve the parent team's name via the same
    // membership-free preview endpoint already used for "Join with Team
    // ID" -- no new backend surface, and it's exactly the safe-fields
    // shape needed here (team_name/team_type, nothing sensitive).
    if (team.parent_team_id) {
      try {
        const parentRes = await api.getTeamPreview(team.parent_team_id);
        if (isCurrent()) setParentTeam(parentRes.data.data);
      } catch (error) {
        console.error('Failed to load parent team:', error);
      }
    }

    if (!isCurrent()) return;

    // Milestone 50: best-effort, additive context data -- a failure here
    // (e.g. a normal team with no sub-teams, or nobody has submitted
    // today) must never break the rest of the team view, so each is
    // caught independently rather than sharing the Promise.all above.
    // Milestone: these two are independent of each other, so run them in
    // parallel via allSettled instead of sequential awaits -- same
    // per-call error handling as before, just no longer waiting for one
    // to finish before starting the other.
    const [subTeamsResult, submissionsResult] = await Promise.allSettled([
      api.getSubTeams(team.team_id),
      api.getTeamWorkSubmissions(team.team_id),
    ]);
    if (!isCurrent()) return;
    if (subTeamsResult.status === 'fulfilled') {
      setSubTeams(subTeamsResult.value.data.data);
    } else {
      console.error('Failed to load sub-teams:', subTeamsResult.reason);
    }
    if (submissionsResult.status === 'fulfilled') {
      setWorkSubmissions(submissionsResult.value.data.data);
    } else {
      console.error('Failed to load work submissions:', submissionsResult.reason);
    }

    // Milestone 51: only attempt the coordinator dashboard when the
    // frontend already knows the caller is owner/admin of THIS team --
    // the backend enforces this regardless (requireTeamRole on the
    // route), this check just avoids firing a request that would only
    // ever come back 403 for a plain member/viewer.
    if (myMembership && (myMembership.role === 'owner' || myMembership.role === 'admin')) {
      if (!isCurrent()) return;
      setDashboardLoading(true);
      try {
        const dashboardRes = await api.getContextDashboard(team.team_id);
        if (isCurrent()) setContextDashboard(dashboardRes.data.data);
      } catch (error) {
        console.error('Failed to load context dashboard:', error);
      } finally {
        if (isCurrent()) setDashboardLoading(false);
      }
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Milestone 50: parentTeamId is only sent if the user actually
      // filled it in -- the backend already requires owner/admin access
      // to that exact parent team (requireTeamRoleIfSpecified, M42) and
      // will correctly reject it with a clear error otherwise; nothing
      // here tries to pre-guess or hide that from the user, since the
      // frontend has no way to know in advance who "is" a coordinator.
      await api.createTeam(
        newTeam.teamName,
        newTeam.description,
        newTeam.isPublic,
        newTeam.maxTeamSize,
        newTeam.parentTeamId.trim() || undefined,
        undefined,
        newTeam.teamType
      );
      setShowCreateModal(false);
      setNewTeam({ teamName: '', description: '', isPublic: true, maxTeamSize: 10, teamType: 'main', parentTeamId: '' });
      loadTeams();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  // Milestone 50: preview-before-joining -- getTeamPreview (M48) works
  // for ANY exact Team ID regardless of privacy/discoverability (the
  // same precondition requestJoinTeam already had), so a 404 here means
  // "no team with that exact ID," not "you can't see this team."
  const handlePreviewTeamId = async () => {
    const teamId = joinByIdInput.trim();
    if (!teamId) return;
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewedTeam(null);
    try {
      const res = await api.getTeamPreview(teamId);
      setPreviewedTeam(res.data.data);
    } catch (error: any) {
      setPreviewError(
        error.response?.status === 404
          ? 'No team found with that ID. Double-check the Team ID with whoever shared it.'
          : error.response?.data?.error || 'Failed to preview that team.'
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleJoinPreviewedTeam = async () => {
    if (!previewedTeam) return;
    try {
      await api.requestJoinTeam(previewedTeam.team_id);
      alert('Join request sent! The team owner will review your request.');
      setShowJoinByIdModal(false);
      setJoinByIdInput('');
      setPreviewedTeam(null);
      loadMyJoinRequests();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to send join request');
    }
  };

  const handleInviteByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam) return;
    setLoading(true);
    try {
      await api.inviteByEmail(selectedTeam.team_id, inviteEmail);
      setShowInviteModal(false);
      setInviteEmail('');
      alert('Invitation sent successfully! The user will receive an email with instructions.');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    try {
      await api.acceptInvite(inviteId);
      loadInvites();
      loadTeams();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to accept invitation');
    }
  };

  const handleRejectInvite = async (inviteId: string) => {
    try {
      await api.rejectInvite(inviteId);
      loadInvites();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to reject invitation');
    }
  };

  // Discover Teams search had no stale-response protection at all --
  // found during this task's own audit, not a pre-existing documented
  // gap. The 300ms debounce (below) makes back-to-back keystrokes rare in
  // practice, but nothing prevented an OLDER query's response from
  // resolving after a NEWER one's and overwriting it (real network
  // jitter, not just rapid typing). Same version-token pattern already
  // proven everywhere else in this file (selectTeamRequestVersion).
  const searchRequestVersion = useRef(0);

  const handleSearch = async () => {
    const requestVersion = ++searchRequestVersion.current;
    if (!searchQuery.trim()) {
      if (searchRequestVersion.current === requestVersion) setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    setDiscoverError('');
    try {
      const response = await api.searchTeams(searchQuery);
      if (searchRequestVersion.current !== requestVersion) return;
      setSearchResults(response.data.data);
    } catch (error) {
      if (searchRequestVersion.current !== requestVersion) return;
      console.error('Search failed:', error);
      setDiscoverError('Failed to search teams. Please try again.');
    } finally {
      if (searchRequestVersion.current === requestVersion) setSearchLoading(false);
    }
  };

  // Mutation refetch scoping: removeMember/updateMemberRole/approve-
  // reject-JoinRequest all used to call the FULL selectTeam() cascade
  // (members + join-requests + parent-preview + sub-teams + submissions +
  // dashboard) even though each of these mutations only ever changes
  // team_members and/or join_requests rows on THIS team -- confirmed by
  // reading teams.controller.ts, where all four endpoints return
  // `ok(res, undefined, ...)` (no body to patch from, so a scoped refetch
  // is required rather than a local patch). Sub-teams/work-submissions/
  // coordinator-dashboard/parent-team-preview are never affected by any
  // of these four mutations, so refetching them was always wasted work.
  // Reuses selectTeamRequestVersion (the same ref selectTeam() itself
  // uses) rather than a second, competing race-protection mechanism --
  // bumping it here correctly invalidates any older in-flight selectTeam
  // cascade or scoped refetch for this team, and is itself invalidated if
  // the user switches teams (or another mutation fires) before this
  // resolves.
  const refetchTeamMembers = async (teamId: string) => {
    const requestVersion = ++selectTeamRequestVersion.current;
    try {
      const membersRes = await api.getTeamMembers(teamId);
      if (selectTeamRequestVersion.current !== requestVersion) return;
      setTeamMembers(membersRes.data.data);
      const myMembership = membersRes.data.data.find((m: any) => m.user_id === user?.user_id);
      setMyRole(myMembership?.role || null);
    } catch (error) {
      console.error('Failed to refresh team members:', error);
    }
  };

  const refetchJoinRequests = async (teamId: string) => {
    const requestVersion = ++selectTeamRequestVersion.current;
    try {
      const requestsRes = await api.getJoinRequests(teamId);
      if (selectTeamRequestVersion.current !== requestVersion) return;
      setJoinRequests(requestsRes.data.data);
    } catch (error) {
      console.error('Failed to refresh join requests:', error);
    }
  };

  // Approving a join request both adds a member AND clears that request
  // from the pending list -- both genuinely change, so both are
  // refetched, in parallel, under a single shared version so one doesn't
  // invalidate the other.
  const refetchTeamMembersAndJoinRequests = async (teamId: string) => {
    const requestVersion = ++selectTeamRequestVersion.current;
    const [membersResult, requestsResult] = await Promise.allSettled([
      api.getTeamMembers(teamId),
      api.getJoinRequests(teamId),
    ]);
    if (selectTeamRequestVersion.current !== requestVersion) return;
    if (membersResult.status === 'fulfilled') {
      setTeamMembers(membersResult.value.data.data);
      const myMembership = membersResult.value.data.data.find((m: any) => m.user_id === user?.user_id);
      setMyRole(myMembership?.role || null);
    } else {
      console.error('Failed to refresh team members:', membersResult.reason);
    }
    if (requestsResult.status === 'fulfilled') {
      setJoinRequests(requestsResult.value.data.data);
    } else {
      console.error('Failed to refresh join requests:', requestsResult.reason);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedTeam) return;
    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      await api.removeTeamMember(selectedTeam.team_id, userId);
      await refetchTeamMembers(selectedTeam.team_id);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to remove member');
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    if (!selectedTeam) return;
    try {
      await api.updateMemberRole(selectedTeam.team_id, userId, newRole);
      await refetchTeamMembers(selectedTeam.team_id);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update role');
    }
  };

  const handleJoinTeam = async (teamId: string) => {
    try {
      await api.requestJoinTeam(teamId);
      alert('Join request sent! The team owner will review your request.');
      loadMyJoinRequests();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to send join request');
    }
  };

  const handleApproveJoinRequest = async (requestId: string) => {
    approvingJoinRequestRef.current = true;
    try {
      await api.approveJoinRequest(requestId);
      if (selectedTeam) await refetchTeamMembersAndJoinRequests(selectedTeam.team_id);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to approve request');
    } finally {
      approvingJoinRequestRef.current = false;
    }
  };

  const handleRejectJoinRequest = async (requestId: string) => {
    rejectingJoinRequestRef.current = true;
    try {
      await api.rejectJoinRequest(requestId);
      if (selectedTeam) await refetchJoinRequests(selectedTeam.team_id);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to reject request');
    } finally {
      rejectingJoinRequestRef.current = false;
    }
  };

  const handleLeaveTeam = async () => {
    if (!selectedTeam || !confirm('Are you sure you want to leave this team?')) return;
    try {
      await api.leaveTeam(selectedTeam.team_id);
      setSelectedTeam(null);
      loadTeams();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to leave team');
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam || !settingsDraft) return;
    setLoading(true);
    // Server-truth sync: updateTeamSettings' controller returns the full
    // updated team row (RETURNING * in the repository), and every field
    // the detail pane and sidebar actually render (team_name,
    // description, is_public, parent_team_id, team_type, created_at,
    // team_id) is a plain `teams` column present in that response -- so
    // the mutation response alone is sufficient server truth. No refetch
    // (scoped or full) is needed; this also replaces the previous
    // loadTeams() call, which re-fetched the whole team list but never
    // re-synced the selected-team detail pane at all (the actual bug --
    // the pane kept showing whatever the form's local edits happened to
    // be, not a confirmed server round-trip).
    //
    // Reuses selectTeamRequestVersion (the same ref selectTeam() and the
    // scoped mutation refetches use) so a team switch that happens while
    // this save is still in flight correctly makes this response stale --
    // it must not overwrite whatever team the user has since switched to.
    const requestVersion = ++selectTeamRequestVersion.current;
    const savedTeamId = selectedTeam.team_id;
    try {
      const response = await api.updateTeamSettings(savedTeamId, {
        team_name: settingsDraft.team_name,
        description: settingsDraft.description,
        is_public: settingsDraft.is_public,
      });
      const updatedTeam = response.data.data;
      setShowSettingsModal(false);
      setSettingsDraft(null);
      // The sidebar list isn't scoped to "which team is currently
      // selected" -- patching this specific team's entry is correct
      // regardless of whether the user has since switched away.
      setTeams((prev) => prev.map((t) => (t.team_id === updatedTeam.team_id ? updatedTeam : t)));
      if (selectTeamRequestVersion.current === requestVersion) {
        setSelectedTeam(updatedTeam);
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) handleSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Discover Teams hierarchy card, rendered recursively (unlimited depth,
  // not just one level) by buildTeamTree's node structure. Every node --
  // parent or child, any depth -- gets its own uniform "Request to Join"
  // button and always targets THAT exact node's own team_id (never a
  // parent substitution): unlike the sidebar, Discover Teams has no
  // "select to view" concept, the user isn't necessarily a member of
  // ANY of these teams, so every row must be independently actionable.
  // Indentation is reinforced with a "└──" text marker and an explicit
  // "Sub-team of X" caption -- never relying on indentation/color alone.
  const renderDiscoverNode = (
    node: TeamTreeNode,
    depth: number,
    resolveParentName: (parentId: string) => string | null
  ) => {
    const { team, children } = node;
    const parentName = hasRealParent(team) ? resolveParentName(team.parent_team_id) : null;
    return (
      <div key={team.team_id} className={depth > 0 ? 'ml-6 mt-3' : ''}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 pro-card-hover"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {depth > 0 && <span className="text-gray-400" aria-hidden="true">└──</span>}
                <h3 className="font-semibold text-gray-900">{team.team_name}</h3>
                {team.team_type && team.team_type !== 'main' && (
                  <span className="badge badge-blue text-xs">
                    {contextTypeEmoji(team.team_type)} {contextTypeLabel(team.team_type)}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1">{team.description || 'No description'}</p>
              {/* Real hierarchy only -- never invented. A team with no
                  parent_team_id at all shows no caption here (it's
                  grouped under "Independent Teams" instead, or is itself
                  a hierarchy root with children below). A team WITH a
                  real parent always shows this caption, whether or not
                  that parent happens to be visible in this same result
                  set -- "Parent team unavailable" is an honest fallback,
                  never a guessed/invented name. */}
              {hasRealParent(team) && (
                <p className="text-xs text-gray-400 mt-1">
                  {parentName ? `Sub-team of ${parentName}` : 'Parent team unavailable'}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2">
                {team.owner && (
                  <span className="text-xs text-gray-500">
                    👤 Led by {team.owner.full_name}
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  {team.member_count || 0} members
                </span>
                {team.is_public && <span className="badge badge-green text-xs">Public</span>}
              </div>
            </div>
            <button
              onClick={() => handleJoinTeam(team.team_id)}
              className="btn-primary text-sm"
              aria-label={`Request to join ${team.team_name}`}
            >
              Request to Join
            </button>
          </div>
        </motion.div>
        {children.length > 0 && (
          <div role="group" aria-label={`Sub-teams of ${team.team_name}`}>
            {children.map((child) => renderDiscoverNode(child, depth + 1, resolveParentName))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
              <p className="text-gray-600 mt-1">Collaborate with your team members</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDiscoverModal(true)} className="btn-secondary">
                🔍 Discover Teams
              </button>
              <button onClick={() => { setShowJoinByIdModal(true); setPreviewedTeam(null); setPreviewError(''); setJoinByIdInput(''); }} className="btn-secondary">
                🔑 Join with Team ID
              </button>
              <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                + Create Team / Classroom
              </button>
            </div>
          </div>
        </div>
      </div>

      {deepLinkError && (
        <div role="alert" className="max-w-7xl mx-auto px-6 pt-4">
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm flex items-center justify-between">
            <span>{deepLinkError}</span>
            <button type="button" onClick={() => setDeepLinkError('')} className="text-yellow-700 hover:text-yellow-900 text-xs underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Pending Invites Banner */}
      {invites.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 border-b border-blue-200"
        >
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📬</span>
                <div>
                  <div className="font-semibold text-blue-900">
                    You have {invites.length} pending team {invites.length === 1 ? 'invitation' : 'invitations'}
                  </div>
                  <div className="text-sm text-blue-700">Review and accept to join teams</div>
                </div>
              </div>
              <div className="flex gap-2">
                {invites.slice(0, 2).map((invite) => (
                  <div key={invite.invite_id} className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg">
                    <span className="text-sm font-medium">{invite.team?.team_name}</span>
                    <button
                      onClick={() => handleAcceptInvite(invite.invite_id)}
                      className="text-green-600 hover:text-green-700 text-sm font-medium"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleRejectInvite(invite.invite_id)}
                      className="text-red-600 hover:text-red-700 text-sm font-medium"
                    >
                      Decline
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Milestone 50: Pending Join Requests (mine) -- "Waiting for team
          leader approval" empty state, previously had no data source. */}
      {myJoinRequests.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-yellow-50 border-b border-yellow-200"
        >
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⏳</span>
              <div>
                <div className="font-semibold text-yellow-900">
                  Waiting for approval on {myJoinRequests.length} join {myJoinRequests.length === 1 ? 'request' : 'requests'}
                </div>
                <div className="text-sm text-yellow-700">
                  {myJoinRequests.map((r: any) => r.team?.team_name).filter(Boolean).join(', ') || 'A team leader still needs to review this.'}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        {initialLoading ? (
          <div role="status" className="pro-card p-12 text-center text-gray-500">
            <div className="spinner w-6 h-6 mx-auto mb-3"></div>
            Loading teams...
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Teams List */}
          <div className="lg:col-span-1">
            <div className="pro-card p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Your Teams ({teams.length})</h2>
              <div className="space-y-4">
                <AnimatePresence>
                  {(() => {
                    const indexRef = { current: 0 };
                    return buildSidebarGroups().map((group) => (
                      <div key={group.key} data-testid="sidebar-team-group">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 px-1">
                          {group.heading}
                        </div>
                        <div className="space-y-2">
                          {group.headingTeam && (
                            <motion.button
                              key={group.headingTeam.team_id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: indexRef.current++ * 0.05 }}
                              onClick={() => selectTeam(group.headingTeam)}
                              aria-label={`Select ${group.headingTeam.team_name}`}
                              className={`w-full text-left p-3 rounded-lg transition-all ${
                                selectedTeam?.team_id === group.headingTeam.team_id
                                  ? 'bg-blue-50 border-2 border-blue-500 shadow-sm'
                                  : 'hover:bg-gray-50 border-2 border-transparent'
                              }`}
                            >
                              <div className="font-medium text-gray-900">{group.headingTeam.team_name}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                {new Date(group.headingTeam.created_at).toLocaleDateString()}
                              </div>
                            </motion.button>
                          )}
                          {group.nodes.map((node) =>
                            renderSidebarNode(node, group.headingTeam || group.key.startsWith('orphan-') ? 1 : 0, indexRef)
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                </AnimatePresence>
                {teams.length === 0 && (
                  <div className="text-sm text-gray-500 text-center py-8 space-y-3">
                    <p>You have no teams yet.</p>
                    <p className="text-xs">Got a Team ID from a coordinator or team leader?</p>
                    <button
                      onClick={() => { setShowJoinByIdModal(true); setPreviewedTeam(null); setPreviewError(''); setJoinByIdInput(''); }}
                      className="btn-secondary text-xs w-full"
                    >
                      🔑 Join with Team ID
                    </button>
                    <p className="text-xs">or</p>
                    <button onClick={() => setShowCreateModal(true)} className="btn-primary text-xs w-full">
                      + Create a Team or Classroom
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Team Details */}
          <div className="lg:col-span-3">
            {selectedTeam ? (
              <motion.div
                key={selectedTeam.team_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Team Info */}
                <div className="pro-card p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-2xl font-bold text-gray-900">{selectedTeam.team_name}</h2>
                        {selectedTeam.team_type && selectedTeam.team_type !== 'main' && (
                          <span className="badge badge-blue">
                            {contextTypeEmoji(selectedTeam.team_type)} {contextTypeLabel(selectedTeam.team_type)}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 mt-2">{selectedTeam.description || 'No description provided'}</p>
                      {/* Hierarchy (Step 4): derived only from parent_team_id,
                          which the backend actually returns -- never
                          fabricated. parentTeam is resolved via the
                          membership-free preview endpoint in selectTeam. */}
                      <p className="text-sm text-gray-500 mt-1">
                        {selectedTeam.parent_team_id
                          ? `Sub-team of ${parentTeam ? parentTeam.team_name : '…'}`
                          : 'Independent Team'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">Team ID:</span>
                        <code className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{selectedTeam.team_id}</code>
                      </div>
                      <div className="flex items-center gap-4 mt-4">
                        <span className="badge badge-blue">{teamMembers.length} members</span>
                        <span className={`badge ${selectedTeam.is_public ? 'badge-green' : 'badge-gray'}`}>
                          {selectedTeam.is_public ? '🌐 Public' : '🔒 Private'}
                        </span>
                        <span className="text-sm text-gray-500">
                          Created {new Date(selectedTeam.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {/* Step 2: Settings/Invite are owner/admin-only on the
                          backend (requireTeamRole) -- a plain member could
                          never use these, so don't show them. */}
                      {(myRole === 'owner' || myRole === 'admin') && (
                        <button
                          onClick={() => {
                            setSettingsDraft({
                              team_name: selectedTeam.team_name,
                              description: selectedTeam.description || '',
                              is_public: selectedTeam.is_public,
                            });
                            setShowSettingsModal(true);
                          }}
                          className="btn-secondary"
                        >
                          ⚙️ Settings
                        </button>
                      )}
                      {(myRole === 'owner' || myRole === 'admin') && (
                        <button onClick={() => setShowInviteModal(true)} className="btn-primary">
                          📧 Invite
                        </button>
                      )}
                      {/* leaveTeam rejects the owner (ForbiddenError) -- the
                          owner has no way to leave their own team, only to
                          transfer/delete it (not yet built), so don't show
                          an action that would always fail. */}
                      {myRole !== 'owner' && (
                        <button onClick={handleLeaveTeam} className="btn-secondary text-red-600">
                          🚪 Leave
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Milestone 51: Coordinator Dashboard -- only rendered
                    when contextDashboard was actually loaded (owner/admin
                    of THIS team, per selectTeam). Aggregate counts/
                    booleans only, per-child-team -- see
                    docs/security/SECURITY_FINDINGS.md §22/§23 for why
                    this does not violate M50's "no implicit parent->child
                    access" rule: it never returns a child team's member
                    list, blocker content, task titles, or daily-work
                    text, only counts derived from bulk, backend-side
                    queries the caller's owner/admin role on THIS
                    (parent) team explicitly authorizes. */}
                {dashboardLoading && (
                  <div className="pro-card p-6 text-center text-gray-500">
                    <div className="spinner w-6 h-6 mx-auto mb-2"></div>
                    Loading coordinator dashboard...
                  </div>
                )}
                {contextDashboard && (
                  <div className="pro-card p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Coordinator Dashboard — {contextTypeLabel(contextDashboard.context.team_type) || 'Teams'}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Neutral activity signals only -- not a productivity score. Being a coordinator here does not give you access to any team's own tasks, goals, blockers, or daily work below.
                    </p>

                    {contextDashboard.teams.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No teams have been created in this {contextTypeLabel(contextDashboard.context.team_type) || 'context'} yet.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                          <div className="pro-card p-3 text-center">
                            <div className="text-2xl font-bold text-gray-900">{contextDashboard.summary.total_teams}</div>
                            <div className="text-xs text-gray-500">Teams</div>
                          </div>
                          <div className="pro-card p-3 text-center">
                            <div className="text-2xl font-bold text-green-600">{contextDashboard.summary.submitted_today_count}</div>
                            <div className="text-xs text-gray-500">Submitted Today</div>
                          </div>
                          <div className="pro-card p-3 text-center">
                            <div className="text-2xl font-bold text-red-600">{contextDashboard.summary.blocked_count}</div>
                            <div className="text-xs text-gray-500">Blocked</div>
                          </div>
                          <div className="pro-card p-3 text-center">
                            <div className="text-2xl font-bold text-yellow-600">{contextDashboard.summary.needs_attention_count}</div>
                            <div className="text-xs text-gray-500">Needs Attention</div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {contextDashboard.teams.map((t: any) => (
                            <div key={t.team_id} className="flex items-center justify-between p-3 pro-card-hover">
                              <div>
                                <div className="font-medium text-gray-900">{t.team_name}</div>
                                <div className="text-xs text-gray-500">{t.description || 'No description'}</div>
                                <div className="text-xs text-gray-400 flex items-center gap-2 mt-1">
                                  <code>{t.team_id}</code>
                                  <span>{t.member_count} members</span>
                                  {t.task_progress && <span>{t.task_progress.completed}/{t.task_progress.total} tasks ({t.task_progress.percent}%)</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {t.open_blocker_count > 0 && (
                                  <span className="badge badge-red">🚧 {t.open_blocker_count} blocker{t.open_blocker_count > 1 ? 's' : ''}</span>
                                )}
                                <span className={`badge ${t.submitted_today ? 'badge-green' : 'badge-gray'}`}>
                                  {t.submitted_today ? '✅ Submitted' : '⚪ No recent submission'}
                                </span>
                                {t.needs_attention && <span className="badge badge-yellow">⚠️ Needs Attention</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Milestone 50: Teams in this context (M37's existing
                    getSubTeams -- membership-gated, no new backend
                    surface). Shown to a plain member/viewer who is NOT
                    owner/admin (contextDashboard above covers the
                    owner/admin case with richer, still-neutral data). */}
                {!contextDashboard && subTeams.length > 0 && (
                  <div className="pro-card p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Teams in this {contextTypeLabel(selectedTeam.team_type) || 'context'} ({subTeams.length})
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      You can only see the sub-teams here because you're a member of this parent team -- being a member here does not give you access to any sub-team's own tasks, goals, blockers, or daily work.
                    </p>
                    <div className="space-y-2">
                      {subTeams.map((st: any) => (
                        <div key={st.team_id} className="flex items-center justify-between p-3 pro-card-hover">
                          <div>
                            <div className="font-medium text-gray-900">{st.team_name}</div>
                            <div className="text-xs text-gray-500">{st.description || 'No description'}</div>
                            <code className="text-xs text-gray-400">{st.team_id}</code>
                          </div>
                          <span className={`badge ${st.is_public ? 'badge-green' : 'badge-gray'}`}>
                            {st.is_public ? 'Public' : 'Private'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Milestone 50: neutral, non-scoring activity indicator
                    (Phase E's own explicit rule -- no "hardworking
                    score"). Only shows whether each member has confirmed
                    a daily-work submission for today (M49), never a
                    ranking, never a time-based metric. */}
                <div className="pro-card p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Today's Activity</h3>
                  <p className="text-sm text-gray-500 mb-4">Who has submitted today's confirmed work -- not a productivity score.</p>
                  <div className="flex flex-wrap gap-2">
                    {teamMembers.map((member: any) => {
                      const submitted = workSubmissions.some((s: any) => s.user_id === member.user_id);
                      return (
                        <span
                          key={member.user_id}
                          className={`badge ${submitted ? 'badge-green' : 'badge-gray'}`}
                          title={member.full_name}
                        >
                          {submitted ? '✅' : '⚪'} {member.full_name}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Members */}
                <div className="pro-card p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Members</h3>

                  {teamDetailsLoading && (
                    <div role="status" className="text-center text-gray-500 py-8">
                      <div className="spinner w-5 h-5 mx-auto mb-2"></div>
                      Loading members...
                    </div>
                  )}

                  {/* Join Requests -- also gated on myRole even though
                      joinRequests is already only ever populated for an
                      owner/admin caller (selectTeam only fetches it then);
                      this is defense in depth, not the actual privacy
                      boundary, which is the backend's requireTeamRole on
                      GET /teams/:teamId/join-requests. */}
                  {!teamDetailsLoading && (myRole === 'owner' || myRole === 'admin') && joinRequests.length > 0 && (
                    <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="font-medium text-yellow-900 mb-3">📋 Pending Join Requests ({joinRequests.length})</div>
                      <div className="space-y-2">
                        {joinRequests.map((request) => (
                          <div key={request.request_id} className="flex items-center justify-between bg-white p-3 rounded">
                            <div className="flex items-center gap-3">
                              <div className="avatar w-8 h-8 text-xs">
                                {getInitials(request.user?.full_name || 'U')}
                              </div>
                              <div>
                                <div className="font-medium text-sm">{request.user?.full_name}</div>
                                <div className="text-xs text-gray-500">@{request.user?.username}</div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleApproveJoinRequest(request.request_id)}
                                className="text-green-600 hover:text-green-700 text-sm font-medium px-3 py-1"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectJoinRequest(request.request_id)}
                                className="text-red-600 hover:text-red-700 text-sm font-medium px-3 py-1"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <AnimatePresence>
                      {!teamDetailsLoading && teamMembers.map((member, index) => (
                        <motion.div
                          key={member.user_id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="flex items-center justify-between p-4 pro-card-hover"
                        >
                          <div className="flex items-center gap-3">
                            <div className="avatar w-10 h-10 text-sm">
                              {getInitials(member.full_name || 'U')}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{member.full_name}</div>
                              <div className="text-sm text-gray-500">@{member.username}</div>
                            </div>
                            {/* Step 3: a role badge on every card, not just
                                owner -- backend role enum is owner/admin/
                                manager/member/viewer, so this shows
                                whatever the backend actually says rather
                                than assuming only two tiers exist. */}
                            <span className={`badge ${member.role === 'owner' ? 'badge-yellow' : 'badge-gray'}`}>
                              {member.role === 'owner' && '👑 '}
                              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                            </span>
                          </div>

                          {/* Step 2: same hierarchy rule the backend
                              enforces (removeTeamMemberIfAuthorized /
                              updateMemberRoleIfAuthorized) -- the owner is
                              never manageable by anyone, and an admin
                              cannot manage another admin (or the owner) --
                              only the owner can. A plain member/manager/
                              viewer sees no controls here at all. */}
                          {(() => {
                            const canManage =
                              (myRole === 'owner' || myRole === 'admin') &&
                              member.role !== 'owner' &&
                              (member.role !== 'admin' || myRole === 'owner');
                            if (!canManage) return null;
                            return (
                              <div className="flex items-center gap-3">
                                <select
                                  value={member.role}
                                  onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}
                                  className="input-field text-sm py-1.5"
                                >
                                  <option value="admin">Admin</option>
                                  <option value="manager">Manager</option>
                                  <option value="member">Member</option>
                                  <option value="viewer">Viewer</option>
                                </select>

                                <button
                                  onClick={() => handleRemoveMember(member.user_id)}
                                  className="text-red-600 hover:text-red-700 text-sm font-medium"
                                >
                                  Remove
                                </button>
                              </div>
                            );
                          })()}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="pro-card p-12 text-center"
              >
                <div className="text-6xl mb-4">👥</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Team Selected</h3>
                <p className="text-gray-600 mb-6">Select a team from the list or create a new one</p>
                <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                  Create Your First Team
                </button>
              </motion.div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Create Team Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="pro-card p-6 w-full max-w-md"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Team</h2>
              <form onSubmit={handleCreateTeam} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    What are you creating? *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {CONTEXT_TYPES.map((ct) => (
                      <button
                        key={ct.value}
                        type="button"
                        onClick={() => setNewTeam({ ...newTeam, teamType: ct.value })}
                        className={`p-3 rounded-lg border-2 text-center text-sm transition-all ${
                          newTeam.teamType === ct.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="text-2xl mb-1">{ct.emoji}</div>
                        {ct.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    A classroom or hackathon works exactly like a team -- you'll be its owner and can create sub-teams under it.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Team Name *
                  </label>
                  <input
                    type="text"
                    value={newTeam.teamName}
                    onChange={(e) => setNewTeam({ ...newTeam, teamName: e.target.value })}
                    className="input-field"
                    placeholder={newTeam.teamType === 'classroom' ? 'Software Engineering - TY CSE - 2026' : newTeam.teamType === 'hackathon' ? 'Smart India Hackathon 2026' : 'Engineering Team'}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={newTeam.description}
                    onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                    className="input-field resize-none"
                    rows={3}
                    placeholder="What does this team do?"
                  />
                </div>

                {newTeam.teamType === 'main' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Parent Classroom/Hackathon Team ID (optional)
                    </label>
                    <input
                      type="text"
                      value={newTeam.parentTeamId}
                      onChange={(e) => setNewTeam({ ...newTeam, parentTeamId: e.target.value })}
                      className="input-field"
                      placeholder="Paste the classroom/hackathon's Team ID"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Only works if you're an owner/admin of that classroom/hackathon -- otherwise leave this blank and create a normal team instead.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Team Size Limit *
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="100"
                    value={newTeam.maxTeamSize}
                    onChange={(e) => setNewTeam({ ...newTeam, maxTeamSize: parseInt(e.target.value) || 10 })}
                    className="input-field"
                    placeholder="Enter team size (2-100)"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    Maximum number of team members
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTeam.isPublic}
                      onChange={(e) => setNewTeam({ ...newTeam, isPublic: e.target.checked })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm font-medium text-gray-700">Public team (discoverable by others)</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    Private teams require invitation to join
                  </p>
                </div>

                <div className="flex gap-3">
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Creating...' : 'Create Team'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Invite by Email Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="pro-card p-6 w-full max-w-md"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Invite Team Member</h2>
              <form onSubmit={handleInviteByEmail} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="input-field"
                    placeholder="colleague@company.com"
                    required
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    They'll receive an invitation to join this team
                  </p>
                </div>

                <div className="flex gap-3">
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Sending...' : 'Send Invitation'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Discover Teams Modal */}
      <AnimatePresence>
        {showDiscoverModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="pro-card p-6 w-full max-w-2xl max-h-[80vh] overflow-auto"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Discover Teams</h2>
              
              <div className="mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field"
                  placeholder="Search teams by name or description..."
                  autoFocus
                />
              </div>

              <div className="space-y-3">
                {/* Step 5: LOADING / ERROR / EMPTY / RESULTS as four
                    distinct states -- searchLoading covers an active
                    search, allTeamsLoading covers the initial (or a
                    retried) unfiltered load, so "No teams available"
                    can never render while either is still in flight. */}
                {(searchQuery ? searchLoading : allTeamsLoading) ? (
                  <div role="status" className="text-center py-8">
                    <div className="spinner w-6 h-6 mx-auto mb-2"></div>
                    <p className="text-gray-500">{searchQuery ? 'Searching teams...' : 'Loading teams...'}</p>
                  </div>
                ) : discoverError ? (
                  <div role="alert" className="text-center py-8">
                    <p className="text-red-600 mb-3">{discoverError}</p>
                    <button
                      type="button"
                      onClick={searchQuery ? handleSearch : loadAllTeams}
                      className="btn-secondary"
                    >
                      Retry
                    </button>
                  </div>
                ) : (searchQuery ? searchResults : allTeams).length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    {searchQuery ? 'No teams found' : 'No teams available'}
                  </p>
                ) : (
                  (() => {
                    const discoverList = searchQuery ? searchResults : allTeams;
                    // True nested hierarchy: buildTeamTree walks the REAL
                    // parent_team_id already returned by getAllTeams/
                    // searchTeams (no backend change) -- unlimited depth,
                    // cycle-safe, never invents a relationship that isn't
                    // in the data. A node whose real parent isn't in THIS
                    // result set (not itself public/discoverable, or
                    // didn't match the current search) still shows a
                    // "Sub-team of X" caption via the batched
                    // parentNamesById resolution above, rather than being
                    // mislabeled as independent.
                    const tree = buildTeamTree(discoverList);
                    const resolveParentName = (parentId: string): string | null => {
                      const inList = discoverList.find((t) => t.team_id === parentId);
                      return inList ? inList.team_name : parentNamesById[parentId] || null;
                    };
                    const withHierarchy = tree.filter((n) => n.children.length > 0 || hasRealParent(n.team));
                    const independent = tree.filter((n) => n.children.length === 0 && !hasRealParent(n.team));

                    return (
                      <>
                        {withHierarchy.map((node) => renderDiscoverNode(node, 0, resolveParentName))}
                        {independent.length > 0 && (
                          <div role="group" aria-label="Independent teams">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2 px-1">
                              Independent Teams
                            </h3>
                            <div className="space-y-3">
                              {independent.map((node) => renderDiscoverNode(node, 0, resolveParentName))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()
                )}
              </div>

              <button
                onClick={() => setShowDiscoverModal(false)}
                className="btn-secondary w-full mt-4"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Milestone 50: Join with Team ID -- preview (M48's GET
          /teams/:teamId/preview, no membership/discoverability gate by
          design) before requesting to join (existing POST
          /teams/:teamId/join, unchanged). This is the safe, minimal
          field set the preview endpoint returns -- no member list, no
          project data, nothing beyond what a caller who already knew
          this exact ID could already learn by requesting to join blind. */}
      <AnimatePresence>
        {showJoinByIdModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="pro-card p-6 w-full max-w-md"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Join with Team ID</h2>
              <p className="text-sm text-gray-600 mb-4">
                Ask your coordinator, team leader, or organizer for the Team ID.
              </p>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={joinByIdInput}
                  onChange={(e) => { setJoinByIdInput(e.target.value); setPreviewedTeam(null); setPreviewError(''); }}
                  className="input-field flex-1"
                  placeholder="Paste the Team ID"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handlePreviewTeamId}
                  disabled={previewLoading || !joinByIdInput.trim()}
                  className="btn-secondary"
                >
                  {previewLoading ? 'Looking...' : 'Preview'}
                </button>
              </div>

              {previewError && <p className="text-sm text-red-600 mb-4">{previewError}</p>}

              {previewedTeam && (
                <div className="p-4 pro-card-hover mb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{previewedTeam.team_name}</h3>
                    {previewedTeam.team_type && previewedTeam.team_type !== 'main' && (
                      <span className="badge badge-blue">
                        {contextTypeEmoji(previewedTeam.team_type)} {contextTypeLabel(previewedTeam.team_type)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{previewedTeam.description || 'No description'}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span>{previewedTeam.member_count}/{previewedTeam.max_team_size} members</span>
                    {previewedTeam.owner && <span>Led by {previewedTeam.owner.full_name}</span>}
                  </div>
                  <button onClick={handleJoinPreviewedTeam} className="btn-primary w-full mt-4">
                    Request to Join
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowJoinByIdModal(false)}
                className="btn-secondary w-full"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Team Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && selectedTeam && settingsDraft && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="pro-card p-6 w-full max-w-md"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Team Settings</h2>
              <form onSubmit={handleUpdateSettings} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Team Name *
                  </label>
                  <input
                    type="text"
                    value={settingsDraft.team_name}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, team_name: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={settingsDraft.description}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, description: e.target.value })}
                    className="input-field resize-none"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsDraft.is_public}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, is_public: e.target.checked })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm font-medium text-gray-700">Public team (discoverable)</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    Public teams can be found and joined by anyone
                  </p>
                </div>

                <div className="flex gap-3">
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowSettingsModal(false); setSettingsDraft(null); }}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
