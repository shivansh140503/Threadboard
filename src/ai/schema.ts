import { z } from 'zod';

/** Message indexes that support an item. Every item must cite at least one. */
const EvidenceIdx = z.array(z.number().int().nonnegative()).min(1).max(50);
const ShortText = z.string().trim().min(1).max(500);

export const AiTaskSchema = z.object({
  title: ShortText,
  owner: z.string().trim().min(1).max(100).nullable(),
  due_text: z.string().trim().min(1).max(100).nullable(),
  status_hint: z.enum(['pending', 'done', 'unclear']),
  evidence_idx: EvidenceIdx,
  confidence: z.number().min(0).max(1),
});

export const AiTextItemSchema = z.object({
  text: ShortText,
  evidence_idx: EvidenceIdx,
});

export const AiBudgetItemSchema = z.object({
  label: ShortText,
  /** Major units as stated in the chat (e.g. 1500.5 rupees). Converted to minor units on import. */
  amount: z.number().finite().nonnegative().max(1e12),
  currency: z.string().trim().min(1).max(10).nullable(),
  status_hint: z.enum(['proposed', 'approved', 'paid', 'unclear']),
  evidence_idx: EvidenceIdx,
});

export const AiBudgetCapSchema = z.object({
  amount: z.number().finite().nonnegative().max(1e12),
  currency: z.string().trim().min(1).max(10).nullable(),
  evidence_idx: EvidenceIdx,
});

export const AiRoleSchema = z.object({
  person: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(100),
  evidence_idx: EvidenceIdx,
});

/** What the model must return for each chunk (and what sampleResult.json holds). */
export const ExtractionSchema = z.object({
  tasks: z.array(AiTaskSchema).default([]),
  decisions: z.array(AiTextItemSchema).default([]),
  open_questions: z.array(AiTextItemSchema).default([]),
  budget: z.array(AiBudgetItemSchema).default([]),
  /** Added beyond the base spec so the overall budget cap can be found too. See docs/decisions.md. */
  budget_cap: AiBudgetCapSchema.nullable().default(null),
  roles: z.array(AiRoleSchema).default([]),
});

export type AiTask = z.infer<typeof AiTaskSchema>;
export type AiTextItem = z.infer<typeof AiTextItemSchema>;
export type AiBudgetItem = z.infer<typeof AiBudgetItemSchema>;
export type AiRole = z.infer<typeof AiRoleSchema>;
export type Extraction = z.infer<typeof ExtractionSchema>;
