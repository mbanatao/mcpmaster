import { createHash, timingSafeEqual } from 'crypto';

export type RiskClass = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function normalizeJson(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Action envelopes cannot contain non-finite numbers');
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJson(item));
  }

  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Action envelopes may contain only plain JSON objects');
    }

    const output: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) {
        output[key] = normalizeJson(child);
      }
    }
    return output;
  }

  throw new Error(`Unsupported action-envelope value: ${typeof value}`);
}

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

export interface ActionEnvelope {
  toolName: string;
  provider: string;
  accountId: string;
  resourceId?: string;
  requesterId: string;
  arguments: unknown;
}

export function computeActionHash(envelope: ActionEnvelope): string {
  return createHash('sha256').update(canonicalizeJson(envelope), 'utf8').digest('hex');
}

export function secureEqualHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

const SECRET_KEY_PATTERN = /(?:authorization|cookie|password|passphrase|secret|token|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key)/i;
const PERSONAL_KEY_PATTERN = /(?:email|phone|mobile|address|full[_-]?name|first[_-]?name|last[_-]?name|message|body|content|case[_-]?facts?)/i;

export interface RedactionOptions {
  includePersonalData?: boolean;
  maxStringLength?: number;
  maxArrayLength?: number;
}

export function redactForAudit(
  value: unknown,
  options: RedactionOptions = {},
  keyHint = '',
): JsonValue {
  const maxStringLength = options.maxStringLength ?? 500;
  const maxArrayLength = options.maxArrayLength ?? 20;

  if (SECRET_KEY_PATTERN.test(keyHint)) {
    return '[REDACTED_SECRET]';
  }

  if (!options.includePersonalData && PERSONAL_KEY_PATTERN.test(keyHint)) {
    return '[REDACTED_PERSONAL]';
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    if (value.length <= maxStringLength) {
      return value;
    }
    return `${value.slice(0, maxStringLength)}…[TRUNCATED]`;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : '[NON_FINITE_NUMBER]';
  }

  if (Array.isArray(value)) {
    const redacted = value
      .slice(0, maxArrayLength)
      .map((item) => redactForAudit(item, options));
    if (value.length > maxArrayLength) {
      redacted.push(`[${value.length - maxArrayLength} ITEMS OMITTED]`);
    }
    return redacted;
  }

  if (typeof value === 'object') {
    const output: { [key: string]: JsonValue } = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = redactForAudit(child, options, key);
    }
    return output;
  }

  return `[UNSUPPORTED_${typeof value}]`;
}

export function isPageAllowed(pageId: string, allowedPageIds: readonly string[]): boolean {
  const normalizedPageId = pageId.trim();
  if (!normalizedPageId || normalizedPageId.includes('*')) {
    return false;
  }
  return new Set(allowedPageIds.map((id) => id.trim()).filter(Boolean)).has(normalizedPageId);
}

export type LawOfficeReviewReason =
  | 'legal_advice'
  | 'case_merits_or_strategy'
  | 'deadline_or_limitation_period'
  | 'fees_or_engagement_terms'
  | 'conflict_clearance'
  | 'confidential_case_facts'
  | 'outcome_prediction';

const LAW_OFFICE_PATTERNS: ReadonlyArray<{
  reason: LawOfficeReviewReason;
  pattern: RegExp;
}> = [
  {
    reason: 'legal_advice',
    pattern: /\b(?:legal advice|what are my rights|should i sue|am i liable|are they liable|do i have a case)\b/i,
  },
  {
    reason: 'case_merits_or_strategy',
    pattern: /\b(?:merits? of (?:the|my|your) case|legal strategy|case strategy|best argument|defense strategy)\b/i,
  },
  {
    reason: 'deadline_or_limitation_period',
    pattern: /\b(?:deadline|statute of limitations|limitation period|prescriptive period|filing period|appeal period)\b/i,
  },
  {
    reason: 'fees_or_engagement_terms',
    pattern: /\b(?:attorney(?:'s)? fees?|legal fees?|retainer|engagement terms?|representation agreement)\b/i,
  },
  {
    reason: 'conflict_clearance',
    pattern: /\b(?:conflict check|conflict clearance|conflict of interest|opposing party)\b/i,
  },
  {
    reason: 'confidential_case_facts',
    pattern: /\b(?:confidential case facts?|client confession|case evidence|docket number|case number|medical records?)\b/i,
  },
  {
    reason: 'outcome_prediction',
    pattern: /\b(?:will (?:i|we|you|they) win|(?:i|we|you|they) will win|chance of winning|likely outcome|guaranteed result|case is worth)\b/i,
  },
];

export interface LawOfficeTextEvaluation {
  disposition: 'static_information_candidate' | 'legal_review_required';
  reasons: LawOfficeReviewReason[];
}

export function evaluateLawOfficeText(text: string): LawOfficeTextEvaluation {
  const reasons = LAW_OFFICE_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ reason }) => reason);

  return {
    disposition: reasons.length > 0 ? 'legal_review_required' : 'static_information_candidate',
    reasons: [...new Set(reasons)],
  };
}

export interface ExternalWriteAuthorizationInput {
  staffId: string;
  pageId: string;
  allowedPageIds: readonly string[];
  idempotencyKey: string;
  approvalDecision: 'approved' | 'denied' | 'pending' | 'expired' | 'revoked';
  expectedActionHash: string;
  approvedActionHash: string;
  killSwitchActive: boolean;
  outboundText?: string;
  legalReviewConfirmed?: boolean;
}

export interface ExternalWriteAuthorizationResult {
  allowed: boolean;
  reasons: string[];
  requiresLegalReview: boolean;
}

export function authorizeExternalWrite(
  input: ExternalWriteAuthorizationInput,
): ExternalWriteAuthorizationResult {
  const reasons: string[] = [];
  const staffId = input.staffId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const textEvaluation = evaluateLawOfficeText(input.outboundText ?? '');
  const requiresLegalReview = textEvaluation.disposition === 'legal_review_required';

  if (!staffId) {
    reasons.push('authenticated_staff_required');
  }
  if (input.killSwitchActive) {
    reasons.push('emergency_kill_switch_active');
  }
  if (!isPageAllowed(input.pageId, input.allowedPageIds)) {
    reasons.push('page_not_allowlisted');
  }
  if (input.approvalDecision !== 'approved') {
    reasons.push('human_approval_required');
  }
  if (!secureEqualHex(input.expectedActionHash, input.approvedActionHash)) {
    reasons.push('approved_action_hash_mismatch');
  }
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    reasons.push('valid_idempotency_key_required');
  }
  if (requiresLegalReview && !input.legalReviewConfirmed) {
    reasons.push('lawyer_or_secretary_review_required');
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    requiresLegalReview,
  };
}
