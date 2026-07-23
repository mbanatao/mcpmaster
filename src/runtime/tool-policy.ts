import { timingSafeEqual } from 'crypto';

export type ToolRisk = 'read' | 'write' | 'destructive';

const READ_PREFIXES = [
  'get',
  'list',
  'search',
  'query',
  'read',
  'analyze',
  'summarize',
  'translate',
];

const DESTRUCTIVE_PREFIXES = [
  'delete',
  'drop',
  'merge',
  'deploy',
  'send-transaction',
  'train',
  'cancel',
  'approve',
  'reject',
  'remove',
  'rotate',
];

const WRITE_PREFIXES = [
  'create',
  'update',
  'post',
  'upload',
  'insert',
  'copy',
  'move',
  'start',
  'stop',
  'assign',
  'generate',
  'execute',
];

function actionName(toolName: string): string {
  const separator = toolName.indexOf('.');
  return separator === -1 ? toolName.toLowerCase() : toolName.slice(separator + 1).toLowerCase();
}

export function classifyToolRisk(toolName: string): ToolRisk {
  const action = actionName(toolName);

  if (DESTRUCTIVE_PREFIXES.some((prefix) => action.startsWith(prefix))) {
    return 'destructive';
  }

  if (READ_PREFIXES.some((prefix) => action.startsWith(prefix))) {
    return 'read';
  }

  if (WRITE_PREFIXES.some((prefix) => action.startsWith(prefix))) {
    return 'write';
  }

  // Unknown actions fail closed. A new tool cannot silently become read-only.
  return 'write';
}

export function requiresApproval(toolName: string): boolean {
  return classifyToolRisk(toolName) !== 'read';
}

export function secureTokenMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
