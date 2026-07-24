import type express from 'express';
import {
  SupabaseBearerAuthenticator,
} from '../auth/supabase-bearer';
import { SupabaseOrganizationMembershipResolver } from '../auth/membership';
import { SupabaseMetaDraftStore } from '../drafts/supabase-store';
import type { MetaHttpTransport } from '../meta/official-read-provider';
import { MetaRemoteMcpHandler } from '../mcp/handler';
import { createMetaRemoteMcpApp } from '../mcp/server';
import type { MetaRemoteMcpConfig } from '../remote-config';
import { resolveRequiredSecret, type SecretResolver } from '../secrets/resolver';
import type { FetchLike } from '../supabase/rest-client';
import {
  SupabaseMetaWebhookClaimStore,
  SupabaseMetaWebhookHealthStore,
} from '../webhooks/supabase-stores';
import { createOfficialMetaRuntime, type OfficialMetaRuntime } from './official-runtime';

export interface CreateMetaRemoteRuntimeOptions {
  config: MetaRemoteMcpConfig;
  secretResolver: SecretResolver;
  fetchFn?: FetchLike;
  metaTransport?: MetaHttpTransport;
}

export interface MetaRemoteRuntime {
  app: express.Express;
  official: OfficialMetaRuntime;
}

export async function createMetaRemoteRuntime(
  options: CreateMetaRemoteRuntimeOptions,
): Promise<MetaRemoteRuntime> {
  const { config, secretResolver, fetchFn } = options;
  const serviceKey = await resolveRequiredSecret(
    secretResolver,
    config.supabaseServiceKeySecretRef,
  );

  const webhookStoreOptions = {
    supabaseUrl: config.supabaseUrl,
    serviceKey: serviceKey.value,
    organizationId: config.organizationId,
    installationId: config.installationId,
    fetchFn,
    timeoutMs: config.supabaseTimeoutMs,
  };
  const webhookHealthStore = new SupabaseMetaWebhookHealthStore(webhookStoreOptions);
  const webhookClaimStore = new SupabaseMetaWebhookClaimStore(webhookStoreOptions);

  const official = createOfficialMetaRuntime({
    config,
    secretResolver,
    transport: options.metaTransport,
    webhookHealthStore,
    webhookClaimStore,
  });

  const authenticator = new SupabaseBearerAuthenticator({
    supabaseUrl: config.supabaseUrl,
    publishableKey: config.supabasePublishableKey,
    fetchFn,
    timeoutMs: config.authTimeoutMs,
  });
  const membershipResolver = new SupabaseOrganizationMembershipResolver({
    supabaseUrl: config.supabaseUrl,
    publishableKey: config.supabasePublishableKey,
    fetchFn,
    timeoutMs: config.supabaseTimeoutMs,
  });
  const handler = new MetaRemoteMcpHandler({
    readExecutor: official.readExecutor,
    draftStoreFactory: (accessToken) => new SupabaseMetaDraftStore({
      supabaseUrl: config.supabaseUrl,
      publishableKey: config.supabasePublishableKey,
      accessToken,
      fetchFn,
      timeoutMs: config.supabaseTimeoutMs,
    }),
    organizationId: config.organizationId,
    allowedPageIds: config.allowedPageIds,
    killSwitchActive: config.killSwitchActive,
    networkEnabled: config.networkEnabled,
  });

  const app = createMetaRemoteMcpApp({
    handler,
    authenticator,
    membershipResolver,
    organizationId: config.organizationId,
    allowedOrigins: config.allowedOrigins,
    requireHttps: config.requireHttps,
    requestBodyLimitBytes: config.requestBodyLimitBytes,
    requestsPerMinute: config.requestsPerMinute,
    webhookProcessor: official.webhookProcessor,
    webhookVerifier: official.webhookVerifier,
    webhookBodyLimitBytes: config.webhookMaxBodyBytes,
  });

  return { app, official };
}
