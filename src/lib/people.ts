/** Two-letter initials for an avatar. Phone-number senders get "#" plus last two digits. */
export function initials(name: string): string {
  const trimmed = name.trim();
  if (/^\+?[\d\s()-]+$/.test(trimmed)) return '#' + trimmed.replace(/\D/g, '').slice(-2);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  const chars = [...first].slice(0, 1).concat([...last].slice(0, 1));
  if (chars.length === 1) chars.push(...[...first].slice(1, 2));
  return chars.join('').toUpperCase() || '?';
}

/** Chat name from an export file name, e.g. "WhatsApp Chat with Fest Team.txt" → "Fest Team". */
export function chatNameFromFile(fileName: string): string {
  const base = fileName.split('/').pop() ?? fileName;
  const name = base
    .replace(/\.(txt|zip)$/i, '')
    .replace(/^WhatsApp Chat( with| -)?\s*/i, '')
    .trim();
  return name && name !== '_chat' ? name : 'My group chat';
}
