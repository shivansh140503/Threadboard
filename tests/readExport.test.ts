import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { readExport } from '../src/parser/readExport';

const chat = readFileSync(resolve(process.cwd(), 'fixtures', '01-android-24h-dmy.txt'), 'utf8');

describe('readExport', () => {
  it('reads a .txt file', () => {
    const out = readExport(strToU8(chat), 'WhatsApp Chat with Team.txt');
    expect(out).toMatchObject({ ok: true, text: chat });
  });

  it('reads the chat .txt inside a .zip and ignores media', () => {
    const zip = zipSync({
      'IMG-20261114-WA0001.jpg': new Uint8Array([0xff, 0xd8, 0xff]),
      '_chat.txt': strToU8(chat),
    });
    const out = readExport(zip, 'WhatsApp Chat - Team.zip');
    expect(out).toMatchObject({ ok: true, text: chat, fileName: '_chat.txt' });
  });

  it('gives a friendly error for a broken zip', () => {
    const out = readExport(new Uint8Array([1, 2, 3, 4]), 'chat.zip');
    expect(out.ok).toBe(false);
  });

  it('gives a friendly error for a zip without a chat', () => {
    const out = readExport(zipSync({ 'a.jpg': new Uint8Array([1]) }), 'chat.zip');
    expect(out).toMatchObject({ ok: false, reason: expect.stringContaining('No chat') });
  });

  it('rejects other file types', () => {
    expect(readExport(new Uint8Array([1]), 'photo.png').ok).toBe(false);
  });
});
