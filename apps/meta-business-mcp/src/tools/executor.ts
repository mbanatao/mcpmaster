import { redactForAudit, type JsonValue } from '../../../../packages/shared-security/dist/index';
import type { MetaDraft, MetaDraftStore } from '../drafts/store';
import type { MetaProvider } from '../meta/provider';
import { evaluateMetaInvocation, type MetaPolicyDecision } from '../security/policy';
import { getMetaToolDefinition } from './catalog';

export interface MetaExecutionContext {
  organizationId: string;
  staffId: string;
  requesterId: string;
  allowedPageIds: readonly string[];
  killSwitchActive: boolean;
  networkEnabled: boolean;
}

export interface MetaToolExecutionResult {
  toolName: string;
  mode: 'read' | 'draft';
  data: unknown;
  policy: {
    actionHash?: string;
    requiresLegalReview: boolean;
  };
  audit: {
    argumentsRedacted: JsonValue;
  };
}

export class MetaPolicyDeniedError extends Error {
  readonly reasons: string[];

  constructor(toolName: string, reasons: string[]) {
    super(`Meta tool ${toolName} denied: ${reasons.join(', ')}`);
    this.name = 'MetaPolicyDeniedError';
    this.reasons = reasons;
  }
}

export class MetaWriteExecutionDisabledError extends Error {
  constructor(toolName: string) {
    super(`Meta write execution is not implemented in this milestone: ${toolName}`);
    this.name = 'MetaWriteExecutionDisabledError';
  }
}

function requiredString(
  argumentsValue: Record<string, unknown>,
  key: string,
): string {
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

function optionalStringArray(
  argumentsValue: Record<string, unknown>,
  key: string,
): string[] {
  const value = argumentsValue[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${key} must be an array of strings`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function policyFor(
  toolName: string,
  argumentsValue: Record<string, unknown>,
  context: MetaExecutionContext,
): MetaPolicyDecision {
  return evaluateMetaInvocation(toolName, {
    staffId: context.staffId,
    requesterId: context.requesterId,
    pageId: requiredString(argumentsValue, 'pageId'),
    allowedPageIds: context.allowedPageIds,
    arguments: argumentsValue,
    killSwitchActive: context.killSwitchActive,
    networkEnabled: context.networkEnabled,
  });
}

function weeklyPlanContent(argumentsValue: Record<string, unknown>): string {
  const topics = optionalStringArray(argumentsValue, 'topics');
  if (topics.length === 0) {
    throw new Error('topics must contain at least one topic');
  }

  const weekOf = typeof argumentsValue.weekOf === 'string' && argumentsValue.weekOf.trim()
    ? argumentsValue.weekOf.trim()
    : 'unspecified week';

  return [`Weekly content plan — ${weekOf}`, ...topics.map((topic, index) => `${index + 1}. ${topic}`)].join('\n');
}

export class MetaReadDraftExecutor {
  constructor(
    private readonly provider: MetaProvider,
    private readonly drafts: MetaDraftStore,
  ) {
    if (provider.networkCapable) {
      throw new Error('This milestone accepts only a non-networked Meta provider');
    }
  }

  async execute(
    toolName: string,
    argumentsValue: Record<string, unknown>,
    context: MetaExecutionContext,
  ): Promise<MetaToolExecutionResult> {
    const definition = getMetaToolDefinition(toolName);
    if (definition?.mode === 'write') {
      throw new MetaWriteExecutionDisabledError(toolName);
    }

    const policy = policyFor(toolName, argumentsValue, context);
    if (!policy.allowed || !policy.tool) {
      throw new MetaPolicyDeniedError(toolName, policy.reasons);
    }

    const pageId = requiredString(argumentsValue, 'pageId');
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
      case 'meta_post_create_draft':
        data = await this.createDraft('post', pageId, argumentsValue, context, policy);
        break;
      case 'meta_comment_create_reply_draft':
        data = await this.createDraft(
          'comment_reply',
          pageId,
          argumentsValue,
          context,
          policy,
          `${requiredString(argumentsValue, 'postId')}:${requiredString(argumentsValue, 'commentId')}`,
        );
        break;
      case 'meta_message_create_reply_draft':
        data = await this.createDraft(
          'message_reply',
          pageId,
          argumentsValue,
          context,
          policy,
          requiredString(argumentsValue, 'threadId'),
        );
        break;
      case 'meta_content_create_weekly_plan':
        data = await this.drafts.create({
          organizationId: context.organizationId,
          pageId,
          kind: 'weekly_plan',
          content: weeklyPlanContent(argumentsValue),
          createdBy: context.staffId,
          legalReviewRequired: policy.requiresLegalReview,
        });
        break;
      default:
        throw new MetaPolicyDeniedError(toolName, ['unsupported_read_or_draft_tool']);
    }

    return {
      toolName,
      mode: policy.tool.mode,
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

  private async createDraft(
    kind: MetaDraft['kind'],
    pageId: string,
    argumentsValue: Record<string, unknown>,
    context: MetaExecutionContext,
    policy: MetaPolicyDecision,
    targetId?: string,
  ): Promise<MetaDraft> {
    return this.drafts.create({
      organizationId: context.organizationId,
      pageId,
      kind,
      targetId,
      content: requiredString(argumentsValue, 'message'),
      createdBy: context.staffId,
      legalReviewRequired: policy.requiresLegalReview,
    });
  }
}
