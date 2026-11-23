import type { AiBudgetItem, AiRole, AiTask, AiTextItem, Extraction } from './schema';

const STOP = new Set(['the', 'a', 'an', 'to', 'for', 'of', 'and', 'with', 'on', 'in', 'by', 'from']);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t)),
  );
}

/** Jaccard similarity of word sets. */
export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

const SAME = 0.6;
const union = (a: number[], b: number[]) => [...new Set([...a, ...b])].sort((x, y) => x - y);

/**
 * Link an owner string to a participant: exact, case-insensitive, then a
 * unique first-name match. Anything else becomes null (never invent owners).
 */
export function linkOwner(owner: string | null, participants: string[]): string | null {
  if (!owner) return null;
  const o = owner.trim();
  if (participants.includes(o)) return o;
  const lower = o.toLowerCase();
  const ci = participants.filter((p) => p.toLowerCase() === lower);
  if (ci.length === 1) return ci[0]!;
  const first = lower.split(/\s+/)[0] ?? '';
  const byFirst = participants.filter((p) => (p.toLowerCase().split(/\s+/)[0] ?? '') === first);
  return byFirst.length === 1 ? byFirst[0]! : null;
}

function mergeTasks(all: AiTask[]): AiTask[] {
  const out: AiTask[] = [];
  for (const t of all) {
    const hit = out.find(
      (o) => similarity(o.title, t.title) >= SAME && (o.owner === null || t.owner === null || o.owner === t.owner),
    );
    if (!hit) {
      out.push({ ...t, evidence_idx: [...t.evidence_idx] });
      continue;
    }
    hit.evidence_idx = union(hit.evidence_idx, t.evidence_idx);
    hit.owner = hit.owner ?? t.owner;
    hit.due_text = hit.due_text ?? t.due_text;
    hit.confidence = Math.max(hit.confidence, t.confidence);
    // A later "done" beats an earlier "will do".
    if (t.status_hint === 'done' || hit.status_hint === 'done') hit.status_hint = 'done';
    else if (hit.status_hint === 'unclear') hit.status_hint = t.status_hint;
  }
  return out;
}

function mergeText(all: AiTextItem[]): AiTextItem[] {
  const out: AiTextItem[] = [];
  for (const d of all) {
    const hit = out.find((o) => similarity(o.text, d.text) >= SAME);
    if (hit) hit.evidence_idx = union(hit.evidence_idx, d.evidence_idx);
    else out.push({ ...d, evidence_idx: [...d.evidence_idx] });
  }
  return out;
}

const BUDGET_RANK = { unclear: 0, proposed: 1, approved: 2, paid: 3 } as const;

function mergeBudget(all: AiBudgetItem[]): AiBudgetItem[] {
  const out: AiBudgetItem[] = [];
  for (const b of all) {
    const hit = out.find((o) => o.amount === b.amount && similarity(o.label, b.label) >= 0.4);
    if (!hit) {
      out.push({ ...b, evidence_idx: [...b.evidence_idx] });
      continue;
    }
    hit.evidence_idx = union(hit.evidence_idx, b.evidence_idx);
    if (BUDGET_RANK[b.status_hint] > BUDGET_RANK[hit.status_hint]) hit.status_hint = b.status_hint;
    hit.currency = hit.currency ?? b.currency;
  }
  return out;
}

function mergeRoles(all: AiRole[]): AiRole[] {
  const byPerson = new Map<string, AiRole>();
  for (const r of all) {
    const hit = byPerson.get(r.person);
    if (!hit) {
      byPerson.set(r.person, { ...r, evidence_idx: [...r.evidence_idx] });
      continue;
    }
    hit.evidence_idx = union(hit.evidence_idx, r.evidence_idx);
    // A second, different role is kept rather than silently dropped.
    if (similarity(hit.role, r.role) < 0.5 && !hit.role.toLowerCase().includes(r.role.toLowerCase())) {
      hit.role = `${hit.role}; ${r.role}`.slice(0, 100);
    }
  }
  return [...byPerson.values()];
}

/** Combine per-chunk results: dedupe overlap, link owners to people. */
export function mergeExtractions(parts: Extraction[], participants: string[]): Extraction {
  const tasks = mergeTasks(
    parts.flatMap((p) => p.tasks).map((t) => ({ ...t, owner: linkOwner(t.owner, participants) })),
  );
  const roles = mergeRoles(
    parts
      .flatMap((p) => p.roles)
      .map((r) => ({ ...r, person: linkOwner(r.person, participants) ?? '' }))
      .filter((r) => r.person !== ''),
  );
  const caps = parts.map((p) => p.budget_cap).filter((c): c is NonNullable<typeof c> => c !== null);
  const latestCap = caps.sort((a, b) => Math.max(...b.evidence_idx) - Math.max(...a.evidence_idx))[0] ?? null;

  return {
    tasks,
    decisions: mergeText(parts.flatMap((p) => p.decisions)),
    open_questions: mergeText(parts.flatMap((p) => p.open_questions)),
    budget: mergeBudget(parts.flatMap((p) => p.budget)),
    budget_cap: latestCap,
    roles,
  };
}
