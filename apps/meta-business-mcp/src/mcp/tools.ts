import { metaToolCatalog, type MetaToolDefinition } from '../tools/catalog';

type JsonSchema = Record<string, unknown>;

export interface RemoteMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: false;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

const pageId = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
  description: 'Exact allowlisted Facebook Page ID.',
};
const limit = {
  type: 'integer',
  minimum: 1,
  maximum: 100,
  default: 25,
};
const message = {
  type: 'string',
  minLength: 1,
  maxLength: 10000,
  description: 'Draft content. This is stored internally and is not sent to Meta.',
};

function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[],
): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  };
}

const INPUT_SCHEMAS: Record<string, JsonSchema> = {
  meta_page_get: objectSchema({ pageId }, ['pageId']),
  meta_page_list_posts: objectSchema({ pageId, limit }, ['pageId']),
  meta_post_get: objectSchema({
    pageId,
    postId: { type: 'string', minLength: 1, maxLength: 256 },
  }, ['pageId', 'postId']),
  meta_post_list_comments: objectSchema({
    pageId,
    postId: { type: 'string', minLength: 1, maxLength: 256 },
    limit,
  }, ['pageId', 'postId']),
  meta_inbox_list_threads: objectSchema({ pageId, limit }, ['pageId']),
  meta_inbox_get_thread: objectSchema({
    pageId,
    threadId: { type: 'string', minLength: 1, maxLength: 256 },
  }, ['pageId', 'threadId']),
  meta_page_get_insights: objectSchema({
    pageId,
    metricNames: {
      type: 'array',
      maxItems: 25,
      items: { type: 'string', minLength: 1, maxLength: 128 },
    },
  }, ['pageId']),
  meta_webhook_health: objectSchema({ pageId }, ['pageId']),
  meta_post_create_draft: objectSchema({ pageId, message }, ['pageId', 'message']),
  meta_comment_create_reply_draft: objectSchema({
    pageId,
    postId: { type: 'string', minLength: 1, maxLength: 256 },
    commentId: { type: 'string', minLength: 1, maxLength: 256 },
    message,
  }, ['pageId', 'postId', 'commentId', 'message']),
  meta_message_create_reply_draft: objectSchema({
    pageId,
    threadId: { type: 'string', minLength: 1, maxLength: 256 },
    message,
  }, ['pageId', 'threadId', 'message']),
  meta_content_create_weekly_plan: objectSchema({
    pageId,
    weekOf: { type: 'string', minLength: 1, maxLength: 64 },
    topics: {
      type: 'array',
      minItems: 1,
      maxItems: 14,
      items: { type: 'string', minLength: 1, maxLength: 500 },
    },
  }, ['pageId', 'topics']),
};

function titleFor(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function expose(definition: MetaToolDefinition): RemoteMcpTool {
  const inputSchema = INPUT_SCHEMAS[definition.name];
  if (!inputSchema) {
    throw new Error(`Missing remote MCP schema for ${definition.name}`);
  }
  const readOnly = definition.mode === 'read';
  return {
    name: definition.name,
    title: titleFor(definition.name),
    description: definition.description,
    inputSchema,
    annotations: {
      readOnlyHint: readOnly,
      destructiveHint: false,
      idempotentHint: readOnly,
      openWorldHint: readOnly,
    },
  };
}

export const remoteMetaMcpTools: readonly RemoteMcpTool[] = metaToolCatalog
  .filter((definition) => definition.mode !== 'write')
  .map(expose);

export function getRemoteMetaMcpTool(name: string): RemoteMcpTool | undefined {
  return remoteMetaMcpTools.find((tool) => tool.name === name);
}
