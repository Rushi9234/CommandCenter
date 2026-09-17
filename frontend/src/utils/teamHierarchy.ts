// Pure, reusable team-hierarchy builder -- deliberately NOT the same
// function as Teams.tsx's buildSidebarGroups(). That one is a flat,
// 2-level grouping (root -> direct children only; a grandchild whose
// parent is itself a child is silently never rendered) tightly coupled
// to the sidebar's own needs (a clickable "headingTeam," an "Independent
// Team" bucket, orphan-parent grouping). Discover Teams needs genuine
// unlimited-depth recursion (parent_team_id is a self-referential FK with
// no depth limit) and every node -- parent or child, any depth -- needs
// its own uniform "Request to Join" affordance, not a "select to view"
// concept. Extracting a *new* small pure function here, rather than
// bending buildSidebarGroups() to do double duty, keeps the
// well-tested/working sidebar completely untouched and keeps this
// function trivially unit-testable in isolation (see teamHierarchy.test.ts)
// without rendering the whole Teams page.
//
// Never invents hierarchy: only ever uses each team's own real
// parent_team_id, already returned by the existing GET /teams and
// GET /teams/search endpoints (no backend change).

export interface TeamTreeNode {
  team: any;
  children: TeamTreeNode[];
}

// Cycle-safe, duplicate-safe, missing-parent-safe, and independent of API
// ordering (child-before-parent, parent-before-child, or fully shuffled
// all produce the identical tree). Every team_id present in `teams`
// appears in the output exactly once -- either nested under its real
// parent, or as a root if its parent isn't in this result set / doesn't
// exist / would only be reachable via a cycle. Nothing is ever silently
// dropped, and a corrupt/cyclic parent_team_id can never cause infinite
// recursion.
export function buildTeamTree(teams: any[]): TeamTreeNode[] {
  const byId = new Map<string, any>();
  for (const t of teams) {
    if (t && t.team_id && !byId.has(t.team_id)) {
      byId.set(t.team_id, t); // duplicate-safe: first occurrence wins
    }
  }

  const childrenByParent = new Map<string, any[]>();
  for (const t of byId.values()) {
    if (t.parent_team_id && t.parent_team_id !== t.team_id && byId.has(t.parent_team_id)) {
      const list = childrenByParent.get(t.parent_team_id) || [];
      list.push(t);
      childrenByParent.set(t.parent_team_id, list);
    }
  }

  const visited = new Set<string>();

  // ancestors carries the current root-to-here path so a cycle anywhere
  // in the chain (not just a direct self-parent) can never be walked
  // twice -- the cyclic member simply stops growing children at the
  // point it would re-enter its own ancestry, rather than looping.
  const buildNode = (team: any, ancestors: Set<string>): TeamTreeNode => {
    visited.add(team.team_id);
    const children = (childrenByParent.get(team.team_id) || [])
      .filter((c) => !ancestors.has(c.team_id))
      .map((c) => buildNode(c, new Set(ancestors).add(c.team_id)));
    return { team, children };
  };

  const roots: TeamTreeNode[] = [];
  for (const t of byId.values()) {
    if (!t.parent_team_id || !byId.has(t.parent_team_id)) {
      roots.push(buildNode(t, new Set([t.team_id])));
    }
  }
  // Safety net: a team stuck entirely inside a cycle (every member of the
  // cycle has a parent_team_id that IS present in byId, so none of them
  // ever qualifies as a root above) would otherwise never be visited at
  // all -- shown here as its own standalone root instead of silently
  // disappearing from Discover Teams.
  for (const t of byId.values()) {
    if (!visited.has(t.team_id)) {
      roots.push(buildNode(t, new Set([t.team_id])));
    }
  }

  return roots;
}

// A node's REAL parent_team_id may point outside the current result set
// entirely (the parent isn't public/discoverable, or didn't match a
// search query) -- true independence (no parent at all) must never be
// conflated with "parent just isn't shown here." Used to decide the
// "Sub-team of X" caption vs treating a node as a genuine independent
// team.
export function hasRealParent(team: any): boolean {
  return !!team.parent_team_id;
}
