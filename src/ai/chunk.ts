import type { Message } from '../parser/types';
import type { Anonymizer } from './anonymize';

export type Line = { idx: number; line: string };
export type Chunk = { lines: Line[]; fromIdx: number; toIdx: number };

const MAX_MESSAGE_CHARS = 1000;

/** "[idx] sender: text" on one line. System messages must already be filtered out. */
export function formatLine(m: Message, anon: Anonymizer): Line {
  let text = m.text.replace(/\s*\n\s*/g, ' ⏎ ');
  if (text.length > MAX_MESSAGE_CHARS) text = text.slice(0, MAX_MESSAGE_CHARS) + '…';
  const sender = m.sender ? anon.sender(m.sender) : 'Unknown';
  return { idx: m.idx, line: `[${m.idx}] ${sender}: ${anon.forward(text)}` };
}

/** Only messages with real content go to the AI. */
export function aiInputMessages(messages: Message[]): Message[] {
  return messages.filter((m) => !m.isSystem && m.sender !== null && m.text.trim() !== '');
}

/**
 * Split into chunks of up to `size` lines with `overlap` lines repeated
 * between neighbours, also capped by total characters so each request stays
 * under the server's body limit.
 */
export function chunkLines(lines: Line[], size = 300, overlap = 30, maxChars = 120_000): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = start;
    let chars = 0;
    while (end < lines.length && end - start < size) {
      const len = (lines[end]?.line.length ?? 0) + 1;
      if (end > start && chars + len > maxChars) break;
      chars += len;
      end++;
    }
    const slice = lines.slice(start, end);
    chunks.push({ lines: slice, fromIdx: slice[0]!.idx, toIdx: slice[slice.length - 1]!.idx });
    if (end >= lines.length) break;
    const next = end - overlap;
    start = next > start ? next : end;
  }
  return chunks;
}
