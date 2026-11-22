export type ChatFormat = 'android-24h' | 'android-12h' | 'ios-24h' | 'ios-12h';
export type DateOrder = 'DMY' | 'MDY' | 'ambiguous';

export type Message = {
  /** Stable 0-based index, used as the evidence reference. Includes system messages. */
  idx: number;
  /** Local ISO 8601 (no timezone, as exported), null if unparseable. */
  ts: string | null;
  /**
   * null for group events (encryption notice, joins/leaves, subject changes).
   * Media-omitted and deleted messages keep their sender but are still isSystem.
   */
  sender: string | null;
  text: string;
  /** System messages are excluded from AI input. */
  isSystem: boolean;
};

export type ParseWarning = { line: number; reason: string };

export type ParseResult = {
  format: ChatFormat;
  dateOrder: DateOrder;
  messages: Message[];
  participants: string[];
  warnings: ParseWarning[];
};

export type ParseOutcome =
  | { ok: true; result: ParseResult }
  | { ok: false; reason: string };
