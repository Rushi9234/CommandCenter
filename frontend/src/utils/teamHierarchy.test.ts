import { describe, it, expect } from 'vitest';
import { buildTeamTree, hasRealParent } from './teamHierarchy';

const team = (id: string, parentId: string | null = null, extra: Record<string, any> = {}) => ({
  team_id: id,
  team_name: id,
  parent_team_id: parentId,
  ...extra,
});

describe('buildTeamTree', () => {
  it('an independent team (no parent_team_id) is a root with no children', () => {
    const tree = buildTeamTree([team('a')]);
    expect(tree).toEqual([{ team: team('a'), children: [] }]);
  });

  it('a child team nests under its real parent, not as a root sibling', () => {
    const parent = team('p');
    const child = team('c', 'p');
    const tree = buildTeamTree([parent, child]);

    expect(tree.length).toBe(1);
    expect(tree[0].team.team_id).toBe('p');
    expect(tree[0].children.length).toBe(1);
    expect(tree[0].children[0].team.team_id).toBe('c');
  });

  it('multiple children render under the same parent', () => {
    const parent = team('p');
    const childA = team('a', 'p');
    const childB = team('b', 'p');
    const tree = buildTeamTree([parent, childA, childB]);

    expect(tree.length).toBe(1);
    expect(tree[0].children.map((c) => c.team.team_id).sort()).toEqual(['a', 'b']);
  });

  it('a deeper hierarchy (grandchild) nests recursively, not just one level', () => {
    const grandparent = team('gp');
    const parent = team('p', 'gp');
    const child = team('c', 'p');
    const tree = buildTeamTree([grandparent, parent, child]);

    expect(tree.length).toBe(1);
    expect(tree[0].team.team_id).toBe('gp');
    expect(tree[0].children.length).toBe(1);
    expect(tree[0].children[0].team.team_id).toBe('p');
    expect(tree[0].children[0].children.length).toBe(1);
    expect(tree[0].children[0].children[0].team.team_id).toBe('c');
  });

  it('produces the identical tree regardless of input ordering (child before parent, shuffled, etc.)', () => {
    const grandparent = team('gp');
    const parent = team('p', 'gp');
    const child = team('c', 'p');

    const orderings = [
      [grandparent, parent, child],
      [child, parent, grandparent],
      [parent, child, grandparent],
      [child, grandparent, parent],
    ];

    const trees = orderings.map((teams) => buildTeamTree(teams));
    const shapes = trees.map((tree) =>
      JSON.stringify(tree, (key, value) => (key === 'team' ? value.team_id : value))
    );
    expect(new Set(shapes).size).toBe(1);
  });

  it('a missing parent (parent_team_id points at a team not in the result set) is treated as a root, not dropped', () => {
    const orphan = team('c', 'parent-not-in-set');
    const tree = buildTeamTree([orphan]);

    expect(tree.length).toBe(1);
    expect(tree[0].team.team_id).toBe('c');
    expect(tree[0].children).toEqual([]);
  });

  it('a self-parent cannot cause infinite recursion and the team still renders', () => {
    const selfParent = team('a', 'a');
    const tree = buildTeamTree([selfParent]);

    expect(tree.length).toBe(1);
    expect(tree[0].team.team_id).toBe('a');
    expect(tree[0].children).toEqual([]);
  });

  it('a mutual parent cycle (A parents B, B parents A) cannot infinite-loop and both teams still render', () => {
    const a = team('a', 'b');
    const b = team('b', 'a');
    const tree = buildTeamTree([a, b]);

    // Both team_ids must appear exactly once somewhere in the tree --
    // never dropped, never duplicated, never an infinite structure.
    const collectIds = (nodes: any[]): string[] =>
      nodes.flatMap((n) => [n.team.team_id, ...collectIds(n.children)]);
    const ids = collectIds(tree).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('duplicate team_id entries in the input are de-duplicated, not rendered twice', () => {
    const a1 = team('a', null, { team_name: 'First' });
    const a2 = team('a', null, { team_name: 'Second' });
    const tree = buildTeamTree([a1, a2]);

    expect(tree.length).toBe(1);
    expect(tree[0].team.team_name).toBe('First');
  });

  it('a 3-level cycle (A -> B -> C -> A) cannot infinite-loop and all three teams still render exactly once', () => {
    const a = team('a', 'c');
    const b = team('b', 'a');
    const c = team('c', 'b');
    const tree = buildTeamTree([a, b, c]);

    const collectIds = (nodes: any[]): string[] =>
      nodes.flatMap((n) => [n.team.team_id, ...collectIds(n.children)]);
    const ids = collectIds(tree).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('handles an empty list', () => {
    expect(buildTeamTree([])).toEqual([]);
  });
});

describe('hasRealParent', () => {
  it('is true when parent_team_id is set', () => {
    expect(hasRealParent(team('c', 'p'))).toBe(true);
  });

  it('is false for a genuinely independent team', () => {
    expect(hasRealParent(team('a'))).toBe(false);
  });
});
