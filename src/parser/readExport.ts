import { unzipSync } from 'fflate';

export type ReadOutcome = { ok: true; text: string; fileName: string } | { ok: false; reason: string };

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB is far beyond any text-only export

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
}

/**
 * Turn the bytes of a chosen file (.txt or .zip) into chat text.
 * For a .zip, only the chat .txt is read; media files are never decompressed.
 */
export function readExport(bytes: Uint8Array, fileName: string): ReadOutcome {
  if (bytes.byteLength > MAX_BYTES) {
    return { ok: false, reason: 'That file is too large. Export the chat "Without media" and try again.' };
  }
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.txt')) return { ok: true, text: decode(bytes), fileName };

  if (lower.endsWith('.zip')) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes, { filter: (f) => f.name.toLowerCase().endsWith('.txt') });
    } catch {
      return { ok: false, reason: "We couldn't open that .zip file. Try exporting the chat again." };
    }
    const names = Object.keys(files).filter((n) => !n.startsWith('__MACOSX/'));
    const chosen =
      names.find((n) => /(^|\/)_chat\.txt$/i.test(n)) ??
      names.find((n) => /whatsapp chat/i.test(n)) ??
      names[0];
    const data = chosen ? files[chosen] : undefined;
    if (!chosen || !data) return { ok: false, reason: 'No chat .txt file was found inside that .zip.' };
    return { ok: true, text: decode(data), fileName: chosen };
  }

  return { ok: false, reason: 'Please choose the .txt or .zip file that WhatsApp exported.' };
}
