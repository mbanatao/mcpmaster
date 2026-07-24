import type { AuthenticatedStaffIdentity } from '../auth/supabase-bearer';
import type { ActiveOrganizationMembership } from '../auth/membership';
import type { MetaDraftStore } from '../drafts/store';
import { getMetaToolDefinition } from '../tools/catalog';
import { PersistentMetaDraftExecutor } from '../tools/draft-executor';
import {
  MetaPolicyDeniedError,
  MetaWriteExecutionDisabledError,
} from '../tools/executor';
import type { MetaNetworkReadExecutor } from '../tools/network-read-executor';
import { getRemoteMetaMcpTool, remoteMetaMcpTools } from './tools';

export const SUPPORTED_MCP_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
] as const;

export type JsonRpcId = string | number | null;

export interface JsonRpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

export interface McpRequestActor {
  identity: AuthenticatedStaffIdentity;
  membership: ActiveOrganizationMembership;
}

export interface MetaRemoteMcpHandlerOptions {
  readExecutor: MetaNetworkReadExecutor;
  draftStoreFactory: (accessToken: string) => MetaDraftStore;
  organizationId: string;
  allowedPageIds: readonly string[];
  killSwitchActive: boolean;
  networkEnabled: boolean;
  maxToolResponseBytes?: number;
}

export interface McpHandlerResult {
  notification: boolean;
  response?: Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === 'string' || typeof value === 'number';
}

function errorResponse(id: JsonRpcId, code: number, message: string, data?: unknown): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function resultResponse(id: JsonRpcId, result: unknown): Record<string, unknown> {
  return { jsonrpc: '2.0', id, result };
}

function negotiatedVersion(requested: unknown): string {
  if (typeof requested === 'string' && SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(
    requested as (typeof SUPPORTED_MCP_PROTOCOL_VERSIONS)[number],
  )) {
    return requested;
  }
  return SUPPORTED_MCP_PROTOCOL_VERSIONS[0];
}

function toolErrorMessage(error: unknown): string {
  if (error instanceof MetaPolicyDeniedError) {
    return `Request denied: ${error.reasons.join(', ')}`;
  }
  if (error instanceof MetaWriteExecutionDisabledError) {
    return 'External write execution is disabled.';
  }
  if (error instanceof Error && /(?:required|must|cannot|unsupported|between|contain)/i.test(error.message)) {
    return error.message.slice(0, 300);
  }
  return 'Tool execution failed.';
}

export class MetaRemoteMcpHandler {
  private readonly maxToolResponseBytes: number;

  constructor(private readonly options: MetaRemoteMcpHandlerOptions) {
    this.maxToolResponseBytes = options.maxToolResponseBytes ?? 512 * 1024;
  }

  async handle(message: JsonRpcMessage, actor: McpRequestActor): Promise<McpHandlerResult> {
    if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return {
        notification: false,
        response: errorResponse(null, -32600, 'Invalid Request'),
      };
    }

    const isNotification = message.id === undefined;
    if (!isNotification && !validId(message.id)) {
      return {
        notification: false,
        response: errorResponse(null, -32600, 'Invalid Request'),
      };
    }

    if (isNotification) {
      return { notification: true };
    }

    const id = message.id as JsonRpcId;
    switch (message.method) {
      case 'initialize': {
        const params = record(message.params);
        return {
          notification: false,
          response: resultResponse(id, {
            protocolVersion: negotiatedVersion(params.protocolVersion),
            capabilities: { tools: { listChanged: false } },
            serverInfo: {
              name: 'mcpmaster-meta-business',
              title: 'MCPMaster Meta Business MCP',
              version: '1.0.0',
              description: 'Authenticated read and internal-draft tools for an allowlisted Meta Business Page.',
            },
            instructions: [
              'This server exposes Meta read tools and internal draft creation only.',
              'It does not publish, schedule, reply, send, or delete external content.',
              'Drafts involving legal advice, deadlines, fees, conflicts, case facts, strategy, or outcomes require human legal review.',
            ].join(' '),
          }),
        };
      }
      case 'ping':
        return { notification: false, response: resultResponse(id, {}) };
      case 'tools/list':
        return {
          notification: false,
          response: resultResponse(id, { tools: remoteMetaMcpTools }),
        };
      case 'tools/call':
        return {
          notification: false,
          response: resultResponse(id, await this.callTool(message.params, actor)),
        };
      default:
        return {
          notification: false,
          response: errorResponse(id, -32601, 'Method not found'),
        };
    }
  }

  private async callTool(paramsValue: unknown, actor: McpRequestActor): Promise<Record<string, unknown>> {
    const params = record(paramsValue);
    const name = typeof params.name === 'string' ? params.name : '';
    const argumentsValue = record(params.arguments);
    const exposedTool = getRemoteMetaMcpTool(name);
    const catalogTool = getMetaToolDefinition(name);

    if (!exposedTool) {
      return {
        content: [{
          type: 'text',
          text: catalogTool?.mode === 'write'
            ? 'External write tools are not exposed by this server.'
            : 'Unknown tool.',
        }],
        isError: true,
      };
    }

    try {
      const context = {
        organizationId: this.options.organizationId,
        staffId: actor.identity.userId,
        requesterId: actor.identity.userId,
        allowedPageIds: this.options.allowedPageIds,
        killSwitchActive: this.options.killSwitchActive,
        networkEnabled: this.options.networkEnabled,
      };

      let data: unknown;
      if (catalogTool?.mode === 'read') {
        data = (await this.options.readExecutor.execute(name, argumentsValue, context)).data;
      } else if (catalogTool?.mode === 'draft') {
        const drafts = this.options.draftStoreFactory(actor.identity.accessToken);
        data = (await new PersistentMetaDraftExecutor(drafts).execute(
          name,
          argumentsValue,
          context,
        )).data;
      } else {
        throw new MetaWriteExecutionDisabledError(name);
      }

      const text = JSON.stringify(data);
      if (Buffer.byteLength(text, 'utf8') > this.maxToolResponseBytes) {
        throw new Error('Tool response exceeds the configured size limit');
      }
      return {
        content: [{ type: 'text', text }],
        structuredContent: data,
        isError: false,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: toolErrorMessage(error) }],
        isError: true,
      };
    }
  }
}
