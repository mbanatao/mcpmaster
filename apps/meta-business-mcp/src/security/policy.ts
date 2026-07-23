import {
  authorizeExternalWrite,
  computeActionHash,
  evaluateLawOfficeText,
  isPageAllowed,
  type ActionEnvelope,
  type ExternalWriteAuthorizationResult,
} from '../../../../packages/shared-security/dist/index';
import {
  getMetaToolDefinition,
  type MetaToolDefinition,
} from '../tools/catalog';

export interface MetaInvocationContext {
  staffId: string;
  pageId: string;
  allowedPageIds: readonly string[];
  requesterId: string;
  approverId?: string;
  arguments: Record<string, unknown>;
  idempotencyKey?: string;
  approvalDecision?: 'approved' | 'denied' | 'pending' | 'expired' | 'revoked';
  approvedActionHash?: string;
  killSwitchActive: boolean;
  networkEnabled: boolean;
  legalReviewConfirmed?: boolean;
}

export interface MetaPolicyDecision {
  allowed: boolean;
  tool?: MetaToolDefinition;
  actionHash?: string;
  reasons: string[];
  requiresHumanApproval: boolean;
  requiresIndependentApproval: boolean;
  requiresLegalReview: boolean;
  networkMutationAllowed: boolean;
}

function outboundText(argumentsValue: Record<string, unknown>): string {
  const candidates = [
    argumentsValue.message,
    argumentsValue.text,
    argumentsValue.body,
    argumentsValue.content,
    argumentsValue.reply,
  ];

  return candidates.find((value): value is string => typeof value === 'string') ?? '';
}

function actionEnvelope(
  toolName: string,
  context: MetaInvocationContext,
): ActionEnvelope {
  return {
    toolName,
    provider: 'meta',
    accountId: context.pageId,
    resourceId:
      typeof context.arguments.resourceId === 'string'
        ? context.arguments.resourceId
        : undefined,
    requesterId: context.requesterId,
    arguments: context.arguments,
  };
}

export function evaluateMetaInvocation(
  toolName: string,
  context: MetaInvocationContext,
): MetaPolicyDecision {
  const tool = getMetaToolDefinition(toolName);
  if (!tool) {
    return {
      allowed: false,
      reasons: ['unknown_tool'],
      requiresHumanApproval: true,
      requiresIndependentApproval: false,
      requiresLegalReview: false,
      networkMutationAllowed: false,
    };
  }

  const reasons: string[] = [];
  const staffId = context.staffId.trim();
  const requesterId = context.requesterId.trim();
  const approverId = context.approverId?.trim() ?? '';
  const textEvaluation = evaluateLawOfficeText(outboundText(context.arguments));
  const requiresLegalReview = textEvaluation.disposition === 'legal_review_required';
  const requiresHumanApproval = tool.mode === 'write';
  const requiresIndependentApproval = tool.approval === 'dual';
  const envelope = actionEnvelope(toolName, context);
  const actionHash = computeActionHash(envelope);

  if (!staffId || !requesterId) {
    reasons.push('authenticated_staff_required');
  }

  if (!isPageAllowed(context.pageId, context.allowedPageIds)) {
    reasons.push('page_not_allowlisted');
  }

  if (context.killSwitchActive && tool.mode === 'write') {
    reasons.push('emergency_kill_switch_active');
  }

  if (tool.mode === 'read' || tool.mode === 'draft') {
    return {
      allowed: reasons.length === 0,
      tool,
      actionHash,
      reasons,
      requiresHumanApproval: false,
      requiresIndependentApproval: false,
      requiresLegalReview,
      networkMutationAllowed: false,
    };
  }

  if (!context.networkEnabled) {
    reasons.push('meta_network_disabled');
  }

  if (requiresIndependentApproval && (!approverId || approverId === requesterId)) {
    reasons.push('independent_approver_required');
  }

  const writeResult: ExternalWriteAuthorizationResult = authorizeExternalWrite({
    staffId,
    pageId: context.pageId,
    allowedPageIds: context.allowedPageIds,
    idempotencyKey: context.idempotencyKey ?? '',
    approvalDecision: context.approvalDecision ?? 'pending',
    expectedActionHash: actionHash,
    approvedActionHash: context.approvedActionHash ?? '',
    killSwitchActive: context.killSwitchActive,
    outboundText: outboundText(context.arguments),
    legalReviewConfirmed: context.legalReviewConfirmed,
  });

  reasons.push(...writeResult.reasons);
  const uniqueReasons = [...new Set(reasons)];

  return {
    allowed: uniqueReasons.length === 0,
    tool,
    actionHash,
    reasons: uniqueReasons,
    requiresHumanApproval,
    requiresIndependentApproval,
    requiresLegalReview: writeResult.requiresLegalReview,
    networkMutationAllowed: uniqueReasons.length === 0,
  };
}
