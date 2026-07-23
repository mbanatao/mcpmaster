export interface MetaPage {
  id: string;
  name: string;
  category?: string;
  website?: string;
  phone?: string;
  address?: string;
}

export interface MetaPost {
  id: string;
  pageId: string;
  message: string;
  createdAt: string;
  status: 'published' | 'scheduled';
  scheduledFor?: string;
}

export interface MetaComment {
  id: string;
  postId: string;
  authorDisplayName: string;
  message: string;
  createdAt: string;
  needsStaffAttention: boolean;
}

export interface MetaInboxThreadSummary {
  id: string;
  pageId: string;
  participantDisplayName: string;
  updatedAt: string;
  unreadCount: number;
}

export interface MetaInboxMessage {
  id: string;
  threadId: string;
  direction: 'inbound' | 'outbound';
  message: string;
  createdAt: string;
}

export interface MetaInboxThread extends MetaInboxThreadSummary {
  messages: MetaInboxMessage[];
}

export interface MetaInsight {
  name: string;
  period: 'day' | 'week' | 'month' | 'lifetime';
  value: number;
  asOf: string;
}

export interface MetaWebhookHealth {
  pageId: string;
  status: 'healthy' | 'degraded' | 'unconfigured';
  signatureVerificationEnabled: boolean;
  lastVerifiedAt?: string;
  lastDeliveryAt?: string;
  pendingDeliveries: number;
  failedDeliveries: number;
}

export interface MetaProvider {
  readonly providerKind: 'synthetic' | 'official-meta';
  readonly networkCapable: boolean;

  getPage(pageId: string): Promise<MetaPage>;
  listPosts(pageId: string, limit: number): Promise<MetaPost[]>;
  getPost(pageId: string, postId: string): Promise<MetaPost | null>;
  listComments(pageId: string, postId: string, limit: number): Promise<MetaComment[]>;
  listInboxThreads(pageId: string, limit: number): Promise<MetaInboxThreadSummary[]>;
  getInboxThread(pageId: string, threadId: string): Promise<MetaInboxThread | null>;
  getPageInsights(pageId: string, metricNames: readonly string[]): Promise<MetaInsight[]>;
  getWebhookHealth(pageId: string): Promise<MetaWebhookHealth>;
}
