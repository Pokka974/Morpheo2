import { sqlite } from '@db/client';

export interface ChainDream {
  id: string;
  title: string;
  occurredAt: string;
}

export interface RecurrenceChain {
  /** Stable key — the id of the earliest dream in the chain. */
  id: string;
  dreams: ChainDream[];
}

/** First sentence, or a clipped opening — same derivation as DreamCard's `deriveTitle`. */
function deriveTitle(description: string): string {
  const firstSentence = description.split(/(?<=[.!?])\s/)[0] ?? description;
  return firstSentence.length > 48 ? `${firstSentence.slice(0, 45).trimEnd()}…` : firstSentence;
}

/**
 * Groups dreams the dreamer explicitly linked via "Déjà rêvé de ça" into chains.
 *
 * `linked_dream_id` only ever points at one earlier dream, so the link graph is a
 * forest; each connected component (union-find over the id ↔ linked_dream_id
 * edges) is one chain, listed oldest-first. Chains are sorted by their most
 * recent dream, newest first — a chain someone is actively adding to belongs at
 * the top of Insights, not buried under one nobody has touched in months.
 */
export async function getRecurrenceChains(userId: string): Promise<RecurrenceChain[]> {
  const rows = await sqlite.getAllAsync<{
    id: string;
    description: string;
    occurred_at: string;
    linked_dream_id: string | null;
  }>(
    `SELECT id, description, occurred_at, linked_dream_id FROM dreams
     WHERE user_id = ? AND is_deleted = 0`,
    [userId]
  );

  const byId = new Map(rows.map(r => [r.id, r]));
  const parent = new Map<string, string>();

  function find(id: string): string {
    let root = id;
    while (parent.has(root)) root = parent.get(root)!;
    // Path compression.
    let cur = id;
    while (parent.has(cur)) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const linked = new Set<string>();
  for (const row of rows) {
    if (row.linked_dream_id && byId.has(row.linked_dream_id)) {
      union(row.id, row.linked_dream_id);
      linked.add(row.id);
      linked.add(row.linked_dream_id);
    }
  }

  const groups = new Map<string, string[]>();
  for (const id of linked) {
    const root = find(id);
    const group = groups.get(root) ?? [];
    group.push(id);
    groups.set(root, group);
  }

  const chains: RecurrenceChain[] = Array.from(groups.values()).map(ids => {
    const dreams = ids
      .map(id => byId.get(id)!)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .map(r => ({ id: r.id, title: deriveTitle(r.description), occurredAt: r.occurred_at }));
    return { id: dreams[0]!.id, dreams };
  });

  chains.sort((a, b) => {
    const aLast = a.dreams[a.dreams.length - 1]!.occurredAt;
    const bLast = b.dreams[b.dreams.length - 1]!.occurredAt;
    return bLast.localeCompare(aLast);
  });

  return chains;
}
