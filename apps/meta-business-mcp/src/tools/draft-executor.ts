import type { MetaDraft, MetaDraftStore } from '../drafts/store';
import { evaluateMetaInvocation } from '../security/policy';
import {
  MetaPolicyDeniedError,
  MetaWriteExecutionDisabledError,
  type MetaExecutionContext,
} from './executor';
import { getMetaToolDefinition } from './catalog';

function requiredString(argumentsValue: Record<string, unknown>, key: string): string {
  const value = argumentsValue[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
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

function weeklyPlanContent(argumentsValue: Record<string, unknown>): string {
  const topics = optionalStringArray(argumentsValue, 'topics');
  if (topics.length === 0) {
    throw new Error('topics must contain at least one topic');
  }
  if (topics.length > 14) {
    throw new Error('topics cannot contain more than 14 entries');
  }

  const weekOf = typeof argumentsValue.weekOf === 'string' && argumentsValue.weekOf.trim()
    ? argumentsValue.weekOf.trim()
    : 'unspecified week';
  return [
    `Weekly content plan — ${weekOf}`,
    ...topics.map((topic, index) => `${index + 1}. ${topic}`),
  ].join('\n');
}

export interface PersistentDraftExecutionResult {
  toolName: string;
  data: MetaDraft;
  requiresLegalReview: boolean;
}

export class PersistentMetaDraftExecutor {
  constructor(private readonly drafts: MetaDraftStore) {}

  async execute(
    toolName: string,
    argumentsValue: Record<string, unknown>,
    context: MetaExecutionContext,
  ): Promise<PersistentDraftExecutionResult> {
    const definition = getMetaToolDefinition(toolName);
    if (definition?.mode === 'write') {
      throw new MetaWriteExecutionDisabledError(toolName);
    }
    if (!definition || definition.mode !== 'draft') {
      throw new MetaPolicyDeniedError(toolName, ['draft_tool_required']);
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
    if (!policy.allowed) {
      throw new MetaPolicyDeniedError(toolName, policy.reasons);
    }

    let data: MetaDraft;
    switch (toolName) {
      case 'meta_post_create_draft':
        data = await this.createDraft('post', pageId, argumentsValue, context, policy.requiresLegalReview);
        break;
      case 'meta_comment_create_reply_draft':
        data = await this.createDraft(
          'comment_reply',
          pageId,
          argumentsValue,
          context,
          policy.requiresLegalReview,
          `${requiredString(argumentsValue, 'postId')}:${requiredString(argumentsValue, 'commentId')}`,
        );
        break;
      case 'meta_message_create_reply_draft':
        data = await this.createDraft(
          'message_reply',
          pageId,
          argumentsValue,
          context,
          policy.requiresLegalReview,
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
        throw new MetaPolicyDeniedError(toolName, ['unsupported_draft_tool']);
    }

    return {
      toolName,
      data,
      requiresLegalReview: policy.requiresLegalReview,
    };
  }

  private async createDraft(
    kind: MetaDraft['kind'],
    pageId: string,
    argumentsValue: Record<string, unknown>,
    context: MetaExecutionContext,
    legalReviewRequired: boolean,
    targetId?: string,
  ): Promise<MetaDraft> {
    return this.drafts.create({
      organizationId: context.organizationId,
      pageId,
      kind,
      targetId,
      content: requiredString(argumentsValue, 'message'),
      createdBy: context.staffId,
      legalReviewRequired,
    });
  }
}
