import type {
  CreateMetaDraftInput,
  MetaDraft,
  MetaDraftKind,
  MetaDraftStore,
} from './store';
import { SupabaseRestClient, type FetchLike } from '../supabase/rest-client';

export interface SupabaseMetaDraftStoreOptions {
  supabaseUrl: string;
  publishableKey: string;
  accessToken: string;
  fetchFn?: FetchLike;
  timeoutMs?: number;
}

const DRAFT_KINDS = new Set<MetaDraftKind>([
  'post',
  'comment_reply',
  'message_reply',
  'weekly_plan',
]);

function rowToDraft(value: unknown): MetaDraft {
  const row = typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {};
  const kind = row.kind;
  if (
    typeof row.id !== 'string'
    || typeof row.organization_id !== 'string'
    || typeof row.page_id !== 'string'
    || typeof kind !== 'string'
    || !DRAFT_KINDS.has(kind as MetaDraftKind)
    || typeof row.content !== 'string'
    || typeof row.created_by !== 'string'
    || typeof row.created_at !== 'string'
    || typeof row.legal_review_required !== 'boolean'
    || row.status !== 'draft'
  ) {
    throw new Error('Supabase returned an invalid Meta draft row');
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    pageId: row.page_id,
    kind: kind as MetaDraftKind,
    targetId: typeof row.target_id === 'string' ? row.target_id : undefined,
    content: row.content,
    createdBy: row.created_by,
    createdAt: row.created_at,
    legalReviewRequired: row.legal_review_required,
    status: 'draft',
  };
}

export class SupabaseMetaDraftStore implements MetaDraftStore {
  private readonly client: SupabaseRestClient;

  constructor(options: SupabaseMetaDraftStoreOptions) {
    this.client = new SupabaseRestClient({
      supabaseUrl: options.supabaseUrl,
      apiKey: options.publishableKey,
      accessToken: options.accessToken,
      fetchFn: options.fetchFn,
      timeoutMs: options.timeoutMs,
    });
  }

  async create(input: CreateMetaDraftInput): Promise<MetaDraft> {
    const payload = await this.client.requestJson('/rest/v1/meta_drafts', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        organization_id: input.organizationId,
        page_id: input.pageId,
        kind: input.kind,
        target_id: input.targetId ?? null,
        content: input.content,
        created_by: input.createdBy,
        legal_review_required: input.legalReviewRequired,
      }),
    });

    if (!Array.isArray(payload) || payload.length !== 1) {
      throw new Error('Supabase did not return the created Meta draft');
    }
    return rowToDraft(payload[0]);
  }

  async get(organizationId: string, draftId: string): Promise<MetaDraft | null> {
    const query = new URLSearchParams({
      select: '*',
      organization_id: `eq.${organizationId}`,
      id: `eq.${draftId}`,
      limit: '1',
    });
    const payload = await this.client.requestJson(`/rest/v1/meta_drafts?${query.toString()}`);
    if (!Array.isArray(payload) || payload.length === 0) {
      return null;
    }
    return rowToDraft(payload[0]);
  }

  async list(organizationId: string, pageId: string): Promise<MetaDraft[]> {
    const query = new URLSearchParams({
      select: '*',
      organization_id: `eq.${organizationId}`,
      page_id: `eq.${pageId}`,
      order: 'created_at.desc',
      limit: '100',
    });
    const payload = await this.client.requestJson(`/rest/v1/meta_drafts?${query.toString()}`);
    if (!Array.isArray(payload)) {
      throw new Error('Supabase returned an invalid Meta draft list');
    }
    return payload.map(rowToDraft);
  }
}
