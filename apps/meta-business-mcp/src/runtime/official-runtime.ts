import type { MetaLiveConfig } from '../live-config';
import {
  OfficialMetaReadProvider,
  type MetaHttpTransport,
} from '../meta/official-read-provider';
import type { SecretResolver } from '../secrets/resolver';
import { MetaNetworkReadExecutor } from '../tools/network-read-executor';
import {
  InMemoryMetaWebhookHealthStore,
  type MetaWebhookHealthStore,
} from '../webhooks/health-store';
import {
  InMemoryMetaWebhookClaimStore,
  MetaWebhookProcessor,
  type MetaWebhookClaimStore,
} from '../webhooks/processor';
import { MetaWebhookSignatureVerifier } from '../webhooks/signature';

export interface CreateOfficialMetaRuntimeOptions {
  config: MetaLiveConfig;
  secretResolver: SecretResolver;
  transport?: MetaHttpTransport;
  webhookHealthStore?: MetaWebhookHealthStore;
  webhookClaimStore?: MetaWebhookClaimStore;
}

export interface OfficialMetaRuntime {
  readExecutor: MetaNetworkReadExecutor;
  webhookProcessor?: MetaWebhookProcessor;
  webhookVerifier?: MetaWebhookSignatureVerifier;
  webhookHealthStore: MetaWebhookHealthStore;
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required for the official Meta runtime`);
  }
  return value;
}

export function createOfficialMetaRuntime(
  options: CreateOfficialMetaRuntimeOptions,
): OfficialMetaRuntime {
  const { config, secretResolver } = options;
  if (!config.networkEnabled) {
    throw new Error('Official Meta runtime requires META_NETWORK_ENABLED=true');
  }

  const webhookHealthStore = options.webhookHealthStore ?? new InMemoryMetaWebhookHealthStore();
  const provider = new OfficialMetaReadProvider({
    apiVersion: config.graphApiVersion,
    pageAccessTokenSecretRef: required(config.tokenSecretRef, 'META_TOKEN_SECRET_REF'),
    secretResolver,
    transport: options.transport,
    requestTimeoutMs: config.requestTimeoutMs,
    webhookHealthReader: webhookHealthStore,
  });
  const readExecutor = new MetaNetworkReadExecutor(provider);

  if (!config.webhooksEnabled) {
    return { readExecutor, webhookHealthStore };
  }

  const webhookVerifier = new MetaWebhookSignatureVerifier({
    appSecretRef: required(config.webhookSecretRef, 'META_WEBHOOK_SECRET_REF'),
    verifyTokenSecretRef: required(
      config.webhookVerifyTokenSecretRef,
      'META_WEBHOOK_VERIFY_TOKEN_SECRET_REF',
    ),
    secretResolver,
  });
  const webhookProcessor = new MetaWebhookProcessor({
    signatureVerifier: webhookVerifier,
    claimStore: options.webhookClaimStore ?? new InMemoryMetaWebhookClaimStore(),
    healthStore: webhookHealthStore,
    allowedPageIds: config.allowedPageIds,
    maxBodyBytes: config.webhookMaxBodyBytes,
  });

  return {
    readExecutor,
    webhookProcessor,
    webhookVerifier,
    webhookHealthStore,
  };
}
