import { randomUUID } from 'crypto';

export type MetaDraftKind = 'post' | 'comment_reply' | 'message_reply' | 'weekly_plan';

export interface MetaDraft {
  id: string;
  organizationId: string;
  pageId: string;
  kind: MetaDraftKind;
  targetId?: string;
  content: string;
  createdBy: string;
  createdAt: string;
  legalReviewRequired: boolean;
  status: 'draft';
}

export interface CreateMetaDraftInput {
  organizationId: string;
  pageId: string;
  kind: MetaDraftKind;
  targetId?: string;
  content: string;
  createdBy: string;
  legalReviewRequired: boolean;
}

export interface MetaDraftStore {
  create(input: CreateMetaDraftInput): Promise<MetaDraft>;
  get(organizationId: string, draftId: string): Promise<MetaDraft | null>;
  list(organizationId: string, pageId: string): Promise<MetaDraft[]>;
}

export interface InMemoryDraftStoreOptions {
  createId?: () => string;
  now?: () => Date;
}

export class InMemoryMetaDraftStore implements MetaDraftStore {
  private readonly drafts = new Map<string, MetaDraft>();
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(options: InMemoryDraftStoreOptions = {}) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  async create(input: CreateMetaDraftInput): Promise<MetaDraft> {
    const organizationId = input.organizationId.trim();
    const pageId = input.pageId.trim();
    const createdBy = input.createdBy.trim();
    const content = input.content.trim();

    if (!organizationId || !pageId || !createdBy || !content) {
      throw new Error('Draft organization, Page, creator, and content are required');
    }

    const draft: MetaDraft = {
      id: this.createId(),
      organizationId,
      pageId,
      kind: input.kind,
      targetId: input.targetId?.trim() || undefined,
      content,
      createdBy,
      createdAt: this.now().toISOString(),
      legalReviewRequired: input.legalReviewRequired,
      status: 'draft',
    };

    this.drafts.set(draft.id, draft);
    return { ...draft };
  }

  async get(organizationId: string, draftId: string): Promise<MetaDraft | null> {
    const draft = this.drafts.get(draftId);
    if (!draft || draft.organizationId !== organizationId) {
      return null;
    }
    return { ...draft };
  }

  async list(organizationId: string, pageId: string): Promise<MetaDraft[]> {
    return [...this.drafts.values()]
      .filter(
        (draft) => draft.organizationId === organizationId && draft.pageId === pageId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((draft) => ({ ...draft }));
  }
}
