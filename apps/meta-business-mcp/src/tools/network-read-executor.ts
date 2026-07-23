import { redactForAudit, type JsonValue } from '../../../../packages/shared-security/dist/index';
import type { MetaProvider } from '../meta/provider';
import { evaluateMetaInvocation } from '../security/policy';
import { getMetaToolDefinition } from './catalog';
import {
  MetaPolicyDeniedError,
  MetaWriteExecutionDisabledError,
  type MetaExecutionContext,
} from './executor';

export interface MetaNetworkReadExecutionResult {
  toolName: string;
  mode: 'read';
  data: unknown;
  policy: {
    actionHash?: string;
    requiresLegalReview: boolean;
  };
  audit: {
    argumentsRedacted: JsonValue;
  };
}

function requiredString(argumentsValue: Record<string, unknown>, key: string): string {
  const value = argumentsValue[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function optionalLimit(argumentsValue: Record<string, unknown>): number {
  const value = argumentsValue.limit;
  if (value === undefined) {
    return 25;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error('limit must be an integer between 1 and 100');
  }
  return value;
}

function optionalStringArray(argumentsValue: Record<string, unknown>, key: string): string[] {
  const value = argumentsValue[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${key} must be an array of strings`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

export class MetaNetworkReadExecutor {
  constructor(private readonly provider: MetaProvider) {
    if (!provider.networkCapable || provider.providerKind !== 'official-meta') {
      throw new Error('MetaNetworkReadExecutor requires the official network-capable Meta provider');
    }
  }

  async execute(
    toolName: string,
    argumentsValue: Record<string, unknown>,
    context: MetaExecutionContext,
  ): Promise<MetaNetworkReadExecutionResult> {
    const definition = getMetaToolDefinition(toolName);
    if (definition?.mode === 'write') {
      throw new MetaWriteExecutionDisabledError(toolName);
    }
    if (!definition || definition.mode !== 'read') {
      throw new MetaPolicyDeniedError(toolName, ['network_executor_read_only']);
    }

    const pageId = requiredString(argumentsValue, 'pageId');
    const policy = evaluateMetaInvocation(toolName, {
      staffId: context.staffId,
      requesterId: context.requesterId,
      pageId,
      allowedPageIds: context.allowedPageIds,
      arguments: argumentsValue,
      killSwitchActive: context.killSwitchActive,
      networkEnabled: context.networkEnabled,
    });

    const reasons = [...policy.reasons];
    if (!context.networkEnabled) {
      reasons.push('meta_network_disabled');
    }
    if (!policy.allowed || reasons.length > 0) {
      throw new MetaPolicyDeniedError(toolName, [...new Set(reasons)]);
    }

    let data: unknown;
    switch (toolName) {
      case 'meta_page_get':
        data = await this.provider.getPage(pageId);
        break;
      case 'meta_page_list_posts':
        data = await this.provider.listPosts(pageId, optionalLimit(argumentsValue));
        break;
      case 'meta_post_get':
        data = await this.provider.getPost(pageId, requiredString(argumentsValue, 'postId'));
        break;
      case 'meta_post_list_comments':
        data = await this.provider.listComments(
          pageId,
          requiredString(argumentsValue, 'postId'),
          optionalLimit(argumentsValue),
        );
        break;
      case 'meta_inbox_list_threads':
        data = await this.provider.listInboxThreads(pageId, optionalLimit(argumentsValue));
        break;
      case 'meta_inbox_get_thread':
        data = await this.provider.getInboxThread(
          pageId,
          requiredString(argumentsValue, 'threadId'),
        );
        break;
      case 'meta_page_get_insights':
        data = await this.provider.getPageInsights(
          pageId,
          optionalStringArray(argumentsValue, 'metricNames'),
        );
        break;
      case 'meta_webhook_health':
        data = await this.provider.getWebhookHealth(pageId);
        break;
      default:
        throw new MetaPolicyDeniedError(toolName, ['unsupported_network_read_tool']);
    }

    return {
      toolName,
      mode: 'read',
      data,
      policy: {
        actionHash: policy.actionHash,
        requiresLegalReview: policy.requiresLegalReview,
      },
      audit: {
        argumentsRedacted: redactForAudit(argumentsValue),
      },
    };
  }
}
