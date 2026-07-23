import type {
  MetaComment,
  MetaInboxThread,
  MetaInboxThreadSummary,
  MetaInsight,
  MetaPage,
  MetaPost,
  MetaProvider,
  MetaWebhookHealth,
} from './provider';

export class SyntheticMetaProvider implements MetaProvider {
  readonly providerKind = 'synthetic' as const;
  readonly networkCapable = false;

  private readonly page: MetaPage;
  private readonly posts: MetaPost[];
  private readonly comments: MetaComment[];
  private readonly threads: MetaInboxThread[];
  private readonly insights: MetaInsight[];

  constructor(pageId = 'synthetic-page') {
    this.page = {
      id: pageId,
      name: 'Batalla & Associates — Synthetic Test Page',
      category: 'Legal Service',
      website: 'https://example.test',
      phone: '+63 000 000 0000',
      address: 'Synthetic Office Address',
    };

    this.posts = [
      {
        id: 'synthetic-post-1',
        pageId,
        message: 'Synthetic office-hours announcement for testing only.',
        createdAt: '2026-07-20T01:00:00.000Z',
        status: 'published',
      },
      {
        id: 'synthetic-post-2',
        pageId,
        message: 'Synthetic consultation-request guidance for testing only.',
        createdAt: '2026-07-18T01:00:00.000Z',
        status: 'published',
      },
    ];

    this.comments = [
      {
        id: 'synthetic-comment-1',
        postId: 'synthetic-post-1',
        authorDisplayName: 'Synthetic Visitor',
        message: 'What number should I call to request a consultation?',
        createdAt: '2026-07-20T02:00:00.000Z',
        needsStaffAttention: true,
      },
    ];

    this.threads = [
      {
        id: 'synthetic-thread-1',
        pageId,
        participantDisplayName: 'Synthetic Inquirer',
        updatedAt: '2026-07-20T03:00:00.000Z',
        unreadCount: 1,
        messages: [
          {
            id: 'synthetic-message-1',
            threadId: 'synthetic-thread-1',
            direction: 'inbound',
            message: 'I would like to request a callback. This is synthetic test data.',
            createdAt: '2026-07-20T03:00:00.000Z',
          },
        ],
      },
    ];

    this.insights = [
      {
        name: 'page_views',
        period: 'week',
        value: 42,
        asOf: '2026-07-20T00:00:00.000Z',
      },
      {
        name: 'post_engagements',
        period: 'week',
        value: 12,
        asOf: '2026-07-20T00:00:00.000Z',
      },
    ];
  }

  private assertPage(pageId: string): void {
    if (pageId !== this.page.id) {
      throw new Error(`Synthetic Page not found: ${pageId}`);
    }
  }

  async getPage(pageId: string): Promise<MetaPage> {
    this.assertPage(pageId);
    return { ...this.page };
  }

  async listPosts(pageId: string, limit: number): Promise<MetaPost[]> {
    this.assertPage(pageId);
    return this.posts.slice(0, limit).map((post) => ({ ...post }));
  }

  async getPost(pageId: string, postId: string): Promise<MetaPost | null> {
    this.assertPage(pageId);
    const post = this.posts.find((candidate) => candidate.id === postId);
    return post ? { ...post } : null;
  }

  async listComments(pageId: string, postId: string, limit: number): Promise<MetaComment[]> {
    this.assertPage(pageId);
    return this.comments
      .filter((comment) => comment.postId === postId)
      .slice(0, limit)
      .map((comment) => ({ ...comment }));
  }

  async listInboxThreads(pageId: string, limit: number): Promise<MetaInboxThreadSummary[]> {
    this.assertPage(pageId);
    return this.threads.slice(0, limit).map(({ messages: _messages, ...thread }) => ({ ...thread }));
  }

  async getInboxThread(pageId: string, threadId: string): Promise<MetaInboxThread | null> {
    this.assertPage(pageId);
    const thread = this.threads.find((candidate) => candidate.id === threadId);
    return thread
      ? {
          ...thread,
          messages: thread.messages.map((message) => ({ ...message })),
        }
      : null;
  }

  async getPageInsights(pageId: string, metricNames: readonly string[]): Promise<MetaInsight[]> {
    this.assertPage(pageId);
    const requested = new Set(metricNames);
    const results = metricNames.length === 0
      ? this.insights
      : this.insights.filter((insight) => requested.has(insight.name));
    return results.map((insight) => ({ ...insight }));
  }

  async getWebhookHealth(pageId: string): Promise<MetaWebhookHealth> {
    this.assertPage(pageId);
    return {
      pageId,
      status: 'unconfigured',
      signatureVerificationEnabled: false,
      pendingDeliveries: 0,
      failedDeliveries: 0,
    };
  }
}
