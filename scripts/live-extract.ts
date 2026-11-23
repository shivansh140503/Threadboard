// Live check: runs the bundled SYNTHETIC sample chat through the deployed /api/extract.
// Usage: npx vite-node scripts/live-extract.ts  (costs one real API call per chunk)
import { readFileSync } from 'node:fs';
import { parseWhatsApp } from '../src/parser/whatsapp.ts';
import { extractChat } from '../src/ai/extract.ts';
import { similarity } from '../src/ai/merge.ts';
import { ExtractionSchema } from '../src/ai/schema.ts';
import { consentStore, memoryKV } from '../src/lib/storage.ts';

const SITE = 'https://threadboard-sigma.vercel.app';
const chat = readFileSync('src/data/sampleChat.txt', 'utf8');
const expected = ExtractionSchema.parse(JSON.parse(readFileSync('src/data/sampleResult.json', 'utf8')));
const parsed = parseWhatsApp(chat);
if (!parsed.ok) throw new Error(parsed.reason);

const consent = consentStore(memoryKV());
consent.grant('live-test');

let calls = 0;
const fetchImpl: typeof fetch = async (url, init) => {
  calls++;
  const t0 = Date.now();
  const res = await fetch(`${SITE}${String(url)}`, { ...init, headers: { ...(init?.headers as Record<string, string>), Origin: SITE } });
  console.log(`  request ${calls}: HTTP ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return res;
};

const t0 = Date.now();
const out = await extractChat(
  { chatId: 'live-test', messages: parsed.result.messages, participants: parsed.result.participants, anonymize: true },
  { consent, fetchImpl },
);
const ex = out.extraction;
console.log(`\nTotal ${((Date.now() - t0) / 1000).toFixed(1)}s, chunks ${out.totalChunks}, failed ${out.failedChunks}, requests ${calls}`);
console.log(`Counts: tasks ${ex.tasks.length}, decisions ${ex.decisions.length}, questions ${ex.open_questions.length}, budget ${ex.budget.length}, roles ${ex.roles.length}, cap ${ex.budget_cap ? ex.budget_cap.amount : 'none'}`);

console.log('\nTASKS (live)');
for (const t of ex.tasks) {
  const best = Math.max(...expected.tasks.map((e) => similarity(e.title, t.title)));
  console.log(`  [${t.status_hint}] ${t.title} | owner=${t.owner} | due=${t.due_text} | ev=${t.evidence_idx.join(',')} | conf=${t.confidence} | match=${best.toFixed(2)}`);
}
console.log('\nExpected tasks with no live match (sim < 0.4):');
for (const e of expected.tasks) {
  const best = Math.max(0, ...ex.tasks.map((t) => similarity(e.title, t.title)));
  if (best < 0.4) console.log(`  - ${e.title} (${e.owner})`);
}
console.log('\nBUDGET');
for (const b of ex.budget) console.log(`  ${b.label}: ${b.amount} ${b.currency} [${b.status_hint}] ev=${b.evidence_idx.join(',')}`);
console.log('\nROLES');
for (const r of ex.roles) console.log(`  ${r.person}: ${r.role}`);
console.log('\nDECISIONS');
for (const d of ex.decisions) console.log(`  ${d.text}`);
console.log('\nQUESTIONS');
for (const q of ex.open_questions) console.log(`  ${q.text}`);
