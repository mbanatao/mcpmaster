import type { MetaWebhookHealth } from '../meta/provider';
import type { MetaWebhookHealthReader } from '../meta/official-read-provider';

interface MutableHealth {
  pageId: string;
  signatureVerificationEnabled: boolean;
  lastVerifiedAt?: string;
  lastDeliveryAt?: string;
  pendingDeliveries: number;
  failedDeliveries: number;
}

export interface MetaWebhookHealthStore extends MetaWebhookHealthReader {
  recordAccepted(pageId: string, receivedAt: string): Promise<void>;
  recordRejected(pageId: string | undefined, receivedAt: string): Promise<void>;
}

export class InMemoryMetaWebhookHealthStore implements MetaWebhookHealthStore {
  private readonly health = new Map<string, MutableHealth>();

  private state(pageId: string): MutableHealth {
    const existing = this.health.get(pageId);
    if (existing) {
      return existing;
    }
    const created: MutableHealth = {
      pageId,
      signatureVerificationEnabled: true,
      pendingDeliveries: 0,
      failedDeliveries: 0,
    };
    this.health.set(pageId, created);
    return created;
  }

  async recordAccepted(pageId: string, receivedAt: string): Promise<void> {
    const value = this.state(pageId);
    value.lastVerifiedAt = receivedAt;
    value.lastDeliveryAt = receivedAt;
  }

  async recordRejected(pageId: string | undefined, receivedAt: string): Promise<void> {
    if (!pageId) {
      return;
    }
    const value = this.state(pageId);
    value.lastDeliveryAt = receivedAt;
    value.failedDeliveries += 1;
  }

  async getWebhookHealth(pageId: string): Promise<MetaWebhookHealth> {
    const value = this.health.get(pageId);
    if (!value) {
      return {
        pageId,
        status: 'unconfigured',
        signatureVerificationEnabled: true,
        pendingDeliveries: 0,
        failedDeliveries: 0,
      };
    }

    return {
      pageId,
      status: value.failedDeliveries > 0 ? 'degraded' : 'healthy',
      signatureVerificationEnabled: value.signatureVerificationEnabled,
      lastVerifiedAt: value.lastVerifiedAt,
      lastDeliveryAt: value.lastDeliveryAt,
      pendingDeliveries: value.pendingDeliveries,
      failedDeliveries: value.failedDeliveries,
    };
  }
}
